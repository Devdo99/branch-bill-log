import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Receipt, ShieldCheck, Building2, FileText, BarChart3, Smartphone, ArrowRight } from "lucide-react";

const Index = () => {
  const { user, role, loading } = useAuth();
  if (loading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Memuat…</div>;
  if (user && role) {
    const dest = role === "kasir" ? "/kasir" : "/manager/select-branch";
    return <Navigate to={dest} replace />;
  }
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
    <div className="min-h-screen">
      <header className="container flex items-center justify-between py-5">
        <div className="flex items-center gap-2 font-display font-bold text-xl tracking-tight">
          <span className="grid h-10 w-10 place-items-center rounded-md bg-primary text-primary-foreground border-2 border-foreground shadow-brutal-sm">
            <Receipt className="h-5 w-5" />
          </span>
          NotaKu
        </div>
        <Link to="/auth"><Button variant="outline" className="border-2 border-foreground font-semibold">Masuk</Button></Link>
      </header>

      <section className="container py-12 md:py-20 grid md:grid-cols-2 gap-10 items-center">
        <div>
          <span className="brutal-chip bg-primary text-primary-foreground">Manajemen Tagihan Supplier</span>
          <h1 className="font-display text-4xl md:text-6xl font-bold mt-5 leading-[1.05] tracking-tight">
            Nota tagihan <span className="bg-primary text-primary-foreground px-2 inline-block -rotate-1 border-2 border-foreground shadow-brutal-sm">multi cabang</span> tanpa ribet.
          </h1>
          <p className="mt-5 text-lg text-foreground/80 max-w-xl">
            Kasir input nota, manager memantau tagihan supplier, admin bantu kelola — semua di satu tempat.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/auth"><Button size="lg" className="border-2 border-foreground shadow-brutal-sm font-semibold">Mulai Gratis <ArrowRight className="h-4 w-4 ml-1" /></Button></Link>
            <a href="#fitur"><Button size="lg" variant="outline" className="border-2 border-foreground font-semibold">Lihat Fitur</Button></a>
          </div>
        </div>
        <div className="relative">
          <div className="brutal-card p-5 -rotate-1">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Tagihan Hari Ini</div>
            <div className="font-display text-3xl font-bold mt-1">Rp 12.450.000</div>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="rounded-md p-3 bg-warning/30 border-2 border-foreground">
                <div className="text-[11px] font-semibold uppercase">Belum</div>
                <div className="font-display text-xl font-bold">Rp 7.200.000</div>
              </div>
              <div className="rounded-md p-3 bg-primary text-primary-foreground border-2 border-foreground">
                <div className="text-[11px] font-semibold uppercase opacity-90">Sudah</div>
                <div className="font-display text-xl font-bold">Rp 5.250.000</div>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {[["Supplier A", "Rp 2.300.000", "BELUM"], ["Supplier B", "Rp 1.100.000", "SUDAH"], ["Supplier C", "Rp 4.900.000", "BELUM"]].map(([s,t,st]) => (
                <div key={s} className="flex justify-between items-center px-3 py-2 text-sm border-2 border-foreground rounded-md bg-accent/50">
                  <span className="font-semibold">{s}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs">{t}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border-2 border-foreground font-bold ${st === "SUDAH" ? "bg-primary text-primary-foreground" : "bg-warning"}`}>{st}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="fitur" className="container py-12">
        <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">Semua yang Anda butuhkan</h2>
        <div className="grid md:grid-cols-3 gap-5 mt-8">
          {features.map((f, i) => {
            const Icon = f.icon;
            const accents = ["bg-primary text-primary-foreground", "bg-accent", "bg-warning"];
            return (
              <div key={f.title} className="brutal-card p-5">
                <div className={`grid h-11 w-11 place-items-center rounded-md border-2 border-foreground ${accents[i % 3]}`}><Icon className="h-5 w-5" /></div>
                <h3 className="font-display font-bold text-lg mt-4">{f.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">{f.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      <footer className="container py-10 border-t-2 border-foreground mt-8 text-center text-sm">
        © {new Date().getFullYear()} <b>NotaKu</b> — Manajemen Nota Tagihan
      </footer>
    </div>
  );
};

export default Index;
