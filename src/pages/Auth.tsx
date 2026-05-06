import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Receipt, Building2, Lock } from "lucide-react";
import { z } from "zod";

const registerSchema = z.object({
  full_name: z.string().trim().min(2, "Nama minimal 2 karakter").max(80),
  email: z.string().trim().email("Email tidak valid").max(255),
  password: z.string().min(8, "Password minimal 8 karakter").max(72),
});
const loginSchema = z.object({
  email: z.string().trim().email("Email tidak valid").max(255),
  password: z.string().min(1, "Password wajib diisi").max(72),
});

interface BranchOpt { id: string; name: string }

export default function Auth() {
  const [tab, setTab] = useState<"manager" | "kasir">("manager");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", password: "" });
  const nav = useNavigate();

  // Kasir
  const [branches, setBranches] = useState<BranchOpt[]>([]);
  const [branchId, setBranchId] = useState("");
  const [pin, setPin] = useState("");
  const [kasirLoading, setKasirLoading] = useState(false);

  useEffect(() => {
    if (tab !== "kasir" || branches.length) return;
    (async () => {
      const { data, error } = await supabase.functions.invoke("list-branches-public");
      if (error) { toast.error("Gagal memuat cabang"); return; }
      setBranches((data as any)?.branches ?? []);
    })();
  }, [tab]);

  const submitManager = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "register") {
        const parsed = registerSchema.safeParse(form);
        if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
        const { error } = await supabase.auth.signUp({
          email: parsed.data.email,
          password: parsed.data.password,
          options: { emailRedirectTo: `${window.location.origin}/`, data: { full_name: parsed.data.full_name } },
        });
        if (error) { toast.error(error.message); return; }
        toast.success("Akun manager dibuat!");
        nav("/manager/setup");
      } else {
        const parsed = loginSchema.safeParse(form);
        if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
        const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
        if (error) { toast.error(error.message); return; }
        toast.success("Berhasil masuk");
        nav("/");
      }
    } finally { setLoading(false); }
  };

  const submitKasir = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchId) return toast.error("Pilih cabang");
    if (!/^\d{4,6}$/.test(pin)) return toast.error("PIN 4-6 digit");
    setKasirLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("kasir-login", { body: { branch_id: branchId, pin } });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message || "PIN salah");
      const { email, token_hash } = data as { email: string; token_hash: string };
      const { error: vErr } = await supabase.auth.verifyOtp({ token_hash, type: "magiclink" });
      if (vErr) throw vErr;
      toast.success("Berhasil masuk sebagai kasir");
      nav("/kasir");
    } catch (e: any) {
      toast.error(e.message ?? "Login kasir gagal");
    } finally { setKasirLoading(false); }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex bg-gradient-dark text-secondary-foreground p-12 flex-col justify-between">
        <Link to="/" className="flex items-center gap-2 font-display font-bold text-xl">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-primary"><Receipt className="h-5 w-5 text-primary-foreground" /></span>
          NotaKu
        </Link>
        <div>
          <h2 className="font-display text-4xl font-extrabold leading-tight">Catat. Pantau. Lunasi.</h2>
          <p className="mt-3 text-secondary-foreground/70 max-w-md">Manajemen nota tagihan supplier untuk bisnis multi cabang.</p>
        </div>
        <div className="text-xs text-secondary-foreground/50">© NotaKu</div>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <h1 className="font-display text-3xl font-bold">Masuk</h1>
          <p className="text-sm text-muted-foreground mt-1">Pilih jenis akun untuk masuk.</p>

          <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="mt-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="manager">Manager</TabsTrigger>
              <TabsTrigger value="kasir">Kasir</TabsTrigger>
            </TabsList>

            <TabsContent value="manager" className="mt-6">
              <form onSubmit={submitManager} className="space-y-4">
                {mode === "register" && (
                  <div className="space-y-1.5">
                    <Label>Nama Lengkap</Label>
                    <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Password</Label>
                  <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
                </div>
                <Button type="submit" disabled={loading} className="w-full bg-gradient-primary shadow-elegant" size="lg">
                  {loading ? "Memproses…" : mode === "login" ? "Masuk" : "Daftar"}
                </Button>
              </form>
              <div className="mt-4 text-sm text-center text-muted-foreground">
                {mode === "login" ? "Belum punya akun?" : "Sudah punya akun?"}{" "}
                <button className="text-primary font-semibold" onClick={() => setMode(mode === "login" ? "register" : "login")}>
                  {mode === "login" ? "Daftar di sini" : "Masuk"}
                </button>
              </div>
            </TabsContent>

            <TabsContent value="kasir" className="mt-6">
              <form onSubmit={submitKasir} className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-2"><Building2 className="h-4 w-4" /> Cabang</Label>
                  <select value={branchId} onChange={(e) => setBranchId(e.target.value)} required
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="">— Pilih cabang —</option>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-2"><Lock className="h-4 w-4" /> PIN Cabang</Label>
                  <Input type="password" inputMode="numeric" value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="4-6 digit" required />
                </div>
                <Button type="submit" disabled={kasirLoading} className="w-full bg-gradient-primary shadow-elegant" size="lg">
                  {kasirLoading ? "Memverifikasi…" : "Masuk Kasir"}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  PIN diatur oleh manager saat membuat cabang.
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
