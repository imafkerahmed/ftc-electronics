-- Migration: 20261001120000_sales_pos_fulfillment_hardening.sql
-- Description:
--   Forward-only hardening migration addressing CodeRabbit findings 1-5.
--
--   1. Hardens void_pos_sale_atomic guard against commercial sales (NULL-safe receipt_number check)
--   2. Scopes commercial fulfillment idempotency to sale_id (prevents cross-sale replay)
--   3. Fixes sale-wide catalog fulfillment status computation (re-derives catalog_lines_count from DB)
--   4. Resolves POS unit lookups to canonical UUID before duplicate-cart checks
--   5. Adds pg_advisory_xact_lock for POS idempotency concurrency safety

-- ============================================================================
-- 1. HARDEN void_pos_sale_atomic: NULL-safe commercial sale guard
-- ============================================================================
-- Problem: `v_sale.receipt_number NOT LIKE 'FTC-POS-%'` returns UNKNOWN (not TRUE)
-- when receipt_number IS NULL, causing the guard to silently pass for commercial
-- sales that have NULL receipt_number. Fix uses explicit COALESCE.

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
    -- FIX (Finding 1): Use COALESCE to handle NULL receipt_number safely.
    -- A sale is commercial if it has a quotation_id, OR if it has an invoice_number
    -- and its receipt_number is NOT a POS receipt (or is NULL).
    IF v_sale.quotation_id IS NOT NULL
       OR (v_sale.invoice_number IS NOT NULL AND COALESCE(v_sale.receipt_number, '') NOT LIKE 'FTC-POS-%')
    THEN
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

