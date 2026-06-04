import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import BrandLogo from "@/components/BrandLogo";
import { Receipt, ShieldCheck, Building2, FileText, BarChart3, Smartphone, ArrowRight } from "lucide-react";

const Index = () => {
  const { user, role, loading } = useAuth();
  if (loading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Memuat...</div>;
  if (user && role) {
    const dest = role === "kasir" ? "/kasir" : "/manager/select-branch";
    return <Navigate to={dest} replace />;
  }
  if (user && !role) return <Navigate to="/manager/setup" replace />;

  const features = [
    { icon: FileText, title: "Input nota", desc: "Kasir mencatat nota, nominal, supplier, dan foto bukti." },
    { icon: ShieldCheck, title: "Hak akses", desc: "Manager mengatur admin, cabang, kasir, dan izin operasional." },
    { icon: BarChart3, title: "Ringkasan biaya", desc: "Total tagihan, pembayaran, supplier, dan omset tampil dalam satu dashboard." },
    { icon: Building2, title: "Multi cabang", desc: "Data cabang dipisah, tetapi tetap dapat dipantau dari akun manager." },
    { icon: Smartphone, title: "Mobile", desc: "Form kasir tetap nyaman untuk input cepat lewat perangkat kecil." },
    { icon: Receipt, title: "Laporan", desc: "Ekspor dan kirim ringkasan tagihan supplier saat dibutuhkan." },
  ];

  return (
    <div className="min-h-screen">
      <header className="container flex items-center justify-between py-4">
        <BrandLogo className="text-lg" />
        <Link to="/auth"><Button variant="outline">Masuk</Button></Link>
      </header>

      <section className="container py-10 md:py-14 grid md:grid-cols-[0.9fr_1.1fr] gap-8 items-start">
        <div>
          <span className="app-chip">Operasional supplier multi cabang</span>
          <h1 className="text-2xl md:text-3xl font-semibold mt-4 leading-tight text-balance">
            Nota supplier, pembayaran, dan omset cabang dalam satu sistem kerja.
          </h1>
          <p className="mt-4 text-base text-muted-foreground max-w-xl">
            Kasir mencatat nota, manager memantau pembayaran, dan admin mengelola akses cabang dalam satu alur kerja yang ringkas.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/auth"><Button size="lg">Mulai Sekarang <ArrowRight className="h-4 w-4 ml-1" /></Button></Link>
            <a href="#fitur"><Button size="lg" variant="outline">Lihat Fitur</Button></a>
          </div>
        </div>
        <div className="app-panel p-4">
          <div className="flex items-center justify-between border-b pb-3">
            <div>
              <div className="text-xs font-semibold uppercase text-muted-foreground">Dashboard cabang</div>
              <div className="text-sm font-medium mt-1">Cabang Kemang</div>
            </div>
            <span className="app-chip">Juni 2026</span>
          </div>
          <div className="pt-4">
            <div className="text-xs font-semibold uppercase text-muted-foreground">Total Tagihan Hari Ini</div>
            <div className="text-xl font-semibold mt-1">Rp 12.450.000</div>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="rounded-md p-3 bg-muted border">
                <div className="text-[11px] font-medium uppercase text-muted-foreground">Belum</div>
                <div className="text-lg font-semibold">Rp 7.200.000</div>
              </div>
              <div className="rounded-md p-3 bg-muted border">
                <div className="text-[11px] font-medium uppercase text-muted-foreground">Sudah</div>
                <div className="text-lg font-semibold text-success">Rp 5.250.000</div>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {[["Supplier A", "Rp 2.300.000", "BELUM"], ["Supplier B", "Rp 1.100.000", "SUDAH"], ["Supplier C", "Rp 4.900.000", "BELUM"]].map(([s,t,st]) => (
                <div key={s} className="flex justify-between items-center px-3 py-2 text-sm border rounded-md bg-background">
                  <span className="font-medium">{s}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs">{t}</span>
                    <span className={`status-pill ${st === "SUDAH" ? "bg-success/10 text-success" : "bg-warning/15 text-warning-foreground"}`}>{st}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="fitur" className="container py-10">
        <h2 className="text-xl font-semibold">Modul utama</h2>
        <div className="grid md:grid-cols-3 gap-4 mt-5">
          {features.map((f, i) => {
            const Icon = f.icon;
            const accents = ["bg-primary text-primary-foreground", "bg-muted text-muted-foreground", "bg-muted text-muted-foreground"];
            return (
              <div key={f.title} className="app-card p-4">
                <div className={`grid h-9 w-9 place-items-center rounded-md ${accents[i % 3]}`}><Icon className="h-4 w-4" /></div>
                <h3 className="font-semibold mt-3">{f.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">{f.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      <footer className="container py-8 border-t mt-6 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} <b className="text-foreground">NotaKu</b> - Manajemen Nota Tagihan
      </footer>
    </div>
  );
};

export default Index;
