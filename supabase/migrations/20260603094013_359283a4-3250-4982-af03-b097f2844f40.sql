-- 1. Tambah nilai enum 'admin'
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'admin';

-- 2. Tabel izin admin per cabang
CREATE TABLE IF NOT EXISTS public.admin_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  manage_invoices boolean NOT NULL DEFAULT false,
  mark_paid boolean NOT NULL DEFAULT false,
  manage_suppliers boolean NOT NULL DEFAULT false,
  manage_revenues boolean NOT NULL DEFAULT false,
  manage_cashiers boolean NOT NULL DEFAULT false,
  view_reports boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_permissions TO authenticated;
GRANT ALL ON public.admin_permissions TO service_role;

ALTER TABLE public.admin_permissions ENABLE ROW LEVEL SECURITY;

-- updated_at trigger
DROP TRIGGER IF EXISTS tg_admin_permissions_updated_at ON public.admin_permissions;
CREATE TRIGGER tg_admin_permissions_updated_at
BEFORE UPDATE ON public.admin_permissions
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 3. Helper functions (SECURITY DEFINER, hindari recursion RLS)
CREATE OR REPLACE FUNCTION public.is_branch_admin(_user_id uuid, _branch_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.admin_permissions
    WHERE user_id = _user_id AND branch_id = _branch_id)
$$;

CREATE OR REPLACE FUNCTION public.admin_has_permission(_user_id uuid, _branch_id uuid, _perm text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v boolean;
BEGIN
  EXECUTE format(
    'SELECT COALESCE((SELECT %I FROM public.admin_permissions WHERE user_id = $1 AND branch_id = $2), false)',
    _perm
  ) INTO v USING _user_id, _branch_id;
  RETURN COALESCE(v, false);
END $$;

-- 4. RLS untuk admin_permissions
CREATE POLICY "manager manages admin permissions in own branches"
ON public.admin_permissions FOR ALL TO authenticated
USING (public.is_branch_manager(auth.uid(), branch_id))
WITH CHECK (public.is_branch_manager(auth.uid(), branch_id));

CREATE POLICY "admin reads own permissions"
ON public.admin_permissions FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- 5. Tambah policy untuk admin pada tabel terkait
-- branches: admin bisa melihat cabang tempat dia jadi admin
CREATE POLICY "admin reads assigned branches"
ON public.branches FOR SELECT TO authenticated
USING (public.is_branch_admin(auth.uid(), id));

-- invoices: admin baca semua nota di cabangnya
CREATE POLICY "admin reads invoices in assigned branches"
ON public.invoices FOR SELECT TO authenticated
USING (public.is_branch_admin(auth.uid(), branch_id));

-- admin update nota jika izin manage_invoices ATAU mark_paid
CREATE POLICY "admin updates invoices when permitted"
ON public.invoices FOR UPDATE TO authenticated
USING (
  public.admin_has_permission(auth.uid(), branch_id, 'manage_invoices')
  OR public.admin_has_permission(auth.uid(), branch_id, 'mark_paid')
)
WITH CHECK (
  public.admin_has_permission(auth.uid(), branch_id, 'manage_invoices')
  OR public.admin_has_permission(auth.uid(), branch_id, 'mark_paid')
);

CREATE POLICY "admin deletes invoices when permitted"
ON public.invoices FOR DELETE TO authenticated
USING (public.admin_has_permission(auth.uid(), branch_id, 'manage_invoices'));

-- suppliers
CREATE POLICY "admin reads suppliers in assigned branches"
ON public.suppliers FOR SELECT TO authenticated
USING (public.is_branch_admin(auth.uid(), branch_id));

CREATE POLICY "admin manages suppliers when permitted"
ON public.suppliers FOR ALL TO authenticated
USING (public.admin_has_permission(auth.uid(), branch_id, 'manage_suppliers'))
WITH CHECK (public.admin_has_permission(auth.uid(), branch_id, 'manage_suppliers'));

-- daily_revenues
CREATE POLICY "admin reads revenues in assigned branches"
ON public.daily_revenues FOR SELECT TO authenticated
USING (public.is_branch_admin(auth.uid(), branch_id));

CREATE POLICY "admin manages revenues when permitted"
ON public.daily_revenues FOR ALL TO authenticated
USING (public.admin_has_permission(auth.uid(), branch_id, 'manage_revenues'))
WITH CHECK (public.admin_has_permission(auth.uid(), branch_id, 'manage_revenues'));

-- branch_users (kelola kasir)
CREATE POLICY "admin reads branch_users when permitted"
ON public.branch_users FOR SELECT TO authenticated
USING (public.admin_has_permission(auth.uid(), branch_id, 'manage_cashiers'));

CREATE POLICY "admin manages branch_users when permitted"
ON public.branch_users FOR ALL TO authenticated
USING (public.admin_has_permission(auth.uid(), branch_id, 'manage_cashiers'))
WITH CHECK (public.admin_has_permission(auth.uid(), branch_id, 'manage_cashiers'));

-- activity_logs
CREATE POLICY "admin reads logs of assigned branches"
ON public.activity_logs FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.invoices i
  WHERE i.id = activity_logs.invoice_id
    AND public.is_branch_admin(auth.uid(), i.branch_id)
));

-- profiles: manager bisa baca profil admin yg dia kelola
CREATE POLICY "manager reads admin profiles"
ON public.profiles FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.admin_permissions ap
  JOIN public.branches b ON b.id = ap.branch_id
  WHERE ap.user_id = profiles.id AND b.manager_id = auth.uid()
));