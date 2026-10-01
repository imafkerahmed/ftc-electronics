-- Migration: 20260927143000_explicit_inventory_tracking_type.sql
-- Description:
--   Phase 2A: Introduces an explicit inventory tracking model on public.products
--   ('counter' vs 'unit'). Automatically classifies products with existing
--   stock_management units as 'unit', leaving other products as 'counter'.
--   Adds non-negative constraint to products.count_in_stock.

DO $$
BEGIN
    -- 1. Add inventory_tracking_type column with default 'counter'
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'inventory_tracking_type'
    ) THEN
        ALTER TABLE public.products
        ADD COLUMN inventory_tracking_type TEXT NOT NULL DEFAULT 'counter';
    END IF;

    -- 2. Add CHECK constraint for inventory_tracking_type
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'products_inventory_tracking_type_check'
    ) THEN
        ALTER TABLE public.products
        ADD CONSTRAINT products_inventory_tracking_type_check
        CHECK (inventory_tracking_type IN ('counter', 'unit'));
    END IF;

    -- 3. Automatically classify products with existing stock_management rows as 'unit'
    UPDATE public.products
    SET inventory_tracking_type = 'unit'
    WHERE EXISTS (
        SELECT 1 FROM public.stock_management
        WHERE stock_management.product_id = products.id
    );

    -- 4. Harden products.count_in_stock: default 0, NOT NULL, CHECK >= 0
    UPDATE public.products
    SET count_in_stock = 0
    WHERE count_in_stock IS NULL;

    ALTER TABLE public.products
    ALTER COLUMN count_in_stock SET DEFAULT 0;

    ALTER TABLE public.products
    ALTER COLUMN count_in_stock SET NOT NULL;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'products_count_in_stock_non_negative'
    ) THEN
        ALTER TABLE public.products
        ADD CONSTRAINT products_count_in_stock_non_negative
        CHECK (count_in_stock >= 0);
    END IF;
END $$;
