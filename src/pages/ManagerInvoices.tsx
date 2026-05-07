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
import { Search, FileDown, Image as ImgIcon, MessageCircle, Eye } from "lucide-react";
import jsPDF from "jspdf";

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

  const togglePaid = async (inv: Inv, paid: boolean) => {
    const update = paid
      ? { status: "SUDAH" as const, paid_at: new Date().toISOString(), paid_by: user!.id }
      : { status: "BELUM" as const, paid_at: null, paid_by: null };
    const { error } = await supabase.from("invoices").update(update).eq("id", inv.id);
    if (error) return toast.error(error.message);
    toast.success(paid ? "Ditandai TERBAYAR" : "Ditandai BELUM");
    load();
  };

  const openDetail = async (inv: Inv) => {
    setDetail(inv); setPhotoUrl(null);
    if (inv.photo_path) {
      const { data } = await supabase.storage.from("nota-photos").createSignedUrl(inv.photo_path, 3600);
      setPhotoUrl(data?.signedUrl ?? null);
    }
  };

  const buildText = (rows: Inv[]) => {
    const head = `*Laporan Nota — ${activeBranch?.name}*\n${from || to ? `Periode: ${from || "-"} s/d ${to || "-"}\n` : ""}\n`;
    const lines = rows.map((i, idx) =>
      `${idx + 1}. ${formatDate(i.invoice_date)} • ${i.supplier}\n   ${i.item_name} (${i.qty} × ${formatRupiah(i.price)}) = *${formatRupiah(i.total)}* — ${i.status}`
    ).join("\n");
    const total = `\n\n*Total: ${formatRupiah(rows.reduce((s, i) => s + Number(i.total), 0))}*`;
    return head + lines + total;
  };

  const sendWhatsApp = () => {
    const text = buildText(filtered);
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
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
      <div className="bg-card border rounded-xl shadow-card p-4 grid md:grid-cols-6 gap-3">
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
        <Button variant="outline" onClick={exportPDF}><FileDown className="h-4 w-4 mr-1" /> Export PDF</Button>
        <Button variant="outline" onClick={exportJPG}><ImgIcon className="h-4 w-4 mr-1" /> Export JPG</Button>
        <Button className="bg-success text-success-foreground hover:bg-success/90" onClick={sendWhatsApp}><MessageCircle className="h-4 w-4 mr-1" /> Kirim WhatsApp</Button>
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
                <tr key={i.id} className="border-t">
                  <td className="p-3"><Checkbox checked={i.status === "SUDAH"} onCheckedChange={(v) => togglePaid(i, !!v)} /></td>
                  <td className="p-3 whitespace-nowrap">{formatDate(i.invoice_date)}</td>
                  <td className="p-3">{i.supplier}</td>
                  <td className="p-3">{i.item_name}</td>
                  <td className="p-3 text-right">{i.qty}</td>
                  <td className="p-3 text-right">{formatRupiah(Number(i.price))}</td>
                  <td className="p-3 text-right font-semibold">{formatRupiah(Number(i.total))}</td>
                  <td className="p-3"><span className={`text-xs px-2 py-0.5 rounded-full ${i.status === "SUDAH" ? "bg-success text-success-foreground" : "bg-warning text-warning-foreground"}`}>{i.status}</span></td>
                  <td className="p-3"><Button size="icon" variant="ghost" onClick={() => openDetail(i)}><Eye className="h-4 w-4" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="max-w-lg">
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
                  <div className="text-muted-foreground mb-2">Foto Nota</div>
                  <img src={photoUrl} alt="Foto nota" className="w-full rounded-lg border" />
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
    </AppShell>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex justify-between gap-4"><span className="text-muted-foreground">{k}</span><span className="text-right">{v}</span></div>;
}