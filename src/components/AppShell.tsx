import { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useBranch } from "@/contexts/BranchContext";
import { Button } from "@/components/ui/button";
import { LogOut, Receipt, LayoutDashboard, FileText, Users, Building2, Plus, Truck, LineChart, ShieldCheck } from "lucide-react";

interface Props { children: ReactNode; title?: string }

export default function AppShell({ children, title }: Props) {
  const { role, fullName, signOut } = useAuth();
  const { activeBranch, setActiveBranch, adminPerms } = useBranch();
  const nav = useNavigate();
  const loc = useLocation();

  const fullManagerNav = [
    { to: "/manager", label: "Dashboard", icon: LayoutDashboard },
    { to: "/manager/invoices", label: "Nota", icon: FileText, perm: "manage_invoices" as const, viewPerm: true },
    { to: "/manager/suppliers", label: "Supplier", icon: Truck, perm: "manage_suppliers" as const, viewPerm: true },
    { to: "/manager/omset", label: "Omset", icon: LineChart, perm: "manage_revenues" as const, viewPerm: true },
    { to: "/manager/cashiers", label: "Kasir", icon: Users, perm: "manage_cashiers" as const },
    { to: "/manager/admins", label: "Admin", icon: ShieldCheck, managerOnly: true },
    { to: "/manager/branches", label: "Cabang", icon: Building2, managerOnly: true },
  ];
  const kasirNav = [
    { to: "/kasir", label: "Dashboard", icon: LayoutDashboard },
    { to: "/kasir/input", label: "Input Nota", icon: Plus },
  ];

  let items: { to: string; label: string; icon: any }[] = [];
  if (role === "kasir") items = kasirNav;
  else if (role === "manager") items = fullManagerNav.map(({ to, label, icon }) => ({ to, label, icon }));
  else if (role === "admin") {
    items = fullManagerNav.filter((it) => {
      if (it.managerOnly) return false;
      if (!it.perm) return true; // dashboard
      if (!adminPerms) return false;
      // dashboard/view if any view perm, others need their perm
      if (it.viewPerm && adminPerms.view_reports) return true;
      return (adminPerms as any)[it.perm];
    }).map(({ to, label, icon }) => ({ to, label, icon }));
  }

  const handleLogout = async () => { await signOut(); nav("/auth"); };
  const switchBranch = () => { setActiveBranch(null); nav("/manager/select-branch"); };
  const home = role === "manager" || role === "admin" ? "/manager" : "/kasir";

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 bg-background border-b-2 border-foreground">
        <div className="container flex h-16 items-center justify-between gap-4">
          <Link to={home} className="flex items-center gap-2 font-display font-bold text-lg">
            <span className="grid h-9 w-9 place-items-center rounded-md bg-primary border-2 border-foreground shadow-brutal-sm">
              <Receipt className="h-5 w-5 text-primary-foreground" />
            </span>
            <span className="tracking-tight">NotaKu</span>
          </Link>
          <div className="hidden md:flex items-center gap-1.5">
            {items.map((it) => {
              const Icon = it.icon;
              const active = loc.pathname === it.to;
              return (
                <Link key={it.to} to={it.to}
                  className={`px-3 py-2 rounded-md text-sm font-semibold flex items-center gap-2 border-2 transition-all ${active ? "bg-primary text-primary-foreground border-foreground shadow-brutal-sm" : "border-transparent hover:border-foreground hover:bg-accent"}`}>
                  <Icon className="h-4 w-4" />{it.label}
                </Link>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            {activeBranch && (
              <button onClick={(role === "manager" || role === "admin") ? switchBranch : undefined}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-card border-2 border-foreground text-sm font-semibold shadow-brutal-sm hover:translate-y-[1px] hover:shadow-none transition-all">
                <Building2 className="h-4 w-4" />
                <span>{activeBranch.name}</span>
                {(role === "manager" || role === "admin") && <span className="text-[10px] opacity-60">ganti</span>}
              </button>
            )}
            {role === "admin" && (
              <span className="brutal-chip bg-accent hidden sm:inline-flex"><ShieldCheck className="h-3 w-3" /> Admin</span>
            )}
            <Button size="sm" variant="outline" onClick={handleLogout} className="border-2 border-foreground font-semibold">
              <LogOut className="h-4 w-4 mr-1" /> Keluar
            </Button>
          </div>
        </div>
        {/* Mobile nav */}
        <div className="md:hidden border-t-2 border-foreground bg-accent/60">
          <div className="container flex overflow-x-auto py-2 gap-1.5">
            {items.map((it) => {
              const Icon = it.icon;
              const active = loc.pathname === it.to;
              return (
                <Link key={it.to} to={it.to}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap border-2 ${active ? "bg-primary text-primary-foreground border-foreground" : "bg-card border-foreground"}`}>
                  <Icon className="h-4 w-4" />{it.label}
                </Link>
              );
            })}
          </div>
        </div>
      </header>
      <main className="container py-6">
        {title && (
          <div className="mb-6 flex items-end justify-between gap-3 flex-wrap">
            <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight">{title}</h1>
            <div className="h-1.5 flex-1 min-w-[40px] bg-foreground rounded-full" />
          </div>
        )}
        {children}
      </main>
      <footer className="container py-6 text-xs text-muted-foreground">
        Masuk sebagai <span className="font-semibold text-foreground">{fullName}</span> · <span className="brutal-chip py-0.5">{role}</span>
      </footer>
    </div>
  );
}