-- ============================================================================
-- MIGRATION: 20260927150000_commercial_stock_handover_foundation.sql
-- DESCRIPTION: Phase 2 Commercial Stock Handover / Fulfillment Database Foundation
-- ============================================================================

-- 1. ADD QUANTITY_FULFILLED TO SALE_ITEMS
ALTER TABLE public.sale_items
ADD COLUMN IF NOT EXISTS quantity_fulfilled INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.sale_items
DROP CONSTRAINT IF EXISTS sale_items_quantity_fulfilled_check;

ALTER TABLE public.sale_items
ADD CONSTRAINT sale_items_quantity_fulfilled_check
CHECK (quantity_fulfilled >= 0 AND quantity_fulfilled <= quantity);

-- 2. CREATE DELIVERY NOTE NUMBER SEQUENCE & GENERATOR
CREATE SEQUENCE IF NOT EXISTS public.delivery_note_number_seq START WITH 1 INCREMENT BY 1;

CREATE OR REPLACE FUNCTION public.generate_delivery_note_number()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
    v_year TEXT := to_char(CURRENT_DATE, 'YYYY');
    v_seq BIGINT;
BEGIN
    v_seq := nextval('public.delivery_note_number_seq');
    RETURN 'DN-' || v_year || '-' || LPAD(v_seq::TEXT, 6, '0');
END;
$$;

-- 3. CREATE SALE_FULFILLMENTS TABLE
CREATE TABLE IF NOT EXISTS public.sale_fulfillments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE RESTRICT,
    fulfillment_number TEXT NOT NULL UNIQUE,
    idempotency_key UUID NOT NULL UNIQUE,
    handed_over_by_profile_id UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
    handed_over_by_name TEXT NOT NULL,
    recipient_name TEXT NULL,
    recipient_phone TEXT NULL,
    notes TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. CREATE SALE_FULFILLMENT_ITEMS TABLE
-- Note: unit_id is NOT globally UNIQUE here to preserve future return & resale compatibility.
CREATE TABLE IF NOT EXISTS public.sale_fulfillment_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fulfillment_id UUID NOT NULL REFERENCES public.sale_fulfillments(id) ON DELETE RESTRICT,
    sale_item_id UUID NOT NULL REFERENCES public.sale_items(id) ON DELETE RESTRICT,
    product_id UUID NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_id UUID NULL REFERENCES public.stock_management(id) ON DELETE RESTRICT,
    serial_number TEXT NULL,
    barcode TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. CREATE USEFUL INDEXES
