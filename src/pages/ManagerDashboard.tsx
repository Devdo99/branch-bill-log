import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { useBranch } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { formatRupiah, formatRupiahCompact } from "@/lib/format";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line, CartesianGrid } from "recharts";
import { TrendingUp, AlertCircle, CheckCircle2, Receipt, Package, Truck, Building2, Crown, Calendar, Layers, Wallet, BarChart3 } from "lucide-react";
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

  const topBranch = branchSummary[0];

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