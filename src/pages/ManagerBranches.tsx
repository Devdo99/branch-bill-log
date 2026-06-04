import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Building2, Plus, Trash2 } from "lucide-react";

export default function ManagerBranches() {
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data, error } = await supabase.from("branches").select("id, name").order("created_at");
    if (error) toast.error(error.message);
    setBranches(data ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) { toast.error("Nama minimal 2 karakter"); return; }
    if (!/^\d{4,6}$/.test(pin)) { toast.error("PIN 4-6 digit"); return; }
    setSaving(true);
    try {
      const { error } = await supabase.functions.invoke("create-branch", { body: { name: name.trim(), pin } });
      if (error) throw error;
      toast.success("Cabang dibuat");
      setOpen(false); setName(""); setPin("");
      load();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    if (!confirm("Hapus cabang ini? Semua nota & kasir terkait akan ikut terhapus.")) return;
    const { error } = await supabase.from("branches").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Cabang dihapus");
    load();
  };

  return (
    <AppShell title="Cabang">
      <div className="flex justify-end mb-4">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> Tambah Cabang</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Tambah Cabang Baru</DialogTitle></DialogHeader>
            <form onSubmit={create} className="space-y-4">
              <div className="space-y-1.5"><Label>Nama Cabang</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
              <div className="space-y-1.5"><Label>PIN (4-6 digit)</Label><Input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" required /></div>
              <Button type="submit" disabled={saving} className="w-full">{saving ? "Menyimpan…" : "Simpan"}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? <p className="text-muted-foreground">Memuat…</p> : branches.length === 0 ? (
        <div className="app-card p-10 text-center text-muted-foreground">Belum ada cabang. Tambahkan cabang pertama.</div>
      ) : (
        <div className="grid md:grid-cols-3 gap-4">
          {branches.map((b) => (
            <div key={b.id} className="app-card p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-lg bg-accent text-accent-foreground"><Building2 className="h-5 w-5" /></div>
                <div className="font-semibold">{b.name}</div>
              </div>
              <Button size="icon" variant="ghost" onClick={() => remove(b.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
