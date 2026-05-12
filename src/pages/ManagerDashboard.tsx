import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { useBranch } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { formatRupiah, formatRupiahCompact } from "@/lib/format";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line, CartesianGrid, ComposedChart, Area } from "recharts";
import { TrendingUp, AlertCircle, CheckCircle2, Receipt, Package, Truck, Building2, Crown, Calendar, Layers, Wallet, BarChart3, LineChart as LineIcon, Coins, Percent, ArrowUpRight, ArrowDownRight, Scale } from "lucide-react";
import { Link } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Inv { id: string; supplier: string; item_name: string; qty: number; price: number; total: number; status: "BELUM" | "SUDAH"; invoice_date: string; branch_id: string }
interface Rev { id: string; branch_id: string; revenue_date: string; amount: number }

export default function ManagerDashboard() {
  const { activeBranch } = useBranch();
  const [allInv, setAllInv] = useState<Inv[]>([]);
  const [allRev, setAllRev] = useState<Rev[]>([]);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const now = new Date();
  const _mFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const _mTo = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  const [from, setFrom] = useState<string>(_mFrom);
  const [to, setTo] = useState<string>(_mTo);
  const [periodMode, setPeriodMode] = useState<"custom" | "bulan" | "kuartal" | "semester" | "tahun">("bulan");
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1); // 1-12
  const [quarter, setQuarter] = useState<number>(Math.floor(now.getMonth() / 3) + 1);
  const [semester, setSemester] = useState<number>(now.getMonth() < 6 ? 1 : 2);
  const [trendItem, setTrendItem] = useState<string>("");

  const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
  useEffect(() => {
    if (periodMode === "custom") return;
    let f: Date, t: Date;
    if (periodMode === "tahun") { f = new Date(year, 0, 1); t = new Date(year, 11, 31); }
    else if (periodMode === "semester") { f = new Date(year, semester === 1 ? 0 : 6, 1); t = new Date(year, semester === 1 ? 5 : 11, semester === 1 ? 30 : 31); }
    else if (periodMode === "kuartal") { const sm = (quarter - 1) * 3; f = new Date(year, sm, 1); t = new Date(year, sm + 3, 0); }
    else { f = new Date(year, month - 1, 1); t = new Date(year, month, 0); }
    setFrom(fmtDate(f)); setTo(fmtDate(t));
  }, [periodMode, year, month, quarter, semester]);

  useEffect(() => {
    (async () => {
      const [{ data: invs }, { data: brs }, { data: revs }] = await Promise.all([
        supabase.from("invoices").select("id, supplier, item_name, qty, price, total, status, invoice_date, branch_id"),
        supabase.from("branches").select("id, name"),
        supabase.from("daily_revenues" as any).select("id, branch_id, revenue_date, amount"),
      ]);
      setAllInv((invs ?? []) as Inv[]);
      setBranches(brs ?? []);
      setAllRev(((revs ?? []) as unknown) as Rev[]);
      setLoading(false);
    })();
  }, []);

  const branchInv = useMemo(() => allInv.filter((i) => {
    if (i.branch_id !== activeBranch?.id) return false;
    if (from && i.invoice_date < from) return false;
    if (to && i.invoice_date > to) return false;
    return true;
  }), [allInv, activeBranch, from, to]);
  const branchRev = useMemo(() => allRev.filter((r) => {
    if (r.branch_id !== activeBranch?.id) return false;
    if (from && r.revenue_date < from) return false;
    if (to && r.revenue_date > to) return false;
    return true;
  }), [allRev, activeBranch, from, to]);

  const omsetTotal = branchRev.reduce((s, r) => s + Number(r.amount), 0);
  const bahanTotal = branchInv.reduce((s, i) => s + Number(i.total), 0);
  const labaKotor = omsetTotal - bahanTotal;
  const hppPct = omsetTotal > 0 ? (bahanTotal / omsetTotal) * 100 : 0;
  const marginPct = omsetTotal > 0 ? (labaKotor / omsetTotal) * 100 : 0;

  const omsetVsBahan = useMemo(() => {
    const map = new Map<string, { omset: number; bahan: number }>();
    branchRev.forEach((r) => {
      const cur = map.get(r.revenue_date) ?? { omset: 0, bahan: 0 };
      map.set(r.revenue_date, { ...cur, omset: cur.omset + Number(r.amount) });
    });
    branchInv.forEach((i) => {
      const cur = map.get(i.invoice_date) ?? { omset: 0, bahan: 0 };
      map.set(i.invoice_date, { ...cur, bahan: cur.bahan + Number(i.total) });
    });
    return Array.from(map, ([date, v]) => ({
      date: date.slice(5), full: date,
      omset: v.omset, bahan: v.bahan, laba: v.omset - v.bahan,
    })).sort((a, b) => a.full.localeCompare(b.full));
  }, [branchRev, branchInv]);

  const omsetTrend = useMemo(() => omsetVsBahan.slice(-30).map((d) => ({ date: d.date, omset: d.omset })), [omsetVsBahan]);

  // Bandingkan periode ini vs sebelumnya (panjang yang sama)
  const periodCompare = useMemo(() => {
    if (!from || !to) return null;
    const fd = new Date(from), td = new Date(to);
    const days = Math.max(1, Math.round((td.getTime() - fd.getTime()) / 86400000) + 1);
    const prevTo = new Date(fd); prevTo.setDate(prevTo.getDate() - 1);
    const prevFrom = new Date(prevTo); prevFrom.setDate(prevFrom.getDate() - (days - 1));
    const pf = prevFrom.toISOString().slice(0, 10);
    const pt = prevTo.toISOString().slice(0, 10);
    const pOmset = allRev.filter((r) => r.branch_id === activeBranch?.id && r.revenue_date >= pf && r.revenue_date <= pt).reduce((s, r) => s + Number(r.amount), 0);
    const pBahan = allInv.filter((i) => i.branch_id === activeBranch?.id && i.invoice_date >= pf && i.invoice_date <= pt).reduce((s, i) => s + Number(i.total), 0);
    const dOmset = pOmset > 0 ? ((omsetTotal - pOmset) / pOmset) * 100 : 0;
    const dBahan = pBahan > 0 ? ((bahanTotal - pBahan) / pBahan) * 100 : 0;
    return { pf, pt, pOmset, pBahan, dOmset, dBahan };
  }, [from, to, allRev, allInv, activeBranch, omsetTotal, bahanTotal]);
  const today = new Date().toISOString().slice(0, 10);
  const todayTotal = branchInv.filter((i) => i.invoice_date === today).reduce((s, i) => s + Number(i.total), 0);
  const belumTotal = branchInv.filter((i) => i.status === "BELUM").reduce((s, i) => s + Number(i.total), 0);
  const sudahTotal = branchInv.filter((i) => i.status === "SUDAH").reduce((s, i) => s + Number(i.total), 0);
  const uniqueItems = new Set(branchInv.map((i) => i.item_name.trim().toLowerCase())).size;
  const uniqueSuppliers = new Set(branchInv.map((i) => i.supplier.trim().toLowerCase())).size;

  const supplierData = useMemo(() => {
    const map = new Map<string, number>();
    branchInv.forEach((i) => map.set(i.supplier, (map.get(i.supplier) ?? 0) + Number(i.total)));
    return Array.from(map, ([supplier, total]) => ({ supplier, total })).sort((a, b) => b.total - a.total).slice(0, 8);
  }, [branchInv]);

  const itemData = useMemo(() => {
    const map = new Map<string, { total: number; qty: number }>();
    branchInv.forEach((i) => {
      const k = i.item_name.trim();
      const cur = map.get(k) ?? { total: 0, qty: 0 };
      map.set(k, { total: cur.total + Number(i.total), qty: cur.qty + Number(i.qty) });
    });
    return Array.from(map, ([item, v]) => ({ item, ...v })).sort((a, b) => b.total - a.total).slice(0, 8);
  }, [branchInv]);

  const trendData = useMemo(() => {
    const map = new Map<string, number>();
    branchInv.forEach((i) => map.set(i.invoice_date, (map.get(i.invoice_date) ?? 0) + Number(i.total)));
    return Array.from(map, ([date, total]) => ({ date: date.slice(5), total })).sort((a, b) => a.date.localeCompare(b.date)).slice(-14);
  }, [branchInv]);

  const itemNames = useMemo(() => Array.from(new Set(branchInv.map((i) => i.item_name.trim()))).sort(), [branchInv]);
  useEffect(() => { if (!trendItem && itemNames.length) setTrendItem(itemNames[0]); }, [itemNames, trendItem]);

  const priceTrendData = useMemo(() => {
    if (!trendItem) return [] as { date: string; price: number }[];
    const map = new Map<string, { sum: number; n: number }>();
    branchInv.filter((i) => i.item_name.trim() === trendItem).forEach((i) => {
      const cur = map.get(i.invoice_date) ?? { sum: 0, n: 0 };
      map.set(i.invoice_date, { sum: cur.sum + Number(i.price), n: cur.n + 1 });
    });
    return Array.from(map, ([date, v]) => ({ date: date.slice(5), price: Math.round(v.sum / v.n) }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [branchInv, trendItem]);

  const priceStats = useMemo(() => {
    if (priceTrendData.length === 0) return null;
    const prices = priceTrendData.map((p) => p.price);
    const min = Math.min(...prices), max = Math.max(...prices);
    const first = prices[0], last = prices[prices.length - 1];
    const change = first > 0 ? ((last - first) / first) * 100 : 0;
    return { min, max, first, last, change };
  }, [priceTrendData]);

  const branchData = useMemo(() => {
    const map = new Map<string, number>();
    allInv.forEach((i) => map.set(i.branch_id, (map.get(i.branch_id) ?? 0) + Number(i.total)));
    return branches.map((b) => ({ name: b.name, total: map.get(b.id) ?? 0 }));
  }, [allInv, branches]);

  // Per-branch comprehensive summary (respects date filter)
  const branchSummary = useMemo(() => {
    const filtered = allInv.filter((i) => {
      if (from && i.invoice_date < from) return false;
      if (to && i.invoice_date > to) return false;
      return true;
    });
    return branches.map((b) => {
      const rows = filtered.filter((i) => i.branch_id === b.id);
      const total = rows.reduce((s, i) => s + Number(i.total), 0);
      const belum = rows.filter((i) => i.status === "BELUM").reduce((s, i) => s + Number(i.total), 0);
      const sudah = rows.filter((i) => i.status === "SUDAH").reduce((s, i) => s + Number(i.total), 0);
      const supMap = new Map<string, number>();
      const itMap = new Map<string, number>();
      rows.forEach((r) => {
        supMap.set(r.supplier, (supMap.get(r.supplier) ?? 0) + Number(r.total));
        itMap.set(r.item_name, (itMap.get(r.item_name) ?? 0) + Number(r.total));
      });
      const topSup = [...supMap.entries()].sort((a, b) => b[1] - a[1])[0];
      const topItem = [...itMap.entries()].sort((a, b) => b[1] - a[1])[0];
      const last = rows.map((r) => r.invoice_date).sort().slice(-1)[0];
      return {
        id: b.id,
        name: b.name,
        count: rows.length,
        total,
        belum,
        sudah,
        avg: rows.length ? total / rows.length : 0,
        suppliers: supMap.size,
        items: itMap.size,
        topSup: topSup?.[0] ?? "-",
        topItem: topItem?.[0] ?? "-",
        last: last ?? "-",
      };
    }).sort((a, b) => b.total - a.total);
  }, [allInv, branches, from, to]);

  const grand = useMemo(() => {
    return branchSummary.reduce((acc, b) => ({
      total: acc.total + b.total,
      belum: acc.belum + b.belum,
      sudah: acc.sudah + b.sudah,
      count: acc.count + b.count,
    }), { total: 0, belum: 0, sudah: 0, count: 0 });
  }, [branchSummary]);

  // Ringkasan omset per cabang
  const branchOmset = useMemo(() => {
    const filtered = allRev.filter((r) => {
      if (from && r.revenue_date < from) return false;
      if (to && r.revenue_date > to) return false;
      return true;
    });
    return branches.map((b) => {
      const omset = filtered.filter((r) => r.branch_id === b.id).reduce((s, r) => s + Number(r.amount), 0);
      const bahan = (branchSummary.find((x) => x.id === b.id)?.total) ?? 0;
      return { id: b.id, name: b.name, omset, bahan, laba: omset - bahan, hpp: omset > 0 ? (bahan / omset) * 100 : 0 };
    }).sort((a, b) => b.omset - a.omset);
  }, [allRev, branches, branchSummary, from, to]);
  const grandOmset = branchOmset.reduce((s, b) => s + b.omset, 0);

  const topBranch = branchSummary[0];

  const COLORS = ["hsl(152 72% 32%)", "hsl(152 72% 50%)", "hsl(0 0% 18%)", "hsl(38 92% 55%)", "hsl(152 40% 70%)", "hsl(0 0% 50%)"];

  if (loading) return <AppShell title="Dashboard"><p className="text-muted-foreground">Memuat…</p></AppShell>;

  return (
    <AppShell title={`Dashboard — ${activeBranch?.name}`}>
      <div className="bg-card border rounded-xl shadow-card p-4 mb-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Calendar className="h-4 w-4" /> Filter Periode
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          <div className="space-y-1.5">
            <Label>Mode</Label>
            <Select value={periodMode} onValueChange={(v: any) => setPeriodMode(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">Custom</SelectItem>
                <SelectItem value="bulan">Bulan</SelectItem>
                <SelectItem value="kuartal">Kuartal</SelectItem>
                <SelectItem value="semester">Semester</SelectItem>
                <SelectItem value="tahun">Tahun</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {periodMode !== "custom" && (
            <div className="space-y-1.5">
              <Label>Tahun</Label>
              <Select value={String(year)} onValueChange={(v) => setYear(+v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 6 }, (_, i) => now.getFullYear() - i).map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {periodMode === "bulan" && (
            <div className="space-y-1.5">
              <Label>Bulan</Label>
              <Select value={String(month)} onValueChange={(v) => setMonth(+v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"].map((n, i) => (
                    <SelectItem key={i} value={String(i + 1)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {periodMode === "kuartal" && (
            <div className="space-y-1.5">
              <Label>Kuartal</Label>
              <Select value={String(quarter)} onValueChange={(v) => setQuarter(+v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Q1 (Jan–Mar)</SelectItem>
                  <SelectItem value="2">Q2 (Apr–Jun)</SelectItem>
                  <SelectItem value="3">Q3 (Jul–Sep)</SelectItem>
                  <SelectItem value="4">Q4 (Okt–Des)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {periodMode === "semester" && (
            <div className="space-y-1.5">
              <Label>Semester</Label>
              <Select value={String(semester)} onValueChange={(v) => setSemester(+v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Sem 1 (Jan–Jun)</SelectItem>
                  <SelectItem value="2">Sem 2 (Jul–Des)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {periodMode === "custom" && (
            <>
              <div className="space-y-1.5"><Label>Dari</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Sampai</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            </>
          )}
          <div className="flex items-end">
            <button onClick={() => { setPeriodMode("custom"); setFrom(""); setTo(""); }} className="text-sm text-primary font-medium">Reset</button>
          </div>
        </div>
        {(from || to) && (
          <div className="text-xs text-muted-foreground">Periode aktif: <b>{from || "?"}</b> s/d <b>{to || "?"}</b></div>
        )}
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <StatCard icon={<TrendingUp className="h-5 w-5" />} label="Tagihan Hari Ini" value={formatRupiah(todayTotal)} accent="primary" />
        <StatCard icon={<AlertCircle className="h-5 w-5" />} label="Belum Dibayar" value={formatRupiah(belumTotal)} accent="warning" />
        <StatCard icon={<CheckCircle2 className="h-5 w-5" />} label="Sudah Dibayar" value={formatRupiah(sudahTotal)} accent="success" />
      </div>

      <div className="grid sm:grid-cols-2 gap-4 mt-4">
        <StatCard icon={<Package className="h-5 w-5" />} label="Jenis Bahan Baku" value={`${uniqueItems} item`} accent="primary" />
        <StatCard icon={<Truck className="h-5 w-5" />} label="Jumlah Supplier Aktif" value={`${uniqueSuppliers} supplier`} accent="success" />
      </div>

      {/* === RINGKASAN OMSET vs BAHAN BAKU === */}
      <div className="mt-6 bg-gradient-dark text-secondary-foreground rounded-xl shadow-elegant p-5">
        <div className="flex items-center gap-2 mb-4">
          <Scale className="h-5 w-5" />
          <h3 className="font-display font-bold">Omset vs Bahan Baku</h3>
          {!omsetTotal && (
            <Link to="/manager/omset" className="ml-auto text-xs underline opacity-90">Input omset →</Link>
          )}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <DarkStat icon={<Coins className="h-4 w-4" />} label="Total Omset" value={formatRupiah(omsetTotal)} delta={periodCompare?.dOmset} />
          <DarkStat icon={<Package className="h-4 w-4" />} label="Total Bahan Baku" value={formatRupiah(bahanTotal)} delta={periodCompare?.dBahan} invertDelta />
          <DarkStat icon={<Wallet className="h-4 w-4" />} label="Laba Kotor" value={formatRupiah(labaKotor)} accent={labaKotor >= 0 ? "good" : "bad"} />
          <DarkStat icon={<Percent className="h-4 w-4" />} label="HPP / Margin" value={omsetTotal > 0 ? `${hppPct.toFixed(1)}% / ${marginPct.toFixed(1)}%` : "-"} />
        </div>
        {omsetTotal > 0 && (
          <div className="mt-3">
            <div className="h-2 rounded-full bg-white/15 overflow-hidden flex">
              <div className="h-full bg-warning" style={{ width: `${Math.min(100, hppPct)}%` }} title={`Bahan baku ${hppPct.toFixed(1)}%`} />
              <div className="h-full bg-success" style={{ width: `${Math.max(0, 100 - hppPct)}%` }} title={`Laba kotor ${marginPct.toFixed(1)}%`} />
            </div>
            <div className="flex justify-between text-[11px] mt-1.5 opacity-90">
              <span>Bahan baku {hppPct.toFixed(1)}%</span>
              <span>Laba kotor {marginPct.toFixed(1)}%</span>
            </div>
          </div>
        )}
        {periodCompare && (
          <div className="text-[11px] opacity-80 mt-3">
            Dibandingkan periode sebelumnya ({periodCompare.pf} s/d {periodCompare.pt}) — Omset {formatRupiah(periodCompare.pOmset)}, Bahan baku {formatRupiah(periodCompare.pBahan)}
          </div>
        )}
      </div>

      {/* === TREN OMSET === */}
      <div className="bg-card rounded-xl border shadow-card p-5 mt-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-success" />
            <h3 className="font-display font-bold">Tren Omset (30 hari terakhir)</h3>
          </div>
          <Link to="/manager/omset" className="text-xs text-primary font-semibold">Kelola omset →</Link>
        </div>
        {omsetTrend.length === 0 ? <EmptyChart /> : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={omsetTrend}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={70} tickFormatter={(v) => formatRupiahCompact(v)} />
              <Tooltip formatter={(v: number) => formatRupiah(v)} />
              <Line type="monotone" dataKey="omset" name="Omset" stroke="hsl(152 72% 32%)" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* === PERBANDINGAN OMSET vs BAHAN BAKU CHART === */}
      <div className="bg-card rounded-xl border shadow-card p-5 mt-6">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h3 className="font-display font-bold">Perbandingan Omset vs Bahan Baku per Hari</h3>
        </div>
        {omsetVsBahan.length === 0 ? <EmptyChart /> : (
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={omsetVsBahan.slice(-30)}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={70} tickFormatter={(v) => formatRupiahCompact(v)} />
              <Tooltip formatter={(v: number) => formatRupiah(v)} />
              <Legend />
              <Bar dataKey="omset" name="Omset" fill="hsl(152 72% 32%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="bahan" name="Bahan Baku" fill="hsl(38 92% 55%)" radius={[4, 4, 0, 0]} />
              <Line type="monotone" dataKey="laba" name="Laba Kotor" stroke="hsl(0 0% 18%)" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="bg-card rounded-xl border shadow-card p-5 mt-6">
        <h3 className="font-display font-bold mb-4">Tren Pengeluaran Harian (14 hari terakhir)</h3>
        {trendData.length === 0 ? <EmptyChart /> : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={70} tickFormatter={(v) => formatRupiahCompact(v)} />
              <Tooltip formatter={(v: number) => formatRupiah(v)} />
              <Line type="monotone" dataKey="total" stroke="hsl(152 72% 32%)" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* === TREN HARGA BAHAN BAKU === */}
      <div className="bg-card rounded-xl border shadow-card p-5 mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <LineIcon className="h-5 w-5 text-primary" />
            <h3 className="font-display font-bold">Tren Harga Bahan Baku</h3>
          </div>
          <div className="min-w-[220px]">
            <Select value={trendItem} onValueChange={setTrendItem}>
              <SelectTrigger><SelectValue placeholder="Pilih bahan baku" /></SelectTrigger>
              <SelectContent>
                {itemNames.length === 0 ? <SelectItem value="-" disabled>Belum ada item</SelectItem>
                  : itemNames.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        {priceStats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4 text-sm">
            <div className="bg-accent/40 rounded-lg p-2"><div className="text-xs text-muted-foreground">Harga awal</div><div className="font-semibold">{formatRupiah(priceStats.first)}</div></div>
            <div className="bg-accent/40 rounded-lg p-2"><div className="text-xs text-muted-foreground">Harga terakhir</div><div className="font-semibold">{formatRupiah(priceStats.last)}</div></div>
            <div className="bg-accent/40 rounded-lg p-2"><div className="text-xs text-muted-foreground">Min – Max</div><div className="font-semibold text-xs">{formatRupiahCompact(priceStats.min)} – {formatRupiahCompact(priceStats.max)}</div></div>
            <div className={`rounded-lg p-2 ${priceStats.change >= 0 ? "bg-warning/20" : "bg-success/20"}`}>
              <div className="text-xs text-muted-foreground">Perubahan</div>
              <div className={`font-semibold ${priceStats.change >= 0 ? "text-warning-foreground" : "text-success"}`}>
                {priceStats.change >= 0 ? "▲" : "▼"} {Math.abs(priceStats.change).toFixed(1)}%
              </div>
            </div>
          </div>
        )}
        {priceTrendData.length === 0 ? <EmptyChart /> : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={priceTrendData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={70} tickFormatter={(v) => formatRupiahCompact(v)} />
              <Tooltip formatter={(v: number) => formatRupiah(v)} />
              <Line type="monotone" dataKey="price" name="Harga rata-rata" stroke="hsl(38 92% 55%)" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mt-6">
        <div className="bg-card rounded-xl border shadow-card p-5">
          <h3 className="font-display font-bold mb-4">Tagihan per Supplier ({activeBranch?.name})</h3>
          {supplierData.length === 0 ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={supplierData}>
                <XAxis dataKey="supplier" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={70} tickFormatter={(v) => formatRupiahCompact(v)} />
                <Tooltip formatter={(v: number) => formatRupiah(v)} />
                <Bar dataKey="total" fill="hsl(152 72% 32%)" radius={[6,6,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="bg-card rounded-xl border shadow-card p-5">
          <h3 className="font-display font-bold mb-4">Top Bahan Baku (berdasarkan nilai)</h3>
          {itemData.length === 0 ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={itemData} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => formatRupiahCompact(v)} />
                <YAxis type="category" dataKey="item" width={90} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => formatRupiah(v)} />
                <Bar dataKey="total" fill="hsl(38 92% 55%)" radius={[0,6,6,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="bg-card rounded-xl border shadow-card p-5 mt-6">
          <h3 className="font-display font-bold mb-4">Tagihan per Cabang (semua)</h3>
          {branchData.every((b) => b.total === 0) ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={branchData.filter((b) => b.total > 0)} dataKey="total" nameKey="name" outerRadius={90}
                  label={({ name, value }) => `${name}: ${formatRupiah(Number(value))}`}>
                  {branchData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => formatRupiah(v)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
      </div>

      {/* === RINGKASAN OMSET PER CABANG === */}
      <div className="mt-8">
        <div className="flex items-center gap-2 mb-3">
          <Coins className="h-5 w-5 text-success" />
          <h2 className="font-display text-xl font-bold">Omset & Profitabilitas per Cabang</h2>
        </div>
        <div className="bg-card rounded-xl border shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2.5">Cabang</th>
                  <th className="text-right px-3 py-2.5">Omset</th>
                  <th className="text-right px-3 py-2.5">Bahan Baku</th>
                  <th className="text-right px-3 py-2.5">Laba Kotor</th>
                  <th className="text-right px-3 py-2.5">HPP %</th>
                  <th className="text-right px-3 py-2.5">Margin %</th>
                </tr>
              </thead>
              <tbody>
                {branchOmset.map((b) => {
                  const margin = 100 - b.hpp;
                  const isActive = b.id === activeBranch?.id;
                  return (
                    <tr key={b.id} className={`border-t ${isActive ? "bg-accent/40" : ""}`}>
                      <td className="px-3 py-2.5 font-medium flex items-center gap-2">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />{b.name}
                        {isActive && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary text-primary-foreground">aktif</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{formatRupiah(b.omset)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-warning">{formatRupiah(b.bahan)}</td>
                      <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${b.laba >= 0 ? "text-success" : "text-destructive"}`}>{formatRupiah(b.laba)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{b.omset > 0 ? `${b.hpp.toFixed(1)}%` : "-"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{b.omset > 0 ? `${margin.toFixed(1)}%` : "-"}</td>
                    </tr>
                  );
                })}
                {branchOmset.every((b) => b.omset === 0 && b.bahan === 0) && (
                  <tr><td colSpan={6} className="text-center text-muted-foreground py-6">Belum ada data omset / bahan baku</td></tr>
                )}
              </tbody>
              {grandOmset > 0 && (
                <tfoot className="bg-muted/30 font-semibold">
                  <tr className="border-t">
                    <td className="px-3 py-2.5">TOTAL</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatRupiah(grandOmset)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-warning">{formatRupiah(grand.total)}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${grandOmset - grand.total >= 0 ? "text-success" : "text-destructive"}`}>{formatRupiah(grandOmset - grand.total)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{((grand.total / grandOmset) * 100).toFixed(1)}%</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{(((grandOmset - grand.total) / grandOmset) * 100).toFixed(1)}%</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>

      <div className="mt-6 bg-card rounded-xl border shadow-card p-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-lg bg-accent text-accent-foreground"><Receipt className="h-5 w-5" /></div>
          <div>
            <div className="font-display font-bold">Lihat semua nota & filter</div>
            <div className="text-sm text-muted-foreground">Checklist untuk menandai nota sudah dibayar.</div>
          </div>
        </div>
        <Link to="/manager/invoices" className="text-primary font-semibold">Buka →</Link>
      </div>

      {/* === RINGKASAN SEMUA CABANG === */}
      <div className="mt-8">
        <div className="flex items-center gap-2 mb-3">
          <Building2 className="h-5 w-5 text-primary" />
          <h2 className="font-display text-xl font-bold">Ringkasan Semua Cabang</h2>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <MiniStat icon={<Building2 className="h-4 w-4" />} label="Jumlah Cabang" value={`${branches.length}`} />
          <MiniStat icon={<Receipt className="h-4 w-4" />} label="Total Nota" value={`${grand.count}`} />
          <MiniStat icon={<Wallet className="h-4 w-4" />} label="Total Pengeluaran" value={formatRupiah(grand.total)} />
          <MiniStat icon={<AlertCircle className="h-4 w-4" />} label="Belum Dibayar" value={formatRupiah(grand.belum)} />
        </div>

        {topBranch && topBranch.total > 0 && (
          <div className="bg-gradient-primary text-primary-foreground rounded-xl p-4 mb-4 flex items-center gap-3 shadow-card">
            <Crown className="h-6 w-6" />
            <div className="flex-1">
              <div className="text-xs opacity-90">Cabang dengan pengeluaran terbesar</div>
              <div className="font-display font-bold text-lg">{topBranch.name}</div>
            </div>
            <div className="text-right">
              <div className="font-display font-bold">{formatRupiah(topBranch.total)}</div>
              <div className="text-xs opacity-90">{topBranch.count} nota</div>
            </div>
          </div>
        )}

        <div className="bg-card rounded-xl border shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2.5">Cabang</th>
                  <th className="text-right px-3 py-2.5">Nota</th>
                  <th className="text-right px-3 py-2.5">Total</th>
                  <th className="text-right px-3 py-2.5">Belum</th>
                  <th className="text-right px-3 py-2.5">Sudah</th>
                  <th className="text-right px-3 py-2.5">Rata²/nota</th>
                  <th className="text-left px-3 py-2.5">Supplier Top</th>
                  <th className="text-left px-3 py-2.5">Item Top</th>
                  <th className="text-left px-3 py-2.5">Aktivitas</th>
                </tr>
              </thead>
              <tbody>
                {branchSummary.map((b) => {
                  const pctPaid = b.total > 0 ? Math.round((b.sudah / b.total) * 100) : 0;
                  const isActive = b.id === activeBranch?.id;
                  return (
                    <tr key={b.id} className={`border-t ${isActive ? "bg-accent/40" : ""}`}>
                      <td className="px-3 py-2.5 font-medium">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                          {b.name}
                          {isActive && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary text-primary-foreground">aktif</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{b.count}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{formatRupiah(b.total)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-warning">{formatRupiah(b.belum)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-success">
                        <div>{formatRupiah(b.sudah)}</div>
                        <div className="text-[10px] text-muted-foreground">{pctPaid}% lunas</div>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatRupiahCompact(b.avg)}</td>
                      <td className="px-3 py-2.5 max-w-[140px] truncate" title={b.topSup}>{b.topSup}</td>
                      <td className="px-3 py-2.5 max-w-[140px] truncate" title={b.topItem}>{b.topItem}</td>
                      <td className="px-3 py-2.5 text-muted-foreground text-xs">{b.last}</td>
                    </tr>
                  );
                })}
                {branchSummary.length === 0 && (
                  <tr><td colSpan={9} className="text-center text-muted-foreground py-6">Belum ada cabang</td></tr>
                )}
              </tbody>
              {branchSummary.length > 0 && (
                <tfoot className="bg-muted/30 font-semibold">
                  <tr className="border-t">
                    <td className="px-3 py-2.5">TOTAL</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{grand.count}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatRupiah(grand.total)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-warning">{formatRupiah(grand.belum)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-success">{formatRupiah(grand.sudah)}</td>
                    <td colSpan={4}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* Per-branch detail cards */}
        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          {branchSummary.map((b) => {
            const pctPaid = b.total > 0 ? (b.sudah / b.total) * 100 : 0;
            return (
              <div key={b.id} className="bg-card rounded-xl border shadow-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-primary text-primary-foreground">
                      <Building2 className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-display font-bold">{b.name}</div>
                      <div className="text-xs text-muted-foreground">{b.count} nota · {b.suppliers} supplier · {b.items} item</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-display font-bold">{formatRupiah(b.total)}</div>
                    <div className="text-xs text-muted-foreground">total</div>
                  </div>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden mb-2">
                  <div className="h-full bg-success" style={{ width: `${pctPaid}%` }} />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground mb-3">
                  <span>Sudah {formatRupiahCompact(b.sudah)}</span>
                  <span>Belum {formatRupiahCompact(b.belum)}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-accent/40 rounded-lg p-2">
                    <div className="text-muted-foreground flex items-center gap-1"><Truck className="h-3 w-3" /> Supplier top</div>
                    <div className="font-medium truncate" title={b.topSup}>{b.topSup}</div>
                  </div>
                  <div className="bg-accent/40 rounded-lg p-2">
                    <div className="text-muted-foreground flex items-center gap-1"><Package className="h-3 w-3" /> Item top</div>
                    <div className="font-medium truncate" title={b.topItem}>{b.topItem}</div>
                  </div>
                  <div className="bg-accent/40 rounded-lg p-2">
                    <div className="text-muted-foreground flex items-center gap-1"><BarChart3 className="h-3 w-3" /> Rata²/nota</div>
                    <div className="font-medium">{formatRupiah(b.avg)}</div>
                  </div>
                  <div className="bg-accent/40 rounded-lg p-2">
                    <div className="text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" /> Aktivitas terakhir</div>
                    <div className="font-medium">{b.last}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}

function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent: "primary" | "warning" | "success" }) {
  const colorMap: Record<string, string> = {
    primary: "bg-gradient-primary text-primary-foreground",
    warning: "bg-warning text-warning-foreground",
    success: "bg-success text-success-foreground",
  };
  return (
    <div className="bg-card rounded-xl border shadow-card p-5 flex items-start justify-between">
      <div>
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="font-display text-2xl font-bold mt-1">{value}</div>
      </div>
      <div className={`grid h-10 w-10 place-items-center rounded-lg ${colorMap[accent]}`}>{icon}</div>
    </div>
  );
}
function EmptyChart() {
  return <div className="h-[260px] grid place-items-center text-sm text-muted-foreground">Belum ada data</div>;
}

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-card rounded-xl border shadow-card p-3 flex items-center gap-3">
      <div className="grid h-9 w-9 place-items-center rounded-lg bg-accent text-accent-foreground">{icon}</div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-display font-bold truncate">{value}</div>
      </div>
    </div>
  );
}

function DarkStat({ icon, label, value, delta, invertDelta, accent }: { icon: React.ReactNode; label: string; value: string; delta?: number; invertDelta?: boolean; accent?: "good" | "bad" }) {
  const showDelta = typeof delta === "number" && isFinite(delta) && delta !== 0;
  const positive = showDelta && (invertDelta ? delta! < 0 : delta! > 0);
  const valueCls = accent === "good" ? "text-success-foreground" : accent === "bad" ? "text-destructive-foreground" : "";
  return (
    <div className="bg-white/10 backdrop-blur rounded-lg p-3">
      <div className="flex items-center gap-1.5 text-[11px] opacity-90">{icon}{label}</div>
      <div className={`font-display font-bold text-base mt-1 ${valueCls}`}>{value}</div>
      {showDelta && (
        <div className={`text-[11px] mt-0.5 flex items-center gap-0.5 ${positive ? "text-success" : "text-warning"}`}>
          {delta! > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          {Math.abs(delta!).toFixed(1)}% vs sebelumnya
        </div>
      )}
    </div>
  );
}