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
  Calendar, 
  RefreshCw, 
  FileSpreadsheet,
  FileDown,
  Printer,
  ChevronRight,
  DollarSign
} from "lucide-react";
import jsPDF from "jspdf";

interface Invoice {
  id: string;
  total: number;
  status: "BELUM" | "SUDAH";
  invoice_date: string;
  item_name: string;
  qty: number;
  price: number;
  supplier: string;
}

interface Revenue {
  id: string;
  amount: number;
  revenue_date: string;
}

export default function ManagerProfitLoss() {
  const { activeBranch } = useBranch();
  const { role, fullName } = useAuth();
  const { adminPerms } = useBranch();
  
  const activeBranchId = activeBranch?.id;
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [revenues, setRevenues] = useState<Revenue[]>([]);
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
      const [invRes, revRes] = await Promise.all([
        supabase
          .from("invoices")
          .select("id, supplier, total, status, invoice_date, item_name, qty, price")
          .eq("branch_id", activeBranchId),
        supabase
          .from("daily_revenues" as any)
          .select("id, amount, revenue_date")
          .eq("branch_id", activeBranchId),
      ]);

      if (invRes.error) throw invRes.error;
      if (revRes.error) throw revRes.error;

      setInvoices((invRes.data ?? []) as Invoice[]);
      setRevenues(((revRes.data ?? []) as unknown) as Revenue[]);
    } catch (e: any) {
      toast.error(e.message || "Gagal memuat data Laba Rugi");
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

  // Calculations
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

  const netProfit = totalOmset - totalInvoices;
  const marginPct = totalOmset > 0 ? (netProfit / totalOmset) * 100 : 0;

  // Group Expenses by Supplier
  const expensesBySupplier = useMemo(() => {
    const map: Record<string, number> = {};
    filteredInvoices.forEach((i) => {
      const key = i.supplier.trim();
      map[key] = (map[key] || 0) + Number(i.total);
    });
    return Object.entries(map)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);
  }, [filteredInvoices]);

  // Export PDF
  const exportPDF = () => {
    const doc = new jsPDF();
    const branchName = activeBranch?.name || "Semua Cabang";
    const dateStr = `${formatDate(from)} s/d ${formatDate(to)}`;
    
    // Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("LAPORAN LABA RUGI", 14, 20);
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text(`Cabang: ${branchName}`, 14, 28);
    doc.text(`Periode: ${dateStr}`, 14, 34);
    doc.text(`Pengekspor: ${fullName || "Manager"}`, 14, 40);
    
    doc.setDrawColor(200, 200, 200);
    doc.line(14, 45, 196, 45);
    
    // Section 1: Pendapatan
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("1. PENDAPATAN OPERASIONAL", 14, 55);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text("Omset Harian Cabang", 20, 64);
    doc.text(formatRupiah(totalOmset), 150, 64, { align: "right" });
    
    // Total Pendapatan
    doc.setFont("helvetica", "bold");
    doc.text("Total Pendapatan Bersih (A)", 20, 72);
    doc.text(formatRupiah(totalOmset), 150, 72, { align: "right" });
    
    doc.line(20, 75, 196, 75);
    
    // Section 2: Pengeluaran
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("2. BEBAN OPERASIONAL (NOTA SUPPLIER)", 14, 86);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text("Beban Nota Lunas (Terbayar)", 20, 95);
    doc.text(formatRupiah(totalPaidInvoices), 150, 95, { align: "right" });
    doc.text("Beban Nota Hutang (Belum Bayar)", 20, 103);
    doc.text(formatRupiah(totalUnpaidInvoices), 150, 103, { align: "right" });
    
    // Total Pengeluaran
    doc.setFont("helvetica", "bold");
    doc.text("Total Beban Operasional (B)", 20, 112);
    doc.text(formatRupiah(totalInvoices), 150, 112, { align: "right" });
    
    doc.line(20, 116, 196, 116);
    
    // Section 3: Laba Rugi Bersih
    doc.setFontSize(13);
    doc.text("3. HASIL BERSIH (A - B)", 14, 128);
    doc.setFontSize(12);
    doc.text("LABA / (RUGI) BERSIH", 20, 138);
    doc.text(formatRupiah(netProfit), 150, 138, { align: "right" });
    doc.text(`Margin Keuntungan: ${marginPct.toFixed(1)}%`, 20, 146);
    
    doc.save(`LabaRugi-${branchName.replace(/\s+/g, "_")}-${Date.now()}.pdf`);
    toast.success("Laporan Laba Rugi PDF berhasil diunduh!");
  };

  // Auth Guard
  if (role === "admin" && adminPerms && !adminPerms.view_reports) {
    return (
      <AppShell title="Laporan Laba Rugi">
        <div className="app-card p-8 text-center text-muted-foreground">
          <TrendingUp className="h-12 w-12 mx-auto mb-3 text-destructive" />
          <h2 className="text-lg font-semibold text-foreground mb-1">Akses Terbatas</h2>
          <p className="text-sm">Anda tidak memiliki izin untuk melihat laporan keuangan cabang ini. Silakan hubungi Manager.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={`Laba Rugi — ${activeBranch?.name}`}>
      
      {/* Date Filters & Controls */}
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

        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={exportPDF} title="Unduh PDF">
            <FileDown className="h-4 w-4 mr-1.5" /> PDF
          </Button>
          <Button size="sm" variant="ghost" onClick={loadData} title="Muat Ulang Data">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="min-h-[300px] flex items-center justify-center text-muted-foreground">
          <RefreshCw className="h-8 w-8 animate-spin mb-2" />
          <span className="ml-2">Memuat Laporan Laba Rugi...</span>
        </div>
      ) : (
        <div className="grid lg:grid-cols-3 gap-6">
          
          {/* Main Profit & Loss Statement (2/3 width on large screens) */}
          <div className="lg:col-span-2 space-y-6">
            <div className="app-card p-6 shadow-md border-t-4 border-t-primary">
              
              {/* Report Header */}
              <div className="text-center border-b pb-4 mb-6">
                <h2 className="text-xl font-bold text-foreground">LAPORAN LABA RUGI</h2>
                <p className="text-sm font-medium text-primary mt-1">{activeBranch?.name}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Periode: {formatDate(from)} s/d {formatDate(to)}
                </p>
              </div>

              {/* Report Contents */}
              <div className="space-y-6">
                
                {/* 1. Revenues */}
                <div>
                  <div className="flex justify-between items-center font-bold text-sm text-foreground border-b pb-2 mb-3">
                    <span>1. PENDAPATAN OPERASIONAL</span>
                    <span className="font-mono">PENJUALAN</span>
                  </div>
                  <div className="space-y-2 text-sm pl-4 pr-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Omset Penjualan Harian (Tunai/Transfer)</span>
                      <span className="font-mono">{formatRupiah(totalOmset)}</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center font-bold text-xs bg-emerald-50 text-emerald-800 p-2.5 rounded-md mt-4 border border-emerald-100">
                    <span>TOTAL PENDAPATAN BERSIH (A)</span>
                    <span className="font-mono text-sm">{formatRupiah(totalOmset)}</span>
                  </div>
                </div>

                {/* 2. Expenses */}
                <div>
                  <div className="flex justify-between items-center font-bold text-sm text-foreground border-b pb-2 mb-3">
                    <span>2. BEBAN OPERASIONAL & COGS</span>
                    <span className="font-mono">PENGELUARAN</span>
                  </div>
                  <div className="space-y-3 text-sm pl-4 pr-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Nota Lunas (Beban Terbayar)</span>
                      <span className="font-mono text-amber-700">{formatRupiah(totalPaidInvoices)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Nota Pending (Kewajiban Hutang)</span>
                      <span className="font-mono text-rose-600">{formatRupiah(totalUnpaidInvoices)}</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center font-bold text-xs bg-rose-50 text-rose-800 p-2.5 rounded-md mt-4 border border-rose-100">
                    <span>TOTAL BEBAN OPERASIONAL (B)</span>
                    <span className="font-mono text-sm text-rose-700">({formatRupiah(totalInvoices)})</span>
                  </div>
                </div>

                {/* 3. Net Result */}
                <div className="pt-4 border-t border-dashed">
                  <div className={`flex justify-between items-center p-4 rounded-lg font-bold text-lg ${netProfit >= 0 ? "bg-emerald-600 text-white shadow-sm" : "bg-rose-600 text-white shadow-sm"}`}>
                    <span>LABA / (RUGI) BERSIH (A - B)</span>
                    <span className="font-mono">{formatRupiah(netProfit)}</span>
                  </div>
                </div>

              </div>

            </div>
          </div>

          {/* Side Panels (1/3 width) */}
          <div className="space-y-6">
            
            {/* Quick Metrics */}
            <div className="app-card p-4 space-y-4">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Metrik Utama</h3>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="border rounded-lg p-3 bg-muted/20">
                  <div className="text-[10px] text-muted-foreground uppercase font-medium">Profit Margin</div>
                  <div className={`text-base font-bold mt-1 ${netProfit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {marginPct.toFixed(1)}%
                  </div>
                </div>
                <div className="border rounded-lg p-3 bg-muted/20">
                  <div className="text-[10px] text-muted-foreground uppercase font-medium">Jumlah Nota</div>
                  <div className="text-base font-bold text-foreground mt-1">
                    {filteredInvoices.length} pcs
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                <div className={`h-9 w-9 rounded-full grid place-items-center ${netProfit >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                  <TrendingUp className="h-4 w-4" />
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Status Efisiensi</span>
                  <span className="text-xs font-bold text-foreground">
                    {netProfit >= 0 ? "Operasional Menguntungkan" : "Defisit Operasional"}
                  </span>
                </div>
              </div>
            </div>

            {/* Expenses by Supplier Chart/List */}
            <div className="app-card p-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                <FileSpreadsheet className="h-4 w-4 text-primary" /> Beban Pengeluaran per Supplier
              </h3>
              
              {expensesBySupplier.length === 0 ? (
                <p className="text-xs text-muted-foreground italic text-center py-4">Tidak ada data pengeluaran</p>
              ) : (
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                  {expensesBySupplier.map((s, idx) => {
                    const pct = totalInvoices > 0 ? (s.total / totalInvoices) * 100 : 0;
                    return (
                      <div key={s.name} className="space-y-1">
                        <div className="flex justify-between text-xs font-medium">
                          <span className="truncate max-w-[120px]">{s.name}</span>
                          <span className="font-mono text-muted-foreground">{formatRupiah(s.total)} ({pct.toFixed(0)}%)</span>
                        </div>
                        {/* Progress Bar */}
                        <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
                          <div 
                            className="bg-primary h-full rounded-full" 
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>

        </div>
      )}

    </AppShell>
  );
}