CREATE INDEX IF NOT EXISTS idx_sale_fulfillments_sale_id ON public.sale_fulfillments(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_fulfillment_items_fulfillment_id ON public.sale_fulfillment_items(fulfillment_id);
CREATE INDEX IF NOT EXISTS idx_sale_fulfillment_items_sale_item_id ON public.sale_fulfillment_items(sale_item_id);
CREATE INDEX IF NOT EXISTS idx_sale_fulfillment_items_product_id ON public.sale_fulfillment_items(product_id);

-- 6. IMPLEMENT ATOMIC COMMERCIAL FULFILLMENT RPC
CREATE OR REPLACE FUNCTION public.fulfill_commercial_sale_items_atomic(
    p_sale_id UUID,
    p_idempotency_key UUID,
    p_actor_profile_id UUID DEFAULT NULL,
    p_actor_name TEXT DEFAULT NULL,
    p_recipient_name TEXT DEFAULT NULL,
    p_recipient_phone TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_items JSONB DEFAULT '[]'::jsonb
)
RETURNS jsonb
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

    -- 2. Check Idempotency Table
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

    -- 4. Validate Sale Eligibility (Commercial Invoices Only)
    IF v_sale.invoice_number IS NULL OR v_sale.quotation_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only quotation-backed commercial invoices can be fulfilled through this workflow.');
    END IF;

    IF v_sale.invoice_revoked_at IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot fulfill a revoked commercial invoice.');
    END IF;

    IF v_sale.status = 'voided' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot fulfill a voided commercial invoice.');
    END IF;

    -- 5. Validate Requested Items
    IF p_items IS NULL OR jsonb_typeof(p_items) != 'array' OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'At least one line item must be specified for fulfillment.');
    END IF;

    -- 6. Generate Concurrency-Safe Delivery Note Number
    v_dn_number := public.generate_delivery_note_number();
    v_actor_name := COALESCE(NULLIF(TRIM(p_actor_name), ''), 'Admin Staff');

    -- 7. Create Master Fulfillment Record
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

    -- 8. Process Requested Line Items
    FOR v_item_elem IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_sale_item_id := (v_item_elem->>'sale_item_id')::uuid;
        v_req_qty := (v_item_elem->>'quantity')::int;
        v_non_inventory_flag := COALESCE((v_item_elem->>'non_inventory_line')::boolean, false);
        v_unit_ids := v_item_elem->'unit_ids';

        IF v_sale_item_id IS NULL THEN
            RAISE EXCEPTION 'sale_item_id is required for all fulfillment items.';
        END IF;

        IF v_req_qty IS NULL OR v_req_qty <= 0 THEN
            RAISE EXCEPTION 'Requested fulfillment quantity must be a positive integer.';
        END IF;

        -- Lock sale_item FOR UPDATE
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

        v_remaining_qty := v_sale_item.quantity - v_sale_item.quantity_fulfilled;
        IF v_req_qty > v_remaining_qty THEN
            RAISE EXCEPTION 'Requested quantity (%) exceeds remaining unfulfilled quantity (%) for item "%".',
                v_req_qty, v_remaining_qty, v_sale_item.product_name;
        END IF;

        -- Check Product Association
        IF v_sale_item.product_id IS NULL THEN
            -- Custom / non-catalog line
            IF NOT v_non_inventory_flag THEN
                RAISE EXCEPTION 'Line "%" has no linked catalog product. It must be explicitly confirmed with non_inventory_line = true to record handover.',
                    v_sale_item.product_name;
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
                v_sale_item.id,
                NULL,
                v_req_qty,
                NULL,
                NULL,
                NULL,
                NOW()
            );

        ELSE
            -- Catalog Product Line
            IF v_non_inventory_flag THEN
                RAISE EXCEPTION 'Line "%" is linked to catalog product % and cannot be bypassed with non_inventory_line = true.',
                    v_sale_item.product_name, v_sale_item.product_id;
            END IF;

            -- Lock Product FOR UPDATE
            SELECT * INTO v_product
            FROM public.products
            WHERE id = v_sale_item.product_id
            FOR UPDATE;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Catalog product % for line "%" was not found in catalog.',
                    v_sale_item.product_id, v_sale_item.product_name;
            END IF;

            -- Inspect Explicit Inventory Model
            IF v_product.inventory_tracking_type = 'counter' THEN
                -- COUNTER STOCK PATH
                IF v_product.count_in_stock < v_req_qty THEN
                    RAISE EXCEPTION 'Insufficient stock for counter product "%" (available: %, requested: %).',
                        v_product.name, v_product.count_in_stock, v_req_qty;
                END IF;

                UPDATE public.products
                SET count_in_stock = count_in_stock - v_req_qty,
                    updated_at = NOW()
                WHERE id = v_product.id
                  AND inventory_tracking_type = 'counter'
                  AND count_in_stock >= v_req_qty;

                IF NOT FOUND THEN
                    RAISE EXCEPTION 'Concurrency conflict while updating counter stock for product "%".', v_product.name;
                END IF;

                -- Record single fulfillment item for counter line
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
                    v_sale_item.id,
                    v_product.id,
                    v_req_qty,
                    NULL,
                    NULL,
                    NULL,
                    NOW()
                );

            ELSIF v_product.inventory_tracking_type = 'unit' THEN
                -- UNIT STOCK PATH
                IF v_unit_ids IS NULL OR jsonb_typeof(v_unit_ids) != 'array' THEN
                    RAISE EXCEPTION 'Line "%" is an individually tracked unit product and requires exact unit_ids array.',
                        v_product.name;
                END IF;

                IF jsonb_array_length(v_unit_ids) != v_req_qty THEN
                    RAISE EXCEPTION 'Number of unit IDs provided (%) must exactly equal requested quantity (%) for item "%".',
                        jsonb_array_length(v_unit_ids), v_req_qty, v_product.name;
                END IF;

                v_claimed_units_count := 0;

                -- Iterate and claim each physical unit
                FOR v_unit_id_elem IN SELECT * FROM jsonb_array_elements(v_unit_ids)
                LOOP
                    v_unit_id := (v_unit_id_elem#>>'{}')::uuid;

                    IF v_unit_id IS NULL THEN
                        RAISE EXCEPTION 'Invalid null unit ID in unit_ids array for "%".', v_product.name;
                    END IF;

                    -- Check duplicate unit ID within same request
                    IF v_unit_id = ANY(v_seen_unit_ids) THEN
                        RAISE EXCEPTION 'Duplicate unit ID % specified in fulfillment request for "%".', v_unit_id, v_product.name;
                    END IF;
                    v_seen_unit_ids := array_append(v_seen_unit_ids, v_unit_id);

                    -- Lock and validate unit in stock_management
                    SELECT * INTO v_unit_record
                    FROM public.stock_management
                    WHERE id = v_unit_id
                    FOR UPDATE;

                    IF NOT FOUND THEN
                        RAISE EXCEPTION 'Physical unit % does not exist in stock management.', v_unit_id;
                    END IF;

                    IF v_unit_record.product_id != v_product.id THEN
                        RAISE EXCEPTION 'Physical unit % belongs to product % (expected product % "%").',
                            v_unit_id, v_unit_record.product_id, v_product.id, v_product.name;
                    END IF;

                    IF v_unit_record.status != 'available' THEN
                        RAISE EXCEPTION 'Physical unit % (barcode: %, SN: %) is not available (current status: "%"). Cannot fulfill.',
                            v_unit_id, v_unit_record.barcode, COALESCE(v_unit_record.serial_number, 'N/A'), v_unit_record.status;
                    END IF;

                    -- Claim unit: transition available -> sold
                    UPDATE public.stock_management
                    SET status = 'sold',
                        order_id = p_sale_id::text,
                        updated_at = NOW()
                    WHERE id = v_unit_id
                      AND status = 'available';

                    IF NOT FOUND THEN
                        RAISE EXCEPTION 'Conflict: Physical unit % was claimed concurrently.', v_unit_id;
                    END IF;

                    v_claimed_units_count := v_claimed_units_count + 1;

                    -- Record individual fulfillment item per physical unit
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
                        v_sale_item.id,
                        v_product.id,
                        1,
                        v_unit_record.id,
                        v_unit_record.serial_number,
                        v_unit_record.barcode,
                        NOW()
                    );
                END LOOP;

                -- RECOUNT products.count_in_stock directly from available physical units
                UPDATE public.products
                SET count_in_stock = (
                    SELECT COUNT(*)
                    FROM public.stock_management
                    WHERE product_id = v_product.id
                      AND status = 'available'
                ),
                updated_at = NOW()
                WHERE id = v_product.id;

            ELSE
                RAISE EXCEPTION 'Invalid inventory_tracking_type "%" for product "%".',
                    v_product.inventory_tracking_type, v_product.name;
            END IF;
        END IF;

        -- 9. Increment quantity_fulfilled on sale_items
        UPDATE public.sale_items
        SET quantity_fulfilled = quantity_fulfilled + v_req_qty,
            updated_at = NOW()
        WHERE id = v_sale_item.id;

    END LOOP;

    -- 10. Calculate Overall Fulfillment Status
    FOR v_item_cursor IN
        SELECT id, product_id, quantity, quantity_fulfilled
        FROM public.sale_items
        WHERE sale_id = p_sale_id
    LOOP
        IF v_item_cursor.product_id IS NULL THEN
            v_has_unclassified_lines := true;
        ELSE
            v_catalog_lines_count := v_catalog_lines_count + 1;
            IF v_item_cursor.quantity_fulfilled < v_item_cursor.quantity THEN
                v_all_catalog_items_fulfilled := false;
            END IF;
            IF v_item_cursor.quantity_fulfilled > 0 THEN
                v_any_catalog_items_fulfilled := true;
            END IF;
        END IF;
    END LOOP;

    IF v_catalog_lines_count = 0 THEN
        v_catalog_status := 'NOT APPLICABLE';
    ELSIF v_all_catalog_items_fulfilled THEN
        v_catalog_status := 'HANDED OVER';
    ELSIF v_any_catalog_items_fulfilled THEN
        v_catalog_status := 'PARTIALLY HANDED OVER';
    ELSE
        v_catalog_status := 'NOT HANDED OVER';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'idempotent', false,
        'fulfillment_id', v_fulfillment_id,
        'fulfillment_number', v_dn_number,
        'sale_id', p_sale_id,
        'invoice_number', v_sale.invoice_number,
        'handed_over_by_name', v_actor_name,
        'catalog_fulfillment_status', v_catalog_status,
        'has_unclassified_lines', v_has_unclassified_lines,
        'created_at', NOW()
    );
