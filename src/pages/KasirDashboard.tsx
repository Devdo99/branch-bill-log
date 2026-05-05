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
  const [invs, setInvs] = useState<Inv[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!branch) return;
    (async () => {
      const { data } = await supabase.from("invoices").select("id, invoice_date, supplier, item_name, total, status")
        .eq("branch_id", branch.id).order("created_at", { ascending: false }).limit(20);
      setInvs((data ?? []) as Inv[]);
      setLoading(false);
    })();
  }, [branch?.id]);

  if (!branch) return <AppShell title="Dashboard Kasir"><p className="text-muted-foreground">Anda belum ditugaskan ke cabang manapun. Hubungi manager.</p></AppShell>;

  const today = new Date().toISOString().slice(0, 10);
  const todayCount = invs.filter((i) => i.invoice_date === today).length;
  const todayTotal = invs.filter((i) => i.invoice_date === today).reduce((s, i) => s + Number(i.total), 0);

  return (
    <AppShell title={`Dashboard — ${branch.name}`}>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="bg-gradient-dark text-secondary-foreground rounded-xl p-6 shadow-elegant">
          <div className="text-sm opacity-70">Total Nota Hari Ini</div>
          <div className="font-display text-3xl font-bold mt-1">{todayCount} nota</div>
          <div className="text-lg mt-1 text-primary-glow">{formatRupiah(todayTotal)}</div>
        </div>
        <Link to="/kasir/input" className="bg-gradient-primary text-primary-foreground rounded-xl p-6 shadow-elegant flex items-center justify-between hover:opacity-95 transition">
          <div>
            <div className="text-sm opacity-90">Aksi Cepat</div>
            <div className="font-display text-2xl font-bold mt-1">Input Nota Baru</div>
          </div>
          <Plus className="h-10 w-10" />
        </Link>
      </div>

      <h2 className="font-display font-bold text-xl mt-8 mb-3">Nota Terbaru</h2>
      {loading ? <p className="text-muted-foreground">Memuat…</p> : invs.length === 0 ? (
        <div className="bg-card border rounded-xl p-12 text-center text-muted-foreground">
          <Receipt className="h-10 w-10 mx-auto mb-2" />
          Belum ada nota. <Link to="/kasir/input" className="text-primary font-semibold">Tambah nota pertama →</Link>
        </div>
      ) : (
        <div className="bg-card border rounded-xl shadow-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left"><tr><th className="p-3">Tanggal</th><th className="p-3">Supplier</th><th className="p-3">Barang</th><th className="p-3 text-right">Total</th><th className="p-3">Status</th></tr></thead>
            <tbody>
              {invs.map((i) => (
                <tr key={i.id} className="border-t">
                  <td className="p-3 whitespace-nowrap">{formatDate(i.invoice_date)}</td>
                  <td className="p-3">{i.supplier}</td>
                  <td className="p-3">{i.item_name}</td>
                  <td className="p-3 text-right font-semibold">{formatRupiah(Number(i.total))}</td>
                  <td className="p-3"><span className={`text-xs px-2 py-0.5 rounded-full ${i.status === "SUDAH" ? "bg-success text-success-foreground" : "bg-warning text-warning-foreground"}`}>{i.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}