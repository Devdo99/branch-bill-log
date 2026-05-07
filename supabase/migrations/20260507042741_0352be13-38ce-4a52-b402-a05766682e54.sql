
CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  note text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, name)
);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "manager manages suppliers in own branches"
ON public.suppliers FOR ALL TO authenticated
USING (public.is_branch_manager(auth.uid(), branch_id))
WITH CHECK (public.is_branch_manager(auth.uid(), branch_id));

CREATE POLICY "kasir reads suppliers in own branch"
ON public.suppliers FOR SELECT TO authenticated
USING (public.is_branch_cashier(auth.uid(), branch_id));

CREATE TRIGGER suppliers_set_updated_at
BEFORE UPDATE ON public.suppliers
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX idx_suppliers_branch ON public.suppliers(branch_id);
CREATE INDEX idx_invoices_branch_date ON public.invoices(branch_id, invoice_date);
CREATE INDEX idx_invoices_item ON public.invoices(item_name);
