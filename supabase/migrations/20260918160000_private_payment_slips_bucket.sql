-- ==============================================================================
-- FTC Electronics: Private Storage Bucket for Bank Transfer Payment Slips
-- Migration: 20260918160000_private_payment_slips_bucket.sql
-- ==============================================================================

-- 1. Create or configure private storage bucket for payment slips
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ftc-payment-slips',
  'ftc-payment-slips',
  false,
  10485760, -- 10MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

-- 2. Storage RLS Security: Direct anon/authenticated public reads are disabled
-- All sensitive uploads and signed URL generations are mediated through authorized server actions.
