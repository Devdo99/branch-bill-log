import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { useBranch } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { UserPlus, User, Trash2 } from "lucide-react";

interface Cashier { id: string; user_id: string; full_name: string; email?: string }

export default function ManagerCashiers() {
  const { activeBranch } = useBranch();
  const [list, setList] = useState<Cashier[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", password: "" });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!activeBranch) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("branch_users")
      .select("id, user_id, profiles(full_name)")
      .eq("branch_id", activeBranch.id);
    if (error) toast.error(error.message);
    setList(((data ?? []) as any[]).map((r) => ({ id: r.id, user_id: r.user_id, full_name: r.profiles?.full_name ?? "—" })));
    setLoading(false);
  };
  useEffect(() => { load(); }, [activeBranch?.id]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBranch) return;
    if (form.full_name.trim().length < 2) return toast.error("Nama wajib diisi");
    if (!/^\S+@\S+\.\S+$/.test(form.email)) return toast.error("Email tidak valid");
    if (form.password.length < 8) return toast.error("Password minimal 8 karakter");
    setSaving(true);
    try {
      const { error } = await supabase.functions.invoke("create-cashier", {
        body: { ...form, branch_id: activeBranch.id },
      });
      if (error) throw error;
      toast.success("Akun kasir dibuat");
      setOpen(false); setForm({ full_name: "", email: "", password: "" });
      load();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  const remove = async (bu: Cashier) => {
    if (!confirm(`Lepas ${bu.full_name} dari cabang?`)) return;
    const { error } = await supabase.from("branch_users").delete().eq("id", bu.id);
    if (error) return toast.error(error.message);
    toast.success("Kasir dilepas dari cabang");
    load();
  };

  return (
    <AppShell title={`Kasir — ${activeBranch?.name ?? ""}`}>
      <div className="flex justify-end mb-4">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="bg-gradient-primary"><UserPlus className="h-4 w-4 mr-1" /> Tambah Kasir</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Buat Akun Kasir</DialogTitle></DialogHeader>
            <form onSubmit={create} className="space-y-4">
              <div className="space-y-1.5"><Label>Nama Lengkap</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required /></div>
              <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
              <div className="space-y-1.5"><Label>Password (min 8 karakter)</Label><Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></div>
              <p className="text-xs text-muted-foreground">Berikan email & password ini ke kasir untuk login.</p>
              <Button type="submit" disabled={saving} className="w-full bg-gradient-primary">{saving ? "Membuat…" : "Buat Akun"}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? <p className="text-muted-foreground">Memuat…</p> : list.length === 0 ? (
        <div className="bg-card border rounded-xl p-12 text-center text-muted-foreground">Belum ada kasir di cabang ini.</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {list.map((c) => (
            <div key={c.id} className="bg-card rounded-xl border shadow-card p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-lg bg-accent text-accent-foreground"><User className="h-5 w-5" /></div>
                <div className="font-semibold">{c.full_name}</div>
              </div>
              <Button size="icon" variant="ghost" onClick={() => remove(c)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}