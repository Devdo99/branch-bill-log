
-- Enums
CREATE TYPE public.app_role AS ENUM ('manager', 'kasir');
CREATE TYPE public.invoice_status AS ENUM ('BELUM', 'SUDAH');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- User roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer role checker (avoid recursive RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS public.app_role
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id LIMIT 1
$$;

-- Branches (PIN di-hash)
CREATE TABLE public.branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_branches_manager ON public.branches(manager_id);

-- Branch users (kasir <-> cabang). 1 kasir per cabang sesuai spek
CREATE TABLE public.branch_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);
ALTER TABLE public.branch_users ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_branch_users_branch ON public.branch_users(branch_id);

-- Helpers
CREATE OR REPLACE FUNCTION public.is_branch_manager(_user_id UUID, _branch_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.branches WHERE id = _branch_id AND manager_id = _user_id)
$$;

CREATE OR REPLACE FUNCTION public.is_branch_cashier(_user_id UUID, _branch_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.branch_users WHERE user_id = _user_id AND branch_id = _branch_id)
$$;

CREATE OR REPLACE FUNCTION public.get_cashier_branch(_user_id UUID)
RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT branch_id FROM public.branch_users WHERE user_id = _user_id LIMIT 1
$$;

-- Invoices
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  invoice_date DATE NOT NULL,
  supplier TEXT NOT NULL,
  item_name TEXT NOT NULL,
  qty NUMERIC NOT NULL CHECK (qty > 0),
  price NUMERIC NOT NULL CHECK (price >= 0),
  total NUMERIC NOT NULL CHECK (total >= 0),
  status public.invoice_status NOT NULL DEFAULT 'BELUM',
  photo_path TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  paid_at TIMESTAMPTZ,
  paid_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_invoices_branch ON public.invoices(branch_id);
CREATE INDEX idx_invoices_status ON public.invoices(status);
CREATE INDEX idx_invoices_date ON public.invoices(invoice_date);

-- Activity logs
CREATE TABLE public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES auth.users(id),
  action TEXT NOT NULL,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_logs_invoice ON public.activity_logs(invoice_id);

-- Trigger: handle_new_user (creates profile)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER set_invoices_updated_at BEFORE UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Auto activity log on status change
CREATE OR REPLACE FUNCTION public.tg_log_invoice_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.activity_logs(invoice_id, actor_id, action, meta)
    VALUES (NEW.id, NEW.created_by, 'CREATE', jsonb_build_object('status', NEW.status));
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.activity_logs(invoice_id, actor_id, action, meta)
    VALUES (NEW.id, COALESCE(NEW.paid_by, auth.uid()), 'STATUS_CHANGE',
      jsonb_build_object('from', OLD.status, 'to', NEW.status));
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER log_invoice_changes
AFTER INSERT OR UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.tg_log_invoice_status();

-- ===== RLS POLICIES =====

-- profiles
CREATE POLICY "users read own profile" ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "manager reads cashier profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.branch_users bu
      JOIN public.branches b ON b.id = bu.branch_id
      WHERE bu.user_id = profiles.id AND b.manager_id = auth.uid()
    )
  );
CREATE POLICY "users update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid());

-- user_roles
CREATE POLICY "users read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "manager reads roles they created" ON public.user_roles
  FOR SELECT TO authenticated USING (created_by = auth.uid());
-- Inserts/updates for roles are done via edge function (service role).

-- branches
CREATE POLICY "manager manages own branches" ON public.branches
  FOR ALL TO authenticated
  USING (manager_id = auth.uid())
  WITH CHECK (manager_id = auth.uid());
CREATE POLICY "kasir reads own branch" ON public.branches
  FOR SELECT TO authenticated
  USING (public.is_branch_cashier(auth.uid(), id));

-- branch_users
CREATE POLICY "manager manages branch_users in own branches" ON public.branch_users
  FOR ALL TO authenticated
  USING (public.is_branch_manager(auth.uid(), branch_id))
  WITH CHECK (public.is_branch_manager(auth.uid(), branch_id));
CREATE POLICY "kasir reads own assignment" ON public.branch_users
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- invoices
CREATE POLICY "manager reads invoices in own branches" ON public.invoices
  FOR SELECT TO authenticated
  USING (public.is_branch_manager(auth.uid(), branch_id));
CREATE POLICY "manager updates invoices in own branches" ON public.invoices
  FOR UPDATE TO authenticated
  USING (public.is_branch_manager(auth.uid(), branch_id))
  WITH CHECK (public.is_branch_manager(auth.uid(), branch_id));
CREATE POLICY "manager deletes invoices in own branches" ON public.invoices
  FOR DELETE TO authenticated
  USING (public.is_branch_manager(auth.uid(), branch_id));
CREATE POLICY "kasir reads invoices in own branch" ON public.invoices
  FOR SELECT TO authenticated
  USING (public.is_branch_cashier(auth.uid(), branch_id));
CREATE POLICY "kasir inserts invoices in own branch" ON public.invoices
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_branch_cashier(auth.uid(), branch_id)
    AND created_by = auth.uid()
    AND status = 'BELUM'
    AND paid_at IS NULL
    AND paid_by IS NULL
  );

-- activity_logs
CREATE POLICY "manager reads logs of own branches" ON public.activity_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = activity_logs.invoice_id
        AND public.is_branch_manager(auth.uid(), i.branch_id)
    )
  );
CREATE POLICY "kasir reads logs of own branch" ON public.activity_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = activity_logs.invoice_id
        AND public.is_branch_cashier(auth.uid(), i.branch_id)
    )
  );

-- ===== STORAGE =====
INSERT INTO storage.buckets (id, name, public) VALUES ('nota-photos', 'nota-photos', false)
ON CONFLICT (id) DO NOTHING;

-- Path convention: {branch_id}/{filename}
CREATE POLICY "kasir upload to own branch folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'nota-photos'
    AND public.is_branch_cashier(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );
CREATE POLICY "kasir read own branch photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'nota-photos'
    AND public.is_branch_cashier(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );
CREATE POLICY "manager read own branches photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'nota-photos'
    AND public.is_branch_manager(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );
CREATE POLICY "manager delete own branches photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'nota-photos'
    AND public.is_branch_manager(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );
