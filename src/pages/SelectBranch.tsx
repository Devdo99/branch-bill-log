import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useBranch } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Building2, LogOut, Plus, Lock } from "lucide-react";

interface BranchRow { id: string; name: string }

export default function SelectBranch() {
  const { user, fullName, signOut, role } = useAuth();
  const { setActiveBranch } = useBranch();
  const nav = useNavigate();
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<BranchRow | null>(null);
  const [pin, setPin] = useState("");
  const [verifying, setVerifying] = useState(false);

  const load = async () => {
    if (role === "admin") {
      const { data, error } = await (supabase.from("admin_permissions" as any) as any)
        .select("branches(id, name)").eq("user_id", user!.id);
      if (error) toast.error(error.message);
      const list = ((data ?? []) as any[]).map((r) => r.branches).filter(Boolean);
      setBranches(list);
    } else {
      const { data, error } = await supabase.from("branches").select("id, name").order("created_at");
      if (error) toast.error(error.message);
      setBranches(data ?? []);
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, [role]);

  const verify = async () => {
    if (!selected) return;
    if (role === "admin") {
      setActiveBranch(selected);
      toast.success(`Masuk ke ${selected.name}`);
      nav("/manager");
      return;
    }
    if (!/^\d{4,6}$/.test(pin)) { toast.error("PIN 4-6 digit"); return; }
    setVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("verify-branch-pin", {
        body: { branch_id: selected.id, pin },
      });
      if (error) throw error;
      if (!data?.ok) { toast.error("PIN salah"); return; }
      setActiveBranch(selected);
      toast.success(`Masuk ke ${selected.name}`);
      nav("/manager");
    } catch (e: any) { toast.error(e.message ?? "Gagal verifikasi"); }
    finally { setVerifying(false); }
  };

  const handleLogout = async () => { await signOut(); nav("/auth"); };

  const openAdminBranch = (b: BranchRow) => {
    setActiveBranch(b); nav("/manager");
  };

  return (
    <div className="min-h-screen">
      <header className="bg-background border-b-2 border-foreground">
        <div className="container flex items-center justify-between h-16">
          <div className="font-display font-bold text-lg">NotaKu</div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">Halo, <b className="text-foreground">{fullName}</b></span>
            <Button size="sm" variant="outline" onClick={handleLogout} className="border-2 border-foreground">
              <LogOut className="h-4 w-4 mr-1" /> Keluar
            </Button>
          </div>
        </div>
      </header>
      <main className="container py-10 max-w-3xl">
        <h1 className="font-display text-3xl font-bold tracking-tight">Pilih Cabang</h1>
        <p className="text-muted-foreground">{role === "admin" ? "Pilih cabang yang ingin Anda kelola." : "Masukkan PIN untuk membuka dashboard cabang."}</p>

        {loading ? <p className="mt-6 text-muted-foreground">Memuat…</p> : (
          <div className="grid sm:grid-cols-2 gap-4 mt-6">
            {branches.map((b) => (
              <button key={b.id} onClick={() => role === "admin" ? openAdminBranch(b) : (setSelected(b), setPin(""))}
                className={`text-left brutal-card p-5 transition-all hover:-translate-y-0.5 hover:translate-x-0.5 ${selected?.id === b.id ? "ring-2 ring-primary" : ""}`}>
                <div className="flex items-center gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-md bg-primary text-primary-foreground border-2 border-foreground"><Building2 className="h-5 w-5" /></div>
                  <div>
                    <div className="font-display font-bold">{b.name}</div>
                    <div className="text-xs text-muted-foreground">Klik untuk membuka</div>
                  </div>
                </div>
              </button>
            ))}
            {role !== "admin" && (
              <Link to="/manager/branches" className="text-left bg-card border-2 border-dashed border-foreground rounded-md p-5 flex items-center gap-3 text-muted-foreground hover:text-foreground hover:bg-accent">
                <Plus className="h-5 w-5" /> Kelola / Tambah Cabang
              </Link>
            )}
          </div>
        )}

        {selected && role !== "admin" && (
          <div className="mt-8 brutal-card p-6 max-w-sm">
            <div className="flex items-center gap-2 font-display font-bold"><Lock className="h-4 w-4" /> PIN Cabang {selected.name}</div>
            <div className="mt-4 space-y-3">
              <div className="space-y-1.5">
                <Label>PIN</Label>
                <Input autoFocus type="password" inputMode="numeric" value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  onKeyDown={(e) => e.key === "Enter" && verify()} />
              </div>
              <Button onClick={verify} disabled={verifying} className="w-full">
                {verifying ? "Memverifikasi…" : "Buka Cabang"}
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}