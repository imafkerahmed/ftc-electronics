-- =============================================================================
-- Migration: Customer + Profiles Schema & Ownership Row-Level Security (RLS)
-- Description: Establishes public.profiles linked to auth.users, adds immutable
--              user_id ownership columns to orders and quotations, and creates
--              strict auth.uid() ownership policies.
-- =============================================================================

-- 1. Ensure public.profiles table exists and is linked to auth.users
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  phone TEXT,
  address TEXT,
  role TEXT NOT NULL DEFAULT 'customer',
  pin TEXT,
  avatar TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure all required columns exist on profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'customer';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pin TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- 2. Ensure foreign keys and ownership columns on related tables
-- Add profile_id to public.customers if missing
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Add profile_id to public.employees if missing
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Add immutable user_id column to public.orders referencing auth.users
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Add immutable user_id column to public.quotations referencing auth.users
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 3. Enable Row-Level Security (RLS) on all user-owned tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;

-- 4. Drop legacy conflicting policies if present
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Customers can view own record" ON public.customers;
DROP POLICY IF EXISTS "Customers can view own orders" ON public.orders;
DROP POLICY IF EXISTS "Customers can view own quotations" ON public.quotations;

-- 5. Create strict auth.uid() ownership SELECT policies
-- Profiles: Authenticated user can only read their own profile row
CREATE POLICY "Users can view own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Customers: Authenticated user can only read their own customer CRM record
CREATE POLICY "Customers can view own record"
  ON public.customers
  FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

-- Orders: Authenticated user can only read orders explicitly assigned to their user_id
CREATE POLICY "Customers can view own orders"
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Quotations: Authenticated user can only read quotations assigned to their user_id
CREATE POLICY "Customers can view own quotations"
  ON public.quotations
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- 6. Table Grants (Zero-Direct-Client-Mutation Architecture)
-- Revoke all direct mutation permissions from both anon and authenticated roles
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.profiles FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.customers FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.orders FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.quotations FROM anon, authenticated;

-- Allow authenticated users to SELECT their own records governed strictly by auth.uid() RLS policies
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON public.customers TO authenticated;
GRANT SELECT ON public.orders TO authenticated;
GRANT SELECT ON public.quotations TO authenticated;
