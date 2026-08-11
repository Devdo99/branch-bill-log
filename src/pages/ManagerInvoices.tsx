import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { Search, FileDown, FileSpreadsheet, Image as ImgIcon, MessageCircle, Eye, ZoomIn, ZoomOut, RotateCw, Pencil, Trash2, Receipt, Wallet, CheckCircle2, Clock, Settings2, RotateCcw, Archive, ListChecks, RefreshCw, Users, Send, Loader2, AlertCircle, AlertTriangle, Calendar as CalendarIcon, ChevronDown, Plus, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import jsPDF from "jspdf";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import type { DateRange } from "react-day-picker";

// Format tanggal lokal (hindari shift timezone UTC pada .toISOString())
const toISODate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const parseDate = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y || 2000, (m || 1) - 1, d || 1);
};

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

// Template ringkas: hanya total pembayaran (tanpa rincian per item/supplier)
// Variabel: {cabang} {periode} {tanggal} {jumlah} {total} {sudah} {belum}
const DEFAULT_TOTAL_TEMPLATE = `*Rekap Pembayaran — {cabang}*
Periode: {periode}
Tanggal kirim: {tanggal}

Jumlah nota: {jumlah}
Total tagihan: *{total}*
Sudah dibayar: {sudah}
Belum dibayar: {belum}`;

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
  const activeBranchId = activeBranch?.id;
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
    return toISODate(new Date(n.getFullYear(), n.getMonth(), 1));
  });
  const [to, setTo] = useState(() => {
    const n = new Date();
    return toISODate(new Date(n.getFullYear(), n.getMonth() + 1, 0));
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
  const [waMode, setWaMode] = useState<"rincian" | "total" | "ringkasan" | "gabungan">(() => (localStorage.getItem("wa_mode") as any) ?? "rincian");
  const [waUseSelected, setWaUseSelected] = useState(false);
  const [waUseMedia, setWaUseMedia] = useState<boolean>(() => localStorage.getItem("wa_use_media") === "true");
  const [waGroupMode, setWaGroupMode] = useState<boolean>(() => localStorage.getItem("wa_group_mode") === "true");
  const [waGroups, setWaGroups] = useState<{ id: string; name: string }[]>([]);
  const [waGroupId, setWaGroupId] = useState<string>(() => localStorage.getItem("wa_group_id") ?? "");
  const [waLaptopImages, setWaLaptopImages] = useState<{ name: string; dataUrl: string }[]>([]);
  const [waTemplate, setWaTemplate] = useState<string>(() => localStorage.getItem("wa_template") ?? DEFAULT_WA_TEMPLATE);
  const [waTotTpl, setWaTotTpl] = useState<string>(() => localStorage.getItem("wa_total_tpl") ?? DEFAULT_TOTAL_TEMPLATE);
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

  // Bulk payment state
  const [bulkPayOpen, setBulkPayOpen] = useState(false);
  const [bulkPayDate, setBulkPayDate] = useState("");
  const [bulkPayTotal, setBulkPayTotal] = useState(0);
  const [confirmingBulkPay, setConfirmingBulkPay] = useState(false);

  // Rentang tanggal via kalender (mode range)
  const selectedRange: DateRange | undefined = useMemo(() => {
    if (!from && !to) return undefined;
    return { from: from ? parseDate(from) : undefined, to: to ? parseDate(to) : undefined };
  }, [from, to]);

  const handleRangeSelect = (range: DateRange | undefined) => {
    if (!range?.from) {
      setFrom("");
      setTo("");
      return;
    }
    setFrom(toISODate(range.from));
    setTo(range.to ? toISODate(range.to) : toISODate(range.from));
  };

  const load = useCallback(async () => {
    if (!activeBranchId) return;
    setLoading(true);
    const { data, error } = await supabase.from("invoices").select("*")
      .eq("branch_id", activeBranchId).order("invoice_date", { ascending: false });
    if (error) toast.error(error.message);
    setInvs((data ?? []) as Inv[]);
    setLoading(false);
  }, [activeBranchId]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!activeBranchId) return;
    supabase.from("suppliers").select("name, bank_name, bank_account, account_holder, phone")
      .eq("branch_id", activeBranchId).order("name")
      .then(({ data }) => {
        const list = (data ?? []) as any[];
        setSupplierOptions(list.map((s) => s.name));
        const map: Record<string, any> = {};
        list.forEach((s) => { map[s.name] = { bank_name: s.bank_name, bank_account: s.bank_account, account_holder: s.account_holder, phone: s.phone }; });
        setSupplierBank(map);
      });
  }, [activeBranchId]);

  // Nota yang lolos filter non-status (dipakai untuk hitungan chip status cepat)
  const baseFiltered = useMemo(() => invs.filter((i) => {
    if (supplier && !i.supplier.toLowerCase().includes(supplier.toLowerCase())) return false;
    if (supplierFilter !== "all" && i.supplier !== supplierFilter) return false;
    if (itemQuery && !i.item_name.toLowerCase().includes(itemQuery.toLowerCase())) return false;
    if (from && i.invoice_date < from) return false;
    if (to && i.invoice_date > to) return false;
    return true;
  }), [invs, supplier, supplierFilter, itemQuery, from, to]);

  const filtered = useMemo(() => baseFiltered.filter((i) => status === "all" || i.status === status), [baseFiltered, status]);

  // Hitungan per status untuk chip filter cepat
  const statusCounts = useMemo(() => ({
    all: baseFiltered.length,
    BELUM: baseFiltered.filter((i) => i.status === "BELUM").length,
    SUDAH: baseFiltered.filter((i) => i.status === "SUDAH").length,
  }), [baseFiltered]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((i) => selected.has(i.id));
  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
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
  const paidPct = totalFiltered > 0 ? Math.round((paidTotal / totalFiltered) * 100) : 0;

  // Peringatan: nota belum bayar & lewat jatuh tempo (mengikuti filter non-status, agar selalu tampil walau tab status sedang "Lunas")
  const todayIso = toISODate(new Date());
  const unpaidRows = baseFiltered.filter((i) => i.status === "BELUM");
  const unpaidRowsTotal = unpaidRows.reduce((s, i) => s + Number(i.total), 0);
  const overdueRows = unpaidRows.filter((i) => i.invoice_date < todayIso);
  const overdueTotal = overdueRows.reduce((s, i) => s + Number(i.total), 0);
  const selectedTotal = filtered.filter((i) => selected.has(i.id)).reduce((s, i) => s + Number(i.total), 0);

  // Sumber data untuk pesan WA (semua hasil filter / hanya terpilih) + jumlah foto yang bisa dilampirkan
  const waSourceRows = waUseSelected && selected.size > 0 ? filtered.filter((i) => selected.has(i.id)) : filtered;
  const waPhotoCount = waSourceRows.filter((i) => i.photo_path).length;

  const togglePaid = async (inv: Inv, paid: boolean) => {
    const update = paid
      ? { status: "SUDAH" as const, paid_at: new Date().toISOString(), paid_by: user!.id }
      : { status: "BELUM" as const, paid_at: null, paid_by: null };
    const { error } = await supabase.from("invoices").update(update).eq("id", inv.id);
    if (error) return toast.error(error.message);
    toast.success(paid ? "Ditandai TERBAYAR" : "Ditandai BELUM");
    load();
  };

  const confirmBulkPayment = async () => {
    if (!bulkPayDate) {
      return toast.error("Pilih tanggal pembayaran");
    }
    setConfirmingBulkPay(true);
    try {
      const update = {
        status: "SUDAH" as const,
        paid_at: new Date(bulkPayDate).toISOString(),
        paid_by: user!.id
      };
      
      const ids = Array.from(selected);
      const { error } = await supabase
        .from("invoices")
        .update(update)
        .in("id", ids);

      if (error) throw error;
      
      toast.success(`${selected.size} nota berhasil divalidasi terbayar!`);
      setSelected(new Set());
      setBulkPayOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.message || "Gagal memproses pembayaran");
    } finally {
      setConfirmingBulkPay(false);
    }
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
    if (waMode === "total") {
      return tplVars(waTotTpl);
    }
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

  const loadGroups = async () => {
    try {
      const res = await fetch("http://localhost:5000/api/groups").catch(() => null);
      if (!res || !res.ok) {
        setWaGroups([]);
        return;
      }
      const data = await res.json();
      const list: { id: string; name: string }[] = data.groups ?? [];
      setWaGroups(list);
      // Pertahankan pilihan jika grup masih ada; jika daftar kosong/grup tak ada lagi, kosongkan agar user memilih ulang
      if (list.length === 0 || (waGroupId && !list.some((g) => g.id === waGroupId))) setWaGroupId("");
    } catch (e) {
      console.warn("Gagal memuat daftar grup:", e);
      setWaGroups([]);
    }
  };

  // Pilih beberapa gambar dari laptop -> diubah menjadi data URI base64 (dikap 30)
  const handleAddLaptopImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const allFiles = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (allFiles.length === 0) return;
    const files = allFiles.filter((f) => f.type.startsWith("image/"));
    if (files.length < allFiles.length) {
      toast.info(`${allFiles.length - files.length} file dilewati (bukan gambar)`);
    }
    if (files.length === 0) return;
    const readers = files.map(
      (f) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error("Gagal membaca gambar"));
          reader.readAsDataURL(f);
        })
    );
    // Pakai allSettled: file yang gagal dibaca dilewati, sisanya tetap dipakai
    Promise.allSettled(readers).then((results) => {
      const ok: { name: string; dataUrl: string }[] = [];
      results.forEach((r, i) => {
        if (r.status === "fulfilled") ok.push({ name: files[i].name, dataUrl: r.value });
      });
      if (ok.length === 0) {
        toast.error("Tidak ada gambar yang bisa dibaca");
        return;
      }
      setWaLaptopImages((prev) => [...prev, ...ok].slice(0, 30));
    });
  };

  const openWa = () => {
    const rows = waUseSelected && selected.size > 0 ? filtered.filter((i) => selected.has(i.id)) : filtered;
    setWaText(buildText(rows));
    setWaOpen(true);
    // Preload daftar grup bila gateway aktif
    loadGroups();
  };

  const sendWhatsApp = async () => {
    localStorage.setItem("wa_phone", waPhone);
    localStorage.setItem("wa_mode", waMode);
    localStorage.setItem("wa_template", waTemplate);
    localStorage.setItem("wa_total_tpl", waTotTpl);
    localStorage.setItem("wa_group_tpl", waGroupTpl);
    localStorage.setItem("wa_item_tpl", waItemTpl);
    localStorage.setItem("wa_sum_main", waSumMain);
    localStorage.setItem("wa_sum_sup", waSumSup);
    localStorage.setItem("wa_sum_line", waSumLine);
    localStorage.setItem("wa_combo", waComboTpl);
    localStorage.setItem("wa_totals_line", waTotalsLine);
    localStorage.setItem("wa_sup_main", waSupMain);
    localStorage.setItem("wa_sup_line", waSupLine);
    localStorage.setItem("wa_use_media", String(waUseMedia));
    localStorage.setItem("wa_group_mode", String(waGroupMode));
    if (waGroupId) localStorage.setItem("wa_group_id", waGroupId);

    const phone = waPhone.replace(/\D/g, "");
    if (waGroupMode && !waGroupId) return toast.error("Pilih grup WhatsApp tujuan");

    // Kumpulkan foto nota (signed URL dari storage) bila diminta
    const media: string[] = [];
    if (waUseMedia) {
      const withPhoto = waSourceRows.filter((i) => i.photo_path);
      for (const inv of withPhoto) {
        try {
          const { data } = await supabase.storage.from("nota-photos").createSignedUrl(inv.photo_path!, 3600);
          if (data?.signedUrl) media.push(data.signedUrl);
        } catch (e) {
          console.warn("Gagal membuat signed URL foto:", e);
        }
      }
    }
    // Tambahkan gambar yang dipilih manual dari laptop (data URI base64)
    waLaptopImages.forEach((img) => media.push(img.dataUrl));

    const needsGateway = waGroupMode || media.length > 0;

    let isGatewayConnected = false;
    try {
      const statusRes = await fetch("http://localhost:5000/api/status").catch(() => null);
      if (statusRes && statusRes.ok) {
        const statusData = await statusRes.json();
        isGatewayConnected = statusData.status === "connected";
      }
    } catch (err) {
      console.warn("WhatsApp Gateway check failed:", err);
    }

    if (!isGatewayConnected) {
      if (needsGateway) {
        return toast.error(
          waGroupMode
            ? "Kirim ke grup memerlukan WhatsApp Gateway aktif."
            : "Mengirim foto nota memerlukan WhatsApp Gateway aktif."
        );
      }
      // Fallback wa.me hanya untuk teks biasa ke nomor HP
      const fallbackUrl = phone
        ? `https://wa.me/${phone}?text=${encodeURIComponent(waText)}`
        : `https://wa.me/?text=${encodeURIComponent(waText)}`;
      toast.info("Mengalihkan ke WhatsApp Web (Gateway offline)...");
      window.open(fallbackUrl, "_blank");
      setWaOpen(false);
      return;
    }

    const loadingToast = toast.loading(
      waGroupMode
        ? "Mengirim ke grup WhatsApp..."
        : media.length > 0
          ? `Mengirim pesan + ${media.length} foto...`
          : "Mengirim pesan WhatsApp..."
    );
    try {
      const payload: any = { message: waText, media };
      if (waGroupMode) payload.jid = waGroupId;
      else payload.phone = phone;

      const sendRes = await fetch("http://localhost:5000/api/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const sendData = await sendRes.json().catch(() => ({}));
      toast.dismiss(loadingToast);
      if (sendRes.ok && sendData.success) {
        toast.success(
          waGroupMode
            ? "Pesan terkirim ke grup WhatsApp!"
            : media.length > 0
              ? `Pesan + ${media.length} foto terkirim!`
              : "Pesan terkirim via WhatsApp Gateway!"
        );
        setWaOpen(false);
        return;
      }
      if (needsGateway) {
        toast.error("Gagal mengirim: " + (sendData.error || "Terjadi kesalahan"));
        return;
      }
      // Fallback wa.me jika gateway gagal mengirim teks biasa
      const fallbackUrl = phone
        ? `https://wa.me/${phone}?text=${encodeURIComponent(waText)}`
        : `https://wa.me/?text=${encodeURIComponent(waText)}`;
      toast.info("Mengalihkan ke WhatsApp Web (Gateway offline)...");
      window.open(fallbackUrl, "_blank");
      setWaOpen(false);
    } catch (err: any) {
      toast.dismiss(loadingToast);
      toast.error("Gagal mengirim: " + (err?.message || err));
    }
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

  const sendPerSupplier = async () => {
    localStorage.setItem("wa_sup_main", waSupMain);
    localStorage.setItem("wa_sup_line", waSupLine);
    localStorage.setItem("wa_sum_line", waSumLine);
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

    let isGatewayConnected = false;
    try {
      const statusRes = await fetch("http://localhost:5000/api/status").catch(() => null);
      if (statusRes && statusRes.ok) {
        const statusData = await statusRes.json();
        isGatewayConnected = statusData.status === "connected";
      }
    } catch (e) {
      console.warn("WhatsApp Gateway check failed:", e);
    }

    if (isGatewayConnected) {
      const loadingToast = toast.loading(`Mengirim laporan ke ${targets.length} supplier via Gateway...`);
      let successCount = 0;
      for (const t of targets) {
        try {
          const text = buildSupplierMessage(t.name, t.items);
          const sendRes = await fetch("http://localhost:5000/api/send-message", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phone: t.phone, message: text })
          });
          if (sendRes.ok) {
            successCount++;
          }
        } catch (e) {
          console.error(`Gagal mengirim ke ${t.name}:`, e);
        }
      }
      toast.dismiss(loadingToast);
      toast.success(`Berhasil mengirim ${successCount} dari ${targets.length} laporan via WhatsApp Gateway!`);
    } else {
      targets.forEach((t, idx) => {
        const text = buildSupplierMessage(t.name, t.items);
        const url = `https://wa.me/${t.phone}?text=${encodeURIComponent(text)}`;
        setTimeout(() => window.open(url, "_blank"), idx * 350);
      });
      toast.info(`Membuka ${targets.length} chat WhatsApp Web (Gateway offline)...`);
    }
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

  // Export ke Excel: Sheet 1 = Detail Nota, Sheet 2 = Ringkasan per Supplier (mengikuti filter aktif)
  const exportExcel = () => {
    if (filtered.length === 0) return toast.error("Tidak ada data untuk diekspor");
    try {
      // Sheet 1: Detail nota (1 baris per nota)
      const detailRows = filtered.map((i, idx) => ({
        No: idx + 1,
        Tanggal: formatDate(i.invoice_date),
        Supplier: i.supplier,
        Barang: i.item_name,
        Qty: i.qty,
        "Harga Satuan": i.price,
        "Total Tagihan": i.total,
        Status: i.status === "SUDAH" ? "LUNAS" : "BELUM DIBAYAR",
        "Tanggal Bayar": i.paid_at ? formatDate(i.paid_at) : "-",
      }));

      // Sheet 2: Ringkasan per supplier (dengan total dibayar / belum dibayar & rekening)
      const groups = new Map<string, Inv[]>();
      filtered.forEach((r) => {
        const arr = groups.get(r.supplier) ?? [];
        arr.push(r);
        groups.set(r.supplier, arr);
      });
      const summaryRows: any[] = Array.from(groups.entries()).map(([name, items], idx) => {
        const subtotal = items.reduce((s, x) => s + Number(x.total), 0);
        const paid = items.filter((x) => x.status === "SUDAH").reduce((s, x) => s + Number(x.total), 0);
        const b = supplierBank[name];
        return {
          No: idx + 1,
          Supplier: name,
          "Jumlah Nota": items.length,
          "Total Dibayar": paid,
          "Total Belum Dibayar": subtotal - paid,
          "Total Keseluruhan": subtotal,
          "Bank Supplier": b?.bank_name || "-",
          "No Rekening": b?.bank_account || "-",
          "Atas Nama Rekening": b?.account_holder || "-",
        };
      });
      summaryRows.push({
        No: "",
        Supplier: "GRAND TOTAL",
        "Jumlah Nota": filtered.length,
        "Total Dibayar": paidTotal,
        "Total Belum Dibayar": unpaidTotal,
        "Total Keseluruhan": totalFiltered,
        "Bank Supplier": "",
        "No Rekening": "",
        "Atas Nama Rekening": "",
      });

      const workbook = XLSX.utils.book_new();

      const detailSheet = XLSX.utils.json_to_sheet(detailRows);
      detailSheet["!cols"] = Object.keys(detailRows[0] || {}).map((key) => {
        const lengths = detailRows.map((row) => String((row as any)[key] || "").length);
        return { wch: Math.max(key.length, ...lengths) + 3 };
      });
      XLSX.utils.book_append_sheet(workbook, detailSheet, "Detail Nota");

      const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
      summarySheet["!cols"] = Object.keys(summaryRows[0] || {}).map((key) => {
        const lengths = summaryRows.map((row) => String((row as any)[key] || "").length);
        return { wch: Math.max(key.length, ...lengths) + 3 };
      });
      XLSX.utils.book_append_sheet(workbook, summarySheet, "Ringkasan Supplier");

      const fileName = `Daftar_Nota_${sanitize(activeBranch?.name || "Cabang")}_${from || "semua"}_s.d._${to || "semua"}.xlsx`;
      XLSX.writeFile(workbook, fileName);
      toast.success(`Berhasil mengunduh ${filtered.length} nota ke Excel`);
    } catch (e: any) {
      console.error(e);
      toast.error("Gagal mengunduh Excel: " + (e.message || e));
    }
  };

  return (
    <AppShell title={`Nota — ${activeBranch?.name}`}>
      {/* Peringatan nota belum dibayar / lewat jatuh tempo */}
      {unpaidRows.length > 0 && (
        <div className={`mb-4 rounded-lg border border-border border-l-4 bg-card px-4 py-3 shadow-sm ${overdueRows.length > 0 ? "border-l-destructive" : "border-l-amber-500"}`}>
          <div className="flex flex-wrap items-center gap-3">
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white ${overdueRows.length > 0 ? "bg-red-600" : "bg-amber-500"}`}>
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm font-semibold text-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-warning" /> {unpaidRows.length} nota belum dibayar
                </span>
                <span className="text-muted-foreground">•</span>
                <span className="tabular-nums text-warning-foreground">{formatRupiah(unpaidRowsTotal)}</span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {overdueRows.length > 0 ? (
                  <span className="font-medium text-destructive">
                    ⚠ {overdueRows.length} di antaranya lewat jatuh tempo ({formatRupiah(overdueTotal)}) — segera tandai pembayaran agar tidak menumpuk.
                  </span>
                ) : (
                  <span>Nota dalam rentang filter ini. Pastikan ditandai lunas setelah dibayar.</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="h-8 rounded-md border-warning/40 bg-card hover:bg-warning/10" onClick={() => setStatus("BELUM")}>
                Tampilkan yang belum bayar
              </Button>
              {overdueRows.length > 0 && (
                <Button
                  size="sm"
                  className="h-8 rounded-md bg-red-600 text-white hover:bg-red-700"
                  onClick={() => {
                    setStatus("BELUM");
                    document.getElementById("invoice-table-export")?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  Cek segera
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Statistik ringkas */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={<Receipt className="h-5 w-5" />} label="Jumlah Nota" value={String(filtered.length)} tone="primary" />
        <StatCard icon={<Wallet className="h-5 w-5" />} label="Total Tagihan" value={formatRupiah(totalFiltered)} tone="primary" />
        <StatCard icon={<CheckCircle2 className="h-5 w-5" />} label="Sudah Dibayar" value={formatRupiah(paidTotal)} tone="success" />
        <StatCard icon={<Clock className="h-5 w-5" />} label="Belum Dibayar" value={formatRupiah(unpaidTotal)} tone="warning" />
      </div>

      {/* Panel filter & pencarian (ringkas) */}
      <div className="mb-4 rounded-lg border border-border bg-card p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-44">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input className="h-9 rounded-md pl-8 text-sm" placeholder="Cari supplier…" aria-label="Cari supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
          </div>
          <div className="relative w-44">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input className="h-9 rounded-md pl-8 text-sm" placeholder="Cari barang…" aria-label="Cari barang" value={itemQuery} onChange={(e) => setItemQuery(e.target.value)} />
          </div>
          <Select value={supplierFilter} onValueChange={setSupplierFilter}>
            <SelectTrigger className="h-9 w-40 rounded-md text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua supplier</SelectItem>
              {supplierOptions.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex h-9 items-center gap-0.5 rounded-md bg-muted p-1 text-xs">
            {([
              { v: "all", label: "Semua", n: statusCounts.all, active: "bg-background text-foreground shadow-sm" },
              { v: "BELUM", label: "Belum", n: statusCounts.BELUM, active: "bg-amber-500 text-white shadow-sm" },
              { v: "SUDAH", label: "Lunas", n: statusCounts.SUDAH, active: "bg-emerald-600 text-white shadow-sm" },
            ] as const).map((c) => (
              <button
                key={c.v}
                type="button"
                onClick={() => setStatus(c.v)}
                className={`cursor-pointer rounded px-2.5 py-1 font-semibold transition-all ${
                  status === c.v ? c.active : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {c.label} <span className="font-normal opacity-70">({c.n})</span>
              </button>
            ))}
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-md text-xs">
                <CalendarIcon className="h-4 w-4 text-primary" />
                {from && to ? `${formatDate(from)} – ${formatDate(to)}` : "Semua Tanggal"}
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                selected={selectedRange}
                onSelect={handleRangeSelect}
                numberOfMonths={2}
                defaultMonth={from ? parseDate(from) : new Date()}
              />
              <div className="flex items-center justify-between gap-2 border-t border-border/70 p-2">
                <span className="text-[10px] text-muted-foreground px-1">
                  {from && to ? `${formatDate(from)} s.d. ${formatDate(to)}` : "Belum ada rentang"}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[10px] text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setFrom("");
                    setTo("");
                  }}
                >
                  Hapus
                </Button>
              </div>
            </PopoverContent>
          </Popover>
          <div className="ml-auto flex items-baseline gap-2 rounded-md bg-muted/50 px-3 py-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total</span>
            <span className="text-sm font-bold tabular-nums text-foreground">{formatRupiah(totalFiltered)}</span>
          </div>
        </div>
        {totalFiltered > 0 && (
          <div className="mt-3 flex items-center gap-3 border-t border-border/50 pt-3">
            <span className="whitespace-nowrap text-xs font-semibold text-foreground">Progres pembayaran</span>
            <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${paidPct}%` }}
              />
            </div>
            <span className="whitespace-nowrap text-xs text-muted-foreground">
              <b className="text-emerald-600">{paidPct}%</b> lunas · sisa <b className="text-amber-600">{formatRupiah(unpaidTotal)}</b>
            </span>
          </div>
        )}
      </div>

      {/* Toolbar aksi */}
      <div className="flex flex-wrap gap-2 mb-4">
        <Button variant="outline" className="h-9 rounded-lg border-border bg-card shadow-sm hover:bg-accent" onClick={exportPDF}><FileDown className="h-4 w-4 mr-1.5 text-primary" /> Export PDF</Button>
        <Button variant="outline" className="h-9 rounded-lg border-border bg-card shadow-sm hover:bg-accent" onClick={exportJPG}><ImgIcon className="h-4 w-4 mr-1.5 text-primary" /> Export JPG</Button>
        <Button variant="outline" className="h-9 rounded-lg border-border bg-card shadow-sm hover:bg-accent" onClick={exportExcel} title="Unduh data terfilter ke Excel"><FileSpreadsheet className="h-4 w-4 mr-1.5 text-emerald-600" /> Export Excel</Button>
        <Button variant="outline" className="h-9 rounded-lg border-border bg-card shadow-sm hover:bg-accent" onClick={downloadSelectedPhotos} disabled={downloading}>
          <Archive className="h-4 w-4 mr-1.5 text-primary" /> {downloading ? "Mengemas…" : `Unduh Foto ZIP${selected.size > 0 ? ` (${selected.size})` : ""}`}
        </Button>
        <Button className="h-9 rounded-lg bg-gradient-to-br from-[#22c55e] to-[#16a34a] text-white shadow-[0_2px_12px_hsl(151_62%_40%/0.4)] hover:from-[#16a34a] hover:to-[#15803d]" onClick={openWa}><MessageCircle className="h-4 w-4 mr-1.5" /> Kirim WhatsApp</Button>
        {selected.size > 0 && (
          <span className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-3 text-xs font-semibold text-primary">
            <Receipt className="h-3.5 w-3.5" /> {selected.size} nota · {formatRupiah(selectedTotal)}
          </span>
        )}
        {selected.size > 0 && (
          <Button 
            className="h-9 rounded-lg bg-gradient-to-br from-[hsl(208_100%_35%)] to-[hsl(199_95%_50%)] text-white shadow-[0_2px_12px_hsl(208_100%_45%/0.4)] hover:from-[hsl(208_100%_30%)] hover:to-[hsl(199_95%_45%)]" 
            onClick={() => {
              const rows = filtered.filter((i) => selected.has(i.id));
              const totalAmount = rows.reduce((s, x) => s + Number(x.total), 0);
              setBulkPayTotal(totalAmount);
              setBulkPayDate(new Date().toISOString().split("T")[0]);
              setBulkPayOpen(true);
            }}
          >
            <CheckCircle2 className="h-4 w-4 mr-1.5" /> Validasi Pembayaran ({selected.size})
          </Button>
        )}
        {selected.size > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())} className="ml-auto h-9 text-muted-foreground hover:text-foreground">
            Bersihkan pilihan ({selected.size})
          </Button>
        )}
      </div>

      {/* Tabel daftar nota */}
      <div id="invoice-table-export" className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Receipt className="h-4 w-4 text-primary" /> Daftar Nota
          </div>
          <span className="text-xs text-muted-foreground">
            {selected.size > 0 ? <span className="font-semibold text-primary">{selected.size} terpilih</span> : `${filtered.length} nota`}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-muted/40 text-left">
              <tr className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2.5 w-8"><Checkbox checked={allFilteredSelected} onCheckedChange={toggleSelectAll} aria-label="Pilih semua" /></th>
                <th className="px-3 py-2.5">Bayar</th><th className="px-3 py-2.5">Tanggal</th><th className="px-3 py-2.5">Supplier</th>
                <th className="px-3 py-2.5">Barang</th><th className="px-3 py-2.5 text-right">Qty</th><th className="px-3 py-2.5 text-right">Harga</th>
                <th className="px-3 py-2.5 text-right">Total</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5">Tgl Bayar</th><th className="px-3 py-2.5 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={11} className="p-8">
                    <div className="flex flex-col items-center gap-2 py-4 text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      <p className="text-sm">Memuat nota…</p>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-8">
                    <div className="flex flex-col items-center gap-2 py-4 text-muted-foreground">
                      <AlertCircle className="h-7 w-7 text-muted-foreground/50" />
                      <p className="text-sm font-medium text-foreground">Tidak ada nota</p>
                      <p className="text-xs">Coba ubah filter atau rentang tanggal.</p>
                    </div>
                  </td>
                </tr>
              ) : filtered.map((i) => (
                <tr key={i.id} className={`border-t border-border/50 transition-colors hover:bg-muted/30 ${selected.has(i.id) ? "bg-primary/5" : ""}`}>
                  <td className="px-3 py-2.5"><Checkbox checked={selected.has(i.id)} onCheckedChange={() => toggleSelect(i.id)} aria-label="Pilih nota" /></td>
                  <td className="px-3 py-2.5"><Checkbox checked={i.status === "SUDAH"} onCheckedChange={(v) => togglePaid(i, !!v)} title="Tandai lunas / belum bayar" /></td>
                  <td className="px-3 py-2.5 whitespace-nowrap font-medium">{formatDate(i.invoice_date)}</td>
                  <td className="px-3 py-2.5 font-semibold text-foreground/90">{i.supplier}</td>
                  <td className="px-3 py-2.5 text-foreground/80">{i.item_name}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{i.qty}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{formatRupiah(Number(i.price))}</td>
                  <td className="px-3 py-2.5 text-right font-bold tabular-nums">{formatRupiah(Number(i.total))}</td>
                  <td className="px-3 py-2.5">
                    <span className={`status-pill inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${i.status === "SUDAH" ? "bg-emerald-50 text-emerald-700 border-emerald-200/50" : "bg-amber-50 text-amber-800 border-amber-200/50"}`}>
                      {i.status === "SUDAH" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                      {i.status === "SUDAH" ? "Lunas" : "Belum"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-xs text-muted-foreground">
                    {i.paid_at ? formatDate(i.paid_at) : "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="icon" variant="ghost" title="Detail" className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary" onClick={() => openDetail(i)}><Eye className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" title="Edit nota" className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary" onClick={() => openEdit(i)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" title="Hapus" className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={() => setDeleting(i)}><Trash2 className="h-4 w-4" /></Button>
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
              <Row k="Total" v={<span className="font-semibold">{formatRupiah(Number(detail.total))}</span>} />
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
                  <span className="font-semibold">{formatRupiah((Number(editQty) || 0) * (Number(editPrice) || 0))}</span>
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
              <Label>Tujuan kirim</Label>
              <div className="flex h-9 w-fit items-center gap-0.5 rounded-md bg-muted p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setWaGroupMode(false)}
                  className={`cursor-pointer rounded px-3 py-1.5 font-semibold transition-all ${!waGroupMode ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Nomor HP
                </button>
                <button
                  type="button"
                  onClick={() => { setWaGroupMode(true); loadGroups(); }}
                  className={`cursor-pointer rounded px-3 py-1.5 font-semibold transition-all ${waGroupMode ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <Users className="h-3.5 w-3.5 inline-block" /> Grup WhatsApp
                </button>
              </div>
              {waGroupMode ? (
                <div className="flex items-center gap-2">
                  <Select value={waGroupId} onValueChange={setWaGroupId}>
                    <SelectTrigger className="h-9 flex-1 rounded-md text-sm"><SelectValue placeholder="Pilih grup WhatsApp…" /></SelectTrigger>
                    <SelectContent>
                      {waGroups.length === 0 && <SelectItem value="__none" disabled>Belum ada grup — pastikan Gateway aktif &amp; muat ulang</SelectItem>}
                      {waGroups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="icon" className="h-9 w-9 shrink-0 rounded-md" title="Muat ulang daftar grup" onClick={loadGroups}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <>
                  <Input placeholder="cth: 628123456789" value={waPhone} onChange={(e) => setWaPhone(e.target.value)} />
                  <div className="text-xs text-muted-foreground">Kosongkan untuk memilih kontak saat dialihkan ke WhatsApp.</div>
                </>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-2 text-xs font-medium text-foreground">
                <Checkbox checked={waUseMedia} onCheckedChange={(v) => setWaUseMedia(!!v)} aria-label="Lampirkan foto nota" />
                Lampirkan foto nota <span className="font-normal text-muted-foreground">({waPhotoCount} foto)</span>
              </Label>
              <p className="text-[11px] text-muted-foreground">Foto nota dari data yang dikirim akan dilampirkan. Memerlukan Gateway aktif.</p>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2 text-xs font-medium text-foreground">
                  <ImgIcon className="h-3.5 w-3.5 text-primary" /> Gambar dari laptop ({waLaptopImages.length})
                </Label>
                {waLaptopImages.length > 0 && (
                  <Button size="sm" variant="ghost" className="h-6 text-[10px] text-muted-foreground hover:text-destructive" onClick={() => setWaLaptopImages([])}>
                    Bersihkan semua
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {waLaptopImages.map((img, idx) => (
                  <div key={idx} className="relative">
                    <img src={img.dataUrl} alt={img.name} className="h-16 w-16 rounded-md border border-border object-cover" />
                    <button
                      type="button"
                      onClick={() => setWaLaptopImages((prev) => prev.filter((_, i) => i !== idx))}
                      className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-destructive text-white shadow-sm hover:bg-destructive/90"
                      title="Hapus gambar"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {waLaptopImages.length < 30 && (
                  <label
                    className="grid h-16 w-16 cursor-pointer place-items-center rounded-md border border-dashed border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                    title="Pilih gambar dari laptop"
                  >
                    <Plus className="h-5 w-5" />
                    <input type="file" accept="image/*" multiple className="hidden" onChange={handleAddLaptopImages} />
                  </label>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">Pilih beberapa gambar dari laptop untuk dilampirkan. Memerlukan Gateway aktif.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5"><ListChecks className="h-3.5 w-3.5" /> Format pesan</Label>
                <Select value={waMode} onValueChange={(v: any) => { setWaMode(v); setTimeout(() => setWaText(buildText(waUseSelected && selected.size > 0 ? filtered.filter((i) => selected.has(i.id)) : filtered)), 0); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rincian">Rincian (per item)</SelectItem>
                    <SelectItem value="total">Total pembayaran saja</SelectItem>
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
                  setWaTotTpl(DEFAULT_TOTAL_TEMPLATE);
                  setWaGroupTpl(DEFAULT_GROUP_TEMPLATE);
                  setWaItemTpl(DEFAULT_ITEM_TEMPLATE);
                  setWaSumMain(DEFAULT_SUM_MAIN);
                  setWaSumSup(DEFAULT_SUM_SUPPLIER);
                  setWaSumLine(DEFAULT_SUM_LINE);
                  setWaComboTpl(DEFAULT_COMBO_TEMPLATE);
                  setWaTotalsLine(DEFAULT_TOTALS_LINE);
                  setWaSupMain(DEFAULT_SUP_MAIN);
                  setWaSupLine(DEFAULT_SUP_LINE);
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
                {waMode === "total" && <div className="space-y-1">
                  <Label className="text-xs">Template utama — Total Pembayaran</Label>
                  <Textarea rows={7} value={waTotTpl} onChange={(e) => setWaTotTpl(e.target.value)} className="font-mono text-xs" />
                  <div className="text-[11px] text-muted-foreground"><code>{"{cabang} {periode} {tanggal} {jumlah} {total} {sudah} {belum}"}</code></div>
                </div>}
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
                <div className="space-y-1 pt-2 border-t">
                  <Label className="text-xs">Baris total per supplier (laporan general)</Label>
                  <Textarea rows={2} value={waTotalsLine} onChange={(e) => setWaTotalsLine(e.target.value)} className="font-mono text-xs" />
                  <div className="text-[11px] text-muted-foreground">
                    Tersedia variabel <code>{"{total_per_supplier}"}</code> pada template utama (Gabungan default sudah memuatnya).<br/>
                    Variabel baris: <code>{"{supplier} {jumlah} {subtotal}"}</code>
                  </div>
                </div>
                <div className="space-y-2 pt-2 border-t">
                  <Label className="text-xs font-semibold">Template pesan ke Supplier (Kirim per Supplier)</Label>
                  <div className="space-y-1">
                    <Label className="text-xs">Template utama</Label>
                    <Textarea rows={7} value={waSupMain} onChange={(e) => setWaSupMain(e.target.value)} className="font-mono text-xs" />
                    <div className="text-[11px] text-muted-foreground"><code>{"{cabang} {supplier} {periode} {jumlah} {subtotal} {rekening} {lines} {tanggal}"}</code></div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Baris per nota</Label>
                    <Textarea rows={2} value={waSupLine} onChange={(e) => setWaSupLine(e.target.value)} className="font-mono text-xs" />
                    <div className="text-[11px] text-muted-foreground"><code>{"{no} {tanggal} {item} {qty} {harga} {nominal} {status}"}</code></div>
                  </div>
                </div>
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

      <Dialog open={bulkPayOpen} onOpenChange={setBulkPayOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" /> Validasi Pembayaran Sekaligus
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Jumlah Nota Terpilih:</span>
                <span className="font-semibold">{selected.size} nota</span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="text-muted-foreground font-semibold">Total Pembayaran:</span>
                <span className="font-bold text-emerald-600 text-base">{formatRupiah(bulkPayTotal)}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bulk_pay_date">Tanggal Nota Terbayar</Label>
              <Input
                id="bulk_pay_date"
                type="date"
                value={bulkPayDate}
                onChange={(e) => setBulkPayDate(e.target.value)}
                required
              />
              <p className="text-[11px] text-muted-foreground">
                Tentukan tanggal transaksi pembayaran ini terjadi (misal tanggal transfer bank).
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setBulkPayOpen(false)}>
                Batal
              </Button>
              <Button 
                onClick={confirmBulkPayment} 
                disabled={confirmingBulkPay}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {confirmingBulkPay ? "Memproses…" : "Konfirmasi & Tandai Lunas"}
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
  const toneCls =
    tone === "success"
      ? "border-success/25 bg-success/10 text-success"
      : tone === "warning"
        ? "border-warning/30 bg-warning/10 text-warning"
        : "border-primary/15 bg-primary/10 text-primary";
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
      <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border ${toneCls}`}>{icon}</div>
      <div className="min-w-0">
        <div className="truncate text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="truncate text-base font-bold leading-snug text-foreground">{value}</div>
      </div>
    </div>
  );
}
