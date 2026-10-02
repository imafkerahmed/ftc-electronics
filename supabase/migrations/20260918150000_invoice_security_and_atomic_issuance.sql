-- ==============================================================================
-- FTC Electronics: Commercial Document Security & Atomic Invoice Issuance
-- Migration: 20260918150000_invoice_security_and_atomic_issuance.sql
-- ==============================================================================

-- 1. Tighten permissions on sequence & sequence generator function
REVOKE ALL ON SEQUENCE public.invoice_number_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.invoice_number_seq TO service_role;

REVOKE ALL ON FUNCTION public.generate_next_invoice_number() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_next_invoice_number() TO service_role;

-- 2. Atomic, serialized invoice issuance function with database row-level locking
CREATE OR REPLACE FUNCTION public.issue_order_invoice_atomic(
  p_order_id UUID,
  p_invoice_snapshot JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_invoice_num TEXT;
  v_invoiced_at TIMESTAMPTZ;
  v_snapshot JSONB;
BEGIN
  -- Acquire exclusive row-level lock on the order to prevent concurrent issuance race conditions
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order record not found.');
  END IF;

  -- Verify payment state authoritatively
  IF NOT (v_order.is_paid = true OR (v_order.payment_details->>'status' = 'paid') OR v_order.status = 'delivered' OR v_order.status = 'completed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot issue invoice: Order is not marked as paid.');
  END IF;

  -- If invoice was already issued, return the existing immutable snapshot idempotently
  IF v_order.invoice_number IS NOT NULL AND v_order.invoice_snapshot IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_issued', true,
      'invoice_number', v_order.invoice_number,
      'invoiced_at', v_order.invoiced_at,
      'invoice_snapshot', v_order.invoice_snapshot
    );
  END IF;

  -- Generate sequential invoice identity atomically inside the locked row transaction
  v_invoice_num := public.generate_next_invoice_number();
  v_invoiced_at := NOW();

  -- Merge invoice number and timestamp into snapshot
  v_snapshot := p_invoice_snapshot || jsonb_build_object(
    'invoiceNumber', v_invoice_num,
    'invoiceDate', to_char(v_invoiced_at, 'DD Mon YYYY'),
    'invoicedAt', v_invoiced_at
  );

  -- Persist immutable invoice identity to orders table
  UPDATE public.orders
  SET
    invoice_number = v_invoice_num,
    invoiced_at = v_invoiced_at,
    invoice_snapshot = v_snapshot,
    updated_at = NOW()
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'already_issued', false,
    'invoice_number', v_invoice_num,
    'invoiced_at', v_invoiced_at,
    'invoice_snapshot', v_snapshot
  );
END;
$$;

-- Restrict atomic issuance to service_role only (trusted server-side operations)
REVOKE ALL ON FUNCTION public.issue_order_invoice_atomic(UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_order_invoice_atomic(UUID, JSONB) TO service_role;
