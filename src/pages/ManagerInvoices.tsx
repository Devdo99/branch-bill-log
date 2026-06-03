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
import { Search, FileDown, Image as ImgIcon, MessageCircle, Eye, ZoomIn, ZoomOut, RotateCw, Pencil, Trash2, Filter, Receipt, Wallet, CheckCircle2, Clock, Settings2, RotateCcw, Archive, ListChecks, Send } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import jsPDF from "jspdf";
import JSZip from "jszip";

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

// Template ringkasan (per supplier: tanggal — nominal — rekening, lalu subtotal)
const DEFAULT_SUM_MAIN = `*Ringkasan Tagihan — {cabang}*
Periode: {periode}

{ringkasan}

Total: *{total}*`;

const DEFAULT_SUM_SUPPLIER = `*{supplier}*
{lines}
Subtotal: *{subtotal}*`;

const DEFAULT_SUM_LINE = `• {tanggal} — {nominal} — {rekening}`;

// Template gabungan: ringkasan + rincian dalam satu pesan
const DEFAULT_COMBO_TEMPLATE = `*Laporan Nota — {cabang}*
Periode: {periode}

— RINGKASAN —
{ringkasan}

— RINCIAN —
{rincian}

— TOTAL PER SUPPLIER —
{total_per_supplier}

Total: *{total}*`;

// Baris total per supplier untuk laporan general (variabel: {supplier} {jumlah} {subtotal})
const DEFAULT_TOTALS_LINE = `• {supplier}: *{subtotal}* ({jumlah} nota)`;

// === Template terpisah untuk pesan ke MASING-MASING SUPPLIER ===
// Variabel utama: {cabang} {supplier} {tanggal} {periode} {jumlah} {subtotal} {rekening} {lines}
const DEFAULT_SUP_MAIN = `Halo *{supplier}*,
Berikut rincian tagihan dari *{cabang}* (periode {periode}):

{lines}

Total: *{subtotal}*
Transfer ke: {rekening}

Mohon konfirmasi pembayarannya. Terima kasih 🙏`;

