-- These four helpers are referenced directly inside RLS policies, so the
-- querying (authenticated) role must retain EXECUTE for policy evaluation.
GRANT EXECUTE ON FUNCTION public.admin_has_permission(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_branch_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_branch_cashier(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_branch_manager(uuid, uuid) TO authenticated;