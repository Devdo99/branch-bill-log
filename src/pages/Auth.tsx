import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Receipt } from "lucide-react";
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

export default function Auth() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", password: "" });
  const nav = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "register") {
        const parsed = registerSchema.safeParse(form);
        if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
        const { error } = await supabase.auth.signUp({
          email: parsed.data.email,
          password: parsed.data.password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: { full_name: parsed.data.full_name },
          },
        });
        if (error) { toast.error(error.message); return; }
        toast.success("Akun berhasil dibuat!");
        nav("/manager/setup");
      } else {
        const parsed = loginSchema.safeParse(form);
        if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
        const { error } = await supabase.auth.signInWithPassword(parsed.data);
        if (error) { toast.error(error.message); return; }
        toast.success("Berhasil masuk");
        nav("/");
      }
    } finally { setLoading(false); }
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
          <h1 className="font-display text-3xl font-bold">{mode === "login" ? "Masuk" : "Daftar Akun Manager"}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === "login" ? "Gunakan email & password Anda." : "Buat akun manager untuk mulai mengelola cabang."}
          </p>
          <form onSubmit={submit} className="mt-6 space-y-4">
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
          <p className="text-xs text-muted-foreground mt-4 text-center">
            Akun kasir dibuat oleh manager. Login pakai email yang manager berikan.
          </p>
        </div>
      </div>
    </div>
  );
}