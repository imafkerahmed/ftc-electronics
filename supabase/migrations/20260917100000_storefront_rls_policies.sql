-- =============================================================================
-- Migration: Storefront Row-Level Security (RLS) & Least-Privilege Grants
-- Description: Grants safe read-only SELECT permissions to anon & authenticated
--              roles for public storefront entities while keeping mutations and
--              sensitive records strictly restricted.
-- =============================================================================

-- 1. Explicitly ensure least-privilege table grants on schema public
-- Revoke all mutation permissions from the anonymous role
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon;

-- Explicitly revoke direct mutation permissions from authenticated users on storefront tables
-- (All administrative mutations route through authenticated server actions using service-role)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.products FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.categories FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.brands FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.homepage_blocks FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.hero_banners FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.site_settings FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.promotions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.announcements FROM authenticated;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.reviews FROM authenticated;

-- Grant SELECT only on public storefront tables
GRANT SELECT ON public.products TO anon, authenticated;
GRANT SELECT ON public.categories TO anon, authenticated;
GRANT SELECT ON public.brands TO anon, authenticated;
GRANT SELECT ON public.homepage_blocks TO anon, authenticated;
GRANT SELECT ON public.hero_banners TO anon, authenticated;
GRANT SELECT ON public.reviews TO anon, authenticated;
GRANT SELECT ON public.site_settings TO anon, authenticated;
GRANT SELECT ON public.promotions TO anon, authenticated;
GRANT SELECT ON public.announcements TO anon, authenticated;

-- Allow submission of product reviews (insert only with pending status & unverified/unfeatured flags enforced by RLS)
GRANT INSERT ON public.reviews TO anon, authenticated;

-- 2. Enable Row-Level Security (RLS) on all storefront tables
ALTER TABLE IF EXISTS public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.homepage_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.hero_banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.announcements ENABLE ROW LEVEL SECURITY;

-- 3. Drop existing policies if already defined to prevent collision
DROP POLICY IF EXISTS "Public can view published products" ON public.products;
DROP POLICY IF EXISTS "Public can view active categories" ON public.categories;
DROP POLICY IF EXISTS "Public can view brands" ON public.brands;
DROP POLICY IF EXISTS "Public can view active homepage blocks" ON public.homepage_blocks;
DROP POLICY IF EXISTS "Public can view active hero banners" ON public.hero_banners;
DROP POLICY IF EXISTS "Public can view reviews" ON public.reviews;
DROP POLICY IF EXISTS "Public can view approved reviews" ON public.reviews;
DROP POLICY IF EXISTS "Public can submit pending reviews" ON public.reviews;
DROP POLICY IF EXISTS "Public can view site settings" ON public.site_settings;
DROP POLICY IF EXISTS "Public can view public site settings" ON public.site_settings;
DROP POLICY IF EXISTS "Public can view active promotions" ON public.promotions;
DROP POLICY IF EXISTS "Public can view active announcements" ON public.announcements;

-- 4. Create granular SELECT & INSERT policies for anon & authenticated roles

-- Products: Allow public to SELECT published products only (draft/archived stay hidden)
CREATE POLICY "Public can view published products"
  ON public.products
  FOR SELECT
  TO anon, authenticated
  USING (status = 'published');

-- Categories: Allow public to SELECT active categories
CREATE POLICY "Public can view active categories"
  ON public.categories
  FOR SELECT
  TO anon, authenticated
  USING (is_active IS NOT FALSE);

-- Brands: Allow public to SELECT brand directory
CREATE POLICY "Public can view brands"
  ON public.brands
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Homepage Blocks: Allow public to SELECT active CMS layout blocks
CREATE POLICY "Public can view active homepage blocks"
  ON public.homepage_blocks
  FOR SELECT
  TO anon, authenticated
  USING (is_enabled IS NOT FALSE);

-- Hero Banners: Allow public to SELECT active hero slider banners (uses is_enabled column)
CREATE POLICY "Public can view active hero banners"
  ON public.hero_banners
  FOR SELECT
  TO anon, authenticated
  USING (is_enabled IS NOT FALSE);

-- Reviews: Allow public to SELECT approved reviews only (pending moderation stay hidden)
CREATE POLICY "Public can view approved reviews"
  ON public.reviews
  FOR SELECT
  TO anon, authenticated
  USING (status = 'approved');

-- Reviews: Allow customers to submit reviews with default pending status and unverified/unfeatured flags
CREATE POLICY "Public can submit pending reviews"
  ON public.reviews
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    (status = 'pending' OR status IS NULL)
    AND (is_verified IS NOT TRUE)
    AND (is_featured IS NOT TRUE)
  );

-- Site Settings: Restrict public SELECT to storefront-safe configuration keys only.
-- Sensitive settings (API keys, SMTP, payment credentials, webhook secrets) are never readable by anon/authenticated.
CREATE POLICY "Public can view public site settings"
  ON public.site_settings
  FOR SELECT
  TO anon, authenticated
  USING (key IN ('personalization', 'general', 'contact', 'hours', 'branding', 'social', 'location'));

-- Promotions: Allow public to SELECT active discount promos
CREATE POLICY "Public can view active promotions"
  ON public.promotions
  FOR SELECT
  TO anon, authenticated
  USING (is_active IS NOT FALSE);

-- Announcements: Allow public to SELECT active popup announcements
CREATE POLICY "Public can view active announcements"
  ON public.announcements
  FOR SELECT
  TO anon, authenticated
  USING (is_active IS NOT FALSE);
