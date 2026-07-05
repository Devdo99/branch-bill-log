import { useCallback, useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { useBranch } from "@/contexts/BranchContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { formatRupiah, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  ArrowUpRight, 
  ArrowDownRight, 
  DollarSign, 
  Building,
  CreditCard,
  Copy,
  CheckCircle2,
  Calendar,
  RefreshCw,
  FileSpreadsheet
} from "lucide-react";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  CartesianGrid, 
  Legend 
} from "recharts";

interface Invoice {
  id: string;
  supplier: string;
  total: number;
  status: "BELUM" | "SUDAH";
  invoice_date: string;
}

interface Revenue {
  id: string;
  amount: number;
  revenue_date: string;
}

interface Supplier {
  name: string;
  bank_name: string | null;
  bank_account: string | null;
  account_holder: string | null;
}

export default function ManagerFinance() {
  const { activeBranch } = useBranch();
  const { role } = useAuth();
  const { adminPerms } = useBranch();
  
  const activeBranchId = activeBranch?.id;
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [revenues, setRevenues] = useState<Revenue[]>([]);
  const [suppliers, setSuppliers] = useState<Record<string, Supplier>>({});
  const [loading, setLoading] = useState(true);
  
  // Date Filters
  const [preset, setPreset] = useState<"bulan_ini" | "bulan_lalu" | "hari_30" | "tahun_ini" | "kustom">("bulan_ini");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // Handle Preset Changes
  useEffect(() => {
    const today = new Date();
    let f = new Date();
    let t = new Date();

    if (preset === "bulan_ini") {
      f = new Date(today.getFullYear(), today.getMonth(), 1);
      t = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    } else if (preset === "bulan_lalu") {
      f = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      t = new Date(today.getFullYear(), today.getMonth(), 0);
    } else if (preset === "hari_30") {
      f = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      t = today;
    } else if (preset === "tahun_ini") {
      f = new Date(today.getFullYear(), 0, 1);
      t = new Date(today.getFullYear(), 11, 31);
    } else {
      // kustom: keep existing values or default to current month
      return;
    }

    const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
    setFrom(fmtDate(f));
    setTo(fmtDate(t));
  }, [preset]);

  // Load Data
  const loadData = useCallback(async () => {
    if (!activeBranchId) return;
    setLoading(true);
    try {
      // Fetch all invoices, revenues, and suppliers for this branch
      const [invRes, revRes, supRes] = await Promise.all([
        supabase
          .from("invoices")
          .select("id, supplier, total, status, invoice_date")
          .eq("branch_id", activeBranchId),
        supabase
          .from("daily_revenues" as any)
          .select("id, amount, revenue_date")
          .eq("branch_id", activeBranchId),
        supabase
          .from("suppliers")
          .select("name, bank_name, bank_account, account_holder")
          .eq("branch_id", activeBranchId)
      ]);

      if (invRes.error) throw invRes.error;
      if (revRes.error) throw revRes.error;
      if (supRes.error) throw supRes.error;

      setInvoices((invRes.data ?? []) as Invoice[]);
      setRevenues(((revRes.data ?? []) as unknown) as Revenue[]);

      // Map suppliers
      const supMap: Record<string, Supplier> = {};
      (supRes.data ?? []).forEach((s) => {
        supMap[s.name.trim().toLowerCase()] = s;
      });
      setSuppliers(supMap);
    } catch (e: any) {
      toast.error(e.message || "Gagal memuat data keuangan");
    } finally {
      setLoading(false);
    }
  }, [activeBranchId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filtered Data
  const filteredInvoices = useMemo(() => {
    return invoices.filter((i) => {
      if (from && i.invoice_date < from) return false;
      if (to && i.invoice_date > to) return false;
      return true;
    });
  }, [invoices, from, to]);

  const filteredRevenues = useMemo(() => {
    return revenues.filter((r) => {
      if (from && r.revenue_date < from) return false;
      if (to && r.revenue_date > to) return false;
      return true;
    });
  }, [revenues, from, to]);

  // Financial Metrics Calculations
  const totalOmset = useMemo(() => {
    return filteredRevenues.reduce((sum, r) => sum + Number(r.amount), 0);
  }, [filteredRevenues]);

  const totalInvoices = useMemo(() => {
    return filteredInvoices.reduce((sum, i) => sum + Number(i.total), 0);
  }, [filteredInvoices]);

  const totalPaidInvoices = useMemo(() => {
    return filteredInvoices
      .filter((i) => i.status === "SUDAH")
      .reduce((sum, i) => sum + Number(i.total), 0);
  }, [filteredInvoices]);

  const totalUnpaidInvoices = useMemo(() => {
    return filteredInvoices
      .filter((i) => i.status === "BELUM")
      .reduce((sum, i) => sum + Number(i.total), 0);
  }, [filteredInvoices]);

  // Cash Flow = Omset - Paid Invoices (Actual Cash In - Actual Cash Out)
  const netCashFlow = totalOmset - totalPaidInvoices;

  // Net Profit = Omset - Total Invoices (Earned Revenue - Total Cost)
  const netProfit = totalOmset - totalInvoices;

  // Chart Data Preparation (Daily)
  const chartData = useMemo(() => {
    const dataMap: Record<string, { date: string; fullDate: string; omset: number; pengeluaran: number; netto: number }> = {};
    
    // Inisialisasi map dengan tanggal yang ada
    filteredRevenues.forEach((r) => {
      const d = r.revenue_date;
      if (!dataMap[d]) {
        dataMap[d] = { date: d.slice(5), fullDate: d, omset: 0, pengeluaran: 0, netto: 0 };
      }
      dataMap[d].omset += Number(r.amount);
    });

    filteredInvoices.forEach((i) => {
      const d = i.invoice_date;
      if (!dataMap[d]) {
        dataMap[d] = { date: d.slice(5), fullDate: d, omset: 0, pengeluaran: 0, netto: 0 };
      }
      // Kita hitung pengeluaran berdasarkan nota terbayar (Cash Outflow)
      if (i.status === "SUDAH") {
        dataMap[d].pengeluaran += Number(i.total);
      }
    });

    return Object.values(dataMap)
      .map(item => ({
        ...item,
        netto: item.omset - item.pengeluaran
      }))
      .sort((a, b) => a.fullDate.localeCompare(b.fullDate));
  }, [filteredRevenues, filteredInvoices]);

  // Supplier Financial Analysis Table
  const supplierAnalysis = useMemo(() => {
    const map: Record<string, { name: string; total: number; paid: number; unpaid: number; count: number }> = {};
    
    filteredInvoices.forEach((i) => {
      const key = i.supplier.trim();
      if (!map[key]) {
        map[key] = { name: key, total: 0, paid: 0, unpaid: 0, count: 0 };
      }
      map[key].total += Number(i.total);
      map[key].count += 1;
      if (i.status === "SUDAH") {
        map[key].paid += Number(i.total);
      } else {
        map[key].unpaid += Number(i.total);
      }
    });

    return Object.values(map).sort((a, b) => b.unpaid - a.unpaid || b.total - a.total);
  }, [filteredInvoices]);

  // Handle Copy Bank Details Helper
  const copyBankInfo = (supName: string) => {
    const cleanName = supName.trim().toLowerCase();
    const sup = suppliers[cleanName];
    if (sup && sup.bank_account) {
      const info = `${sup.bank_name || ""} - ${sup.bank_account} a.n. ${sup.account_holder || ""}`;
      navigator.clipboard.writeText(info);
      toast.success(`Rekening ${sup.name} berhasil disalin!`);
    } else {
      toast.error("Data rekening supplier tidak lengkap.");
    }
  };

  // Auth Guard
  if (role === "admin" && adminPerms && !adminPerms.view_reports) {
    return (
      <AppShell title="Laporan Keuangan">
        <div className="app-card p-8 text-center text-muted-foreground">
          <Building className="h-12 w-12 mx-auto mb-3 text-destructive" />
          <h2 className="text-lg font-semibold text-foreground mb-1">Akses Terbatas</h2>
          <p className="text-sm">Anda tidak memiliki izin untuk melihat laporan keuangan cabang ini. Silakan hubungi Manager.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={`Keuangan & Arus Kas — ${activeBranch?.name}`}>
      
      {/* Filters & Control Panel */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 bg-card border rounded-lg p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <Button 
            variant={preset === "bulan_ini" ? "default" : "outline"} 
            size="sm" 
            onClick={() => setPreset("bulan_ini")}
          >
            Bulan Ini
          </Button>
          <Button 
            variant={preset === "bulan_lalu" ? "default" : "outline"} 
            size="sm" 
            onClick={() => setPreset("bulan_lalu")}
          >
            Bulan Lalu
          </Button>
          <Button 
            variant={preset === "hari_30" ? "default" : "outline"} 
            size="sm" 
            onClick={() => setPreset("hari_30")}
          >
            30 Hari Terakhir
          </Button>
          <Button 
            variant={preset === "tahun_ini" ? "default" : "outline"} 
            size="sm" 
            onClick={() => setPreset("tahun_ini")}
          >
            Tahun Ini
          </Button>
          <Button 
            variant={preset === "kustom" ? "default" : "outline"} 
            size="sm" 
            onClick={() => setPreset("kustom")}
          >
            Kustom Tanggal
          </Button>
        </div>

        {preset === "kustom" && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Label className="text-xs text-muted-foreground">Dari</Label>
              <Input 
                type="date" 
                value={from} 
                onChange={(e) => setFrom(e.target.value)} 
                className="h-8 w-36 text-xs" 
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Label className="text-xs text-muted-foreground">Sampai</Label>
              <Input 
                type="date" 
                value={to} 
                onChange={(e) => setTo(e.target.value)} 
                className="h-8 w-36 text-xs" 
              />
            </div>
          </div>
        )}

        <Button size="sm" variant="ghost" onClick={loadData} title="Muat Ulang Data">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {loading ? (
        <div className="min-h-[400px] flex items-center justify-center text-muted-foreground">
          <RefreshCw className="h-8 w-8 animate-spin mb-2" />
          <span className="ml-2">Memuat Laporan Keuangan...</span>
        </div>
      ) : (
        <>
          {/* Top Finance Metrics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            
            {/* Cash In: Omset */}
            <div className="app-card p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase">Pendapatan (Omset)</span>
                <div className="h-8 w-8 rounded-full bg-emerald-50 text-emerald-600 grid place-items-center">
                  <ArrowUpRight className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-4">
                <div className="text-xl font-bold font-mono">{formatRupiah(totalOmset)}</div>
                <p className="text-[10px] text-muted-foreground mt-1">Uang Masuk Terdaftar</p>
              </div>
            </div>

            {/* Cash Out: Paid Invoices */}
            <div className="app-card p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase">Tagihan Terbayar</span>
                <div className="h-8 w-8 rounded-full bg-amber-50 text-amber-600 grid place-items-center">
                  <ArrowDownRight className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-4">
                <div className="text-xl font-bold font-mono text-amber-700">{formatRupiah(totalPaidInvoices)}</div>
                <p className="text-[10px] text-muted-foreground mt-1">Arus Kas Keluar Aktual</p>
              </div>
            </div>

            {/* Net Cash Flow */}
            <div className="app-card p-4 flex flex-col justify-between border-l-4 border-l-primary">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase">Arus Kas Bersih</span>
                <div className={`h-8 w-8 rounded-full grid place-items-center ${netCashFlow >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                  <Wallet className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-4">
                <div className={`text-xl font-bold font-mono ${netCashFlow >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                  {formatRupiah(netCashFlow)}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">Saldo Kas Riil (Omset - Terbayar)</p>
              </div>
            </div>

            {/* Account Payables: Unpaid Invoices */}
            <div className="app-card p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase">Hutang (Belum Bayar)</span>
                <div className="h-8 w-8 rounded-full bg-rose-50 text-rose-600 grid place-items-center">
                  <DollarSign className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-4">
                <div className="text-xl font-bold font-mono text-rose-600">{formatRupiah(totalUnpaidInvoices)}</div>
                <p className="text-[10px] text-muted-foreground mt-1">Kewajiban Pembayaran Pending</p>
              </div>
            </div>

            {/* Net Profit: Omset - Total Cost */}
            <div className="app-card p-4 flex flex-col justify-between border-l-4 border-l-success">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase">Laba/Rugi Bersih</span>
                <div className={`h-8 w-8 rounded-full grid place-items-center ${netProfit >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                  {netProfit >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                </div>
              </div>
              <div className="mt-4">
                <div className={`text-xl font-bold font-mono ${netProfit >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                  {formatRupiah(netProfit)}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">Estimasi Buku (Omset - Total Nota)</p>
              </div>
            </div>

          </div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            
            <div className="app-card p-4 lg:col-span-2">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-1.5 text-foreground">
                <Calendar className="h-4 w-4 text-primary" /> Visualisasi Arus Kas Harian (Uang Masuk vs Uang Keluar)
              </h3>
              <div className="h-[280px] w-full">
                {chartData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                    Tidak ada data untuk grafik dalam periode ini.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorOmset" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0.01}/>
                        </linearGradient>
                        <linearGradient id="colorKeluar" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--warning))" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="hsl(var(--warning))" stopOpacity={0.01}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                      <XAxis dataKey="date" tickLine={false} style={{ fontSize: 10 }} />
                      <YAxis tickFormatter={(v) => `${v / 1000}k`} tickLine={false} style={{ fontSize: 10 }} />
                      <Tooltip 
                        formatter={(value) => [formatRupiah(Number(value)), ""]}
                        labelFormatter={(label) => `Tanggal: ${label}`}
                        contentStyle={{ backgroundColor: "white", borderRadius: 8, border: "1px solid #e2e8f0" }}
                      />
                      <Legend style={{ fontSize: 11 }} />
                      <Area 
                        name="Omset (Uang Masuk)" 
                        type="monotone" 
                        dataKey="omset" 
                        stroke="hsl(var(--success))" 
                        fillOpacity={1} 
                        fill="url(#colorOmset)" 
                        strokeWidth={2}
                      />
                      <Area 
                        name="Nota Terbayar (Uang Keluar)" 
                        type="monotone" 
                        dataKey="pengeluaran" 
                        stroke="hsl(var(--warning))" 
                        fillOpacity={1} 
                        fill="url(#colorKeluar)" 
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Profit & Loss Statement Panel */}
            <div className="app-card p-4">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-1.5 text-foreground">
                <FileSpreadsheet className="h-4 w-4 text-primary" /> Ikhtisar Laba Rugi Cabang
              </h3>
              
              <div className="space-y-4">
                
                {/* Income */}
                <div>
                  <h4 className="text-xs font-bold text-muted-foreground uppercase border-b pb-1 mb-2">1. Pendapatan</h4>
                  <div className="flex justify-between items-center text-sm px-1">
                    <span>Omset Penjualan</span>
                    <span className="font-mono font-medium">{formatRupiah(totalOmset)}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs font-semibold bg-muted/40 p-2 rounded-md mt-2">
                    <span>Total Pendapatan Bersih</span>
                    <span className="font-mono text-emerald-700">{formatRupiah(totalOmset)}</span>
                  </div>
                </div>

                {/* Costs / Expenses */}
                <div>
                  <h4 className="text-xs font-bold text-muted-foreground uppercase border-b pb-1 mb-2">2. Pengeluaran (Bahan/Nota)</h4>
                  <div className="space-y-1.5 text-sm px-1">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Nota Lunas (Sudah Dibayar)</span>
                      <span className="font-mono text-amber-700">({formatRupiah(totalPaidInvoices)})</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Nota Hutang (Belum Dibayar)</span>
                      <span className="font-mono text-rose-600">({formatRupiah(totalUnpaidInvoices)})</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-xs font-semibold bg-muted/40 p-2 rounded-md mt-2">
                    <span>Total Biaya Operasional</span>
                    <span className="font-mono text-rose-600">({formatRupiah(totalInvoices)})</span>
                  </div>
                </div>

                {/* Summary Profit/Loss */}
                <div className="pt-2 border-t border-dashed">
                  <div className={`flex justify-between items-center p-3 rounded-lg font-bold text-base ${netProfit >= 0 ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>
                    <span className="text-sm">Laba / (Rugi) Bersih</span>
                    <span className="font-mono">{formatRupiah(netProfit)}</span>
                  </div>
                  <div className="mt-2 text-[10px] text-muted-foreground text-center">
                    Margin Profitabilitas Cabang: <b className={netProfit >= 0 ? "text-emerald-700" : "text-rose-600"}>
                      {totalOmset > 0 ? ((netProfit / totalOmset) * 100).toFixed(1) : 0}%
                    </b>
                  </div>
                </div>

              </div>
            </div>

          </div>

          {/* Supplier Payout and Bank Accounts */}
          <div className="app-panel">
            <div className="p-4 border-b flex items-center justify-between bg-muted/30">
              <div>
                <h3 className="font-semibold text-base flex items-center gap-1.5">
                  <CreditCard className="h-5 w-5 text-primary" /> Pengeluaran & Pembayaran per Supplier
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">Analisis beban supplier dan jalan pintas salin rekening untuk pembayaran.</p>
              </div>
            </div>

            {supplierAnalysis.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Belum ada data nota dari supplier dalam periode ini.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground border-b">
                    <tr>
                      <th className="p-3 pl-4">Supplier</th>
                      <th className="p-3 text-center">Nota</th>
                      <th className="p-3 text-right">Total Beban</th>
                      <th className="p-3 text-right text-emerald-700">Terbayar (Lunas)</th>
                      <th className="p-3 text-right text-rose-600">Belum Terbayar (Hutang)</th>
                      <th className="p-3 text-center">Informasi Rekening Bank</th>
                    </tr>
                  </thead>
                  <tbody>
                    {supplierAnalysis.map((s) => {
                      const cleanName = s.name.trim().toLowerCase();
                      const supDetail = suppliers[cleanName];
                      const hasBank = supDetail && supDetail.bank_account;
                      
                      return (
                        <tr key={s.name} className="border-b hover:bg-muted/20">
                          <td className="p-3 pl-4 font-medium">{s.name}</td>
                          <td className="p-3 text-center font-mono text-muted-foreground">{s.count}</td>
                          <td className="p-3 text-right font-mono font-medium">{formatRupiah(s.total)}</td>
                          <td className="p-3 text-right font-mono text-emerald-700">{formatRupiah(s.paid)}</td>
                          <td className="p-3 text-right font-mono text-rose-600 font-semibold">{formatRupiah(s.unpaid)}</td>
                          <td className="p-3">
                            {s.unpaid > 0 ? (
                              hasBank ? (
                                <div className="flex items-center justify-between gap-2 max-w-xs mx-auto border rounded-md p-1.5 bg-background">
                                  <div className="text-left text-xs truncate">
                                    <span className="font-semibold block">{supDetail.bank_name}</span>
                                    <span className="font-mono text-muted-foreground text-[10px] block">{supDetail.bank_account} a/n {supDetail.account_holder}</span>
                                  </div>
                                  <Button 
                                    size="icon" 
                                    variant="ghost" 
                                    className="h-7 w-7 shrink-0 text-primary hover:bg-primary/5" 
                                    onClick={() => copyBankInfo(s.name)}
                                    title="Salin Rekening"
                                  >
                                    <Copy className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              ) : (
                                <div className="text-center text-xs text-muted-foreground italic p-1 border rounded-md border-dashed bg-muted/20">
                                  Belum diatur di data supplier
                                </div>
                              )
                            ) : (
                              <div className="flex items-center justify-center gap-1.5 text-xs text-emerald-700 font-medium">
                                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                Lunas / Beban Nihil
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

    </AppShell>
  );
}
