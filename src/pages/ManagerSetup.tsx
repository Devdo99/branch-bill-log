import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import bcrypt from "bcryptjs";
import { Building2 } from "lucide-react";

export default function ManagerSetup() {
  const { user, role, refresh } = useAuth();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (role) nav(role === "manager" ? "/manager/select-branch" : "/kasir"); }, [role, nav]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (name.trim().length < 2) { toast.error("Nama cabang minimal 2 karakter"); return; }
    if (!/^\d{4,6}$/.test(pin)) { toast.error("PIN harus 4-6 digit angka"); return; }
    setLoading(true);
    try {
      // Assign manager role first via RPC-less direct insert (allowed since user creates own role here)
      // Use edge function for safety: just insert here using upsert (RLS denies, so use direct insert via RPC).
      // Simpler: call edge function
      const { error: roleErr } = await supabase.functions.invoke("setup-manager", {
        body: { branch_name: name.trim(), pin },
      });
      if (roleErr) throw roleErr;
      await refresh();
      toast.success("Cabang pertama dibuat!");
      nav("/manager/select-branch");
    } catch (e: any) {
      toast.error(e.message ?? "Gagal setup");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-muted/30 p-6">
      <div className="app-card p-7 w-full max-w-md">
        <div className="grid h-10 w-10 place-items-center rounded-md bg-primary text-primary-foreground mx-auto">
          <Building2 className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold text-center mt-4">Buat Cabang Pertama</h1>
        <p className="text-sm text-muted-foreground text-center mt-1">Sebagai manager, mulai dengan satu cabang. PIN ini diperlukan setiap kali membuka cabang.</p>
        <form onSubmit={submit} className="space-y-4 mt-6">
          <div className="space-y-1.5">
            <Label>Nama Cabang</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: Cabang Pusat" required />
          </div>
          <div className="space-y-1.5">
            <Label>PIN Cabang (4–6 digit)</Label>
            <Input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="••••" required />
          </div>
          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading ? "Menyimpan…" : "Buat Cabang"}
          </Button>
        </form>
      </div>
    </div>
  );
}

// Note: bcrypt unused here; hashing happens server-side in edge function.
void bcrypt;
