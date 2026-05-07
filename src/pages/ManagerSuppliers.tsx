import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { useBranch } from "@/contexts/BranchContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Trash2, Plus, Pencil, Save, X } from "lucide-react";

interface Supplier { id: string; name: string; note: string | null }

export default function ManagerSuppliers() {
  const { activeBranch } = useBranch();
  const { user } = useAuth();
  const [list, setList] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editNote, setEditNote] = useState("");

  const load = async () => {
    if (!activeBranch) return;
    setLoading(true);
    const { data, error } = await supabase.from("suppliers").select("id, name, note")
      .eq("branch_id", activeBranch.id).order("name");
    if (error) toast.error(error.message);
    setList((data ?? []) as Supplier[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, [activeBranch?.id]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBranch || !user) return;
    const trimmed = name.trim();
    if (!trimmed) return toast.error("Nama supplier wajib diisi");
    const { error } = await supabase.from("suppliers").insert({
      branch_id: activeBranch.id, name: trimmed, note: note.trim() || null, created_by: user.id,
    });
    if (error) return toast.error(error.message);
    toast.success("Supplier ditambahkan");
    setName(""); setNote(""); load();
  };

  const startEdit = (s: Supplier) => { setEditId(s.id); setEditName(s.name); setEditNote(s.note ?? ""); };
  const saveEdit = async () => {
    if (!editId) return;
    const { error } = await supabase.from("suppliers")
      .update({ name: editName.trim(), note: editNote.trim() || null }).eq("id", editId);
    if (error) return toast.error(error.message);
    toast.success("Tersimpan"); setEditId(null); load();
  };
  const remove = async (id: string) => {
    if (!confirm("Hapus supplier ini?")) return;
    const { error } = await supabase.from("suppliers").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Dihapus"); load();
  };

  return (
    <AppShell title={`Supplier — ${activeBranch?.name}`}>
      <div className="grid lg:grid-cols-3 gap-6">
        <form onSubmit={add} className="bg-card border rounded-xl shadow-card p-5 space-y-3">
          <h3 className="font-display font-bold">Tambah Supplier</h3>
          <div className="space-y-1.5"><Label>Nama Supplier *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="PT Sumber Pangan" required /></div>
          <div className="space-y-1.5"><Label>Catatan (opsional)</Label><Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="No telp, alamat, jenis barang…" rows={3} /></div>
          <Button type="submit" className="w-full bg-gradient-primary"><Plus className="h-4 w-4 mr-1" /> Simpan</Button>
        </form>

        <div className="lg:col-span-2 bg-card border rounded-xl shadow-card overflow-hidden">
          <div className="p-5 border-b"><h3 className="font-display font-bold">Daftar Supplier ({list.length})</h3></div>
          {loading ? <p className="p-5 text-muted-foreground">Memuat…</p>
           : list.length === 0 ? <p className="p-5 text-muted-foreground text-sm">Belum ada supplier. Tambahkan agar kasir tinggal pilih saat input nota.</p>
           : (
            <ul className="divide-y">
              {list.map((s) => (
                <li key={s.id} className="p-4 flex items-start gap-3">
                  {editId === s.id ? (
                    <div className="flex-1 space-y-2">
                      <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                      <Textarea value={editNote} onChange={(e) => setEditNote(e.target.value)} rows={2} />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={saveEdit}><Save className="h-4 w-4 mr-1" />Simpan</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditId(null)}><X className="h-4 w-4" /></Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold">{s.name}</div>
                        {s.note && <div className="text-sm text-muted-foreground whitespace-pre-wrap">{s.note}</div>}
                      </div>
                      <Button size="icon" variant="ghost" onClick={() => startEdit(s)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => remove(s.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AppShell>
  );
}