import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/contexts/AuthContext";
import { useBranch } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { formatRupiah } from "@/lib/format";
import { Camera, Upload } from "lucide-react";
import { z } from "zod";

const schema = z.object({
  invoice_date: z.string().min(1),
  supplier: z.string().trim().min(1).max(100),
  item_name: z.string().trim().min(1).max(200),
  qty: z.number().positive(),
  price: z.number().nonnegative(),
});

export default function KasirInputNota() {
  const { user } = useAuth();
  const { cashierBranch } = useBranch();
  const nav = useNavigate();
  const [form, setForm] = useState({
    invoice_date: new Date().toISOString().slice(0, 10),
    supplier: "", item_name: "", qty: "1", price: "0",
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const total = (Number(form.qty) || 0) * (Number(form.price) || 0);

  const onPhoto = (f: File | null) => {
    setPhoto(f);
    if (f) setPreview(URL.createObjectURL(f)); else setPreview(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !cashierBranch) return;
    const parsed = schema.safeParse({
      invoice_date: form.invoice_date,
      supplier: form.supplier, item_name: form.item_name,
      qty: Number(form.qty), price: Number(form.price),
    });
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    setSaving(true);
    try {
      let photo_path: string | null = null;
      if (photo) {
        const ext = photo.name.split(".").pop() || "jpg";
        photo_path = `${cashierBranch.id}/${user.id}-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("nota-photos").upload(photo_path, photo, { upsert: false });
        if (upErr) throw upErr;
      }
      const { error } = await supabase.from("invoices").insert({
        branch_id: cashierBranch.id,
        invoice_date: parsed.data.invoice_date,
        supplier: parsed.data.supplier,
        item_name: parsed.data.item_name,
        qty: parsed.data.qty,
        price: parsed.data.price,
        total: parsed.data.qty * parsed.data.price,
        photo_path,
        created_by: user.id,
      });
      if (error) throw error;
      toast.success("Nota tersimpan");
      nav("/kasir");
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  return (
    <AppShell title="Input Nota Baru">
      <form onSubmit={submit} className="grid lg:grid-cols-3 gap-6 max-w-5xl">
        <div className="lg:col-span-2 bg-card border rounded-xl shadow-card p-6 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>Tanggal Nota</Label><Input type="date" value={form.invoice_date} onChange={(e) => setForm({ ...form, invoice_date: e.target.value })} required /></div>
            <div className="space-y-1.5"><Label>Supplier</Label><Input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} required /></div>
          </div>
          <div className="space-y-1.5"><Label>Nama Barang</Label><Input value={form.item_name} onChange={(e) => setForm({ ...form, item_name: e.target.value })} required /></div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>Qty</Label><Input type="number" min={0.01} step="0.01" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} required /></div>
            <div className="space-y-1.5"><Label>Harga Satuan</Label><Input type="number" min={0} step="1" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required /></div>
          </div>
          <div className="bg-gradient-dark text-secondary-foreground rounded-lg p-4 flex justify-between items-center">
            <span className="text-sm opacity-80">Total</span>
            <span className="font-display text-2xl font-bold text-primary-glow">{formatRupiah(total)}</span>
          </div>
          <Button type="submit" disabled={saving} className="w-full bg-gradient-primary shadow-elegant" size="lg">
            {saving ? "Menyimpan…" : "Simpan Nota"}
          </Button>
        </div>

        <div className="bg-card border rounded-xl shadow-card p-6 space-y-3">
          <Label>Foto Nota</Label>
          {preview ? (
            <img src={preview} alt="preview" className="w-full rounded-lg border aspect-[3/4] object-cover" />
          ) : (
            <div className="aspect-[3/4] border-2 border-dashed rounded-lg grid place-items-center text-muted-foreground text-sm text-center p-4">
              Foto/upload nota di sini
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <label className="cursor-pointer"><input type="file" accept="image/*" capture="environment" hidden onChange={(e) => onPhoto(e.target.files?.[0] ?? null)} />
              <div className="border rounded-lg py-2 text-center text-sm flex items-center justify-center gap-1 hover:bg-muted"><Camera className="h-4 w-4" /> Kamera</div>
            </label>
            <label className="cursor-pointer"><input type="file" accept="image/*" hidden onChange={(e) => onPhoto(e.target.files?.[0] ?? null)} />
              <div className="border rounded-lg py-2 text-center text-sm flex items-center justify-center gap-1 hover:bg-muted"><Upload className="h-4 w-4" /> Upload</div>
            </label>
          </div>
          {photo && <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => onPhoto(null)}>Hapus foto</Button>}
        </div>
      </form>
    </AppShell>
  );
}