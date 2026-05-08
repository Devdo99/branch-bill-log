import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { useBranch } from "@/contexts/BranchContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { formatRupiah, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Search, FileDown, Image as ImgIcon, MessageCircle, Eye, ZoomIn, ZoomOut, RotateCw, Pencil, Trash2, CalendarDays, Filter, Sparkles, Receipt, Wallet, CheckCircle2, Clock, Settings2, RotateCcw } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import jsPDF from "jspdf";

const DEFAULT_WA_TEMPLATE = `*Laporan Nota — {cabang}*
Periode: {periode}
Tanggal kirim: {tanggal}

Jumlah nota: {jumlah}
Total: *{total}*
Sudah dibayar: {sudah}
Belum dibayar: {belum}

Rincian:
{rincian}`;

interface Inv {
  id: string; invoice_date: string; supplier: string; item_name: string;
  qty: number; price: number; total: number; status: "BELUM" | "SUDAH";
  photo_path: string | null; created_by: string; paid_at: string | null;
}

export default function ManagerInvoices() {
  const { activeBranch } = useBranch();
  const { user } = useAuth();
  const [invs, setInvs] = useState<Inv[]>([]);
  const [loading, setLoading] = useState(true);
  const [supplier, setSupplier] = useState("");
  const [itemQuery, setItemQuery] = useState("");
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const [supplierOptions, setSupplierOptions] = useState<string[]>([]);
  const [status, setStatus] = useState<"all" | "BELUM" | "SUDAH">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [detail, setDetail] = useState<Inv | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotate, setRotate] = useState(0);
  const [editing, setEditing] = useState<Inv | null>(null);
  const [editDate, setEditDate] = useState("");
  const [deleting, setDeleting] = useState<Inv | null>(null);
  const [waOpen, setWaOpen] = useState(false);
  const [waPhone, setWaPhone] = useState<string>(() => localStorage.getItem("wa_phone") ?? "");
  const [waTemplate, setWaTemplate] = useState<string>(() => localStorage.getItem("wa_template") ?? DEFAULT_WA_TEMPLATE);
  const [waText, setWaText] = useState<string>("");

  const load = async () => {
    if (!activeBranch) return;
    setLoading(true);
    const { data, error } = await supabase.from("invoices").select("*")
      .eq("branch_id", activeBranch.id).order("invoice_date", { ascending: false });
    if (error) toast.error(error.message);
    setInvs((data ?? []) as Inv[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, [activeBranch?.id]);

  useEffect(() => {
    if (!activeBranch) return;
    supabase.from("suppliers").select("name").eq("branch_id", activeBranch.id).order("name")
      .then(({ data }) => setSupplierOptions((data ?? []).map((s: any) => s.name)));
  }, [activeBranch?.id]);

  const filtered = useMemo(() => invs.filter((i) => {
    if (supplier && !i.supplier.toLowerCase().includes(supplier.toLowerCase())) return false;
    if (supplierFilter !== "all" && i.supplier !== supplierFilter) return false;
    if (itemQuery && !i.item_name.toLowerCase().includes(itemQuery.toLowerCase())) return false;
    if (status !== "all" && i.status !== status) return false;
    if (from && i.invoice_date < from) return false;
    if (to && i.invoice_date > to) return false;
    return true;
  }), [invs, supplier, supplierFilter, itemQuery, status, from, to]);

  const totalFiltered = filtered.reduce((s, i) => s + Number(i.total), 0);
  const paidTotal = filtered.filter((i) => i.status === "SUDAH").reduce((s, i) => s + Number(i.total), 0);
  const unpaidTotal = filtered.filter((i) => i.status === "BELUM").reduce((s, i) => s + Number(i.total), 0);

  const togglePaid = async (inv: Inv, paid: boolean) => {
    const update = paid
      ? { status: "SUDAH" as const, paid_at: new Date().toISOString(), paid_by: user!.id }
      : { status: "BELUM" as const, paid_at: null, paid_by: null };
    const { error } = await supabase.from("invoices").update(update).eq("id", inv.id);
    if (error) return toast.error(error.message);
    toast.success(paid ? "Ditandai TERBAYAR" : "Ditandai BELUM");
    load();
  };

  const saveEditDate = async () => {
    if (!editing || !editDate) return;
    const { error } = await supabase.from("invoices").update({ invoice_date: editDate }).eq("id", editing.id);
    if (error) return toast.error(error.message);
    toast.success("Tanggal diperbarui");
    setEditing(null);
    load();
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const { error } = await supabase.from("invoices").delete().eq("id", deleting.id);
    if (error) return toast.error(error.message);
    if (deleting.photo_path) {
      await supabase.storage.from("nota-photos").remove([deleting.photo_path]).catch(() => {});
    }
    toast.success("Nota dihapus");
    setDeleting(null);
    load();
  };

  const openDetail = async (inv: Inv) => {
    setDetail(inv); setPhotoUrl(null); setZoom(1); setRotate(0);
    if (inv.photo_path) {
      const { data } = await supabase.storage.from("nota-photos").createSignedUrl(inv.photo_path, 3600);
      setPhotoUrl(data?.signedUrl ?? null);
    }
  };

  const buildText = (rows: Inv[]) => {
    const lines = rows.map((i, idx) =>
      `${idx + 1}. ${formatDate(i.invoice_date)} • ${i.supplier}\n   ${i.item_name} (${i.qty} × ${formatRupiah(i.price)}) = *${formatRupiah(i.total)}* — ${i.status}`
    ).join("\n");
    const total = rows.reduce((s, i) => s + Number(i.total), 0);
    const paid = rows.filter((r) => r.status === "SUDAH").reduce((s, i) => s + Number(i.total), 0);
    const unpaid = total - paid;
    return waTemplate
      .split("{cabang}").join(activeBranch?.name ?? "-")
      .split("{periode}").join(from || to ? `${from || "-"} s/d ${to || "-"}` : "Semua periode")
      .split("{jumlah}").join(String(rows.length))
      .split("{total}").join(formatRupiah(total))
      .split("{sudah}").join(formatRupiah(paid))
      .split("{belum}").join(formatRupiah(unpaid))
      .split("{tanggal}").join(new Date().toLocaleDateString("id-ID"))
      .split("{rincian}").join(lines || "(tidak ada nota)");
  };

  const openWa = () => {
    setWaText(buildText(filtered));
    setWaOpen(true);
  };
  const sendWhatsApp = () => {
    localStorage.setItem("wa_phone", waPhone);
    localStorage.setItem("wa_template", waTemplate);
    const phone = waPhone.replace(/\D/g, "");
    const url = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(waText)}`
      : `https://wa.me/?text=${encodeURIComponent(waText)}`;
    window.open(url, "_blank");
    setWaOpen(false);
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16); doc.text(`Laporan Nota — ${activeBranch?.name}`, 14, 18);
    doc.setFontSize(10); doc.text(`Total: ${formatRupiah(totalFiltered)}`, 14, 26);
    let y = 36;
    doc.setFontSize(9);
    doc.text("Tanggal", 14, y); doc.text("Supplier", 44, y); doc.text("Barang", 84, y); doc.text("Qty", 124, y); doc.text("Total", 144, y); doc.text("Status", 178, y);
    y += 4; doc.line(14, y, 196, y); y += 6;
    filtered.forEach((i) => {
      if (y > 280) { doc.addPage(); y = 20; }
      doc.text(formatDate(i.invoice_date), 14, y);
      doc.text(i.supplier.slice(0, 18), 44, y);
      doc.text(i.item_name.slice(0, 18), 84, y);
      doc.text(String(i.qty), 124, y);
      doc.text(formatRupiah(i.total), 144, y);
      doc.text(i.status, 178, y);
      y += 7;
    });
    doc.save(`laporan-${activeBranch?.name}-${Date.now()}.pdf`);
  };

  const exportJPG = async () => {
    const html2canvas = (await import("html2canvas")).default;
    const el = document.getElementById("invoice-table-export");
    if (!el) return;
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff" });
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/jpeg", 0.95);
    a.download = `laporan-${activeBranch?.name}-${Date.now()}.jpg`;
    a.click();
  };

  return (
    <AppShell title={`Nota — ${activeBranch?.name}`}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <StatCard icon={<Receipt className="h-5 w-5" />} label="Jumlah Nota" value={String(filtered.length)} tone="primary" />
        <StatCard icon={<Wallet className="h-5 w-5" />} label="Total" value={formatRupiah(totalFiltered)} tone="primary" />
        <StatCard icon={<CheckCircle2 className="h-5 w-5" />} label="Sudah Dibayar" value={formatRupiah(paidTotal)} tone="success" />
        <StatCard icon={<Clock className="h-5 w-5" />} label="Belum Dibayar" value={formatRupiah(unpaidTotal)} tone="warning" />
      </div>

      <div className="bg-card border rounded-xl shadow-card p-4 grid md:grid-cols-6 gap-3">
        <div className="md:col-span-6 flex items-center gap-2 text-sm font-semibold text-muted-foreground -mb-1">
          <Filter className="h-4 w-4" /> Filter
        </div>
        <div className="space-y-1.5"><Label>Supplier (daftar)</Label>
          <Select value={supplierFilter} onValueChange={setSupplierFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua supplier</SelectItem>
              {supplierOptions.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>Cari supplier</Label><div className="relative"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-8" placeholder="ketik…" value={supplier} onChange={(e) => setSupplier(e.target.value)} /></div></div>
        <div className="space-y-1.5"><Label>Nama Item</Label><div className="relative"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-8" placeholder="cth: beras" value={itemQuery} onChange={(e) => setItemQuery(e.target.value)} /></div></div>
        <div className="space-y-1.5"><Label>Status</Label>
          <Select value={status} onValueChange={(v: any) => setStatus(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Semua</SelectItem><SelectItem value="BELUM">Belum</SelectItem><SelectItem value="SUDAH">Sudah</SelectItem></SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>Dari</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Sampai</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <div className="flex items-end"><div className="text-sm w-full"><div className="text-muted-foreground">Total</div><div className="font-display font-bold text-lg">{formatRupiah(totalFiltered)}</div></div></div>
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        <Button variant="outline" onClick={exportPDF}><FileDown className="h-4 w-4 mr-1.5" /> Export PDF</Button>
        <Button variant="outline" onClick={exportJPG}><ImgIcon className="h-4 w-4 mr-1.5" /> Export JPG</Button>
        <Button className="bg-success text-success-foreground hover:bg-success/90" onClick={openWa}><MessageCircle className="h-4 w-4 mr-1.5" /> Kirim WhatsApp</Button>
        <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground"><Sparkles className="h-3.5 w-3.5" /> Klik ikon di tabel untuk edit / hapus</div>
      </div>

      <div id="invoice-table-export" className="bg-card border rounded-xl shadow-card mt-4 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left">
              <tr>
                <th className="p-3">Bayar</th><th className="p-3">Tanggal</th><th className="p-3">Supplier</th>
                <th className="p-3">Barang</th><th className="p-3 text-right">Qty</th><th className="p-3 text-right">Harga</th>
                <th className="p-3 text-right">Total</th><th className="p-3">Status</th><th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Memuat…</td></tr>
               : filtered.length === 0 ? <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Tidak ada nota</td></tr>
               : filtered.map((i) => (
                <tr key={i.id} className="border-t hover:bg-muted/40 transition-colors">
                  <td className="p-3"><Checkbox checked={i.status === "SUDAH"} onCheckedChange={(v) => togglePaid(i, !!v)} /></td>
                  <td className="p-3 whitespace-nowrap">{formatDate(i.invoice_date)}</td>
                  <td className="p-3">{i.supplier}</td>
                  <td className="p-3">{i.item_name}</td>
                  <td className="p-3 text-right">{i.qty}</td>
                  <td className="p-3 text-right">{formatRupiah(Number(i.price))}</td>
                  <td className="p-3 text-right font-semibold">{formatRupiah(Number(i.total))}</td>
                  <td className="p-3"><span className={`text-xs px-2 py-0.5 rounded-full ${i.status === "SUDAH" ? "bg-success text-success-foreground" : "bg-warning text-warning-foreground"}`}>{i.status}</span></td>
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="icon" variant="ghost" title="Detail" onClick={() => openDetail(i)}><Eye className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" title="Edit tanggal" onClick={() => { setEditing(i); setEditDate(i.invoice_date); }}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" title="Hapus" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setDeleting(i)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Detail Nota</DialogTitle></DialogHeader>
          {detail && (
            <div className="space-y-3 text-sm">
              <Row k="Tanggal" v={formatDate(detail.invoice_date)} />
              <Row k="Supplier" v={detail.supplier} />
              <Row k="Barang" v={detail.item_name} />
              <Row k="Qty × Harga" v={`${detail.qty} × ${formatRupiah(Number(detail.price))}`} />
              <Row k="Total" v={<span className="font-bold">{formatRupiah(Number(detail.total))}</span>} />
              <Row k="Status" v={detail.status} />
              {detail.paid_at && <Row k="Dibayar pada" v={new Date(detail.paid_at).toLocaleString("id-ID")} />}
              {photoUrl ? (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-muted-foreground">Foto Nota</div>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="outline" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}><ZoomOut className="h-4 w-4" /></Button>
                      <span className="text-xs w-10 text-center">{Math.round(zoom * 100)}%</span>
                      <Button size="icon" variant="outline" onClick={() => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))}><ZoomIn className="h-4 w-4" /></Button>
                      <Button size="icon" variant="outline" onClick={() => setRotate((r) => (r + 90) % 360)}><RotateCw className="h-4 w-4" /></Button>
                    </div>
                  </div>
                  <div className="w-full h-[60vh] overflow-auto rounded-lg border bg-muted/30 grid place-items-start touch-pan-x touch-pan-y">
                    <img
                      src={photoUrl}
                      alt="Foto nota"
                      style={{ transform: `scale(${zoom}) rotate(${rotate}deg)`, transformOrigin: "top left" }}
                      className="max-w-none transition-transform select-none"
                      draggable={false}
                    />
                  </div>
                  <div className="flex gap-2 mt-2">
                    <a href={photoUrl} target="_blank" rel="noreferrer"><Button size="sm" variant="outline">Buka</Button></a>
                    <Button size="sm" className="bg-success text-success-foreground" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`Nota ${detail.supplier} - ${formatRupiah(Number(detail.total))}\n${photoUrl}`)}`, "_blank")}>
                      <MessageCircle className="h-4 w-4 mr-1" /> Kirim WA
                    </Button>
                  </div>
                </div>
              ) : detail.photo_path ? <p className="text-muted-foreground">Memuat foto…</p> : <p className="text-muted-foreground">Tidak ada foto.</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5" /> Edit Tanggal Nota</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">{editing.supplier} • {editing.item_name}</div>
              <div className="space-y-1.5">
                <Label>Tanggal nota</Label>
                <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setEditing(null)}>Batal</Button>
                <Button onClick={saveEditDate}>Simpan</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><Trash2 className="h-5 w-5 text-destructive" /> Hapus nota?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && <>Nota <b>{deleting.supplier}</b> — {deleting.item_name} ({formatRupiah(Number(deleting.total))}) akan dihapus permanen{deleting.photo_path ? " beserta foto notanya" : ""}.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmDelete}>Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={waOpen} onOpenChange={setWaOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><MessageCircle className="h-5 w-5 text-success" /> Kirim Laporan via WhatsApp</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nomor tujuan (opsional)</Label>
              <Input placeholder="cth: 628123456789" value={waPhone} onChange={(e) => setWaPhone(e.target.value)} />
              <div className="text-xs text-muted-foreground">Kosongkan untuk memilih kontak saat dialihkan ke WhatsApp.</div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5"><Settings2 className="h-3.5 w-3.5" /> Isi pesan (bisa diedit)</Label>
                <Button size="sm" variant="ghost" onClick={() => { setWaTemplate(DEFAULT_WA_TEMPLATE); setWaText(buildText(filtered)); }}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset template
                </Button>
              </div>
              <Textarea rows={12} value={waText} onChange={(e) => setWaText(e.target.value)} className="font-mono text-xs" />
              <div className="text-xs text-muted-foreground">
                Variabel template: <code>{"{cabang} {periode} {tanggal} {jumlah} {total} {sudah} {belum} {rincian}"}</code>
              </div>
            </div>
            <details className="text-xs">
              <summary className="cursor-pointer text-primary font-medium">Edit template default (tersimpan otomatis)</summary>
              <Textarea rows={8} value={waTemplate} onChange={(e) => setWaTemplate(e.target.value)} className="font-mono mt-2" />
              <Button size="sm" variant="outline" className="mt-2" onClick={() => setWaText(buildText(filtered))}>Terapkan ke pesan</Button>
            </details>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setWaOpen(false)}>Batal</Button>
              <Button className="bg-success text-success-foreground hover:bg-success/90" onClick={sendWhatsApp}>
                <MessageCircle className="h-4 w-4 mr-1.5" /> Kirim
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex justify-between gap-4"><span className="text-muted-foreground">{k}</span><span className="text-right">{v}</span></div>;
}

function StatCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: "primary" | "success" | "warning" }) {
  const toneCls = tone === "success" ? "bg-success/10 text-success" : tone === "warning" ? "bg-warning/15 text-warning-foreground" : "bg-primary/10 text-primary";
  return (
    <div className="bg-card border rounded-xl shadow-card p-3 flex items-center gap-3">
      <div className={`h-10 w-10 grid place-items-center rounded-lg ${toneCls}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground truncate">{label}</div>
        <div className="font-display font-bold text-base truncate">{value}</div>
      </div>
    </div>
  );
}