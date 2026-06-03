import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { useBranch } from "@/contexts/BranchContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ShieldCheck, UserPlus, Trash2, Save } from "lucide-react";

type PermKey = "manage_invoices" | "mark_paid" | "manage_suppliers" | "manage_revenues" | "manage_cashiers" | "view_reports";

const PERM_LABELS: { key: PermKey; label: string; hint: string }[] = [
  { key: "view_reports", label: "Lihat Laporan", hint: "Akses dashboard & ekspor" },
  { key: "manage_invoices", label: "Kelola Nota", hint: "Edit, hapus, & atur nota" },
  { key: "mark_paid", label: "Tandai Bayar", hint: "Ubah status nota menjadi terbayar" },
  { key: "manage_suppliers", label: "Kelola Supplier", hint: "Tambah, ubah, hapus supplier" },
  { key: "manage_revenues", label: "Kelola Omset", hint: "Catat & ubah omset harian" },
  { key: "manage_cashiers", label: "Kelola Kasir", hint: "Tambah & hapus akses kasir" },
];

interface AdminRow {
  id: string;
  user_id: string;
  manage_invoices: boolean;
  mark_paid: boolean;
  manage_suppliers: boolean;
  manage_revenues: boolean;
  manage_cashiers: boolean;
  view_reports: boolean;
  full_name?: string | null;
}

export default function ManagerAdmins() {
  const { activeBranch } = useBranch();
  const { user } = useAuth();
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pendingPerms, setPendingPerms] = useState<Record<string, Partial<Record<PermKey, boolean>>>>({});
  const [deleting, setDeleting] = useState<AdminRow | null>(null);

  const load = async () => {
    if (!activeBranch) return;
    setLoading(true);
    const { data, error } = await (supabase.from("admin_permissions" as any) as any)
      .select("*")
      .eq("branch_id", activeBranch.id)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    const list = (data ?? []) as AdminRow[];
    const ids = list.map((r) => r.user_id);
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      const map = new Map((profs ?? []).map((p: any) => [p.id, p.full_name]));
      list.forEach((r) => { r.full_name = map.get(r.user_id) ?? "(tanpa nama)"; });
    }
    setRows(list);
    setPendingPerms({});
    setLoading(false);
  };
  useEffect(() => { load(); }, [activeBranch?.id]);

  const createAdmin = async () => {
    if (!activeBranch) return;
    if (fullName.trim().length < 2) return toast.error("Nama minimal 2 karakter");
    if (!/^\S+@\S+\.\S+$/.test(email)) return toast.error("Email tidak valid");
    if (password.length < 8) return toast.error("Password minimal 8 karakter");
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-admin", {
        body: { full_name: fullName.trim(), email: email.trim(), password, branch_id: activeBranch.id },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`Admin ${fullName} dibuat`);
      setFullName(""); setEmail(""); setPassword("");
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Gagal membuat admin");
    } finally { setCreating(false); }
  };

  const togglePerm = (row: AdminRow, key: PermKey, val: boolean) => {
    setPendingPerms((prev) => ({ ...prev, [row.id]: { ...prev[row.id], [key]: val } }));
  };

  const savePerms = async (row: AdminRow) => {
    const pending = pendingPerms[row.id];
    if (!pending) return;
    const { error } = await (supabase.from("admin_permissions" as any) as any)
      .update(pending).eq("id", row.id);
    if (error) return toast.error(error.message);
    toast.success("Izin disimpan");
    setPendingPerms((prev) => { const n = { ...prev }; delete n[row.id]; return n; });
    load();
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const { error } = await (supabase.from("admin_permissions" as any) as any).delete().eq("id", deleting.id);
    if (error) return toast.error(error.message);
    toast.success("Akses admin dicabut");
    setDeleting(null);
    load();
  };

  const getPerm = (row: AdminRow, k: PermKey): boolean => {
    const p = pendingPerms[row.id]?.[k];
    return p ?? (row as any)[k];
  };
  const hasPending = (id: string) => !!pendingPerms[id] && Object.keys(pendingPerms[id]).length > 0;

  return (
    <AppShell title={`Admin — ${activeBranch?.name ?? ""}`}>
      <div className="grid lg:grid-cols-[1fr,360px] gap-5">
        <div className="space-y-4">
          {loading ? (
            <div className="brutal-card p-6 text-muted-foreground">Memuat…</div>
          ) : rows.length === 0 ? (
            <div className="brutal-card p-8 text-center">
              <ShieldCheck className="h-10 w-10 mx-auto mb-2 opacity-60" />
              <div className="font-semibold">Belum ada admin di cabang ini</div>
              <div className="text-sm text-muted-foreground">Buat admin baru di panel kanan.</div>
            </div>
          ) : rows.map((r) => (
            <div key={r.id} className="brutal-card p-4">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div>
                  <div className="font-display font-bold">{r.full_name}</div>
                  <div className="text-xs text-muted-foreground font-mono">{r.user_id.slice(0, 8)}…</div>
                </div>
                <div className="flex items-center gap-2">
                  {hasPending(r.id) && (
                    <Button size="sm" onClick={() => savePerms(r)}>
                      <Save className="h-4 w-4 mr-1" /> Simpan
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="border-2 border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={() => setDeleting(r)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-2">
                {PERM_LABELS.map((p) => (
                  <label key={p.key} className="flex items-start justify-between gap-3 p-3 rounded-md border-2 border-foreground bg-accent/40 cursor-pointer">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm">{p.label}</div>
                      <div className="text-xs text-muted-foreground">{p.hint}</div>
                    </div>
                    <Switch checked={getPerm(r, p.key)} onCheckedChange={(v) => togglePerm(r, p.key, v)} />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="brutal-card p-5 h-fit lg:sticky lg:top-24">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-9 w-9 grid place-items-center rounded-md bg-primary border-2 border-foreground text-primary-foreground">
              <UserPlus className="h-4 w-4" />
            </div>
            <div className="font-display font-bold">Buat Admin Baru</div>
          </div>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Nama lengkap</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nama admin" /></div>
            <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@email.com" /></div>
            <div className="space-y-1.5"><Label>Password</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 8 karakter" /></div>
            <Button disabled={creating} onClick={createAdmin} className="w-full">
              {creating ? "Membuat…" : "Tambah Admin"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Admin baru bisa login & otomatis terhubung ke cabang <b>{activeBranch?.name}</b>. Izin default hanya <b>Lihat Laporan</b> — atur lainnya pada kartu admin.
            </p>
          </div>
        </div>
      </div>

      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cabut akses admin?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && <>Admin <b>{deleting.full_name}</b> akan kehilangan akses ke cabang ini. Akun login-nya tetap ada.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={confirmDelete}>Cabut Akses</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}