// Baris per nota di pesan supplier (variabel: {no} {tanggal} {item} {qty} {harga} {nominal} {status})
const DEFAULT_SUP_LINE = `{no}. {tanggal} — {item} — *{nominal}*`;

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
  const [supplierBank, setSupplierBank] = useState<Record<string, { bank_name: string | null; bank_account: string | null; account_holder: string | null; phone: string | null }>>({});
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
  const [waMode, setWaMode] = useState<"rincian" | "ringkasan" | "gabungan">(() => (localStorage.getItem("wa_mode") as any) ?? "rincian");
  const [waUseSelected, setWaUseSelected] = useState(false);
  const [waTemplate, setWaTemplate] = useState<string>(() => localStorage.getItem("wa_template") ?? DEFAULT_WA_TEMPLATE);
  const [waGroupTpl, setWaGroupTpl] = useState<string>(() => localStorage.getItem("wa_group_tpl") ?? DEFAULT_GROUP_TEMPLATE);
  const [waItemTpl, setWaItemTpl] = useState<string>(() => localStorage.getItem("wa_item_tpl") ?? DEFAULT_ITEM_TEMPLATE);
  const [waSumMain, setWaSumMain] = useState<string>(() => localStorage.getItem("wa_sum_main") ?? DEFAULT_SUM_MAIN);
  const [waSumSup, setWaSumSup] = useState<string>(() => localStorage.getItem("wa_sum_sup") ?? DEFAULT_SUM_SUPPLIER);
  const [waSumLine, setWaSumLine] = useState<string>(() => localStorage.getItem("wa_sum_line") ?? DEFAULT_SUM_LINE);
  const [waComboTpl, setWaComboTpl] = useState<string>(() => localStorage.getItem("wa_combo") ?? DEFAULT_COMBO_TEMPLATE);
  const [waTotalsLine, setWaTotalsLine] = useState<string>(() => localStorage.getItem("wa_totals_line") ?? DEFAULT_TOTALS_LINE);
  const [waSupMain, setWaSupMain] = useState<string>(() => localStorage.getItem("wa_sup_main") ?? DEFAULT_SUP_MAIN);
  const [waSupLine, setWaSupLine] = useState<string>(() => localStorage.getItem("wa_sup_line") ?? DEFAULT_SUP_LINE);
  const [waText, setWaText] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);

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
    supabase.from("suppliers").select("name, bank_name, bank_account, account_holder, phone")
      .eq("branch_id", activeBranch.id).order("name")
      .then(({ data }) => {
        const list = (data ?? []) as any[];
        setSupplierOptions(list.map((s) => s.name));
        const map: Record<string, any> = {};
        list.forEach((s) => { map[s.name] = { bank_name: s.bank_name, bank_account: s.bank_account, account_holder: s.account_holder, phone: s.phone }; });
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

  const allFilteredSelected = filtered.length > 0 && filtered.every((i) => selected.has(i.id));
  const toggleSelect = (id: string) => {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleSelectAll = () => {
    setSelected((prev) => {
      if (filtered.every((i) => prev.has(i.id))) {
        const n = new Set(prev); filtered.forEach((i) => n.delete(i.id)); return n;
      }
      const n = new Set(prev); filtered.forEach((i) => n.add(i.id)); return n;
    });
  };

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

  const buildRincian = (rows: Inv[]) => {
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
    return Array.from(groups.entries()).map(([supplierName, items]) => {
      const subtotal = items.reduce((s, x) => s + Number(x.total), 0);
      const itemsText = items.map((i, idx) => renderItem(i, idx)).join("\n");
      return waGroupTpl
        .split("{supplier}").join(supplierName)
        .split("{jumlah}").join(String(items.length))
        .split("{subtotal}").join(formatRupiah(subtotal))
        .split("{items}").join(itemsText);
    }).join("\n\n");
  };

  const buildRingkasan = (rows: Inv[]) => {
    const groups = new Map<string, Inv[]>();
    rows.forEach((r) => {
      const arr = groups.get(r.supplier) ?? [];
      arr.push(r); groups.set(r.supplier, arr);
    });
    const formatRek = (name: string) => {
      const b = supplierBank[name];
      if (!b || (!b.bank_name && !b.bank_account)) return "(belum ada rekening)";
      return `${b.bank_name ?? "-"} ${b.bank_account ?? "-"}${b.account_holder ? ` a.n. ${b.account_holder}` : ""}`;
    };
    return Array.from(groups.entries()).map(([supplierName, items]) => {
      const lines = items.map((i) => waSumLine
        .split("{tanggal}").join(formatDate(i.invoice_date))
        .split("{nominal}").join(formatRupiah(Number(i.total)))
        .split("{rekening}").join(formatRek(supplierName))
        .split("{status}").join(i.status)
      ).join("\n");
      const subtotal = items.reduce((s, x) => s + Number(x.total), 0);
      return waSumSup
        .split("{supplier}").join(supplierName)
        .split("{lines}").join(lines)
        .split("{subtotal}").join(formatRupiah(subtotal))
        .split("{rekening}").join(formatRek(supplierName))
        .split("{jumlah}").join(String(items.length));
    }).join("\n\n");
  };

  const buildText = (rows: Inv[]) => {
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
    const periode = from || to ? `${from || "-"} s/d ${to || "-"}` : "Semua periode";
    const today = new Date().toLocaleDateString("id-ID");
    // Total per supplier
    const totalsMap = new Map<string, { jumlah: number; subtotal: number }>();
    rows.forEach((r) => {
      const cur = totalsMap.get(r.supplier) ?? { jumlah: 0, subtotal: 0 };
      cur.jumlah += 1; cur.subtotal += Number(r.total);
      totalsMap.set(r.supplier, cur);
    });
    const totalPerSupplier = Array.from(totalsMap.entries())
      .map(([name, v]) => waTotalsLine
        .split("{supplier}").join(name)
        .split("{jumlah}").join(String(v.jumlah))
        .split("{subtotal}").join(formatRupiah(v.subtotal))
      ).join("\n") || "(tidak ada)";
    const tplVars = (s: string) => s
      .split("{cabang}").join(activeBranch?.name ?? "-")
      .split("{periode}").join(periode)
      .split("{jumlah}").join(String(rows.length))
      .split("{total}").join(formatRupiah(total))
      .split("{sudah}").join(formatRupiah(paid))
      .split("{belum}").join(formatRupiah(unpaid))
      .split("{tanggal}").join(today)
      .split("{rekening}").join(rekening)
      .split("{total_per_supplier}").join(totalPerSupplier);
    const rincian = buildRincian(rows) || "(tidak ada nota)";
    const ringkasan = buildRingkasan(rows) || "(tidak ada nota)";
    if (waMode === "ringkasan") {
      return tplVars(waSumMain).split("{ringkasan}").join(ringkasan);
    }
    if (waMode === "gabungan") {
      return tplVars(waComboTpl)
        .split("{ringkasan}").join(ringkasan)
        .split("{rincian}").join(rincian);
    }
    return tplVars(waTemplate).split("{rincian}").join(rincian);
  };

  const openWa = () => {
    const rows = waUseSelected && selected.size > 0 ? filtered.filter((i) => selected.has(i.id)) : filtered;
    setWaText(buildText(rows));
    setWaOpen(true);
  };
  const sendWhatsApp = () => {
    localStorage.setItem("wa_phone", waPhone);
    localStorage.setItem("wa_mode", waMode);
    localStorage.setItem("wa_template", waTemplate);
    localStorage.setItem("wa_group_tpl", waGroupTpl);
    localStorage.setItem("wa_item_tpl", waItemTpl);
    localStorage.setItem("wa_sum_main", waSumMain);
    localStorage.setItem("wa_sum_sup", waSumSup);
    localStorage.setItem("wa_sum_line", waSumLine);
    localStorage.setItem("wa_combo", waComboTpl);
    localStorage.setItem("wa_totals_line", waTotalsLine);
    localStorage.setItem("wa_sup_main", waSupMain);
    localStorage.setItem("wa_sup_line", waSupLine);
    const phone = waPhone.replace(/\D/g, "");
    const url = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(waText)}`
      : `https://wa.me/?text=${encodeURIComponent(waText)}`;
    window.open(url, "_blank");
    setWaOpen(false);
  };

  const sanitize = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 80);

  const buildSupplierMessage = (supplierName: string, items: Inv[]) => {
    const b = supplierBank[supplierName];
    const rek = !b || (!b.bank_name && !b.bank_account)
      ? "(belum ada rekening)"
      : `${b.bank_name ?? "-"} ${b.bank_account ?? "-"}${b.account_holder ? ` a.n. ${b.account_holder}` : ""}`;
    const lines = items.map((i, idx) => waSupLine
      .split("{no}").join(String(idx + 1))
      .split("{tanggal}").join(formatDate(i.invoice_date))
      .split("{item}").join(i.item_name)
      .split("{qty}").join(String(i.qty))
      .split("{harga}").join(formatRupiah(Number(i.price)))
      .split("{nominal}").join(formatRupiah(Number(i.total)))
      .split("{status}").join(i.status)
    ).join("\n");
    const subtotal = items.reduce((s, x) => s + Number(x.total), 0);
    const periode = from || to ? `${from || "-"} s/d ${to || "-"}` : "Semua periode";
    return waSupMain
      .split("{cabang}").join(activeBranch?.name ?? "-")
      .split("{supplier}").join(supplierName)
      .split("{periode}").join(periode)
      .split("{jumlah}").join(String(items.length))
      .split("{subtotal}").join(formatRupiah(subtotal))
      .split("{rekening}").join(rek)
      .split("{lines}").join(lines)
      .split("{tanggal}").join(new Date().toLocaleDateString("id-ID"));
  };

  const sendPerSupplier = () => {
    const rows = (waUseSelected && selected.size > 0 ? filtered.filter((i) => selected.has(i.id)) : filtered);
    if (rows.length === 0) return toast.error("Tidak ada nota");
    const groups = new Map<string, Inv[]>();
    rows.forEach((r) => { const a = groups.get(r.supplier) ?? []; a.push(r); groups.set(r.supplier, a); });
    const targets: { name: string; phone: string; items: Inv[] }[] = [];
    const missing: string[] = [];
    groups.forEach((items, name) => {
      const p = (supplierBank[name]?.phone ?? "").replace(/\D/g, "");
      if (!p) missing.push(name); else targets.push({ name, phone: p, items });
    });
    if (targets.length === 0) {
      return toast.error(`Tidak ada nomor HP supplier${missing.length ? ` (${missing.join(", ")})` : ""}`);
    }
    if (missing.length) toast.warning(`Dilewati (tanpa no. HP): ${missing.join(", ")}`);
    targets.forEach((t, idx) => {
      const text = buildSupplierMessage(t.name, t.items);
      const url = `https://wa.me/${t.phone}?text=${encodeURIComponent(text)}`;
      // sedikit jeda agar browser tidak blokir tab popup beruntun
      setTimeout(() => window.open(url, "_blank"), idx * 350);
    });
    toast.success(`Membuka ${targets.length} chat WhatsApp`);
    setWaOpen(false);
  };

  const downloadSelectedPhotos = async () => {
    const rows = (selected.size > 0 ? filtered.filter((i) => selected.has(i.id)) : filtered).filter((i) => i.photo_path);
    if (rows.length === 0) return toast.error("Tidak ada foto pada nota terpilih");
    setDownloading(true);
    try {
      const zip = new JSZip();
      let ok = 0;
      for (const inv of rows) {
        const { data } = await supabase.storage.from("nota-photos").createSignedUrl(inv.photo_path!, 3600);
        if (!data?.signedUrl) continue;
        const res = await fetch(data.signedUrl);
        if (!res.ok) continue;
        const blob = await res.blob();
        const ext = (inv.photo_path!.split(".").pop() || "jpg").split("?")[0];
        const folder = sanitize(inv.supplier || "lainnya");
        const fname = `${inv.invoice_date}_${sanitize(inv.item_name)}_${inv.id.slice(0, 6)}.${ext}`;
        zip.folder(folder)!.file(fname, blob);
        ok++;
      }
      if (ok === 0) { toast.error("Gagal mengunduh foto"); return; }
      const out = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(out);
      a.download = `foto-nota-${activeBranch?.name ?? "cabang"}-${Date.now()}.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success(`${ok} foto diunduh dalam ZIP`);
    } catch (e: any) {
      toast.error(e?.message ?? "Gagal membuat ZIP");
    } finally {
      setDownloading(false);
    }
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
        <Button variant="outline" onClick={downloadSelectedPhotos} disabled={downloading}>
          <Archive className="h-4 w-4 mr-1.5" /> {downloading ? "Mengemas…" : `Unduh Foto ZIP${selected.size > 0 ? ` (${selected.size})` : ""}`}
        </Button>
        <Button className="bg-success text-success-foreground hover:bg-success/90" onClick={openWa}><MessageCircle className="h-4 w-4 mr-1.5" /> Kirim WhatsApp</Button>
        {selected.size > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())} className="ml-auto">
            Bersihkan pilihan ({selected.size})
          </Button>
        )}
      </div>

      <div id="invoice-table-export" className="bg-card border rounded-xl shadow-card mt-4 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left">
              <tr>
                <th className="p-3 w-8"><Checkbox checked={allFilteredSelected} onCheckedChange={toggleSelectAll} aria-label="Pilih semua" /></th>
                <th className="p-3">Bayar</th><th className="p-3">Tanggal</th><th className="p-3">Supplier</th>
                <th className="p-3">Barang</th><th className="p-3 text-right">Qty</th><th className="p-3 text-right">Harga</th>
                <th className="p-3 text-right">Total</th><th className="p-3">Status</th><th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={10} className="p-6 text-center text-muted-foreground">Memuat…</td></tr>
               : filtered.length === 0 ? <tr><td colSpan={10} className="p-6 text-center text-muted-foreground">Tidak ada nota</td></tr>
               : filtered.map((i) => (
                <tr key={i.id} className={`border-t hover:bg-muted/40 transition-colors ${selected.has(i.id) ? "bg-primary/5" : ""}`}>
                  <td className="p-3"><Checkbox checked={selected.has(i.id)} onCheckedChange={() => toggleSelect(i.id)} aria-label="Pilih nota" /></td>
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5"><ListChecks className="h-3.5 w-3.5" /> Format pesan</Label>
                <Select value={waMode} onValueChange={(v: any) => { setWaMode(v); setTimeout(() => setWaText(buildText(waUseSelected && selected.size > 0 ? filtered.filter((i) => selected.has(i.id)) : filtered)), 0); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rincian">Rincian (per item)</SelectItem>
                    <SelectItem value="ringkasan">Ringkasan (per supplier)</SelectItem>
                    <SelectItem value="gabungan">Gabungan (Ringkasan + Rincian)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Sumber data</Label>
                <Select value={waUseSelected ? "sel" : "all"} onValueChange={(v) => { const sel = v === "sel"; setWaUseSelected(sel); setTimeout(() => setWaText(buildText(sel && selected.size > 0 ? filtered.filter((i) => selected.has(i.id)) : filtered)), 0); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua hasil filter ({filtered.length})</SelectItem>
                    <SelectItem value="sel" disabled={selected.size === 0}>Hanya terpilih ({selected.size})</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5"><Settings2 className="h-3.5 w-3.5" /> Isi pesan (bisa diedit)</Label>
                <Button size="sm" variant="ghost" onClick={() => {
                  setWaTemplate(DEFAULT_WA_TEMPLATE);
                  setWaGroupTpl(DEFAULT_GROUP_TEMPLATE);
                  setWaItemTpl(DEFAULT_ITEM_TEMPLATE);
                  setWaSumMain(DEFAULT_SUM_MAIN);
                  setWaSumSup(DEFAULT_SUM_SUPPLIER);
                  setWaSumLine(DEFAULT_SUM_LINE);
                  setWaComboTpl(DEFAULT_COMBO_TEMPLATE);
                  setTimeout(() => setWaText(buildText(waUseSelected && selected.size > 0 ? filtered.filter((i) => selected.has(i.id)) : filtered)), 0);
                }}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset template
                </Button>
              </div>
              <Textarea rows={12} value={waText} onChange={(e) => setWaText(e.target.value)} className="font-mono text-xs" />
            </div>
            <details className="text-xs rounded-lg border bg-muted/30 p-3">
              <summary className="cursor-pointer text-primary font-medium">Atur template format</summary>
              <div className="mt-3 space-y-3">
                {(waMode === "rincian" || waMode === "gabungan") && <>
                  <div className="space-y-1">
                    <Label className="text-xs">Template utama — Rincian</Label>
                    <Textarea rows={5} value={waTemplate} onChange={(e) => setWaTemplate(e.target.value)} className="font-mono text-xs" />
                    <div className="text-[11px] text-muted-foreground"><code>{"{cabang} {periode} {jumlah} {total} {sudah} {belum} {rincian} {rekening}"}</code></div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Kelompok supplier (rincian)</Label>
                    <Textarea rows={3} value={waGroupTpl} onChange={(e) => setWaGroupTpl(e.target.value)} className="font-mono text-xs" />
                    <div className="text-[11px] text-muted-foreground"><code>{"{supplier} {jumlah} {subtotal} {items}"}</code></div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Setiap item (rincian)</Label>
                    <Textarea rows={2} value={waItemTpl} onChange={(e) => setWaItemTpl(e.target.value)} className="font-mono text-xs" />
                    <div className="text-[11px] text-muted-foreground"><code>{"{no} {tanggal} {item} {qty} {harga} {total} {status}"}</code></div>
                  </div>
                </>}
                {(waMode === "ringkasan" || waMode === "gabungan") && <>
                  {waMode === "ringkasan" && <div className="space-y-1">
                    <Label className="text-xs">Template utama — Ringkasan</Label>
                    <Textarea rows={5} value={waSumMain} onChange={(e) => setWaSumMain(e.target.value)} className="font-mono text-xs" />
                    <div className="text-[11px] text-muted-foreground"><code>{"{cabang} {periode} {total} {ringkasan}"}</code></div>
                  </div>}
                  {waMode === "gabungan" && <div className="space-y-1">
                    <Label className="text-xs">Template utama — Gabungan</Label>
                    <Textarea rows={6} value={waComboTpl} onChange={(e) => setWaComboTpl(e.target.value)} className="font-mono text-xs" />
                    <div className="text-[11px] text-muted-foreground"><code>{"{cabang} {periode} {total} {ringkasan} {rincian}"}</code></div>
                  </div>}
                  <div className="space-y-1">
                    <Label className="text-xs">Blok supplier (ringkasan)</Label>
                    <Textarea rows={3} value={waSumSup} onChange={(e) => setWaSumSup(e.target.value)} className="font-mono text-xs" />
                    <div className="text-[11px] text-muted-foreground"><code>{"{supplier} {lines} {subtotal} {rekening} {jumlah}"}</code></div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Baris per tanggal (ringkasan)</Label>
                    <Textarea rows={2} value={waSumLine} onChange={(e) => setWaSumLine(e.target.value)} className="font-mono text-xs" />
                    <div className="text-[11px] text-muted-foreground"><code>{"{tanggal} {nominal} {rekening} {status}"}</code></div>
                  </div>
                </>}
                <Button size="sm" variant="outline" onClick={() => setWaText(buildText(waUseSelected && selected.size > 0 ? filtered.filter((i) => selected.has(i.id)) : filtered))}>Terapkan ke pesan</Button>
              </div>
            </details>
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setWaOpen(false)}>Batal</Button>
              <Button variant="outline" onClick={sendPerSupplier} title="Buka chat WA terpisah ke nomor HP masing-masing supplier">
                <Send className="h-4 w-4 mr-1.5" /> Kirim per Supplier
              </Button>
              <Button className="bg-success text-success-foreground hover:bg-success/90" onClick={sendWhatsApp}>
                <MessageCircle className="h-4 w-4 mr-1.5" /> Kirim (1 pesan)
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