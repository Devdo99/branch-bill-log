import { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useBranch } from "@/contexts/BranchContext";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Building2,
  FileText,
  LayoutDashboard,
  LineChart,
  LogOut,
  Plus,
  Receipt,
  ShieldCheck,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props { children: ReactNode; title?: string }
type NavItem = { to: string; label: string; icon: LucideIcon };

function ShellNavItem({ item, active }: { item: NavItem; active: boolean }) {
  const { setOpenMobile } = useSidebar();
  const Icon = item.icon;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={active}
        tooltip={item.label}
        className={cn(
          "h-9 gap-3 border-l-2 border-transparent px-3 font-medium text-sidebar-foreground/75",
          "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          active && "border-l-sidebar-primary bg-sidebar-accent text-sidebar-accent-foreground shadow-none",
        )}
      >
        <Link to={item.to} onClick={() => setOpenMobile(false)}>
          <Icon className="h-4 w-4" />
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

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

  let items: NavItem[] = [];
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
  const roleLabel = role === "manager" ? "Manager" : role === "admin" ? "Admin" : "Kasir";

  const isActive = (to: string) => loc.pathname === to;

  return (
    <SidebarProvider defaultOpen={false}>
      <Sidebar collapsible="icon" className="border-r border-sidebar-border">
        <SidebarHeader className="h-16 justify-center border-b border-sidebar-border px-3">
          <Link to={home} className="flex min-w-0 items-center gap-3 rounded-md px-1.5 py-1">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
              <Receipt className="h-4 w-4" />
            </span>
            <span className="min-w-0 group-data-[collapsible=icon]:hidden">
              <span className="block truncate text-sm font-semibold leading-5 text-sidebar-foreground">NotaKu</span>
              <span className="block truncate text-xs text-sidebar-foreground/65">Branch bill log</span>
            </span>
          </Link>
        </SidebarHeader>

        <SidebarContent className="px-2 py-3">
          <SidebarMenu>
            {items.map((it) => (
              <ShellNavItem key={it.to} item={it} active={isActive(it.to)} />
            ))}
          </SidebarMenu>
        </SidebarContent>

        <SidebarFooter className="border-t border-sidebar-border p-3">
          {activeBranch && (
            <button
              onClick={(role === "manager" || role === "admin") ? switchBranch : undefined}
              className="flex w-full items-center gap-3 rounded-md border border-sidebar-border bg-sidebar-accent/40 px-3 py-2.5 text-left text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:[&>svg]:text-sidebar-accent-foreground group-data-[collapsible=icon]:h-10 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
              title={activeBranch.name}
            >
              <Building2 className="h-4 w-4 shrink-0 text-sidebar-foreground/70" />
              <span className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                <span className="block truncate font-medium">{activeBranch.name}</span>
                {(role === "manager" || role === "admin") && <span className="block text-xs text-sidebar-foreground/65">Ganti cabang</span>}
              </span>
            </button>
          )}
          <div className="flex items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/40 px-3 py-2 text-sidebar-foreground group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground">
              {fullName?.slice(0, 1).toUpperCase() ?? "U"}
            </div>
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <div className="truncate text-sm font-medium">{fullName}</div>
              <div className="flex items-center gap-1 text-xs text-sidebar-foreground/65">
                {role === "admin" && <ShieldCheck className="h-3 w-3" />}
                {roleLabel}
              </div>
            </div>
          </div>
          <Button
            className="w-full justify-start border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
            size="sm"
            variant="outline"
            onClick={handleLogout}
            title="Keluar"
          >
            <LogOut className="h-4 w-4" />
            <span className="group-data-[collapsible=icon]:hidden">Keluar</span>
          </Button>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
          <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <SidebarTrigger className="h-9 w-9 border bg-card hover:bg-accent hover:text-accent-foreground" />
              <div className="min-w-0 md:hidden">
                <div className="truncate text-sm font-semibold text-foreground">NotaKu</div>
                <div className="truncate text-xs text-muted-foreground">{roleLabel}</div>
              </div>
            </div>
            {activeBranch && (
              <button
                onClick={(role === "manager" || role === "admin") ? switchBranch : undefined}
                className="inline-flex min-w-0 items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
              >
                <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="max-w-[11rem] truncate sm:max-w-xs">{activeBranch.name}</span>
              </button>
            )}
          </div>
        </header>

        <div className="w-full flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
          <div className="mx-auto w-full max-w-7xl">
            {title && (
              <div className="mb-5 border-b pb-4">
                <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">{roleLabel}</p>
                <h1 className="text-lg font-semibold leading-tight tracking-normal md:text-xl">{title}</h1>
              </div>
            )}
            {children}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
