-- Migration: 20260927160000_commercial_fulfillment_eligibility_hardening.sql
-- Description:
--   Phase 2B: Commercial fulfillment eligibility hardening & idempotency concurrency safety.
--   1. Removes presentation-based document prefix authorization ('INV-%').
--   2. Enforces strict structural eligibility: quotation_id IS NOT NULL, non-POS, valid invoice_number.
--   3. Hardens idempotency against concurrent races using post-lock verification and unique_violation handling.
--   4. Preserves payment state independence (UNPAID, BALANCE PENDING, PAID remain eligible).

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
    SELECT * INTO v_existing_fulfillment
    FROM public.sale_fulfillments
    WHERE idempotency_key = p_idempotency_key;

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
    -- If a concurrent transaction with the same idempotency key was queued on the sale row lock,
    -- it will find the winner's committed fulfillment here and exit cleanly without duplicate mutation.
    SELECT * INTO v_existing_fulfillment
    FROM public.sale_fulfillments
    WHERE idempotency_key = p_idempotency_key;

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
        WHERE idempotency_key = p_idempotency_key;

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

            v_catalog_lines_count := v_catalog_lines_count + 1;

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
                    v_unit_id := (v_unit_id_elem#>>'{}')::UUID;
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
    FOR v_item_cursor IN
        SELECT product_id, quantity, quantity_fulfilled
        FROM public.sale_items
        WHERE sale_id = p_sale_id
    LOOP
        IF v_item_cursor.product_id IS NULL THEN
            v_has_unclassified_lines := true;
        ELSE
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
