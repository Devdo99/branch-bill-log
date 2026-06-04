import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { useBranch } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { formatRupiah, formatDate } from "@/lib/format";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Plus, Receipt } from "lucide-react";

interface Inv { id: string; invoice_date: string; supplier: string; item_name: string; total: number; status: string }

export default function KasirDashboard() {
  const { cashierBranch, activeBranch } = useBranch();
  const branch = activeBranch ?? cashierBranch;
  const branchId = branch?.id;
  const [invs, setInvs] = useState<Inv[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!branchId) return;
    (async () => {
      const { data } = await supabase.from("invoices").select("id, invoice_date, supplier, item_name, total, status")
        .eq("branch_id", branchId).order("created_at", { ascending: false }).limit(20);
      setInvs((data ?? []) as Inv[]);
      setLoading(false);
    })();
  }, [branchId]);

  if (!branch) return <AppShell title="Dashboard Kasir"><p className="text-muted-foreground">Anda belum ditugaskan ke cabang manapun. Hubungi manager.</p></AppShell>;

  const today = new Date().toISOString().slice(0, 10);
  const todayCount = invs.filter((i) => i.invoice_date === today).length;
  const todayTotal = invs.filter((i) => i.invoice_date === today).reduce((s, i) => s + Number(i.total), 0);

  return (
    <AppShell title={`Dashboard - ${branch.name}`}>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="app-panel p-6">
          <div className="text-sm opacity-70">Total Nota Hari Ini</div>
          <div className="text-2xl font-semibold mt-1">{todayCount} nota</div>
          <div className="text-lg mt-1 text-primary font-semibold">{formatRupiah(todayTotal)}</div>
        </div>
        <Link to="/kasir/input" className="rounded-lg bg-primary text-primary-foreground p-6 shadow-card flex items-center justify-between transition hover:bg-primary/90">
          <div>
            <div className="text-sm opacity-90">Aksi Cepat</div>
            <div className="text-xl font-semibold mt-1">Input Nota Baru</div>
          </div>
          <Plus className="h-8 w-8" />
        </Link>
      </div>

      <h2 className="font-semibold text-xl mt-8 mb-3">Nota Terbaru</h2>
      {loading ? <p className="text-muted-foreground">Memuat...</p> : invs.length === 0 ? (
        <div className="app-card p-12 text-center text-muted-foreground">
          <Receipt className="h-8 w-8 mx-auto mb-2" />
          Belum ada nota. <Link to="/kasir/input" className="text-primary font-semibold">Tambah nota pertama</Link>
        </div>
      ) : (
        <div className="app-table">
          <table className="w-full text-sm">
            <thead className="bg-muted/70 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="p-3">Tanggal</th><th className="p-3">Supplier</th><th className="p-3">Barang</th><th className="p-3 text-right">Total</th><th className="p-3">Status</th></tr></thead>
            <tbody>
              {invs.map((i) => (
                <tr key={i.id} className="border-t hover:bg-muted/35">
                  <td className="p-3 whitespace-nowrap">{formatDate(i.invoice_date)}</td>
                  <td className="p-3">{i.supplier}</td>
                  <td className="p-3">{i.item_name}</td>
                  <td className="p-3 text-right font-semibold">{formatRupiah(Number(i.total))}</td>
                  <td className="p-3"><span className={`status-pill ${i.status === "SUDAH" ? "bg-success/10 text-success" : "bg-warning/15 text-warning-foreground"}`}>{i.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
