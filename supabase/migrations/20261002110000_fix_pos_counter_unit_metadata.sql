-- Migration: 20261002110000_fix_pos_counter_unit_metadata.sql
-- Fix COUNTER POS regression: use explicit nullable scalar variables for sale-item unit metadata
-- rather than dereferencing unassigned/null v_unit RECORD fields.
-- Preserves canonical UNIT resolution, advisory idempotency locks, security definer, and permissions.

CREATE OR REPLACE FUNCTION public.create_pos_sale_atomic(
    p_sale_data JSONB,
    p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_idempotency_key TEXT;
    v_existing_sale RECORD;
    v_sale_id UUID;
    v_receipt_number TEXT;
    v_item JSONB;
    v_item_record RECORD;
    v_item_idx INT;
    v_line_unit_mapping JSONB := '{}'::JSONB;
    v_resolved_unit_uuid UUID;
    v_unavailable_unit RECORD;
    v_product_id UUID;
    v_product RECORD;
    v_qty INT;
    v_unit_id TEXT;
    v_unit public.stock_management%ROWTYPE;
    v_item_unit_id TEXT;
    v_item_unit_barcode TEXT;
    v_item_unit_serial TEXT;
    v_claimed_unit_uuids UUID[] := ARRAY[]::UUID[];
    v_affected_unit_pids UUID[] := ARRAY[]::UUID[];
    v_counter_deductions JSONB := '{}'::JSONB;
    v_pid_key TEXT;
    v_deduct_qty INT;
    v_curr_deduct INT;
    v_items_count INT := 0;
    v_subtotal NUMERIC := 0;
    v_discount NUMERIC := 0;
    v_tax NUMERIC := 0;
    v_total NUMERIC := 0;
    v_item_price NUMERIC;
    v_item_discount NUMERIC;
    v_line_total NUMERIC;
    v_now TIMESTAMPTZ := now();
BEGIN
    -- 1. Idempotency Check
    v_idempotency_key := NULLIF(trim(p_sale_data->>'idempotency_key'), '');
    IF v_idempotency_key IS NOT NULL THEN
        -- Acquire transaction-scoped advisory lock on idempotency key hash.
        -- Serializes concurrent requests with the same key, closing the TOCTOU window.
        PERFORM pg_advisory_xact_lock(hashtext(v_idempotency_key));

        SELECT id, receipt_number, total, items_count, status
        INTO v_existing_sale
        FROM public.sales
        WHERE idempotency_key = v_idempotency_key
        LIMIT 1;

        IF FOUND THEN
            RETURN jsonb_build_object(
                'success', true,
                'idempotent_replay', true,
                'sale_id', v_existing_sale.id,
                'receipt_number', v_existing_sale.receipt_number,
                'total', v_existing_sale.total,
                'items_count', v_existing_sale.items_count,
                'status', v_existing_sale.status
            );
        END IF;
    END IF;

    -- 2. Validate Items Array
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'POS sale must contain at least one item.';
    END IF;

    -- 3. Lock & Validate All Products and Inventory Units
    FOR v_item_record IN
        SELECT ord::INT AS idx, value AS item
        FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(value, ord)
    LOOP
        v_item_idx := v_item_record.idx;
        v_item := v_item_record.item;
        v_product_id := (v_item->>'product_id')::UUID;
        v_qty := COALESCE((v_item->>'quantity')::INT, 1);
        v_unit_id := NULLIF(trim(v_item->>'unit_id'), '');

        IF v_product_id IS NULL THEN
            RAISE EXCEPTION 'Every item must have a valid product_id.';
        END IF;

        IF v_qty <= 0 THEN
            RAISE EXCEPTION 'Item quantity must be greater than zero.';
        END IF;

        -- Lock product row
        SELECT * INTO v_product
        FROM public.products
        WHERE id = v_product_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Product with ID % not found.', v_product_id;
        END IF;

        IF v_product.status != 'published' THEN
            RAISE EXCEPTION 'Product "%" is not active for sale.', v_product.name;
        END IF;

        -- Check Tracking Model
        IF v_product.inventory_tracking_type = 'unit' THEN
            IF v_unit_id IS NULL THEN
                RAISE EXCEPTION 'Serialized product "%" requires exact physical unit selection.', v_product.name;
            END IF;

            IF v_qty != 1 THEN
                RAISE EXCEPTION 'Serialized unit items must have quantity of 1 per physical unit.';
            END IF;

            v_resolved_unit_uuid := NULL;

            -- Deterministic canonical UNIT resolution.
            -- Prefer exact UUID match when input is a valid UUID;
            -- otherwise resolve serial/barcode deterministically with ORDER BY id ASC LIMIT 1.
            -- Exclude canonical UUIDs already claimed by earlier cart lines.
            IF v_unit_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
                IF v_unit_id::UUID = ANY(v_claimed_unit_uuids) THEN
                    RAISE EXCEPTION 'Unit % is included multiple times in the checkout request.', v_unit_id;
                END IF;

                SELECT * INTO v_unit
                FROM public.stock_management
                WHERE id = v_unit_id::UUID
                  AND product_id = v_product_id
                FOR UPDATE;

                IF FOUND THEN
                    IF v_unit.status != 'available' THEN
                        RAISE EXCEPTION 'Unit % for product "%" is no longer available (current status: %).',
                            COALESCE(v_unit.serial_number, v_unit_id), v_product.name, v_unit.status;
                    END IF;
                    v_resolved_unit_uuid := v_unit.id;
                ELSIF EXISTS (SELECT 1 FROM public.stock_management WHERE id = v_unit_id::UUID) THEN
                    RAISE EXCEPTION 'Unit % does not belong to product "%".', v_unit_id, v_product.name;
                END IF;
            END IF;

            IF v_resolved_unit_uuid IS NULL THEN
                SELECT * INTO v_unit
                FROM public.stock_management
                WHERE product_id = v_product_id
                  AND (serial_number = v_unit_id OR barcode = v_unit_id)
                  AND NOT (id = ANY(v_claimed_unit_uuids))
                  AND status = 'available'
                ORDER BY id ASC
                LIMIT 1
                FOR UPDATE;

                IF NOT FOUND THEN
                    -- Check if matching unit was already claimed in this request
                    IF EXISTS (
                        SELECT 1 FROM public.stock_management
                        WHERE product_id = v_product_id
                          AND (serial_number = v_unit_id OR barcode = v_unit_id)
                          AND id = ANY(v_claimed_unit_uuids)
                    ) THEN
                        RAISE EXCEPTION 'Unit % is included multiple times in the checkout request.', v_unit_id;
                    END IF;

                    -- Check if matching unit belongs to another product
                    IF EXISTS (
                        SELECT 1 FROM public.stock_management
                        WHERE (serial_number = v_unit_id OR barcode = v_unit_id)
                          AND product_id != v_product_id
                    ) THEN
                        RAISE EXCEPTION 'Unit % does not belong to product "%".', v_unit_id, v_product.name;
                    END IF;

                    -- Check if matching unit exists for this product but is unavailable
                    SELECT * INTO v_unavailable_unit
                    FROM public.stock_management
                    WHERE product_id = v_product_id
                      AND (serial_number = v_unit_id OR barcode = v_unit_id)
                    LIMIT 1;

                    IF FOUND THEN
                        RAISE EXCEPTION 'Unit % for product "%" is no longer available (current status: %).',
                            COALESCE(v_unavailable_unit.serial_number, v_unit_id), v_product.name, v_unavailable_unit.status;
                    END IF;

                    RAISE EXCEPTION 'Unit % not found in stock management for product "%".', v_unit_id, v_product.name;
                END IF;

                v_resolved_unit_uuid := v_unit.id;
            END IF;

            -- Check duplicate in cart using canonical unit UUID
            IF v_resolved_unit_uuid = ANY(v_claimed_unit_uuids) THEN
                RAISE EXCEPTION 'Unit % is included multiple times in the checkout request.', v_unit_id;
            END IF;
            v_claimed_unit_uuids := array_append(v_claimed_unit_uuids, v_resolved_unit_uuid);
            v_line_unit_mapping := v_line_unit_mapping || jsonb_build_object(v_item_idx::TEXT, v_resolved_unit_uuid::TEXT);

            IF NOT (v_product_id = ANY(v_affected_unit_pids)) THEN
                v_affected_unit_pids := array_append(v_affected_unit_pids, v_product_id);
            END IF;

        ELSIF v_product.inventory_tracking_type = 'counter' THEN
            IF v_unit_id IS NOT NULL THEN
                RAISE EXCEPTION 'Counter product "%" cannot be assigned a physical serial unit ID.', v_product.name;
            END IF;

            v_pid_key := v_product_id::TEXT;
            v_curr_deduct := COALESCE((v_counter_deductions->>v_pid_key)::INT, 0);
            v_counter_deductions := jsonb_set(
                v_counter_deductions,
                ARRAY[v_pid_key],
                to_jsonb(v_curr_deduct + v_qty)
            );
        END IF;

        -- Authoritative price validation from locked product record
        v_item_price := COALESCE(v_product.discount_price, v_product.price, 0);
        v_item_discount := LEAST(COALESCE((v_item->>'item_discount')::NUMERIC, 0), v_item_price);
        v_line_total := (v_item_price - v_item_discount) * v_qty;

        v_subtotal := v_subtotal + (v_item_price * v_qty);
        v_discount := v_discount + (v_item_discount * v_qty);
        v_items_count := v_items_count + v_qty;
    END LOOP;

    -- Validate counter stock thresholds
    FOR v_pid_key, v_deduct_qty IN
        SELECT key, value::INT FROM jsonb_each_text(v_counter_deductions)
    LOOP
        SELECT * INTO v_product
        FROM public.products
        WHERE id = v_pid_key::UUID;

        IF v_product.count_in_stock < v_deduct_qty THEN
            RAISE EXCEPTION 'Insufficient stock for product "%". Requested: %, Available: %',
                v_product.name, v_deduct_qty, v_product.count_in_stock;
        END IF;
    END LOOP;

    -- Apply global discount and tax if passed
    IF (p_sale_data->>'discount') IS NOT NULL AND (p_sale_data->>'discount')::NUMERIC > v_discount THEN
        v_discount := LEAST((p_sale_data->>'discount')::NUMERIC, v_subtotal);
    END IF;

    v_tax := COALESCE((p_sale_data->>'tax_amount')::NUMERIC, 0);
    v_total := GREATEST(0, v_subtotal - v_discount + v_tax);

    -- 4. Generate POS Receipt Number and Insert Sale Header
    v_sale_id := gen_random_uuid();
    v_receipt_number := 'FTC-POS-' || upper(substring(replace(v_sale_id::TEXT, '-', '') from 1 for 8));

    INSERT INTO public.sales (
        id,
        receipt_number,
        cashier_name,
        cashier_id,
        customer_name,
        customer_phone,
        customer_email,
        customer_id,
        subtotal,
        discount,
        tax_amount,
        total,
        payment_method,
        cash_tendered,
        change_due,
        items_count,
        status,
        notes,
        created_at,
        idempotency_key,
        date,
        updated_at
    ) VALUES (
        v_sale_id,
        v_receipt_number,
        COALESCE(p_sale_data->>'cashier_name', 'Cashier'),
        NULLIF(p_sale_data->>'cashier_id', '')::UUID,
        NULLIF(p_sale_data->>'customer_name', ''),
        NULLIF(p_sale_data->>'customer_phone', ''),
        NULLIF(p_sale_data->>'customer_email', ''),
        NULLIF(p_sale_data->>'customer_id', '')::UUID,
        v_subtotal,
        v_discount,
        v_tax,
        v_total,
        COALESCE(p_sale_data->>'payment_method', 'cash'),
        COALESCE((p_sale_data->>'cash_tendered')::NUMERIC, 0),
        COALESCE((p_sale_data->>'change_due')::NUMERIC, 0),
        v_items_count,
        'completed',
        NULLIF(p_sale_data->>'notes', ''),
        COALESCE((p_sale_data->>'date')::TIMESTAMPTZ, v_now),
        v_idempotency_key,
        v_now,
        v_now
    );

    -- 5. Insert Sale Items
    FOR v_item_record IN
        SELECT ord::INT AS idx, value AS item
        FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(value, ord)
    LOOP
        v_item_idx := v_item_record.idx;
        v_item := v_item_record.item;
        v_product_id := (v_item->>'product_id')::UUID;
        v_qty := COALESCE((v_item->>'quantity')::INT, 1);
        v_unit_id := NULLIF(trim(v_item->>'unit_id'), '');
        SELECT * INTO v_product FROM public.products WHERE id = v_product_id;
        v_item_price := COALESCE(v_product.discount_price, v_product.price, 0);
        v_item_discount := LEAST(COALESCE((v_item->>'item_discount')::NUMERIC, 0), v_item_price);
        v_line_total := (v_item_price - v_item_discount) * v_qty;

        -- Reset scalar unit metadata variables for each line to prevent cross-line leakage
        v_item_unit_id := NULL;
        v_item_unit_barcode := NULL;
        v_item_unit_serial := NULL;

        -- For UNIT items, retrieve canonical unit UUID resolved during validation.
        -- Strictly query public.stock_management WHERE id = canonical_uuid.
        IF v_product.inventory_tracking_type = 'unit' THEN
            v_resolved_unit_uuid := (v_line_unit_mapping->>v_item_idx::TEXT)::UUID;
            IF v_resolved_unit_uuid IS NOT NULL THEN
                SELECT * INTO v_unit
                FROM public.stock_management
                WHERE id = v_resolved_unit_uuid;

                IF FOUND THEN
                    v_item_unit_id := v_unit.id::TEXT;
                    v_item_unit_barcode := v_unit.barcode;
                    v_item_unit_serial := v_unit.serial_number;
                END IF;
            END IF;
        END IF;

        INSERT INTO public.sale_items (
            id,
            sale_id,
            product_id,
            product_name,
            sku,
            unit_price,
            item_discount,
            unit_cost,
            quantity,
            line_total,
            unit_id,
            unit_barcode,
            unit_serial,
            image_url,
            category,
            created_at,
            updated_at
        ) VALUES (
            gen_random_uuid(),
            v_sale_id,
            v_product_id,
            COALESCE(v_item->>'product_name', 'Product'),
            COALESCE(v_item->>'sku', ''),
            v_item_price,
            v_item_discount,
            COALESCE((v_item->>'unit_cost')::NUMERIC, 0),
            v_qty,
            v_line_total,
            v_item_unit_id,
            COALESCE(v_item_unit_barcode, NULLIF(trim(v_item->>'unit_barcode'), '')),
            COALESCE(v_item_unit_serial, NULLIF(trim(v_item->>'unit_serial'), '')),
            NULLIF(trim(v_item->>'image_url'), ''),
            NULLIF(trim(v_item->>'category'), ''),
            v_now,
            v_now
        );
    END LOOP;

    -- 6. Claim Physical Units Atomically (by canonical UUIDs)
    IF array_length(v_claimed_unit_uuids, 1) > 0 THEN
        UPDATE public.stock_management
        SET status = 'sold',
            order_id = v_sale_id::TEXT,
            updated_at = v_now
        WHERE id = ANY(v_claimed_unit_uuids);

        -- Reconcile count_in_stock for affected unit products
        UPDATE public.products p
        SET count_in_stock = (
            SELECT count(*)
            FROM public.stock_management sm
            WHERE sm.product_id = p.id AND sm.status = 'available'
        )
        WHERE p.id = ANY(v_affected_unit_pids);
    END IF;

    -- 7. Decrement Counter Stock Atomically
    FOR v_pid_key, v_deduct_qty IN
        SELECT key, value::INT FROM jsonb_each_text(v_counter_deductions)
    LOOP
        UPDATE public.products
        SET count_in_stock = count_in_stock - v_deduct_qty
        WHERE id = v_pid_key::UUID;
    END LOOP;

    -- 8. Return Authoritative Sale Summary
    RETURN jsonb_build_object(
        'success', true,
        'sale_id', v_sale_id,
        'receipt_number', v_receipt_number,
        'subtotal', v_subtotal,
        'discount', v_discount,
        'tax_amount', v_tax,
        'total', v_total,
        'items_count', v_items_count,
        'status', 'completed'
    );
END;
$$;

-- Security permissions
REVOKE EXECUTE ON FUNCTION public.create_pos_sale_atomic(JSONB, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_pos_sale_atomic(JSONB, JSONB) TO service_role;
