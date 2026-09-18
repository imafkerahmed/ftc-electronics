-- =============================================================================
-- Migration: Commercial Document Invoices & Numbering
-- Description: Establishes a dedicated, sequential PostgreSQL sequence for invoices,
--              adds immutable invoice identity columns (invoice_number, invoiced_at,
--              invoice_snapshot, invoice_pdf_url) to orders and sales, and creates
--              a database-level invoice generator function.
-- =============================================================================

-- 1. Create PostgreSQL sequence for sequential invoice numbering
CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq START WITH 1 INCREMENT BY 1;

-- 2. Create database function to generate formatted invoice numbers e.g. INV-2026-000001
CREATE OR REPLACE FUNCTION public.generate_next_invoice_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  next_val BIGINT;
  year_str TEXT;
BEGIN
  next_val := nextval('public.invoice_number_seq');
  year_str := to_char(CURRENT_DATE, 'YYYY');
  RETURN 'INV-' || year_str || '-' || LPAD(next_val::TEXT, 6, '0');
END;
$$;

-- Grant execution on sequence and function to authenticated and service_role
GRANT USAGE, SELECT ON SEQUENCE public.invoice_number_seq TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_next_invoice_number() TO authenticated, service_role;

-- 3. Add invoice columns to public.orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS invoice_number TEXT UNIQUE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS invoiced_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS invoice_snapshot JSONB;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS invoice_pdf_url TEXT;

-- Create index for fast lookups by invoice_number
CREATE INDEX IF NOT EXISTS idx_orders_invoice_number ON public.orders(invoice_number);

-- 4. Add invoice columns to public.sales table (for POS / Wholesale sales)
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS invoice_number TEXT;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS invoiced_at TIMESTAMPTZ;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS invoice_snapshot JSONB;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS invoice_pdf_url TEXT;

CREATE INDEX IF NOT EXISTS idx_sales_invoice_number ON public.sales(invoice_number);
