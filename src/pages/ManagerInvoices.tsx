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
{rincian}

*Rekening Supplier (Belum Dibayar):*
{rekening}`;

// Format per kelompok supplier di dalam {rincian}
// Variabel: {supplier} {jumlah} {subtotal} {items}
const DEFAULT_GROUP_TEMPLATE = `*{supplier}* — {jumlah} nota • {subtotal}
{items}`;

// Format per item di dalam {items}
// Variabel: {no} {tanggal} {item} {qty} {harga} {total} {status}
const DEFAULT_ITEM_TEMPLATE = `{no}. {tanggal} — {item} ({qty} × {harga}) = *{total}* [{status}]`;

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
  const [supplierBank, setSupplierBank] = useState<Record<string, { bank_name: string | null; bank_account: string | null; account_holder: string | null }>>({});
  const [status, setStatus] = useState<"all" | "BELUM" | "SUDAH">("all");
  const [from, setFrom] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1).toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth() + 1, 0).toISOString().slice(0, 10);
  });
  const [detail, setDetail] = useState<Inv | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotate, setRotate] = useState(0);
  const [editing, setEditing] = useState<Inv | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editSupplier, setEditSupplier] = useState("");
  const [editItem, setEditItem] = useState("");
  const [editQty, setEditQty] = useState<string>("0");
  const [editPrice, setEditPrice] = useState<string>("0");
  const [editStatus, setEditStatus] = useState<"BELUM" | "SUDAH">("BELUM");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleting, setDeleting] = useState<Inv | null>(null);
  const [waOpen, setWaOpen] = useState(false);
  const [waPhone, setWaPhone] = useState<string>(() => localStorage.getItem("wa_phone") ?? "");
  const [waTemplate, setWaTemplate] = useState<string>(() => localStorage.getItem("wa_template") ?? DEFAULT_WA_TEMPLATE);
  const [waGroupTpl, setWaGroupTpl] = useState<string>(() => localStorage.getItem("wa_group_tpl") ?? DEFAULT_GROUP_TEMPLATE);
  const [waItemTpl, setWaItemTpl] = useState<string>(() => localStorage.getItem("wa_item_tpl") ?? DEFAULT_ITEM_TEMPLATE);
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
    supabase.from("suppliers").select("name, bank_name, bank_account, account_holder")
      .eq("branch_id", activeBranch.id).order("name")
      .then(({ data }) => {
        const list = (data ?? []) as any[];
        setSupplierOptions(list.map((s) => s.name));
        const map: Record<string, any> = {};
        list.forEach((s) => { map[s.name] = { bank_name: s.bank_name, bank_account: s.bank_account, account_holder: s.account_holder }; });
        setSupplierBank(map);
      });
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

  const openEdit = (inv: Inv) => {
    setEditing(inv);
    setEditDate(inv.invoice_date);
    setEditSupplier(inv.supplier);
    setEditItem(inv.item_name);
    setEditQty(String(inv.qty));
    setEditPrice(String(inv.price));
    setEditStatus(inv.status);
  };
  const saveEdit = async () => {
    if (!editing) return;
    const qty = Number(editQty);
    const price = Number(editPrice);
    if (!editDate || !editSupplier.trim() || !editItem.trim() || !isFinite(qty) || !isFinite(price) || qty <= 0 || price < 0) {
      return toast.error("Isi semua field dengan benar");
    }
    setSavingEdit(true);
    const total = qty * price;
    const wasPaid = editing.status === "SUDAH";
    const nowPaid = editStatus === "SUDAH";
    const payload: any = {
      invoice_date: editDate,
      supplier: editSupplier.trim(),
      item_name: editItem.trim(),
      qty, price, total,
      status: editStatus,
    };
    if (!wasPaid && nowPaid) { payload.paid_at = new Date().toISOString(); payload.paid_by = user!.id; }
    if (wasPaid && !nowPaid) { payload.paid_at = null; payload.paid_by = null; }
    const { error } = await supabase.from("invoices").update(payload).eq("id", editing.id);
    setSavingEdit(false);
    if (error) return toast.error(error.message);
    toast.success("Nota diperbarui");
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
    // Kelompokkan per supplier — satu judul per supplier
    const groups = new Map<string, Inv[]>();
    rows.forEach((r) => {
      const arr = groups.get(r.supplier) ?? [];
      arr.push(r);
      groups.set(r.supplier, arr);
    });
    const renderItem = (i: Inv, idx: number) =>
      waItemTpl
        .split("{no}").join(String(idx + 1))
        .split("{tanggal}").join(formatDate(i.invoice_date))
        .split("{item}").join(i.item_name)
        .split("{qty}").join(String(i.qty))
        .split("{harga}").join(formatRupiah(Number(i.price)))
        .split("{total}").join(formatRupiah(Number(i.total)))
        .split("{status}").join(i.status);
    const lines = Array.from(groups.entries()).map(([supplierName, items]) => {
      const subtotal = items.reduce((s, x) => s + Number(x.total), 0);
      const itemsText = items.map((i, idx) => renderItem(i, idx)).join("\n");
      return waGroupTpl
        .split("{supplier}").join(supplierName)
        .split("{jumlah}").join(String(items.length))
        .split("{subtotal}").join(formatRupiah(subtotal))
        .split("{items}").join(itemsText);
    }).join("\n\n");
    const total = rows.reduce((s, i) => s + Number(i.total), 0);
    const paid = rows.filter((r) => r.status === "SUDAH").reduce((s, i) => s + Number(i.total), 0);
    const unpaid = total - paid;
    const unpaidSuppliers = Array.from(new Set(rows.filter((r) => r.status === "BELUM").map((r) => r.supplier)));
    const rekening = unpaidSuppliers.length === 0
      ? "(semua sudah dibayar)"
      : unpaidSuppliers.map((name) => {
          const b = supplierBank[name];
          if (!b || (!b.bank_name && !b.bank_account)) return `• ${name}: (belum ada rekening)`;
          return `• ${name}\n   ${b.bank_name ?? "-"} ${b.bank_account ?? "-"}${b.account_holder ? ` a.n. ${b.account_holder}` : ""}`;
        }).join("\n");
    return waTemplate
      .split("{cabang}").join(activeBranch?.name ?? "-")
      .split("{periode}").join(from || to ? `${from || "-"} s/d ${to || "-"}` : "Semua periode")
      .split("{jumlah}").join(String(rows.length))
      .split("{total}").join(formatRupiah(total))
      .split("{sudah}").join(formatRupiah(paid))
      .split("{belum}").join(formatRupiah(unpaid))
      .split("{tanggal}").join(new Date().toLocaleDateString("id-ID"))
      .split("{rincian}").join(lines || "(tidak ada nota)")
      .split("{rekening}").join(rekening);
  };

  const openWa = () => {
    setWaText(buildText(filtered));
    setWaOpen(true);
  };
  const sendWhatsApp = () => {
    localStorage.setItem("wa_phone", waPhone);
    localStorage.setItem("wa_template", waTemplate);
    localStorage.setItem("wa_group_tpl", waGroupTpl);
    localStorage.setItem("wa_item_tpl", waItemTpl);
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
                      <Button size="icon" variant="ghost" title="Edit nota" onClick={() => openEdit(i)}><Pencil className="h-4 w-4" /></Button>
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Pencil className="h-5 w-5" /> Edit Nota</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5 col-span-2">
                  <Label>Tanggal</Label>
                  <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label>Supplier</Label>
                  {supplierOptions.length > 0 ? (
                    <Select value={supplierOptions.includes(editSupplier) ? editSupplier : "__custom"} onValueChange={(v) => v !== "__custom" && setEditSupplier(v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {supplierOptions.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                        <SelectItem value="__custom">— ketik manual —</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : null}
                  <Input value={editSupplier} onChange={(e) => setEditSupplier(e.target.value)} placeholder="Nama supplier" />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label>Nama barang</Label>
                  <Input value={editItem} onChange={(e) => setEditItem(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Qty</Label>
                  <Input type="number" inputMode="decimal" value={editQty} onChange={(e) => setEditQty(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Harga satuan</Label>
                  <Input type="number" inputMode="decimal" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label>Status</Label>
                  <Select value={editStatus} onValueChange={(v: any) => setEditStatus(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BELUM">BELUM</SelectItem>
                      <SelectItem value="SUDAH">SUDAH</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 flex justify-between items-center bg-muted/40 rounded-md px-3 py-2">
                  <span className="text-muted-foreground text-sm">Total</span>
                  <span className="font-display font-bold">{formatRupiah((Number(editQty) || 0) * (Number(editPrice) || 0))}</span>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setEditing(null)}>Batal</Button>
                <Button onClick={saveEdit} disabled={savingEdit}>{savingEdit ? "Menyimpan…" : "Simpan"}</Button>
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
                <Button size="sm" variant="ghost" onClick={() => {
                  setWaTemplate(DEFAULT_WA_TEMPLATE);
                  setWaGroupTpl(DEFAULT_GROUP_TEMPLATE);
                  setWaItemTpl(DEFAULT_ITEM_TEMPLATE);
                  setTimeout(() => setWaText(buildText(filtered)), 0);
                }}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset template
                </Button>
              </div>
              <Textarea rows={12} value={waText} onChange={(e) => setWaText(e.target.value)} className="font-mono text-xs" />
              <div className="text-xs text-muted-foreground">
                Variabel template: <code>{"{cabang} {periode} {tanggal} {jumlah} {total} {sudah} {belum} {rincian} {rekening}"}</code>
              </div>
            </div>
            <details className="text-xs rounded-lg border bg-muted/30 p-3" open>
              <summary className="cursor-pointer text-primary font-medium">Atur format rincian (per supplier & per item)</summary>
              <div className="mt-3 space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Format kelompok supplier</Label>
                  <Textarea rows={3} value={waGroupTpl} onChange={(e) => setWaGroupTpl(e.target.value)} className="font-mono text-xs" />
                  <div className="text-[11px] text-muted-foreground">
                    Variabel: <code>{"{supplier} {jumlah} {subtotal} {items}"}</code>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Format setiap item</Label>
                  <Textarea rows={2} value={waItemTpl} onChange={(e) => setWaItemTpl(e.target.value)} className="font-mono text-xs" />
                  <div className="text-[11px] text-muted-foreground">
                    Variabel: <code>{"{no} {tanggal} {item} {qty} {harga} {total} {status}"}</code>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Template utama</Label>
                  <Textarea rows={6} value={waTemplate} onChange={(e) => setWaTemplate(e.target.value)} className="font-mono text-xs" />
                </div>
                <Button size="sm" variant="outline" onClick={() => setWaText(buildText(filtered))}>Terapkan ke pesan</Button>
              </div>
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