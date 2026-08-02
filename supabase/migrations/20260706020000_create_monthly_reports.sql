-- Migration: Create monthly_reports table for detailed P&L
CREATE TABLE IF NOT EXISTS public.monthly_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  report_month text NOT NULL, -- Format: YYYY-MM
  
  -- Pendapatan (Revenue)
  dine_in numeric NOT NULL DEFAULT 0,
  take_away numeric NOT NULL DEFAULT 0,
  online_revenue numeric NOT NULL DEFAULT 0,
  catering numeric NOT NULL DEFAULT 0,
  selisih_kehilangan numeric NOT NULL DEFAULT 0,
  selisih_mokapos numeric NOT NULL DEFAULT 0,
  
  -- Harga Pokok Produksi (HPP/COGS)
  beban_bahan_baku numeric NOT NULL DEFAULT 0,
  selisih_kehilangan_shrinkage numeric NOT NULL DEFAULT 0,
  
  -- Beban Operasional Restaurant (OPEX)
  kontrakan_karyawan numeric NOT NULL DEFAULT 0,
  gaji_karyawan numeric NOT NULL DEFAULT 0,
  beban_karyawan numeric NOT NULL DEFAULT 0,
  cicilan_thr numeric NOT NULL DEFAULT 0,
  pesiar numeric NOT NULL DEFAULT 0,
  emas_3_tahun numeric NOT NULL DEFAULT 0,
  maintenance numeric NOT NULL DEFAULT 0,
  bpjs_ketenagakerjaan numeric NOT NULL DEFAULT 0,
  bpjs_kesehatan numeric NOT NULL DEFAULT 0,
  tambahan numeric NOT NULL DEFAULT 0,
  beban_non_operasional_opex numeric NOT NULL DEFAULT 0,
  fee_gofood numeric NOT NULL DEFAULT 0,
  fee_online_food numeric NOT NULL DEFAULT 0,
  fee_ebanking numeric NOT NULL DEFAULT 0,
  
  -- Beban Non Operasional
  beban_marketing numeric NOT NULL DEFAULT 0,
  beban_administrasi numeric NOT NULL DEFAULT 0,
  
  -- Depresiasi & Pajak
  depresiasi numeric NOT NULL DEFAULT 0,
  pajak_restoran numeric NOT NULL DEFAULT 0,
  pajak_reklame numeric NOT NULL DEFAULT 0,
  
  -- Distribusi
  putra_baru numeric NOT NULL DEFAULT 0,
  sedekah_tambahan numeric NOT NULL DEFAULT 0,
  
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE (branch_id, report_month)
);

-- Enable Row Level Security
ALTER TABLE public.monthly_reports ENABLE ROW LEVEL SECURITY;

-- RLS Policies (allows managers to manage, cashiers to read)
CREATE POLICY "manager manages monthly_reports in own branches"
ON public.monthly_reports FOR ALL TO authenticated
USING (public.is_branch_manager(auth.uid(), branch_id))
WITH CHECK (public.is_branch_manager(auth.uid(), branch_id));

CREATE POLICY "kasir reads monthly_reports in own branch"
ON public.monthly_reports FOR SELECT TO authenticated
USING (public.is_branch_cashier(auth.uid(), branch_id));

-- Trigger for auto-updating updated_at timestamp
CREATE TRIGGER trg_monthly_reports_updated_at
BEFORE UPDATE ON public.monthly_reports
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
