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
  const { user, fullName, signOut } = useAuth();
  const { setActiveBranch } = useBranch();
  const nav = useNavigate();
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<BranchRow | null>(null);
  const [pin, setPin] = useState("");
  const [verifying, setVerifying] = useState(false);

  const load = async () => {
    const { data, error } = await supabase.from("branches").select("id, name").order("created_at");
    if (error) toast.error(error.message);
    setBranches(data ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const verify = async () => {
    if (!selected) return;
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

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-gradient-dark text-secondary-foreground">
        <div className="container flex items-center justify-between h-16">
          <div className="font-display font-bold">NotaKu</div>
          <div className="flex items-center gap-3 text-sm">
            <span className="opacity-70">Halo, {fullName}</span>
            <Button size="sm" variant="ghost" onClick={handleLogout} className="text-secondary-foreground hover:bg-white/10">
              <LogOut className="h-4 w-4 mr-1" /> Keluar
            </Button>
          </div>
        </div>
      </header>
      <main className="container py-10 max-w-3xl">
        <h1 className="font-display text-3xl font-bold">Pilih Cabang</h1>
        <p className="text-muted-foreground">Masukkan PIN untuk membuka dashboard cabang.</p>

        {loading ? <p className="mt-6 text-muted-foreground">Memuat…</p> : (
          <div className="grid sm:grid-cols-2 gap-4 mt-6">
            {branches.map((b) => (
              <button key={b.id} onClick={() => { setSelected(b); setPin(""); }}
                className={`text-left bg-card rounded-xl p-5 border shadow-card transition hover:shadow-elegant hover:-translate-y-0.5 ${selected?.id === b.id ? "ring-2 ring-primary" : ""}`}>
                <div className="flex items-center gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-lg bg-accent text-accent-foreground"><Building2 className="h-5 w-5" /></div>
                  <div>
                    <div className="font-semibold">{b.name}</div>
                    <div className="text-xs text-muted-foreground">Klik untuk membuka</div>
                  </div>
                </div>
              </button>
            ))}
            <Link to="/manager/branches" className="text-left bg-card border-dashed border-2 rounded-xl p-5 flex items-center gap-3 text-muted-foreground hover:text-foreground">
              <Plus className="h-5 w-5" /> Kelola / Tambah Cabang
            </Link>
          </div>
        )}

        {selected && (
          <div className="mt-8 bg-card rounded-xl border shadow-card p-6 max-w-sm">
            <div className="flex items-center gap-2 font-semibold"><Lock className="h-4 w-4" /> PIN Cabang {selected.name}</div>
            <div className="mt-4 space-y-3">
              <div className="space-y-1.5">
                <Label>PIN</Label>
                <Input autoFocus type="password" inputMode="numeric" value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  onKeyDown={(e) => e.key === "Enter" && verify()} />
              </div>
              <Button onClick={verify} disabled={verifying} className="w-full bg-gradient-primary">
                {verifying ? "Memverifikasi…" : "Buka Cabang"}
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}