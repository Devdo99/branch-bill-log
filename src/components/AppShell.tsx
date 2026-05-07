import { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useBranch } from "@/contexts/BranchContext";
import { Button } from "@/components/ui/button";
import { LogOut, Receipt, LayoutDashboard, FileText, Users, Building2, Plus, Truck } from "lucide-react";

interface Props { children: ReactNode; title?: string }

export default function AppShell({ children, title }: Props) {
  const { role, fullName, signOut } = useAuth();
  const { activeBranch, setActiveBranch, cashierBranch } = useBranch();
  const nav = useNavigate();
  const loc = useLocation();

  const managerNav = [
    { to: "/manager", label: "Dashboard", icon: LayoutDashboard },
    { to: "/manager/invoices", label: "Nota", icon: FileText },
    { to: "/manager/suppliers", label: "Supplier", icon: Truck },
    { to: "/manager/cashiers", label: "Kasir", icon: Users },
    { to: "/manager/branches", label: "Cabang", icon: Building2 },
  ];
  const kasirNav = [
    { to: "/kasir", label: "Dashboard", icon: LayoutDashboard },
    { to: "/kasir/input", label: "Input Nota", icon: Plus },
  ];
  const items = role === "manager" ? managerNav : kasirNav;

  const handleLogout = async () => { await signOut(); nav("/auth"); };
  const switchBranch = () => { setActiveBranch(null); nav("/manager/select-branch"); };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-30 bg-gradient-dark text-secondary-foreground shadow-elegant">
        <div className="container flex h-16 items-center justify-between gap-4">
          <Link to={role === "manager" ? "/manager" : "/kasir"} className="flex items-center gap-2 font-display font-bold text-lg">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-primary">
              <Receipt className="h-5 w-5 text-primary-foreground" />
            </span>
            NotaKu
          </Link>
          <div className="hidden md:flex items-center gap-1">
            {items.map((it) => {
              const Icon = it.icon;
              const active = loc.pathname === it.to;
              return (
                <Link key={it.to} to={it.to}
                  className={`px-3 py-2 rounded-md text-sm flex items-center gap-2 transition-colors ${active ? "bg-primary text-primary-foreground" : "hover:bg-white/10"}`}>
                  <Icon className="h-4 w-4" />{it.label}
                </Link>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            {activeBranch && (
              <button onClick={role === "manager" ? switchBranch : undefined}
                className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-md bg-white/10 text-sm hover:bg-white/15">
                <Building2 className="h-4 w-4" />
                <span className="font-medium">{activeBranch.name}</span>
                {role === "manager" && <span className="text-xs opacity-70">(ganti)</span>}
              </button>
            )}
            <Button size="sm" variant="ghost" onClick={handleLogout} className="text-secondary-foreground hover:bg-white/10">
              <LogOut className="h-4 w-4 mr-1" /> Keluar
            </Button>
          </div>
        </div>
        {/* Mobile nav */}
        <div className="md:hidden border-t border-white/10">
          <div className="container flex overflow-x-auto py-2 gap-1">
            {items.map((it) => {
              const Icon = it.icon;
              const active = loc.pathname === it.to;
              return (
                <Link key={it.to} to={it.to}
                  className={`px-3 py-2 rounded-md text-xs flex items-center gap-1.5 whitespace-nowrap ${active ? "bg-primary text-primary-foreground" : "bg-white/5"}`}>
                  <Icon className="h-4 w-4" />{it.label}
                </Link>
              );
            })}
          </div>
        </div>
      </header>
      <main className="container py-6">
        {title && <h1 className="font-display text-2xl md:text-3xl font-bold mb-6">{title}</h1>}
        {children}
      </main>
      <footer className="container py-6 text-xs text-muted-foreground">
        Masuk sebagai <span className="font-medium text-foreground">{fullName}</span> ({role})
      </footer>
    </div>
  );
}