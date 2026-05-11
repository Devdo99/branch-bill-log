ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS bank_account text,
  ADD COLUMN IF NOT EXISTS account_holder text;

CREATE TABLE IF NOT EXISTS public.daily_revenues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  revenue_date date NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  note text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, revenue_date)
);

ALTER TABLE public.daily_revenues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "manager manages revenues in own branches"
ON public.daily_revenues FOR ALL TO authenticated
USING (public.is_branch_manager(auth.uid(), branch_id))
WITH CHECK (public.is_branch_manager(auth.uid(), branch_id));

CREATE POLICY "kasir reads revenues in own branch"
ON public.daily_revenues FOR SELECT TO authenticated
USING (public.is_branch_cashier(auth.uid(), branch_id));

CREATE TRIGGER trg_daily_revenues_updated_at
BEFORE UPDATE ON public.daily_revenues
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();