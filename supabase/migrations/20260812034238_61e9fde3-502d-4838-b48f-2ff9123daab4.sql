REVOKE ALL ON FUNCTION public.admin_has_permission(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_has_permission(uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_has_permission(uuid, uuid, text) TO authenticated;