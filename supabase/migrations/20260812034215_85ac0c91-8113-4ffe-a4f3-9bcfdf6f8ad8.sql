-- 1) Harden admin_has_permission with allow-list
CREATE OR REPLACE FUNCTION public.admin_has_permission(_user_id uuid, _branch_id uuid, _perm text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v boolean;
BEGIN
  IF _perm NOT IN ('manage_invoices','mark_paid','manage_suppliers','manage_revenues','manage_cashiers','view_reports') THEN
    RETURN false;
  END IF;
  EXECUTE format(
    'SELECT COALESCE((SELECT %I FROM public.admin_permissions WHERE user_id = $1 AND branch_id = $2), false)',
    _perm
  ) INTO v USING _user_id, _branch_id;
  RETURN COALESCE(v, false);
END $function$;

-- 2) Replace open policy on monthly_reports
DROP POLICY IF EXISTS "Allow authenticated users access" ON public.monthly_reports;

CREATE POLICY "manager manages monthly reports in own branches"
ON public.monthly_reports FOR ALL TO authenticated
USING (branch_id IS NOT NULL AND public.is_branch_manager(auth.uid(), branch_id))
WITH CHECK (branch_id IS NOT NULL AND public.is_branch_manager(auth.uid(), branch_id));

CREATE POLICY "admin reads monthly reports in assigned branches"
ON public.monthly_reports FOR SELECT TO authenticated
USING (branch_id IS NOT NULL AND public.is_branch_admin(auth.uid(), branch_id));

CREATE POLICY "admin manages monthly reports when permitted"
ON public.monthly_reports FOR ALL TO authenticated
USING (branch_id IS NOT NULL AND public.admin_has_permission(auth.uid(), branch_id, 'manage_revenues'))
WITH CHECK (branch_id IS NOT NULL AND public.admin_has_permission(auth.uid(), branch_id, 'manage_revenues'));