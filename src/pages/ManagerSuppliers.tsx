import { useCallback, useEffect, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import { useBranch } from "@/contexts/BranchContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Trash2, Plus, Pencil, Save, X, Download, Upload, FileSpreadsheet } from "lucide-react";

interface Supplier {
  id: string; name: string; note: string | null;
  bank_name: string | null; bank_account: string | null; account_holder: string | null;
  phone: string | null;
  items: string | null;
}

const CSV_HEADERS = ["name", "phone", "note", "bank_name", "bank_account", "account_holder", "items"];
const csvEscape = (v: string) => {
  const s = v ?? "";
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const buildCsv = (rows: string[][]) => rows.map(r => r.map(csvEscape).join(",")).join("\n");
const downloadFile = (content: string, name: string) => {
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [], val = "", inQ = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { val += '"'; i++; }
      else if (c === '"') inQ = false;
      else val += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { cur.push(val); val = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        cur.push(val); rows.push(cur); cur = []; val = "";
      } else val += c;
    }
  }
  if (val.length || cur.length) { cur.push(val); rows.push(cur); }
  return rows.filter(r => r.length && r.some(x => x.trim() !== ""));
}

export default function ManagerSuppliers() {
  const { activeBranch } = useBranch();
  const { user } = useAuth();
  const activeBranchId = activeBranch?.id;
  const [list, setList] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [phone, setPhone] = useState("");
  const [itemsField, setItemsField] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editBankName, setEditBankName] = useState("");
  const [editBankAccount, setEditBankAccount] = useState("");
  const [editAccountHolder, setEditAccountHolder] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editItems, setEditItems] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    if (!activeBranchId) return;
    setLoading(true);
    const res = await supabase.from("suppliers")
      .select("id, name, note, bank_name, bank_account, account_holder, phone, items")
      .eq("branch_id", activeBranchId).order("name");
    if (res.error) toast.error(res.error.message);
    setList((res.data ?? []) as Supplier[]);
    setLoading(false);
  }, [activeBranchId]);
  useEffect(() => { load(); }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBranch || !user) return;
    const trimmed = name.trim();
    if (!trimmed) return toast.error("Nama supplier wajib diisi");
    
    const payload: any = {
      branch_id: activeBranch.id, name: trimmed, note: note.trim() || null, created_by: user.id,
      bank_name: bankName.trim() || null,
      bank_account: bankAccount.trim() || null,
      account_holder: accountHolder.trim() || null,
      phone: phone.trim() || null,
      items: itemsField.trim() || null,
    };
    
    const res = await supabase.from("suppliers").insert(payload);
    if (res.error) return toast.error(res.error.message);
    toast.success("Supplier ditambahkan");
    setName(""); setNote(""); setBankName(""); setBankAccount(""); setAccountHolder(""); setPhone(""); setItemsField(""); load();
  };

  const startEdit = (s: Supplier) => {
    setEditId(s.id); setEditName(s.name); setEditNote(s.note ?? "");
    setEditBankName(s.bank_name ?? ""); setEditBankAccount(s.bank_account ?? ""); setEditAccountHolder(s.account_holder ?? "");
    setEditPhone(s.phone ?? ""); setEditItems(s.items ?? "");
  };
  const saveEdit = async () => {
    if (!editId) return;
    const payload: any = {
      name: editName.trim(), note: editNote.trim() || null,
      bank_name: editBankName.trim() || null,
      bank_account: editBankAccount.trim() || null,
      account_holder: editAccountHolder.trim() || null,
      phone: editPhone.trim() || null,
      items: editItems.trim() || null,
    };
    
    const res = await supabase.from("suppliers").update(payload).eq("id", editId);
    if (res.error) return toast.error(res.error.message);
    toast.success("Tersimpan"); setEditId(null); load();
  };
  const remove = async (id: string) => {
    if (!confirm("Hapus supplier ini?")) return;
    const { error } = await supabase.from("suppliers").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Dihapus"); load();
  };

  const exportCsv = () => {
    const rows = [CSV_HEADERS, ...list.map(s => [s.name, s.phone ?? "", s.note ?? "", s.bank_name ?? "", s.bank_account ?? "", s.account_holder ?? "", s.items ?? ""])];
    downloadFile(buildCsv(rows), `suppliers-${activeBranch?.name ?? "branch"}-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success(`${list.length} supplier diekspor`);
  };
  const downloadTemplate = () => {
    const rows = [CSV_HEADERS,
      ["PT Sumber Pangan", "628123456789", "Pemasok sayur", "BCA", "1234567890", "Budi Santoso", "Beras, Gula, Minyak Goreng"],
      ["UD Maju Jaya", "628987654321", "", "BRI", "987654321", "Ani", "Tepung Terigu, Mentega"]];
    downloadFile(buildCsv(rows), "template-supplier.csv");
  };
  const onPickFile = () => fileRef.current?.click();
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f || !activeBranch || !user) return;
    setImporting(true);
    try {
      const text = await f.text();
      const parsed = parseCsv(text);
      if (parsed.length < 2) { toast.error("File kosong / tidak ada data"); return; }
      const header = parsed[0].map(h => h.trim().toLowerCase());
      const idx = (k: string) => header.indexOf(k);
      if (idx("name") < 0) { toast.error("Kolom 'name' wajib ada"); return; }
      const existing = new Map(list.map(s => [s.name.toLowerCase(), s]));
      let inserted = 0, updated = 0, skipped = 0;
      for (let r = 1; r < parsed.length; r++) {
        const row = parsed[r];
        const name = (row[idx("name")] ?? "").trim();
        if (!name) { skipped++; continue; }
        const payload = {
          name,
          phone: (idx("phone") >= 0 ? row[idx("phone")]?.trim() : "") || null,
          note: (idx("note") >= 0 ? row[idx("note")]?.trim() : "") || null,
          bank_name: (idx("bank_name") >= 0 ? row[idx("bank_name")]?.trim() : "") || null,
          bank_account: (idx("bank_account") >= 0 ? row[idx("bank_account")]?.trim() : "") || null,
          account_holder: (idx("account_holder") >= 0 ? row[idx("account_holder")]?.trim() : "") || null,
          items: (idx("items") >= 0 ? row[idx("items")]?.trim() : "") || null,
        };
        const ex = existing.get(name.toLowerCase());
        if (ex) {
          const res = await supabase.from("suppliers").update(payload).eq("id", ex.id);
          if (res.error) { skipped++; } else updated++;
        } else {
          const res = await supabase.from("suppliers").insert({ ...payload, branch_id: activeBranch.id, created_by: user.id });
          if (res.error) { skipped++; } else inserted++;
        }
      }
      toast.success(`Import selesai • ${inserted} baru, ${updated} diperbarui${skipped ? `, ${skipped} dilewati` : ""}`);
      load();
    } catch (err: any) {
      toast.error("Gagal mengimpor: " + (err?.message ?? "format tidak valid"));
    } finally { setImporting(false); }
  };

  return (
    <AppShell title={`Supplier — ${activeBranch?.name}`}>
      <div className="grid lg:grid-cols-3 gap-6">
        <form onSubmit={add} className="app-card p-4 space-y-3">
          <h3 className="font-semibold">Tambah Supplier</h3>
          <div className="space-y-1.5"><Label>Nama Supplier *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="PT Sumber Pangan" required /></div>
          <div className="space-y-1.5"><Label>No. HP / WhatsApp</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="cth: 628123456789" /></div>
          <div className="space-y-1.5"><Label>Barang yang Dijual (pisahkan dengan koma)</Label><Input value={itemsField} onChange={(e) => setItemsField(e.target.value)} placeholder="cth: Beras, Gula, Minyak Goreng" /></div>
          <div className="space-y-1.5"><Label>Catatan (opsional)</Label><Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Alamat, jenis jasa, dll." rows={2} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5"><Label>Bank</Label><Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="BCA / BRI / Mandiri" /></div>
            <div className="space-y-1.5"><Label>No. Rekening</Label><Input value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} placeholder="1234567890" /></div>
          </div>
          <div className="space-y-1.5"><Label>Atas Nama</Label><Input value={accountHolder} onChange={(e) => setAccountHolder(e.target.value)} placeholder="Nama pemilik rekening" /></div>
          <Button type="submit" className="w-full"><Plus className="h-4 w-4 mr-1" /> Simpan</Button>
        </form>

        <div className="lg:col-span-2 app-table">
          <div className="p-4 border-b flex flex-wrap items-center gap-2">
            <h3 className="font-semibold mr-auto">Daftar Supplier ({list.length})</h3>
            <Button size="sm" variant="outline" onClick={downloadTemplate}><FileSpreadsheet className="h-4 w-4 mr-1" />Template</Button>
            <Button size="sm" variant="outline" onClick={exportCsv} disabled={list.length === 0}><Download className="h-4 w-4 mr-1" />Export</Button>
            <Button size="sm" onClick={onPickFile} disabled={importing}><Upload className="h-4 w-4 mr-1" />{importing ? "Mengimpor…" : "Import"}</Button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
          </div>
          {loading ? <p className="p-5 text-muted-foreground">Memuat…</p>
           : list.length === 0 ? <p className="p-5 text-muted-foreground text-sm">Belum ada supplier. Tambahkan agar kasir tinggal pilih saat input nota.</p>
           : (
            <ul className="divide-y">
              {list.map((s) => (
                <li key={s.id} className="p-4 flex items-start gap-3">
                  {editId === s.id ? (
                    <div className="flex-1 space-y-2">
                      <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Nama Supplier" />
                      <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="No. HP / WhatsApp" />
                      <Input value={editItems} onChange={(e) => setEditItems(e.target.value)} placeholder="Daftar Barang (pisahkan koma)" />
                      <Textarea value={editNote} onChange={(e) => setEditNote(e.target.value)} rows={2} placeholder="Catatan" />
                      <div className="grid grid-cols-2 gap-2">
                        <Input value={editBankName} onChange={(e) => setEditBankName(e.target.value)} placeholder="Bank" />
                        <Input value={editBankAccount} onChange={(e) => setEditBankAccount(e.target.value)} placeholder="No. Rekening" />
                      </div>
                      <Input value={editAccountHolder} onChange={(e) => setEditAccountHolder(e.target.value)} placeholder="Atas Nama" />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={saveEdit}><Save className="h-4 w-4 mr-1" />Simpan</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditId(null)}><X className="h-4 w-4" /></Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-base text-foreground">{s.name}</div>
                        {s.phone && <div className="text-xs text-muted-foreground">HP: {s.phone}</div>}
                        {s.items && (
                          <div className="text-xs text-primary font-medium mt-1 bg-primary/5 px-2.5 py-1 rounded inline-block">
                            Barang dijual: {s.items}
                          </div>
                        )}
                        {s.note && <div className="text-sm text-muted-foreground whitespace-pre-wrap mt-1">{s.note}</div>}
                        {(s.bank_name || s.bank_account || s.account_holder) && (
                          <div className="mt-2 text-xs text-foreground/80 bg-muted/60 rounded px-2.5 py-1.5 block max-w-max">
                            Rekening: {s.bank_name || "-"} • <span className="font-mono">{s.bank_account || "-"}</span>
                            {s.account_holder && <> • a.n. {s.account_holder}</>}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" onClick={() => startEdit(s)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => remove(s.id)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
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
