
CREATE TABLE public.monthly_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  report_month VARCHAR(7) NOT NULL,
  dine_in NUMERIC DEFAULT 0,
  take_away NUMERIC DEFAULT 0,
  online_revenue NUMERIC DEFAULT 0,
  catering NUMERIC DEFAULT 0,
  selisih_kehilangan NUMERIC DEFAULT 0,
  selisih_mokapos NUMERIC DEFAULT 0,
  beban_bahan_baku NUMERIC DEFAULT 0,
  selisih_kehilangan_shrinkage NUMERIC DEFAULT 0,
  kontrakan_karyawan NUMERIC DEFAULT 0,
  gaji_karyawan NUMERIC DEFAULT 0,
  beban_karyawan NUMERIC DEFAULT 0,
  cicilan_thr NUMERIC DEFAULT 0,
  pesiar NUMERIC DEFAULT 0,
  emas_3_tahun NUMERIC DEFAULT 0,
  maintenance NUMERIC DEFAULT 0,
  bpjs_ketenagakerjaan NUMERIC DEFAULT 0,
  bpjs_kesehatan NUMERIC DEFAULT 0,
  tambahan NUMERIC DEFAULT 0,
  beban_non_operasional_opex NUMERIC DEFAULT 0,
  fee_gofood NUMERIC DEFAULT 0,
  fee_online_food NUMERIC DEFAULT 0,
  fee_ebanking NUMERIC DEFAULT 0,
  beban_marketing NUMERIC DEFAULT 0,
  beban_administrasi NUMERIC DEFAULT 0,
  depresiasi NUMERIC DEFAULT 0,
  pajak_restoran NUMERIC DEFAULT 0,
  pajak_reklame NUMERIC DEFAULT 0,
  putra_baru NUMERIC DEFAULT 0,
  sedekah_tambahan NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT unique_branch_month UNIQUE (branch_id, report_month)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_reports TO authenticated;
GRANT ALL ON public.monthly_reports TO service_role;

ALTER TABLE public.monthly_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users access" ON public.monthly_reports
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
