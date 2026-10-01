-- Migration: 20261001110000_atomic_pos_sale_and_void.sql
-- Description:
--   1. Adds idempotency_key, voided_at, voided_by, void_reason columns to public.sales
--   2. Implements create_pos_sale_atomic(...) stored procedure with row locking,
--      strict inventory checks, and idempotency protection
--   3. Implements void_pos_sale_atomic(...) stored procedure with atomic restoration
--      of BOTH physical UNITs and COUNTER stock, double-void prevention, and audit logging
--   4. Grants execute exclusively to service_role with explicit search_path = public

-- ============================================================================
-- 1. EXTEND sales SCHEMA FOR IDEMPOTENCY & VOID METADATA
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'idempotency_key'
    ) THEN
        ALTER TABLE public.sales ADD COLUMN idempotency_key TEXT UNIQUE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'voided_at'
    ) THEN
        ALTER TABLE public.sales ADD COLUMN voided_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'voided_by'
    ) THEN
        ALTER TABLE public.sales ADD COLUMN voided_by TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'void_reason'
    ) THEN
        ALTER TABLE public.sales ADD COLUMN void_reason TEXT;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sales_idempotency_key ON public.sales(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- ============================================================================
-- 2. ATOMIC POS SALE CREATION RPC
-- ============================================================================

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
    v_product_id UUID;
    v_product RECORD;
    v_qty INT;
    v_unit_id TEXT;
    v_unit RECORD;
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
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
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

            -- Lock and verify unit
            SELECT * INTO v_unit
            FROM public.stock_management
            WHERE (id::TEXT = v_unit_id OR serial_number = v_unit_id OR barcode = v_unit_id)
            FOR UPDATE;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Unit % not found in stock management.', v_unit_id;
            END IF;

            -- Check duplicate in cart using canonical unit UUID
            IF v_unit.id = ANY(v_claimed_unit_uuids) THEN
                RAISE EXCEPTION 'Unit % is included multiple times in the checkout request.', v_unit_id;
            END IF;
            v_claimed_unit_uuids := array_append(v_claimed_unit_uuids, v_unit.id);

            IF v_unit.product_id != v_product_id THEN
                RAISE EXCEPTION 'Unit % does not belong to product "%".', v_unit_id, v_product.name;
            END IF;

            IF v_unit.status != 'available' THEN
                RAISE EXCEPTION 'Unit % for product "%" is no longer available (current status: %).',
                    COALESCE(v_unit.serial_number, v_unit_id), v_product.name, v_unit.status;
            END IF;

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

    -- 4. Generate Identifiers & Create Sale Record
    v_sale_id := gen_random_uuid();
    v_receipt_number := COALESCE(
        NULLIF(trim(p_sale_data->>'receipt_number'), ''),
        'FTC-POS-' || upper(substr(replace(v_sale_id::TEXT, '-', ''), 1, 8))
    );

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
        date,
        idempotency_key,
        created_at,
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
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_qty := COALESCE((v_item->>'quantity')::INT, 1);
        v_unit_id := NULLIF(trim(v_item->>'unit_id'), '');
        SELECT * INTO v_product FROM public.products WHERE id = v_product_id;
        v_item_price := COALESCE(v_product.discount_price, v_product.price, 0);
        v_item_discount := LEAST(COALESCE((v_item->>'item_discount')::NUMERIC, 0), v_item_price);
        v_line_total := (v_item_price - v_item_discount) * v_qty;

        IF v_product.inventory_tracking_type = 'unit' AND v_unit_id IS NOT NULL THEN
            SELECT * INTO v_unit FROM public.stock_management
            WHERE (id::TEXT = v_unit_id OR serial_number = v_unit_id OR barcode = v_unit_id);
        ELSE
            v_unit := NULL;
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
            COALESCE(v_unit.id::TEXT, v_unit_id),
            COALESCE(v_unit.barcode, NULLIF(trim(v_item->>'unit_barcode'), '')),
            COALESCE(v_unit.serial_number, NULLIF(trim(v_item->>'unit_serial'), '')),
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

-- ============================================================================
-- 3. ATOMIC POS VOID RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION public.void_pos_sale_atomic(
    p_sale_id UUID,
    p_voided_by TEXT,
    p_void_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_sale RECORD;
    v_affected_unit_pids UUID[] := ARRAY[]::UUID[];
    v_counter_item RECORD;
    v_now TIMESTAMPTZ := now();
    v_restored_units_count INT := 0;
    v_restored_counter_qty INT := 0;
BEGIN
    -- 1. Lock Sale Row
    SELECT * INTO v_sale
    FROM public.sales
    WHERE id = p_sale_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sale with ID % not found.', p_sale_id;
    END IF;

    -- Guard: Only POS sales can be voided via this procedure.
    -- Commercial invoices must use the invoice revocation workflow (revoke_invoice_atomic).
    IF v_sale.quotation_id IS NOT NULL OR (v_sale.invoice_number IS NOT NULL AND v_sale.receipt_number NOT LIKE 'FTC-POS-%') THEN
        RAISE EXCEPTION 'Commercial invoices cannot be voided through POS void. Use the commercial invoice revocation workflow.';
    END IF;

    -- Idempotent check: if already voided, do NOT restore stock again
    IF v_sale.status = 'voided' THEN
        RETURN jsonb_build_object(
            'success', true,
            'already_voided', true,
            'sale_id', p_sale_id,
            'message', 'Sale is already voided.'
        );
    END IF;

    -- 2. Identify and Restore Linked Serial Units
    SELECT array_agg(DISTINCT product_id)
    INTO v_affected_unit_pids
    FROM public.stock_management
    WHERE order_id = p_sale_id::TEXT;

    IF v_affected_unit_pids IS NOT NULL AND array_length(v_affected_unit_pids, 1) > 0 THEN
        UPDATE public.stock_management
        SET status = 'available',
            order_id = NULL,
            updated_at = v_now
        WHERE order_id = p_sale_id::TEXT;

        GET DIAGNOSTICS v_restored_units_count = ROW_COUNT;

        -- Reconcile count_in_stock on products for restored units
        UPDATE public.products p
        SET count_in_stock = (
            SELECT count(*)
            FROM public.stock_management sm
            WHERE sm.product_id = p.id AND sm.status = 'available'
        )
        WHERE p.id = ANY(v_affected_unit_pids);
    END IF;

    -- 3. Restore Counter-Tracked Inventory from sale_items
    FOR v_counter_item IN
        SELECT si.product_id, sum(si.quantity)::INT as total_qty
        FROM public.sale_items si
        JOIN public.products p ON p.id = si.product_id
        WHERE si.sale_id = p_sale_id
          AND (si.unit_id IS NULL OR trim(si.unit_id) = '')
          AND p.inventory_tracking_type = 'counter'
        GROUP BY si.product_id
    LOOP
        UPDATE public.products
        SET count_in_stock = count_in_stock + v_counter_item.total_qty
        WHERE id = v_counter_item.product_id;

        v_restored_counter_qty := v_restored_counter_qty + v_counter_item.total_qty;
    END LOOP;

    -- 4. Mark Sale as Voided
    UPDATE public.sales
    SET status = 'voided',
        voided_at = v_now,
        voided_by = p_voided_by,
        void_reason = p_void_reason,
        notes = concat_ws('; ', NULLIF(notes, ''), 'Void Reason: ' || COALESCE(p_void_reason, 'No reason specified')),
        updated_at = v_now
    WHERE id = p_sale_id;

    -- 5. Insert Audit Log
    INSERT INTO public.audit_log (
        id,
        actor,
        action,
        collection,
        record_id,
        old_value,
        new_value,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        COALESCE(p_voided_by, 'Manager'),
        'void_pos_sale',
        'sales',
        p_sale_id::TEXT,
        v_sale.status,
        'voided',
        v_now,
        v_now
    );

    RETURN jsonb_build_object(
        'success', true,
        'sale_id', p_sale_id,
        'status', 'voided',
        'voided_by', p_voided_by,
        'restored_units_count', v_restored_units_count,
        'restored_counter_qty', v_restored_counter_qty
    );
END;
$$;

-- ============================================================================
-- 4. RPC ACCESS PRIVILEGES
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.create_pos_sale_atomic(JSONB, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_pos_sale_atomic(JSONB, JSONB) TO service_role;

REVOKE EXECUTE ON FUNCTION public.void_pos_sale_atomic(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.void_pos_sale_atomic(UUID, TEXT, TEXT) TO service_role;
