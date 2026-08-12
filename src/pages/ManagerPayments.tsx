import { useCallback, useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { useBranch } from "@/contexts/BranchContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { formatRupiah, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import {
  Calendar as CalendarIcon,
  RefreshCw,
  FileSpreadsheet,
  Building2,
  Search,
  CheckCircle2,
  Clock,
  Landmark,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import * as XLSX from "xlsx";
import type { DateRange } from "react-day-picker";
import { LoadingPage } from "@/components/LoadingBlock";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";

interface Invoice {
  id: string;
  supplier: string;
  item_name: string;
  qty: number;
  price: number;
  total: number;
  status: "BELUM" | "SUDAH";
  invoice_date: string;
  paid_at: string | null;
  paid_by: string | null;
}

interface Supplier {
  name: string;
  bank_name: string | null;
  bank_account: string | null;
  account_holder: string | null;
}

const toISODate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const parseDate = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y || 2000, (m || 1) - 1, d || 1);
};

// Tanggal bayar unik & terurut ascending (format tampilan), dipakai preview & ekspor agar konsisten
const getPaidDates = (invs: Invoice[]): string[] =>
  [...new Set(invs.filter((i) => i.paid_at).map((i) => i.paid_at!.slice(0, 10)))].sort().map(formatDate);

