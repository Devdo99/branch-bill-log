import AppShell from "@/components/AppShell";
import { useBranch } from "@/contexts/BranchContext";
import { Link } from "react-router-dom";
import { Building2, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ManagerCashiers() {
  const { activeBranch } = useBranch();
  return (
    <AppShell title={`Akses Kasir — ${activeBranch?.name ?? ""}`}>
      <div className="app-card p-6 max-w-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="grid h-12 w-12 place-items-center rounded-lg bg-accent text-accent-foreground">
            <KeyRound className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Login Kasir Tanpa Akun</h2>
            <p className="text-sm text-muted-foreground">Kasir cukup memilih cabang dan memasukkan PIN untuk masuk.</p>
          </div>
        </div>
        <ol className="list-decimal pl-5 space-y-2 text-sm">
          <li>Buka menu <Link to="/manager/branches" className="text-primary font-semibold">Cabang</Link> untuk membuat cabang & mengatur PIN-nya.</li>
          <li>Berikan <strong>nama cabang</strong> dan <strong>PIN</strong> kepada kasir Anda.</li>
          <li>Kasir membuka halaman login, tab <strong>Kasir</strong>, pilih cabang, lalu masukkan PIN.</li>
          <li>Untuk mengganti PIN, hapus dan buat ulang cabang (atau hubungi admin).</li>
        </ol>
        <div className="mt-6 flex gap-2">
          <Link to="/manager/branches"><Button><Building2 className="h-4 w-4 mr-1" /> Kelola Cabang & PIN</Button></Link>
        </div>
      </div>
    </AppShell>
  );
}
