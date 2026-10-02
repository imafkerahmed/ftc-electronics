-- Function to calculate total revenue from paid orders securely on the database side
CREATE OR REPLACE FUNCTION get_admin_paid_revenue()
RETURNS numeric
LANGUAGE sql
SECURITY INVOKER
AS $$
  SELECT COALESCE(SUM(total), 0) FROM public.orders WHERE is_paid = true;
$$;
