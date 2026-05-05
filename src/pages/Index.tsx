import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Receipt, ShieldCheck, Building2, FileText, BarChart3, Smartphone } from "lucide-react";

const Index = () => {
  const { user, role, loading } = useAuth();
  if (loading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Memuat…</div>;
  if (user && role) return <Navigate to={role === "manager" ? "/manager/select-branch" : "/kasir"} replace />;
  if (user && !role) return <Navigate to="/manager/setup" replace />;

  const features = [
    { icon: FileText, title: "Input Nota Cepat", desc: "Kasir catat nota & upload foto dalam hitungan detik." },
    { icon: ShieldCheck, title: "Aman per Cabang", desc: "PIN cabang & hak akses ketat. Data tidak bocor antar cabang." },
    { icon: BarChart3, title: "Dashboard Visual", desc: "Pantau total tagihan, terbayar, & grafik per supplier." },
    { icon: Building2, title: "Multi Cabang", desc: "Kelola banyak cabang dari satu akun manager." },
    { icon: Smartphone, title: "Mobile Ready", desc: "Ringan dipakai di HP saat di lapangan maupun di kantor." },
    { icon: Receipt, title: "Export & WhatsApp", desc: "Kirim laporan PDF/JPG ke WhatsApp dalam 1 klik." },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="container flex items-center justify-between py-5">
        <div className="flex items-center gap-2 font-display font-bold text-xl">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-primary">
            <Receipt className="h-5 w-5 text-primary-foreground" />
          </span>
          NotaKu
        </div>
        <Link to="/auth"><Button variant="outline">Masuk</Button></Link>
      </header>

      <section className="container py-16 md:py-24 grid md:grid-cols-2 gap-12 items-center">
        <div>
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent text-accent-foreground text-xs font-semibold">
            Manajemen Tagihan Supplier
          </span>
          <h1 className="font-display text-4xl md:text-6xl font-extrabold mt-4 leading-tight">
            Kelola nota tagihan <span className="text-primary">multi cabang</span> tanpa ribet.
          </h1>
          <p className="mt-5 text-lg text-muted-foreground max-w-xl">
            NotaKu membantu kasir mencatat nota dan manager memantau tagihan supplier secara real-time, aman, dan terorganisir.
          </p>
          <div className="mt-8 flex gap-3">
            <Link to="/auth"><Button size="lg" className="bg-gradient-primary shadow-elegant">Mulai Gratis</Button></Link>
            <a href="#fitur"><Button size="lg" variant="outline">Lihat Fitur</Button></a>
          </div>
        </div>
        <div className="relative">
          <div className="absolute -inset-4 bg-gradient-primary opacity-20 blur-3xl rounded-full" />
          <div className="relative bg-gradient-dark text-secondary-foreground rounded-2xl p-6 shadow-elegant">
            <div className="text-xs opacity-70">Total Tagihan Hari Ini</div>
            <div className="font-display text-3xl font-bold mt-1">Rp 12.450.000</div>
            <div className="grid grid-cols-2 gap-3 mt-5">
              <div className="bg-white/5 rounded-xl p-4">
                <div className="text-xs opacity-70">Belum Dibayar</div>
                <div className="text-xl font-bold text-warning">Rp 7.200.000</div>
              </div>
              <div className="bg-white/5 rounded-xl p-4">
                <div className="text-xs opacity-70">Sudah Dibayar</div>
                <div className="text-xl font-bold text-primary-glow">Rp 5.250.000</div>
              </div>
            </div>
            <div className="mt-5 space-y-2">
              {[["Supplier A", "Rp 2.300.000", "BELUM"], ["Supplier B", "Rp 1.100.000", "SUDAH"], ["Supplier C", "Rp 4.900.000", "BELUM"]].map(([s,t,st]) => (
                <div key={s} className="flex justify-between items-center bg-white/5 rounded-lg px-3 py-2 text-sm">
                  <span>{s}</span>
                  <div className="flex items-center gap-3">
                    <span className="font-mono">{t}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${st === "SUDAH" ? "bg-primary text-primary-foreground" : "bg-warning text-warning-foreground"}`}>{st}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="fitur" className="container py-16">
        <h2 className="font-display text-3xl font-bold text-center">Semua yang Anda butuhkan</h2>
        <div className="grid md:grid-cols-3 gap-5 mt-10">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="bg-card rounded-xl p-6 shadow-card border">
                <div className="grid h-11 w-11 place-items-center rounded-lg bg-accent text-accent-foreground"><Icon className="h-5 w-5" /></div>
                <h3 className="font-display font-bold text-lg mt-4">{f.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">{f.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      <footer className="container py-10 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} NotaKu — Manajemen Nota Tagihan
      </footer>
    </div>
  );
};

export default Index;
