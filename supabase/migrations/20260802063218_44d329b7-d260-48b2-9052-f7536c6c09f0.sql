-- 1. Fix mutable search_path
ALTER FUNCTION public.tg_set_updated_at() SET search_path = public;

-- 2. Revoke direct EXECUTE on internal SECURITY DEFINER helpers from API roles
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_log_invoice_status() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_has_permission(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_cashier_branch(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_user_role(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_branch_admin(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_branch_cashier(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_branch_manager(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Keep server-side/admin access working
GRANT EXECUTE ON FUNCTION public.admin_has_permission(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_cashier_branch(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_branch_admin(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_branch_cashier(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_branch_manager(uuid, uuid) TO service_role;