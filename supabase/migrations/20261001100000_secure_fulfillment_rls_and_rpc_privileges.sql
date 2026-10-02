-- Migration: 20261001100000_secure_fulfillment_rls_and_rpc_privileges.sql
-- Purpose:
-- 1. Enable RLS on sale_fulfillments and sale_fulfillment_items
-- 2. Revoke public/anon/authenticated access on fulfillment tables and restrict to service_role
-- 3. Hardening RPC execute privileges for invoice & reversal generators and order invoice issuance

-- ============================================================================
-- 1. ROW LEVEL SECURITY ON COMMERCIAL FULFILLMENT TABLES
-- ============================================================================

ALTER TABLE public.sale_fulfillments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_fulfillment_items ENABLE ROW LEVEL SECURITY;

-- Revoke all direct privileges from PUBLIC, anon, and authenticated
REVOKE ALL ON public.sale_fulfillments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.sale_fulfillment_items FROM PUBLIC, anon, authenticated;

-- Grant complete administrative privileges to service_role
GRANT ALL ON public.sale_fulfillments TO service_role;
GRANT ALL ON public.sale_fulfillment_items TO service_role;

-- Drop any previous policies to guarantee clean, deterministic state
DROP POLICY IF EXISTS "service_role_manage_sale_fulfillments" ON public.sale_fulfillments;
DROP POLICY IF EXISTS "service_role_manage_sale_fulfillment_items" ON public.sale_fulfillment_items;

-- Restrictive policies permitting ONLY service_role (all app interactions use service_role / RPCs)
CREATE POLICY "service_role_manage_sale_fulfillments" ON public.sale_fulfillments
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role_manage_sale_fulfillment_items" ON public.sale_fulfillment_items
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 2. PRIVILEGED DOCUMENT & SEQUENCE RPC HARDENING
-- ============================================================================

-- A. issue_order_invoice_atomic
REVOKE EXECUTE ON FUNCTION public.issue_order_invoice_atomic(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_order_invoice_atomic(uuid, jsonb) TO service_role;

-- B. generate_next_invoice_number
REVOKE EXECUTE ON FUNCTION public.generate_next_invoice_number() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_next_invoice_number() TO service_role;
ALTER FUNCTION public.generate_next_invoice_number() SET search_path = public;

-- C. generate_reversal_number
REVOKE EXECUTE ON FUNCTION public.generate_reversal_number() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_reversal_number() TO service_role;
ALTER FUNCTION public.generate_reversal_number() SET search_path = public;

-- D. admin_get_cheque_register_metrics
REVOKE EXECUTE ON FUNCTION public.admin_get_cheque_register_metrics(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_cheque_register_metrics(text) TO service_role;

-- E. generate_delivery_note_number
REVOKE EXECUTE ON FUNCTION public.generate_delivery_note_number() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_delivery_note_number() TO service_role;
ALTER FUNCTION public.generate_delivery_note_number() SET search_path = public;