REVOKE EXECUTE ON FUNCTION public.void_pos_sale_atomic(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.void_pos_sale_atomic(UUID, TEXT, TEXT) TO service_role;

-- ============================================================================
-- 2. SCOPE FULFILLMENT IDEMPOTENCY TO sale_id (Finding 2)
-- ============================================================================
-- Problem: The early idempotency lookups only check `idempotency_key` without
-- verifying it matches the requested `sale_id`. If the same idempotency_key were
-- somehow reused across sales, it would return a stale fulfillment from a different
-- sale. Fix adds sale_id filter to both pre-lock and post-lock idempotency checks.
--
-- Also fixes Finding 3: The catalog fulfillment status computation (section 10)
-- uses `v_catalog_lines_count` which only counts items processed in the CURRENT
-- request, not ALL catalog items on the sale. Fix re-derives the count from the
-- database query over all sale_items.

CREATE OR REPLACE FUNCTION public.fulfill_commercial_sale_items_atomic(
    p_sale_id UUID,
    p_idempotency_key UUID,
    p_actor_profile_id UUID DEFAULT NULL,
    p_actor_name TEXT DEFAULT NULL,
    p_recipient_name TEXT DEFAULT NULL,
    p_recipient_phone TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_items JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_sale RECORD;
    v_existing_fulfillment RECORD;
    v_fulfillment_id UUID;
    v_dn_number TEXT;
    v_actor_name TEXT;
    v_item_elem JSONB;
    v_sale_item_id UUID;
    v_req_qty INT;
    v_non_inventory_flag BOOLEAN;
    v_unit_ids JSONB;
    v_sale_item RECORD;
    v_remaining_qty INT;
    v_product RECORD;
    v_unit_id_elem JSONB;
    v_unit_id UUID;
    v_unit_record RECORD;
    v_claimed_units_count INT;
    v_seen_unit_ids UUID[] := '{}';
    v_all_catalog_items_fulfilled BOOLEAN := true;
    v_any_catalog_items_fulfilled BOOLEAN := false;
    v_has_unclassified_lines BOOLEAN := false;
    v_catalog_lines_count INT := 0;
    v_catalog_status TEXT;
    v_item_cursor RECORD;
BEGIN
    -- 1. Validate Idempotency Key
    IF p_idempotency_key IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Idempotency key is required.');
    END IF;

    -- 2. Early Idempotency Lookup (Fast return for replay)
    -- FIX (Finding 2): Scope to sale_id to prevent cross-sale idempotency replay
    SELECT * INTO v_existing_fulfillment
    FROM public.sale_fulfillments
    WHERE idempotency_key = p_idempotency_key
      AND sale_id = p_sale_id;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'success', true,
            'idempotent', true,
            'fulfillment_id', v_existing_fulfillment.id,
            'fulfillment_number', v_existing_fulfillment.fulfillment_number,
            'sale_id', v_existing_fulfillment.sale_id,
            'handed_over_by_name', v_existing_fulfillment.handed_over_by_name,
            'created_at', v_existing_fulfillment.created_at
        );
    END IF;

    -- 3. Lock Target Sale Row FOR UPDATE
    SELECT * INTO v_sale
    FROM public.sales
    WHERE id = p_sale_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Sale record not found.');
    END IF;

    -- 4. Post-Lock Idempotency Verification
    -- FIX (Finding 2): Scope to sale_id
    SELECT * INTO v_existing_fulfillment
    FROM public.sale_fulfillments
    WHERE idempotency_key = p_idempotency_key
      AND sale_id = p_sale_id;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'success', true,
            'idempotent', true,
            'fulfillment_id', v_existing_fulfillment.id,
            'fulfillment_number', v_existing_fulfillment.fulfillment_number,
            'sale_id', v_existing_fulfillment.sale_id,
            'handed_over_by_name', v_existing_fulfillment.handed_over_by_name,
            'created_at', v_existing_fulfillment.created_at
        );
    END IF;

    -- 5. Strict Commercial Sale Eligibility (Structural & Invariant-Based)
    -- Must have durable quotation_id
    IF v_sale.quotation_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Only quotation-origin commercial invoices can be fulfilled through warehouse handover.'
        );
    END IF;

    -- Explicit guard against POS sales (receipt prefix or cashier presence)
    IF (v_sale.receipt_number LIKE 'FTC-POS-%' OR v_sale.receipt_number LIKE 'POS-%' OR v_sale.cashier_id IS NOT NULL) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'POS sales cannot be fulfilled through the commercial warehouse handover workflow.'
        );
    END IF;

    -- Must have valid issued invoice number
    IF v_sale.invoice_number IS NULL OR LENGTH(TRIM(v_sale.invoice_number)) = 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Commercial sale must have an issued invoice number.'
        );
    END IF;

    -- Revocation guard
    IF v_sale.invoice_revoked_at IS NOT NULL OR v_sale.status = 'revoked' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Cannot fulfill a revoked commercial invoice.'
        );
    END IF;

    -- Voided guard
    IF v_sale.status = 'voided' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Cannot fulfill a voided commercial invoice.'
        );
    END IF;

    -- 6. Validate Requested Items
    IF p_items IS NULL OR jsonb_typeof(p_items) != 'array' OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'At least one line item must be specified for fulfillment.');
    END IF;

    -- 7. Generate Concurrency-Safe Delivery Note Number
    v_dn_number := public.generate_delivery_note_number();
    v_actor_name := COALESCE(NULLIF(TRIM(p_actor_name), ''), 'Admin Staff');

    -- 8. Create Master Fulfillment Record (With Concurrency Race Protection)
    BEGIN
        INSERT INTO public.sale_fulfillments (
            sale_id,
            fulfillment_number,
            idempotency_key,
            handed_over_by_profile_id,
            handed_over_by_name,
            recipient_name,
            recipient_phone,
            notes,
            created_at
        ) VALUES (
            p_sale_id,
            v_dn_number,
            p_idempotency_key,
            p_actor_profile_id,
            v_actor_name,
            NULLIF(TRIM(p_recipient_name), ''),
            NULLIF(TRIM(p_recipient_phone), ''),
            NULLIF(TRIM(p_notes), ''),
            NOW()
        )
        RETURNING id INTO v_fulfillment_id;
    EXCEPTION WHEN unique_violation THEN
        -- Fallback catch for concurrent race on idempotency_key
        SELECT * INTO v_existing_fulfillment
        FROM public.sale_fulfillments
        WHERE idempotency_key = p_idempotency_key
          AND sale_id = p_sale_id;

        IF FOUND THEN
            RETURN jsonb_build_object(
                'success', true,
                'idempotent', true,
                'fulfillment_id', v_existing_fulfillment.id,
                'fulfillment_number', v_existing_fulfillment.fulfillment_number,
                'sale_id', v_existing_fulfillment.sale_id,
                'handed_over_by_name', v_existing_fulfillment.handed_over_by_name,
                'created_at', v_existing_fulfillment.created_at,
                'message', 'Fulfillment was concurrently completed by another request.'
            );
        ELSE
            RAISE;
        END IF;
    END;

    -- 9. Process Each Line Item Atomically
    FOR v_item_elem IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_sale_item_id := (v_item_elem->>'sale_item_id')::UUID;
        v_req_qty := COALESCE((v_item_elem->>'quantity')::INT, 0);
        v_non_inventory_flag := COALESCE((v_item_elem->>'non_inventory_line')::BOOLEAN, false);
        v_unit_ids := v_item_elem->'unit_ids';

        IF v_sale_item_id IS NULL THEN
            RAISE EXCEPTION 'Every fulfillment item must specify a valid sale_item_id.';
        END IF;

        IF v_req_qty <= 0 THEN
            RAISE EXCEPTION 'Requested fulfillment quantity must be greater than 0.';
        END IF;

        -- Lock the sale_item row FOR UPDATE
        SELECT * INTO v_sale_item
        FROM public.sale_items
        WHERE id = v_sale_item_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Sale item % not found.', v_sale_item_id;
        END IF;

        IF v_sale_item.sale_id != p_sale_id THEN
            RAISE EXCEPTION 'Sale item % does not belong to sale %.', v_sale_item_id, p_sale_id;
        END IF;

        -- Calculate remaining unfulfilled quantity
        v_remaining_qty := v_sale_item.quantity - v_sale_item.quantity_fulfilled;

        IF v_req_qty > v_remaining_qty THEN
            RAISE EXCEPTION 'Requested quantity (%) exceeds remaining unfulfilled quantity (%) for item "%".',
                v_req_qty, v_remaining_qty, COALESCE(v_sale_item.product_name, 'Line Item');
        END IF;

        -- Check Product Identity
        IF v_sale_item.product_id IS NULL THEN
            -- Non-catalog line policy
            IF NOT v_non_inventory_flag THEN
                RAISE EXCEPTION 'Line "%" has no linked catalog product. It must be explicitly confirmed with non_inventory_line = true to record handover.',
                    COALESCE(v_sale_item.product_name, 'Line Item');
            END IF;

            -- Record fulfillment item without stock mutation
            INSERT INTO public.sale_fulfillment_items (
                fulfillment_id,
                sale_item_id,
                product_id,
                quantity,
                unit_id,
                serial_number,
                barcode,
                created_at
            ) VALUES (
                v_fulfillment_id,
                v_sale_item_id,
                NULL,
                v_req_qty,
                NULL,
                NULL,
                NULL,
                NOW()
            );

            -- Increment quantity_fulfilled
            UPDATE public.sale_items
            SET quantity_fulfilled = quantity_fulfilled + v_req_qty
            WHERE id = v_sale_item_id;

            v_has_unclassified_lines := true;
        ELSE
            -- Catalog product: non_inventory_flag MUST NOT bypass catalog inventory
            IF v_non_inventory_flag THEN
                RAISE EXCEPTION 'Line "%" is linked to catalog product % and cannot be bypassed with non_inventory_line = true.',
                    COALESCE(v_sale_item.product_name, 'Line Item'), v_sale_item.product_id;
            END IF;

            -- Lock Product Row FOR UPDATE
            SELECT * INTO v_product
            FROM public.products
            WHERE id = v_sale_item.product_id
            FOR UPDATE;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Catalog product % ("%") was not found.', v_sale_item.product_id, COALESCE(v_sale_item.product_name, 'Line Item');
            END IF;

            -- Branch on Explicit Inventory Tracking Type
            IF v_product.inventory_tracking_type = 'counter' THEN
                -- COUNTER INVENTORY PATH
                IF v_product.count_in_stock < v_req_qty THEN
                    RAISE EXCEPTION 'Insufficient stock for counter product "%" (available: %, requested: %).',
                        v_product.name, v_product.count_in_stock, v_req_qty;
                END IF;

                -- Atomically decrement stock
                UPDATE public.products
                SET count_in_stock = count_in_stock - v_req_qty,
                    updated_at = NOW()
                WHERE id = v_product.id
                  AND inventory_tracking_type = 'counter'
                  AND count_in_stock >= v_req_qty;

                IF NOT FOUND THEN
                    RAISE EXCEPTION 'Concurrent modification detected while updating stock for product "%".', v_product.name;
                END IF;

                -- Record single fulfillment item for requested quantity
                INSERT INTO public.sale_fulfillment_items (
                    fulfillment_id,
                    sale_item_id,
                    product_id,
                    quantity,
                    unit_id,
                    serial_number,
                    barcode,
                    created_at
                ) VALUES (
                    v_fulfillment_id,
                    v_sale_item_id,
                    v_product.id,
                    v_req_qty,
                    NULL,
                    NULL,
                    NULL,
                    NOW()
                );

                -- Increment quantity_fulfilled
                UPDATE public.sale_items
                SET quantity_fulfilled = quantity_fulfilled + v_req_qty
                WHERE id = v_sale_item_id;

            ELSIF v_product.inventory_tracking_type = 'unit' THEN
                -- UNIT INVENTORY PATH
                IF v_unit_ids IS NULL OR jsonb_typeof(v_unit_ids) != 'array' THEN
                    RAISE EXCEPTION 'Product "%" tracks individual physical units. Specific unit_ids array is required.',
                        v_product.name;
                END IF;

                v_claimed_units_count := jsonb_array_length(v_unit_ids);
                IF v_claimed_units_count != v_req_qty THEN
                    RAISE EXCEPTION 'Number of unit IDs provided (%) must exactly equal requested quantity (%) for item "%".',
                        v_claimed_units_count, v_req_qty, COALESCE(v_sale_item.product_name, 'Line Item');
                END IF;

                -- Iterate each requested physical unit
                FOR v_unit_id_elem IN SELECT * FROM jsonb_array_elements(v_unit_ids)
                LOOP
                    v_unit_id := (v_unit_id_elem#>>'{}'::text[])::UUID;
                    IF v_unit_id IS NULL THEN
                        RAISE EXCEPTION 'Invalid null unit ID provided for item "%".', COALESCE(v_sale_item.product_name, 'Line Item');
                    END IF;

                    -- Check for duplicate unit IDs in the current request
                    IF v_unit_id = ANY(v_seen_unit_ids) THEN
                        RAISE EXCEPTION 'Duplicate unit ID % specified in fulfillment request for "%".',
                            v_unit_id, COALESCE(v_sale_item.product_name, 'Line Item');
                    END IF;
                    v_seen_unit_ids := array_append(v_seen_unit_ids, v_unit_id);

                    -- Lock and validate unit in stock_management
                    SELECT * INTO v_unit_record
                    FROM public.stock_management
                    WHERE id = v_unit_id
                    FOR UPDATE;

                    IF NOT FOUND THEN
                        RAISE EXCEPTION 'Physical unit % does not exist.', v_unit_id;
                    END IF;

                    IF v_unit_record.product_id != v_sale_item.product_id THEN
                        RAISE EXCEPTION 'Physical unit % belongs to product % (expected product % "%").',
                            v_unit_id, v_unit_record.product_id, v_sale_item.product_id, COALESCE(v_sale_item.product_name, 'Line Item');
                    END IF;

                    IF v_unit_record.status != 'available' THEN
                        RAISE EXCEPTION 'Physical unit % ("%") is not available (current status: %).',
                            v_unit_id, COALESCE(v_unit_record.serial_number, v_unit_record.barcode, 'N/A'), v_unit_record.status;
                    END IF;

                    -- Transition unit from 'available' to 'sold'
                    UPDATE public.stock_management
                    SET status = 'sold',
                        order_id = v_sale.id::TEXT,
                        notes = COALESCE(notes, '') || CASE
                            WHEN COALESCE(notes, '') = '' THEN 'Fulfilled via Delivery Note ' || v_dn_number
                            ELSE ' | Fulfilled via Delivery Note ' || v_dn_number
                        END,
                        updated_at = NOW()
                    WHERE id = v_unit_id
                      AND status = 'available';

                    IF NOT FOUND THEN
                        RAISE EXCEPTION 'Failed to claim physical unit % for product "%".', v_unit_id, v_product.name;
                    END IF;

                    -- Insert one fulfillment item row per physical unit (quantity = 1)
                    INSERT INTO public.sale_fulfillment_items (
                        fulfillment_id,
                        sale_item_id,
                        product_id,
                        quantity,
                        unit_id,
                        serial_number,
                        barcode,
                        created_at
                    ) VALUES (
                        v_fulfillment_id,
                        v_sale_item_id,
                        v_product.id,
                        1,
                        v_unit_id,
                        v_unit_record.serial_number,
                        v_unit_record.barcode,
                        NOW()
                    );
                END LOOP;

                -- MANDATORY: Recount available physical units for count_in_stock
                UPDATE public.products
                SET count_in_stock = (
                    SELECT COUNT(*)
                    FROM public.stock_management
                    WHERE product_id = v_product.id
                      AND status = 'available'
                ),
                updated_at = NOW()
                WHERE id = v_product.id;

                -- Increment quantity_fulfilled
                UPDATE public.sale_items
                SET quantity_fulfilled = quantity_fulfilled + v_req_qty
                WHERE id = v_sale_item_id;

            ELSE
                RAISE EXCEPTION 'Unrecognized inventory_tracking_type "%" for product "%".',
                    v_product.inventory_tracking_type, v_product.name;
            END IF;
        END IF;
    END LOOP;

    -- 10. Compute Derived Catalog Fulfillment Status
    -- FIX (Finding 3): Re-derive v_catalog_lines_count from ALL sale_items,
    -- not just items processed in the current request. This ensures accurate
    -- HANDED_OVER vs PARTIALLY_HANDED_OVER determination for partial fulfillments.
    v_catalog_lines_count := 0;
    v_all_catalog_items_fulfilled := true;
    v_any_catalog_items_fulfilled := false;
    v_has_unclassified_lines := false;

    FOR v_item_cursor IN
        SELECT product_id, quantity, quantity_fulfilled
        FROM public.sale_items
        WHERE sale_id = p_sale_id
    LOOP
        IF v_item_cursor.product_id IS NULL THEN
            v_has_unclassified_lines := true;
        ELSE
            v_catalog_lines_count := v_catalog_lines_count + 1;
            IF v_item_cursor.quantity_fulfilled > 0 THEN
                v_any_catalog_items_fulfilled := true;
            END IF;
            IF v_item_cursor.quantity_fulfilled < v_item_cursor.quantity THEN
                v_all_catalog_items_fulfilled := false;
            END IF;
        END IF;
    END LOOP;

    IF v_catalog_lines_count = 0 THEN
        v_catalog_status := 'NON_CATALOG';
    ELSIF v_all_catalog_items_fulfilled THEN
        v_catalog_status := 'HANDED_OVER';
    ELSIF v_any_catalog_items_fulfilled THEN
        v_catalog_status := 'PARTIALLY_HANDED_OVER';
    ELSE
        v_catalog_status := 'NOT_HANDED_OVER';
    END IF;

    -- 11. Return Authoritative Success Payload
    RETURN jsonb_build_object(
        'success', true,
        'idempotent', false,
        'fulfillment_id', v_fulfillment_id,
        'fulfillment_number', v_dn_number,
        'sale_id', p_sale_id,
        'handed_over_by_name', v_actor_name,
        'created_at', NOW(),
        'catalog_fulfillment_status', v_catalog_status,
        'has_unclassified_lines', v_has_unclassified_lines
    );
END;
$function$;

-- Hardened permissions
REVOKE EXECUTE ON FUNCTION public.fulfill_commercial_sale_items_atomic(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fulfill_commercial_sale_items_atomic(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fulfill_commercial_sale_items_atomic(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_commercial_sale_items_atomic(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB) TO service_role;


-- ============================================================================
-- 3. HARDEN create_pos_sale_atomic: Canonical unit resolution + advisory lock
-- ============================================================================
-- Finding 4: The unit lookup `id::TEXT = v_unit_id OR serial_number = v_unit_id OR barcode = v_unit_id`
-- could match multiple rows if a barcode collides with another unit's serial. Fix resolves
-- to canonical UUID first, then uses it for all subsequent operations.
--
-- Finding 5: The idempotency check has a TOCTOU window between SELECT and INSERT.
-- Fix adds pg_advisory_xact_lock on the idempotency key hash to serialize concurrent
-- requests with the same key within the transaction.

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
        -- FIX (Finding 5): Acquire transaction-scoped advisory lock on idempotency key hash.
        -- This serializes concurrent requests with the same key, closing the TOCTOU window
        -- between the SELECT check and the INSERT.
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

            v_unit := NULL;

            -- FIX (Finding 4): Deterministic canonical UNIT resolution.
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
                ELSIF EXISTS (SELECT 1 FROM public.stock_management WHERE id = v_unit_id::UUID) THEN
                    RAISE EXCEPTION 'Unit % does not belong to product "%".', v_unit_id, v_product.name;
                END IF;
            END IF;

            IF v_unit.id IS NULL THEN
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
            END IF;

            -- Check duplicate in cart using canonical unit UUID (v_unit.id)
            IF v_unit.id = ANY(v_claimed_unit_uuids) THEN
                RAISE EXCEPTION 'Unit % is included multiple times in the checkout request.', v_unit_id;
            END IF;
            v_claimed_unit_uuids := array_append(v_claimed_unit_uuids, v_unit.id);
            v_line_unit_mapping := v_line_unit_mapping || jsonb_build_object(v_item_idx::TEXT, v_unit.id::TEXT);

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

        -- FIX (Finding 4): Retrieve canonical unit UUID resolved during validation.
        -- Strictly query public.stock_management WHERE id = canonical_uuid.
        -- Eliminates second ambiguous multi-column (id OR serial_number OR barcode) lookup.
        IF v_product.inventory_tracking_type = 'unit' THEN
            v_resolved_unit_uuid := (v_line_unit_mapping->>v_item_idx::TEXT)::UUID;
            IF v_resolved_unit_uuid IS NOT NULL THEN
                SELECT * INTO v_unit
                FROM public.stock_management
                WHERE id = v_resolved_unit_uuid;
            ELSE
                v_unit := NULL;
            END IF;
        ELSE
            v_resolved_unit_uuid := NULL;
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
            CASE WHEN v_unit.id IS NOT NULL THEN v_unit.id::TEXT ELSE NULL END,
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

REVOKE EXECUTE ON FUNCTION public.create_pos_sale_atomic(JSONB, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_pos_sale_atomic(JSONB, JSONB) TO service_role;
