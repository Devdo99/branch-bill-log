import { useCallback, useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { useBranch } from "@/contexts/BranchContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { formatRupiah, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { TrendingUp, Plus, Pencil, Trash2, Save, X, Calendar, Wallet, BarChart3 } from "lucide-react";

interface Revenue {
  id: string; revenue_date: string; amount: number; note: string | null;
}

export default function ManagerOmset() {
  const { activeBranch } = useBranch();
  const { user } = useAuth();
  const activeBranchId = activeBranch?.id;
  const [list, setList] = useState<Revenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editDate, setEditDate] = useState("");
  const [from, setFrom] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1).toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth() + 1, 0).toISOString().slice(0, 10);
  });

  const load = useCallback(async () => {
    if (!activeBranchId) return;
    setLoading(true);
    const { data, error } = await supabase.from("daily_revenues" as any)
      .select("id, revenue_date, amount, note")
      .eq("branch_id", activeBranchId)
      .order("revenue_date", { ascending: false });
    if (error) toast.error(error.message);
    setList(((data ?? []) as unknown) as Revenue[]);
    setLoading(false);
  }, [activeBranchId]);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => list.filter((r) => {
    if (from && r.revenue_date < from) return false;
    if (to && r.revenue_date > to) return false;
    return true;
  }), [list, from, to]);

  const total = filtered.reduce((s, r) => s + Number(r.amount), 0);
  const avg = filtered.length ? total / filtered.length : 0;
  const best = filtered.reduce((m, r) => (Number(r.amount) > Number(m?.amount ?? 0) ? r : m), null as Revenue | null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBranch || !user) return;
    const amt = Number(amount.replace(/[^\d.-]/g, ""));
    if (!amt || amt < 0) return toast.error("Jumlah omset tidak valid");
    const { error } = await supabase.from("daily_revenues" as any).upsert({
      branch_id: activeBranch.id, revenue_date: date, amount: amt,
      note: note.trim() || null, created_by: user.id,
    } as any, { onConflict: "branch_id,revenue_date" });
    if (error) return toast.error(error.message);
    toast.success("Omset disimpan");
    setAmount(""); setNote(""); load();
  };

  const startEdit = (r: Revenue) => {
    setEditId(r.id); setEditDate(r.revenue_date);
    setEditAmount(String(r.amount)); setEditNote(r.note ?? "");
  };
  const saveEdit = async () => {
    if (!editId) return;
    const amt = Number(editAmount.replace(/[^\d.-]/g, ""));
    if (!amt || amt < 0) return toast.error("Jumlah tidak valid");
    const { error } = await supabase.from("daily_revenues" as any).update({
      revenue_date: editDate, amount: amt, note: editNote.trim() || null,
    } as any).eq("id", editId);
    if (error) return toast.error(error.message);
    toast.success("Tersimpan"); setEditId(null); load();
  };
  const remove = async (id: string) => {
    if (!confirm("Hapus catatan omset ini?")) return;
    const { error } = await supabase.from("daily_revenues" as any).delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Dihapus"); load();
  };

  return (
    <AppShell title={`Omset Harian — ${activeBranch?.name}`}>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
        <Stat icon={<Wallet className="h-5 w-5" />} label="Total Omset" value={formatRupiah(total)} tone="primary" />
        <Stat icon={<BarChart3 className="h-5 w-5" />} label="Rata-rata / hari" value={formatRupiah(avg)} tone="success" />
        <Stat icon={<TrendingUp className="h-5 w-5" />} label="Hari Terbaik" value={best ? `${formatRupiah(Number(best.amount))} (${formatDate(best.revenue_date)})` : "-"} tone="warning" />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <form onSubmit={submit} className="app-card p-4 space-y-3">
          <h3 className="font-semibold flex items-center gap-2"><Plus className="h-4 w-4" /> Input Omset Harian</h3>
          <div className="space-y-1.5"><Label>Tanggal *</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></div>
          <div className="space-y-1.5"><Label>Jumlah Omset (Rp) *</Label><Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="cth: 2500000" required /></div>
          <div className="space-y-1.5"><Label>Catatan (opsional)</Label><Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Cuaca, event, dll." /></div>
          <Button type="submit" className="w-full"><Save className="h-4 w-4 mr-1" /> Simpan</Button>
          <p className="text-xs text-muted-foreground">Jika tanggal sudah ada, datanya akan diperbarui.</p>
        </form>

        <div className="lg:col-span-2 app-table">
          <div className="p-4 border-b flex flex-wrap items-end gap-3">
            <h3 className="font-semibold mr-auto flex items-center gap-2"><Calendar className="h-4 w-4" /> Riwayat ({filtered.length})</h3>
            <div className="space-y-1"><Label className="text-xs">Dari</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8" /></div>
            <div className="space-y-1"><Label className="text-xs">Sampai</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8" /></div>
          </div>
          {loading ? <p className="p-5 text-muted-foreground">Memuat…</p>
           : filtered.length === 0 ? <p className="p-5 text-sm text-muted-foreground">Belum ada catatan omset.</p>
           : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left">
                  <tr><th className="p-3">Tanggal</th><th className="p-3 text-right">Omset</th><th className="p-3">Catatan</th><th className="p-3"></th></tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} className="border-t hover:bg-muted/40">
                      {editId === r.id ? (
                        <>
                          <td className="p-2"><Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="h-8" /></td>
                          <td className="p-2"><Input value={editAmount} onChange={(e) => setEditAmount(e.target.value)} className="h-8 text-right" /></td>
                          <td className="p-2"><Input value={editNote} onChange={(e) => setEditNote(e.target.value)} className="h-8" /></td>
                          <td className="p-2 text-right whitespace-nowrap">
                            <Button size="icon" variant="ghost" onClick={saveEdit}><Save className="h-4 w-4" /></Button>
                            <Button size="icon" variant="ghost" onClick={() => setEditId(null)}><X className="h-4 w-4" /></Button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="p-3 whitespace-nowrap">{formatDate(r.revenue_date)}</td>
                          <td className="p-3 text-right font-semibold">{formatRupiah(Number(r.amount))}</td>
                          <td className="p-3 text-muted-foreground">{r.note ?? "-"}</td>
                          <td className="p-3 text-right whitespace-nowrap">
                            <Button size="icon" variant="ghost" onClick={() => startEdit(r)}><Pencil className="h-4 w-4" /></Button>
                            <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4" /></Button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: "primary" | "success" | "warning" }) {
  const t = tone === "success" ? "bg-success/10 text-success" : tone === "warning" ? "bg-warning/15 text-warning-foreground" : "bg-primary/10 text-primary";
  return (
    <div className="app-card p-3 flex items-center gap-3">
      <div className={`h-10 w-10 grid place-items-center rounded-lg ${t}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground truncate">{label}</div>
        <div className="font-semibold text-base truncate">{value}</div>
      </div>
    </div>
  );
}
