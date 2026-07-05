import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/contexts/AuthContext";
import { useBranch } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const cashierBranchId = cashierBranch?.id;
  const nav = useNavigate();

  const [form, setForm] = useState({
    invoice_date: new Date().toISOString().slice(0, 10),
    supplier: "", item_name: "", qty: "1", price: "0",
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string; items: string | null }[]>([]);
  const [supplierMode, setSupplierMode] = useState<"select" | "new">("select");
  const [itemInputMode, setItemInputMode] = useState<"select" | "text">("text");

  useEffect(() => {
    if (!cashierBranchId) return;
    supabase.from("suppliers").select("id, name, items").eq("branch_id", cashierBranchId).order("name")
      .then(async (res) => {
        if (res.error && res.error.code === "42703") {
          // Fallback if 'items' column does not exist
          const fallback = await supabase.from("suppliers").select("id, name").eq("branch_id", cashierBranchId).order("name");
          setSuppliers((fallback.data ?? []).map(s => ({ ...s, items: null })));
        } else {
          setSuppliers(res.data ?? []);
        }
      });
  }, [cashierBranchId]);

  // Dynamically set items list and default selection when supplier changes
  useEffect(() => {
    const sel = suppliers.find(s => s.name === form.supplier);
    const items = sel?.items ? sel.items.split(",").map(i => i.trim()).filter(Boolean) : [];
    if (items.length > 0) {
      setItemInputMode("select");
      setForm(f => ({ ...f, item_name: items[0] }));
    } else {
      setItemInputMode("text");
      setForm(f => ({ ...f, item_name: "" }));
    }
  }, [form.supplier, suppliers]);

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

  const currentSupplier = suppliers.find(s => s.name === form.supplier);
  const predefinedItems = currentSupplier?.items 
    ? currentSupplier.items.split(",").map(i => i.trim()).filter(Boolean)
    : [];

  return (
    <AppShell title="Input Nota Baru">
      <form onSubmit={submit} className="grid lg:grid-cols-3 gap-6 max-w-5xl">
        <div className="lg:col-span-2 app-card p-6 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>Tanggal Nota</Label><Input type="date" value={form.invoice_date} onChange={(e) => setForm({ ...form, invoice_date: e.target.value })} required /></div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Supplier</Label>
                <button type="button" className="text-xs text-primary font-medium"
                  onClick={() => { setSupplierMode(supplierMode === "select" ? "new" : "select"); setForm({ ...form, supplier: "" }); }}>
                  {supplierMode === "select" ? "+ Supplier baru" : "Pilih dari daftar"}
                </button>
              </div>
              {supplierMode === "select" ? (
                suppliers.length === 0 ? (
                  <div className="text-xs text-muted-foreground border rounded-md p-2">Belum ada supplier. Klik "+ Supplier baru" untuk mengetik manual.</div>
                ) : (
                  <Select value={form.supplier} onValueChange={(v) => setForm({ ...form, supplier: v })}>
                    <SelectTrigger><SelectValue placeholder="Pilih supplier..." /></SelectTrigger>
                    <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                )
              ) : (
                <Input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} placeholder="Nama supplier baru" required />
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Nama Barang</Label>
              {predefinedItems.length > 0 && (
                <button type="button" className="text-xs text-primary font-medium"
                  onClick={() => {
                    const nextMode = itemInputMode === "select" ? "text" : "select";
                    setItemInputMode(nextMode);
                    setForm(f => ({ ...f, item_name: nextMode === "select" ? predefinedItems[0] : "" }));
                  }}>
                  {itemInputMode === "select" ? "+ Ketik manual" : "Pilih dari daftar"}
                </button>
              )}
            </div>
            {itemInputMode === "select" && predefinedItems.length > 0 ? (
              <Select value={form.item_name} onValueChange={(v) => setForm({ ...form, item_name: v })}>
                <SelectTrigger><SelectValue placeholder="Pilih barang..." /></SelectTrigger>
                <SelectContent>
                  {predefinedItems.map((item) => (
                    <SelectItem key={item} value={item}>{item}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input value={form.item_name} onChange={(e) => setForm({ ...form, item_name: e.target.value })} placeholder="cth: Beras Pandanwangi" required />
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>Qty</Label><Input type="number" min={0.01} step="0.01" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} required /></div>
            <div className="space-y-1.5"><Label>Harga Satuan</Label><Input type="number" min={0} step="1" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required /></div>
          </div>
          <div className="rounded-lg border bg-muted/60 p-4 flex justify-between items-center">
            <span className="text-sm opacity-80">Total</span>
            <span className="text-xl font-semibold text-primary">{formatRupiah(total)}</span>
          </div>
          <Button type="submit" disabled={saving} className="w-full shadow-card" size="lg">
            {saving ? "Menyimpan..." : "Simpan Nota"}
          </Button>
        </div>

        <div className="app-card p-6 space-y-3">
          <Label className="font-semibold text-foreground">Foto Bukti Nota</Label>
          {preview ? (
            <img src={preview} alt="preview" className="w-full rounded-lg border aspect-[3/4] object-cover shadow-sm" />
          ) : (
            <div className="aspect-[3/4] border-2 border-dashed border-primary/20 rounded-lg grid place-items-center text-muted-foreground text-sm text-center p-6 bg-muted/20 hover:bg-muted/30 transition-colors">
              <div className="flex flex-col items-center gap-2">
                <div className="h-12 w-12 rounded-full bg-primary/10 text-primary grid place-items-center mb-1">
                  <Camera className="h-6 w-6" />
                </div>
                <span className="font-medium text-foreground">Ambil Foto Nota</span>
                <span className="text-xs text-muted-foreground max-w-[150px] leading-relaxed">Gunakan kamera HP atau unggah file gambar</span>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <label className="cursor-pointer">
              <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => onPhoto(e.target.files?.[0] ?? null)} />
              <div className="border border-primary/20 hover:border-primary/40 rounded-lg py-2.5 text-center text-xs font-semibold flex items-center justify-center gap-1.5 transition bg-primary/5 hover:bg-primary/10 text-primary">
                <Camera className="h-4 w-4" /> Kamera
              </div>
            </label>
            <label className="cursor-pointer">
              <input type="file" accept="image/*" hidden onChange={(e) => onPhoto(e.target.files?.[0] ?? null)} />
              <div className="border border-primary/20 hover:border-primary/40 rounded-lg py-2.5 text-center text-xs font-semibold flex items-center justify-center gap-1.5 transition bg-primary/5 hover:bg-primary/10 text-primary">
                <Upload className="h-4 w-4" /> Galeri File
              </div>
            </label>
          </div>
          {photo && <Button type="button" variant="ghost" size="sm" className="w-full text-destructive hover:bg-destructive/10" onClick={() => onPhoto(null)}>Hapus foto</Button>}
        </div>
      </form>
    </AppShell>
  );
}
