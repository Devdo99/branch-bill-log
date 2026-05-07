import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { useBranch } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { formatRupiah, formatRupiahCompact } from "@/lib/format";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line, CartesianGrid } from "recharts";
import { TrendingUp, AlertCircle, CheckCircle2, Receipt, Package, Truck } from "lucide-react";
import { Link } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Inv { id: string; supplier: string; item_name: string; qty: number; price: number; total: number; status: "BELUM" | "SUDAH"; invoice_date: string; branch_id: string }

export default function ManagerDashboard() {
  const { activeBranch } = useBranch();
  const [allInv, setAllInv] = useState<Inv[]>([]);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  useEffect(() => {
    (async () => {
      const [{ data: invs }, { data: brs }] = await Promise.all([
        supabase.from("invoices").select("id, supplier, item_name, qty, price, total, status, invoice_date, branch_id"),
        supabase.from("branches").select("id, name"),
      ]);
      setAllInv((invs ?? []) as Inv[]);
      setBranches(brs ?? []);
      setLoading(false);
    })();
  }, []);

  const branchInv = useMemo(() => allInv.filter((i) => {
    if (i.branch_id !== activeBranch?.id) return false;
    if (from && i.invoice_date < from) return false;
    if (to && i.invoice_date > to) return false;
    return true;
  }), [allInv, activeBranch, from, to]);
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

  const branchData = useMemo(() => {
    const map = new Map<string, number>();
    allInv.forEach((i) => map.set(i.branch_id, (map.get(i.branch_id) ?? 0) + Number(i.total)));
    return branches.map((b) => ({ name: b.name, total: map.get(b.id) ?? 0 }));
  }, [allInv, branches]);

  const COLORS = ["hsl(152 72% 32%)", "hsl(152 72% 50%)", "hsl(0 0% 18%)", "hsl(38 92% 55%)", "hsl(152 40% 70%)", "hsl(0 0% 50%)"];

  if (loading) return <AppShell title="Dashboard"><p className="text-muted-foreground">Memuat…</p></AppShell>;

  return (
    <AppShell title={`Dashboard — ${activeBranch?.name}`}>
      <div className="bg-card border rounded-xl shadow-card p-4 grid sm:grid-cols-3 gap-3 mb-4">
        <div className="space-y-1.5"><Label>Dari tanggal</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Sampai tanggal</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <div className="flex items-end"><button onClick={() => { setFrom(""); setTo(""); }} className="text-sm text-primary font-medium">Reset filter</button></div>
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