export default function ManagerPayments() {
  const { activeBranch } = useBranch();
  const { role } = useAuth();
  const { adminPerms } = useBranch();

  const activeBranchId = activeBranch?.id;
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [suppliers, setSuppliers] = useState<Record<string, Supplier>>({});
  const [loading, setLoading] = useState(true);

  // Filters
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [dateField, setDateField] = useState<"paid_at" | "invoice_date">("paid_at");
  const [statusFilter, setStatusFilter] = useState<"SUDAH" | "BELUM" | "semua">("SUDAH");
  const [searchQuery, setSearchQuery] = useState("");

  // Supplier summary expand state
  const [expandedSupplier, setExpandedSupplier] = useState<string | null>(null);
  const [supSummaryFilter, setSupSummaryFilter] = useState<"all" | "unpaid" | "paid">("all");

  // Default rentang: bulan berjalan (via kalender)
  useEffect(() => {
    const today = new Date();
    setFrom(toISODate(new Date(today.getFullYear(), today.getMonth(), 1)));
    setTo(toISODate(new Date(today.getFullYear(), today.getMonth() + 1, 0)));
  }, []);

  const selectedRange: DateRange | undefined = useMemo(() => {
    if (!from && !to) return undefined;
    return { from: from ? parseDate(from) : undefined, to: to ? parseDate(to) : undefined };
  }, [from, to]);

  const handleRangeSelect = (range: DateRange | undefined) => {
    if (!range?.from) {
      setFrom("");
      setTo("");
      return;
    }
    setFrom(toISODate(range.from));
    setTo(range.to ? toISODate(range.to) : toISODate(range.from));
  };

  // Load Data
  const loadData = useCallback(async () => {
    if (!activeBranchId) return;
    setLoading(true);
    try {
      const [invRes, supRes] = await Promise.all([
        supabase
          .from("invoices")
          .select("id, supplier, item_name, qty, price, total, status, invoice_date, paid_at, paid_by")
          .eq("branch_id", activeBranchId),
        supabase
          .from("suppliers")
          .select("name, bank_name, bank_account, account_holder")
          .eq("branch_id", activeBranchId),
      ]);

      if (invRes.error) throw invRes.error;
      if (supRes.error) throw supRes.error;

      setInvoices((invRes.data ?? []) as Invoice[]);

      const supMap: Record<string, Supplier> = {};
      (supRes.data ?? []).forEach((s) => {
        supMap[s.name.trim().toLowerCase()] = s;
      });
      setSuppliers(supMap);
    } catch (e: any) {
      toast.error(e.message || "Gagal memuat data laporan pembayaran");
    } finally {
      setLoading(false);
    }
  }, [activeBranchId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filtered Invoices
  const filteredInvoices = useMemo(() => {
    return invoices
      .filter((i) => {
        // Filter by Status
        if (statusFilter !== "semua" && i.status !== statusFilter) return false;

        // Filter by Supplier/Item Search
        if (searchQuery) {
          const query = searchQuery.toLowerCase().trim();
          const matchesSupplier = i.supplier.toLowerCase().includes(query);
          const matchesItem = i.item_name.toLowerCase().includes(query);
          if (!matchesSupplier && !matchesItem) return false;
        }

        // Filter by Date Field & Range
        if (dateField === "paid_at") {
          if (!i.paid_at) {
            return statusFilter === "BELUM";
          }
          const paidDate = i.paid_at.slice(0, 10);
          if (from && paidDate < from) return false;
          if (to && paidDate > to) return false;
        } else {
          if (from && i.invoice_date < from) return false;
          if (to && i.invoice_date > to) return false;
        }

        return true;
      })
      .sort((a, b) => {
        // Sort by paid_at or invoice_date descending
        if (dateField === "paid_at") {
          const dateA = a.paid_at || a.invoice_date;
          const dateB = b.paid_at || b.invoice_date;
          return dateB.localeCompare(dateA);
        }
        return b.invoice_date.localeCompare(a.invoice_date);
      });
  }, [invoices, from, to, dateField, statusFilter, searchQuery]);

  // Summary Metrics
  const metrics = useMemo(() => {
    let totalPaid = 0;
    let totalUnpaid = 0;
    let countPaid = 0;
    let countUnpaid = 0;

    filteredInvoices.forEach((i) => {
      if (i.status === "SUDAH") {
        totalPaid += Number(i.total);
        countPaid++;
      } else {
        totalUnpaid += Number(i.total);
        countUnpaid++;
      }
    });

    return { totalPaid, totalUnpaid, countPaid, countUnpaid };
  }, [filteredInvoices]);

  // Supplier summary (berdasarkan invoice yang sudah terfilter rentang tanggal)
  const supplierSummary = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        total: number;
        paid: number;
        unpaid: number;
        count: number;
        paidCount: number;
        unpaidCount: number;
      }
    >();

    filteredInvoices.forEach((i) => {
      const sName = i.supplier;
      const cur = map.get(sName) ?? {
        name: sName,
        total: 0,
        paid: 0,
        unpaid: 0,
        count: 0,
        paidCount: 0,
        unpaidCount: 0,
      };
      cur.count++;
      cur.total += Number(i.total);
      if (i.status === "SUDAH") {
        cur.paid += Number(i.total);
        cur.paidCount++;
      } else {
        cur.unpaid += Number(i.total);
        cur.unpaidCount++;
      }
      map.set(sName, cur);
    });

    // Urutkan A–Z agar mudah dicek supplier mana saja yang sudah dibayar
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredInvoices]);

  const filteredSupplierSummary = useMemo(() => {
    return supplierSummary.filter((s) => {
      if (supSummaryFilter === "unpaid") return s.unpaid > 0;
      if (supSummaryFilter === "paid") return s.unpaid === 0 && s.paid > 0;
      return true;
    });
  }, [supplierSummary, supSummaryFilter]);

  // Grand total dari daftar supplier yang sedang tampil (mengikuti tab & filter)
  const summaryTotals = useMemo(() => {
    return filteredSupplierSummary.reduce(
      (acc, s) => {
        acc.count += s.count;
        acc.paid += s.paid;
        acc.unpaid += s.unpaid;
        return acc;
      },
      { count: 0, paid: 0, unpaid: 0 }
    );
  }, [filteredSupplierSummary]);

  // Nota per supplier yang sedang diexpand
  const supplierInvoices = useMemo(() => {
    if (!expandedSupplier) return [];
    return filteredInvoices.filter((i) => i.supplier === expandedSupplier);
  }, [expandedSupplier, filteredInvoices]);

  // Peta invoice per supplier (untuk ekspor & pratinjau tanggal bayar)
  const supplierInvoicesMap = useMemo(() => {
    const map = new Map<string, Invoice[]>();
    filteredInvoices.forEach((i) => {
      const arr = map.get(i.supplier) ?? [];
      arr.push(i);
      map.set(i.supplier, arr);
    });
    return map;
  }, [filteredInvoices]);

  // Export ke Excel: Sheet 1 = Ringkasan Supplier (digabung, 1 baris per supplier), Sheet 2 = Detail Nota
  const exportToExcel = () => {
    if (filteredSupplierSummary.length === 0) {
      toast.error("Tidak ada data untuk diekspor");
      return;
    }

    try {
      // Sheet 1: Ringkasan per supplier (nama supplier sama digabung jadi satu baris)
      const summaryRows = filteredSupplierSummary.map((s, index) => {
        const bankInfo = suppliers[s.name.trim().toLowerCase()];
        const invs = supplierInvoicesMap.get(s.name) ?? [];
        const paidDates = getPaidDates(invs);
        return {
          No: index + 1,
          Supplier: s.name,
          "Jumlah Nota": s.count,
          "Total Dibayar": s.paid,
          "Total Belum Dibayar": s.unpaid,
          "Total Keseluruhan": s.paid + s.unpaid,
          "Tanggal Pembayaran": paidDates.length ? paidDates.join(", ") : "-",
          "Bank Supplier": bankInfo?.bank_name || "-",
          "No Rekening Supplier": bankInfo?.bank_account || "-",
          "Penerima Rekening": bankInfo?.account_holder || "-",
        };
      });

      // Baris Grand Total di akhir sheet ringkasan
      summaryRows.push({
        No: "" as any,
        Supplier: "GRAND TOTAL",
        "Jumlah Nota": summaryTotals.count,
        "Total Dibayar": summaryTotals.paid,
        "Total Belum Dibayar": summaryTotals.unpaid,
        "Total Keseluruhan": summaryTotals.paid + summaryTotals.unpaid,
        "Tanggal Pembayaran": "",
        "Bank Supplier": "",
        "No Rekening Supplier": "",
        "Penerima Rekening": "",
      });

      // Sheet 2: Detail nota per baris
      const detailRows = filteredInvoices.map((i, index) => {
        const bankInfo = suppliers[i.supplier.trim().toLowerCase()];
        return {
          No: index + 1,
          Supplier: i.supplier,
          "Tanggal Nota": formatDate(i.invoice_date),
          "Tanggal Pembayaran": i.paid_at ? formatDate(i.paid_at) : "-",
          "Nama Barang": i.item_name,
          Qty: i.qty,
          "Harga Satuan": i.price,
          "Total Tagihan": i.total,
          Status: i.status === "SUDAH" ? "LUNAS" : "BELUM DIBAYAR",
        };
      });

      const workbook = XLSX.utils.book_new();

      const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
      const sumCols = Object.keys(summaryRows[0] || {}).map((key) => {
        const lengths = summaryRows.map((row) => String((row as any)[key] || "").length);
        return { wch: Math.max(key.length, ...lengths) + 3 };
      });
      summarySheet["!cols"] = sumCols;
      XLSX.utils.book_append_sheet(workbook, summarySheet, "Ringkasan Supplier");

      const detailSheet = XLSX.utils.json_to_sheet(detailRows);
      const detCols = Object.keys(detailRows[0] || {}).map((key) => {
        const lengths = detailRows.map((row) => String((row as any)[key] || "").length);
        return { wch: Math.max(key.length, ...lengths) + 3 };
      });
      detailSheet["!cols"] = detCols;
      XLSX.utils.book_append_sheet(workbook, detailSheet, "Detail Nota");

      const fileName = `Laporan_Pembayaran_Supplier_${activeBranch?.name || "Cabang"}_${from || "semua"}_s.d._${to || "semua"}.xlsx`;
      XLSX.writeFile(workbook, fileName);
      toast.success(`Ringkasan ${filteredSupplierSummary.length} supplier berhasil diunduh`);
    } catch (e: any) {
      console.error(e);
      toast.error("Gagal mengunduh Excel: " + (e.message || e));
    }
  };

  // Auth checking
  const canViewReports = role === "manager" || (role === "admin" && adminPerms?.view_reports);
  if (!canViewReports) {
    return (
      <AppShell title="Laporan Pembayaran">
        <div className="app-card p-8 text-center text-muted-foreground">
          <Building2 className="h-12 w-12 mx-auto mb-3 text-destructive" />
          <h2 className="text-lg font-semibold text-foreground mb-1">Akses Terbatas</h2>
          <p className="text-sm">Anda tidak memiliki izin untuk melihat laporan pembayaran cabang ini. Silakan hubungi Manager.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={`Laporan Pembayaran — ${activeBranch?.name || ""}`}>
      {/* Search & Filter Panel */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm mb-6 space-y-4">
        <div className="flex flex-wrap gap-2 items-center justify-between">
          {/* Calendar Range Picker */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 rounded-lg text-xs h-9">
                <CalendarIcon className="h-4 w-4 text-primary" />
                {from && to ? `${formatDate(from)} – ${formatDate(to)}` : "Semua Tanggal"}
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                selected={selectedRange}
                onSelect={handleRangeSelect}
                numberOfMonths={2}
                defaultMonth={from ? parseDate(from) : new Date()}
              />
              <div className="flex items-center justify-between gap-2 border-t border-border/70 p-2">
                <span className="text-[10px] text-muted-foreground px-1">
                  {from && to ? `${formatDate(from)} s.d. ${formatDate(to)}` : "Belum ada rentang"}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[10px] text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setFrom("");
                    setTo("");
                  }}
                >
                  Hapus
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={loadData} title="Refresh" className="h-9 w-9 p-0 rounded-lg">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              onClick={exportToExcel}
              disabled={filteredSupplierSummary.length === 0}
              className="bg-success hover:bg-success/90 text-success-foreground gap-1.5 rounded-md text-xs font-semibold"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Download Supplier
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-border/60">
          {/* Date Type Selector */}
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Filter Berdasarkan</Label>
            <select
              value={dateField}
              onChange={(e) => setDateField(e.target.value as any)}
              className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-xs ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="paid_at">Tanggal Pembayaran (Lunas)</option>
              <option value="invoice_date">Tanggal Nota (Invoice)</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Status Pembayaran</Label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-xs ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="SUDAH">Sudah Bayar (Lunas)</option>
              <option value="BELUM">Belum Bayar (Pending)</option>
              <option value="semua">Semua Status</option>
            </select>
          </div>

          {/* Search Supplier / Items */}
          <div className="space-y-1.5 col-span-1">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Cari Supplier / Barang</Label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Ketik nama supplier atau barang..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-xs rounded-lg"
              />
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <LoadingPage label="Memuat laporan pembayaran…" />
      ) : (
        <>
          {/* Summary Metrics Section */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {/* Paid Total Card */}
            <div className="app-card p-4 flex items-center gap-4">
              <div className="h-10 w-10 rounded-md bg-success/10 text-success flex items-center justify-center shrink-0">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total Lunas</p>
                <h3 className="text-base font-bold text-foreground leading-tight mt-0.5">{formatRupiah(metrics.totalPaid)}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{metrics.countPaid} Transaksi</p>
              </div>
            </div>

            {/* Unpaid Total Card */}
            <div className="app-card p-4 flex items-center gap-4">
              <div className="h-10 w-10 rounded-md bg-warning/15 text-warning-foreground flex items-center justify-center shrink-0">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total Belum Bayar</p>
                <h3 className="text-base font-bold text-foreground leading-tight mt-0.5">{formatRupiah(metrics.totalUnpaid)}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{metrics.countUnpaid} Transaksi</p>
              </div>
            </div>

            {/* Total Invoices in Period Card */}
            <div className="app-card p-4 flex items-center gap-4">
              <div className="h-10 w-10 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <FileSpreadsheet className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total Tagihan Periode</p>
                <h3 className="text-base font-bold text-foreground leading-tight mt-0.5">
                  {formatRupiah(metrics.totalPaid + metrics.totalUnpaid)}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {metrics.countPaid + metrics.countUnpaid} Nota Terfilter
                </p>
              </div>
            </div>

            {/* Supplier Count Card */}
            <div className="app-card p-4 flex items-center gap-4">
              <div className="h-10 w-10 rounded-md bg-accent text-accent-foreground flex items-center justify-center shrink-0">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Supplier Dibayar</p>
                <h3 className="text-base font-bold text-foreground leading-tight mt-0.5">
                  {supplierSummary.length} Supplier
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">Nama sama otomatis digabung</p>
              </div>
            </div>
          </div>

          {/* Ringkasan per Supplier (expandable, lengkap dgn nota & tanggal bayar) */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm mb-6">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3 mb-4">
              <div>
                <h3 className="font-semibold text-sm flex items-center gap-1.5 text-foreground">
                  <Building2 className="h-5 w-5 text-primary" /> Ringkasan Supplier
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Periode{" "}
                  <span className="font-semibold text-foreground/80">
                    {from && to ? `${formatDate(from)} – ${formatDate(to)}` : "semua tanggal"}
                  </span>
                  . Klik supplier untuk rincian nota & tanggal bayar.
                </p>
              </div>
              <div className="flex gap-1 bg-muted p-1 rounded-lg text-[10px]">
                <button
                  onClick={() => setSupSummaryFilter("all")}
                  className={`px-2.5 py-1 rounded-md transition-all ${supSummaryFilter === "all" ? "bg-background font-semibold shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Semua ({supplierSummary.length})
                </button>
                <button
                  onClick={() => setSupSummaryFilter("unpaid")}
                  className={`px-2.5 py-1 rounded-md transition-all ${supSummaryFilter === "unpaid" ? "bg-background font-semibold shadow-sm text-warning-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Belum Lunas ({supplierSummary.filter((s) => s.unpaid > 0).length})
                </button>
                <button
                  onClick={() => setSupSummaryFilter("paid")}
                  className={`px-2.5 py-1 rounded-md transition-all ${supSummaryFilter === "paid" ? "bg-background font-semibold shadow-sm text-success" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Lunas ({supplierSummary.filter((s) => s.unpaid === 0 && s.paid > 0).length})
                </button>
              </div>
            </div>

            {filteredSupplierSummary.length === 0 ? (
              <EmptyState
                icon={<Building2 className="h-6 w-6" />}
                title="Tidak ada ringkasan supplier"
                description="Tidak ada data pada rentang tanggal dan filter yang dipilih."
                compact
              />
            ) : (
              <>
                <div className="space-y-2">
                  {filteredSupplierSummary.map((s) => {
                    const isExpanded = expandedSupplier === s.name;
                    const bankInfo = suppliers[s.name.trim().toLowerCase()];
                    return (
                      <div
                        key={s.name}
                        className={`border rounded-lg overflow-hidden transition-all ${
                          isExpanded ? "border-primary/40 ring-1 ring-primary/20" : "border-border/80"
                        }`}
                      >
                        <button
                          onClick={() => setExpandedSupplier(isExpanded ? null : s.name)}
                          className="w-full flex items-center justify-between gap-3 p-3 hover:bg-muted/30 transition-colors text-left"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <ChevronRight
                              className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                                isExpanded ? "rotate-90 text-primary" : ""
                              }`}
                            />
                            <div className="min-w-0">
                              <p className="font-semibold text-xs truncate">{s.name}</p>
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                {s.count} nota · {s.paidCount} lunas · {s.unpaidCount} pending
                              </p>
                              {(() => {
                                const invs = supplierInvoicesMap.get(s.name) ?? [];
                                const dates = getPaidDates(invs);
                                if (!dates.length) return null;
                                return (
                                  <p className="text-[10px] text-success font-medium mt-0.5 truncate">
                                    Dibayar: {dates.join(", ")}
                                  </p>
                                );
                              })()}
                            </div>
                          </div>
                          <div className="flex items-center gap-4 text-[11px] shrink-0">
                            <div className="text-right">
                              <p className="text-[9px] uppercase text-muted-foreground">Belum Lunas</p>
                              <p className={`font-semibold ${s.unpaid > 0 ? "text-warning-foreground" : "text-muted-foreground"}`}>
                                {formatRupiah(s.unpaid)}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-[9px] uppercase text-muted-foreground">Sudah Lunas</p>
                              <p className={`font-semibold ${s.paid > 0 ? "text-success" : "text-muted-foreground"}`}>
                                {formatRupiah(s.paid)}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-[9px] uppercase text-muted-foreground">Total</p>
                              <p className="font-semibold text-foreground">{formatRupiah(s.paid + s.unpaid)}</p>
                            </div>
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="border-t border-border/60 px-3 py-3 bg-muted/10">
                            {/* Info rekening bank supplier */}
                            {bankInfo && (bankInfo.bank_name || bankInfo.bank_account) && (
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground mb-2">
                                <Landmark className="h-3.5 w-3.5 text-primary" />
                                <span className="font-semibold text-foreground/90">{bankInfo.bank_name}</span>
                                <span className="font-mono">{bankInfo.bank_account}</span>
                                {bankInfo.account_holder && <span>a.n. {bankInfo.account_holder}</span>}
                              </div>
                            )}

                            {supplierInvoices.length === 0 ? (
                              <p className="text-[11px] text-muted-foreground italic py-2 text-center">
                                Tidak ada nota dalam rentang ini.
                              </p>
                            ) : (
                              <div className="overflow-x-auto max-h-72 overflow-y-auto rounded-lg border border-border/60">
                                <table className="w-full text-left text-[11px] border-collapse bg-background">
                                  <thead>
                                    <tr className="bg-muted/50 text-muted-foreground border-b border-border/70">
                                      <th className="py-1.5 px-2 font-semibold w-8 text-center">No</th>
                                      <th className="py-1.5 px-2 font-semibold">Tanggal Nota</th>
                                      <th className="py-1.5 px-2 font-semibold">Tanggal Bayar</th>
                                      <th className="py-1.5 px-2 font-semibold">Nama Barang</th>
                                      <th className="py-1.5 px-2 font-semibold text-center">Qty</th>
                                      <th className="py-1.5 px-2 font-semibold text-right">Total</th>
                                      <th className="py-1.5 px-2 font-semibold text-center">Status</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-border/50">
                                    {supplierInvoices.map((i, idx) => (
                                      <tr key={i.id} className="hover:bg-muted/40">
                                        <td className="py-2 px-2 text-center text-muted-foreground">{idx + 1}</td>
                                        <td className="py-2 px-2 whitespace-nowrap">{formatDate(i.invoice_date)}</td>
                                        <td className="py-2 px-2 whitespace-nowrap">
                                          {i.paid_at ? (
                                            <span className="inline-flex items-center gap-1 font-semibold text-success">
                                              <CheckCircle2 className="h-3 w-3" /> {formatDate(i.paid_at)}
                                            </span>
                                          ) : (
                                            <span className="text-muted-foreground">-</span>
                                          )}
                                        </td>
                                        <td className="py-2 px-2 font-medium text-foreground/80">{i.item_name}</td>
                                        <td className="py-2 px-2 text-center text-muted-foreground">{i.qty}</td>
                                        <td className="py-2 px-2 text-right font-semibold">{formatRupiah(i.total)}</td>
                                        <td className="py-2 px-2 text-center">
                                          <StatusBadge status={i.status} labels={{ done: "Lunas", pending: "Pending" }} />
                                        </td>
                                      </tr>
                                    ))}
                                    {/* Subtotal nota supplier */}
                                    <tr className="bg-muted/40 font-semibold">
                                      <td colSpan={5} className="py-2 px-2 text-right text-[10px] uppercase tracking-wider text-muted-foreground">
                                        Total {s.name}
                                      </td>
                                      <td className="py-2 px-2 text-right">
                                        {formatRupiah(supplierInvoices.reduce((acc, i) => acc + Number(i.total), 0))}
                                      </td>
                                      <td className="py-2 px-2" />
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Grand Total footer */}
                <div className="mt-3 pt-3 border-t border-border/70 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold text-foreground">
                    Grand Total{" "}
                    <span className="text-muted-foreground font-normal">
                      ({summaryTotals.count} nota dari {filteredSupplierSummary.length} supplier)
                    </span>
                  </p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
                    <span className="text-muted-foreground">
                      Dibayar <b className="text-success">{formatRupiah(summaryTotals.paid)}</b>
                    </span>
                    <span className="text-muted-foreground">
                      Belum <b className="text-warning-foreground">{formatRupiah(summaryTotals.unpaid)}</b>
                    </span>
                    <span className="text-muted-foreground">
                      Total <b className="text-foreground">{formatRupiah(summaryTotals.paid + summaryTotals.unpaid)}</b>
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </AppShell>
  );
}