END;
$function$;

-- 7. HARDEN INVOICE REVOCATION WITH FULFILLMENT GUARD
-- Preserves ALL existing financial and lifecycle checks
CREATE OR REPLACE FUNCTION public.revoke_invoice_atomic(
    p_sale_id uuid,
    p_reason text,
    p_notes text DEFAULT NULL::text,
    p_revoked_by text DEFAULT 'Staff'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_sale RECORD;
    v_gross_cleared NUMERIC(12, 2) := 0;
    v_returned_amount NUMERIC(12, 2) := 0;
    v_effective_cleared NUMERIC(12, 2) := 0;
    v_pending_clearance NUMERIC(12, 2) := 0;
    v_clean_reason TEXT;
    v_clean_notes TEXT;
    v_actor TEXT;
BEGIN
    -- 1. Lock sales row exclusively
    SELECT * INTO v_sale
    FROM public.sales
    WHERE id = p_sale_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Sale record not found.');
    END IF;

    -- 2. Validate it is an issued commercial invoice
    IF v_sale.invoice_number IS NULL OR LENGTH(TRIM(v_sale.invoice_number)) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only issued commercial invoices can be revoked.');
    END IF;

    -- 3. Validate invoice is not already revoked
    IF v_sale.invoice_revoked_at IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invoice ' || v_sale.invoice_number || ' is already revoked on ' || to_char(v_sale.invoice_revoked_at, 'YYYY-MM-DD HH24:MI') || '.'
        );
    END IF;

    -- 4. Validate sale is not a voided POS sale
    IF v_sale.status = 'voided' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot revoke a voided POS sale.');
    END IF;

    -- 5. PHYSICAL FULFILLMENT GUARD:
    -- Cannot revoke invoice if products were physically handed over.
    IF EXISTS (SELECT 1 FROM public.sale_fulfillments WHERE sale_id = p_sale_id)
       OR EXISTS (SELECT 1 FROM public.sale_items WHERE sale_id = p_sale_id AND quantity_fulfilled > 0) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invoice has handed-over products. Return the products before revoking the invoice.'
        );
    END IF;

    -- 6. Calculate authoritative cleared payments and reversals
    SELECT
        COALESCE(SUM(amount) FILTER (WHERE status = 'cleared'), 0),
        COALESCE(SUM(amount) FILTER (WHERE payment_method = 'cheque' AND status = 'pending'), 0)
    INTO v_gross_cleared, v_pending_clearance
    FROM public.sale_payments
    WHERE sale_id = p_sale_id;

    SELECT COALESCE(SUM(amount), 0)
    INTO v_returned_amount
    FROM public.sale_payment_reversals
    WHERE sale_id = p_sale_id;

    v_effective_cleared := GREATEST(0, v_gross_cleared - v_returned_amount);

    -- 7. Enforce Revocation Eligibility Rules
    IF v_effective_cleared > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Cannot revoke invoice with active cleared payments. Outstanding effective cleared payments: LKR ' || v_effective_cleared::text || '. Please return/reverse all payments first.'
        );
    END IF;

    IF v_pending_clearance > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Cannot revoke invoice with pending cheques. Outstanding pending cheques: LKR ' || v_pending_clearance::text || '. Please resolve, bounce, or cancel pending cheques first.'
        );
    END IF;

    -- 8. Validate Reason and Notes
    v_clean_reason := TRIM(COALESCE(p_reason, ''));
    IF LENGTH(v_clean_reason) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'A valid revocation reason is required.');
    END IF;

    v_clean_notes := NULLIF(TRIM(COALESCE(p_notes, '')), '');
    IF LOWER(v_clean_reason) = 'other' AND v_clean_notes IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Notes/details are required when selecting reason "Other".');
    END IF;

    v_actor := COALESCE(NULLIF(TRIM(p_revoked_by), ''), 'Staff');

    -- 9. Mark invoice revoked
    UPDATE public.sales
    SET
        invoice_revoked_at = NOW(),
        invoice_revoked_by = v_actor,
        invoice_revoke_reason = v_clean_reason,
        invoice_revoke_notes = v_clean_notes,
        updated_at = NOW()
    WHERE id = p_sale_id;

    RETURN jsonb_build_object(
        'success', true,
        'sale_id', p_sale_id,
        'invoice_number', v_sale.invoice_number,
        'invoice_revoked_at', NOW(),
        'invoice_revoked_by', v_actor,
        'invoice_revoke_reason', v_clean_reason,
        'invoice_revoke_notes', v_clean_notes
    );
END;
$function$;

-- 8. RPC SECURITY GRANTS
REVOKE EXECUTE ON FUNCTION public.fulfill_commercial_sale_items_atomic FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fulfill_commercial_sale_items_atomic FROM anon;
REVOKE EXECUTE ON FUNCTION public.fulfill_commercial_sale_items_atomic FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_commercial_sale_items_atomic TO service_role;

REVOKE EXECUTE ON FUNCTION public.generate_delivery_note_number FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_delivery_note_number FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_delivery_note_number FROM authenticated;
GRANT EXECUTE ON FUNCTION public.generate_delivery_note_number TO service_role;
