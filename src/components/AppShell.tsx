import { ReactNode, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useBranch } from "@/contexts/BranchContext";
import { Button } from "@/components/ui/button";
import BrandLogo from "@/components/BrandLogo";
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
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Building2,
  FileText,
  LayoutDashboard,
  LineChart,
  LogOut,
  Plus,
  ShieldCheck,
  Truck,
  Wallet,
  Users,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props { children: ReactNode; title?: string }

interface SubItem {
  to: string;
  label: string;
  perm?: "manage_invoices" | "manage_suppliers" | "manage_revenues" | "view_reports" | "manage_cashiers";
  viewPerm?: boolean;
  managerOnly?: boolean;
}

interface NavItem {
  to?: string;
  label: string;
  icon: LucideIcon;
  perm?: "manage_invoices" | "manage_suppliers" | "manage_revenues" | "view_reports" | "manage_cashiers";
  viewPerm?: boolean;
  managerOnly?: boolean;
  subItems?: SubItem[];
}

interface NavGroup {
  label?: string;
  items: NavItem[];
}

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
        <Link to={item.to!} onClick={() => setOpenMobile(false)}>
          <Icon className="h-4 w-4 shrink-0" />
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function ShellCollapsibleNavItem({ item, activePath }: { item: NavItem; activePath: string }) {
  const { setOpenMobile } = useSidebar();
  const Icon = item.icon;
  const isSubActive = item.subItems?.some(sub => activePath === sub.to) ?? false;

  return (
    <Collapsible asChild defaultOpen={isSubActive} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton 
            tooltip={item.label}
            className={cn(
              "h-9 gap-3 px-3 font-medium text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              isSubActive && "text-sidebar-accent-foreground font-semibold"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span>{item.label}</span>
            <ChevronRight className="ml-auto h-4 w-4 shrink-0 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub className="border-l border-sidebar-border/60 ml-5 px-0 py-0.5 space-y-0.5">
            {item.subItems?.map((sub) => {
              const active = activePath === sub.to;
              return (
                <SidebarMenuSubItem key={sub.to}>
                  <SidebarMenuSubButton 
                    asChild 
                    isActive={active}
                    className={cn(
                      "h-8 px-3 text-xs text-sidebar-foreground/70 hover:text-sidebar-accent-foreground",
                      active && "text-sidebar-accent-foreground font-medium bg-sidebar-accent/50"
                    )}
                  >
                    <Link to={sub.to} onClick={() => setOpenMobile(false)}>
                      <span>{sub.label}</span>
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              );
            })}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

export default function AppShell({ children, title }: Props) {
  const { role, fullName, signOut } = useAuth();
  const { activeBranch, setActiveBranch, adminPerms } = useBranch();
  const nav = useNavigate();
  const loc = useLocation();

  const managerGroups = [
    {
      items: [
        {
          label: "Urusan Nota",
          icon: FileText,
          subItems: [
            { to: "/manager", label: "Dashboard Nota" },
            { to: "/manager/invoices", label: "Daftar Nota", perm: "manage_invoices" as const, viewPerm: true },
            { to: "/manager/suppliers", label: "Data Supplier", perm: "manage_suppliers" as const, viewPerm: true },
          ]
        },
        {
          label: "Keuangan & Omset",
          icon: Wallet,
          subItems: [
            { to: "/manager/finance", label: "Laporan Keuangan", perm: "view_reports" as const, viewPerm: true },
            { to: "/manager/profit-loss", label: "Laba Rugi", perm: "view_reports" as const, viewPerm: true },
            { to: "/manager/omset", label: "Omset Harian", perm: "manage_revenues" as const, viewPerm: true },
          ]
        },
        {
          label: "Pengaturan Sistem",
          icon: Building2,
          subItems: [
            { to: "/manager/cashiers", label: "Data Kasir", perm: "manage_cashiers" as const },
            { to: "/manager/admins", label: "Kelola Admin", managerOnly: true },
            { to: "/manager/branches", label: "Kelola Cabang", managerOnly: true },
          ]
        }
      ]
    }
  ];

  let groups: NavGroup[] = [];
  if (role === "kasir") {
    groups = [
      {
        label: "Menu Kasir",
        items: [
          { to: "/kasir", label: "Dashboard", icon: LayoutDashboard },
          { to: "/kasir/input", label: "Input Nota", icon: Plus },
        ]
      }
    ];
  } else if (role === "manager") {
    groups = managerGroups.map(g => ({
      label: g.label,
      items: g.items.map(it => ({
        ...it,
        subItems: it.subItems?.map(sub => ({ to: sub.to, label: sub.label }))
      }))
    }));
  } else if (role === "admin") {
    groups = managerGroups.map(g => {
      const filteredItems = g.items.map(it => {
        if (it.subItems) {
          const filteredSubs = it.subItems.filter(sub => {
            if (sub.managerOnly) return false;
            if (!sub.perm) return true;
            if (!adminPerms) return false;
            if (sub.viewPerm && adminPerms.view_reports) return true;
            return (adminPerms as any)[sub.perm];
          });
          return {
            ...it,
            subItems: filteredSubs.map(sub => ({ to: sub.to, label: sub.label }))
          };
        }
        
        // Flat item
        if (it.managerOnly) return null;
        if (!it.perm) return it;
        if (!adminPerms) return null;
        if (it.viewPerm && adminPerms.view_reports) return it;
        if ((adminPerms as any)[it.perm]) return it;
        return null;
      }).filter(Boolean) as NavItem[];

      const finalItems = filteredItems.filter(it => !it.subItems || it.subItems.length > 0);

      return {
        label: g.label,
        items: finalItems
      };
    }).filter(g => g.items.length > 0);
  }

  const handleLogout = async () => { await signOut(); nav("/auth"); };
  const switchBranch = () => { setActiveBranch(null); nav("/manager/select-branch"); };
  const home = role === "manager" || role === "admin" ? "/manager" : "/kasir";
  const roleLabel = role === "manager" ? "Manager" : role === "admin" ? "Admin" : "Kasir";

  const isActive = (to: string) => loc.pathname === to;

  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      const saved = localStorage.getItem("notaku.sidebarOpen");
      return saved ? saved === "true" : true;
    } catch {
      return true;
    }
  });

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={(open) => {
      setSidebarOpen(open);
      localStorage.setItem("notaku.sidebarOpen", String(open));
    }}>
      <Sidebar collapsible="icon" className="border-r border-sidebar-border">
        <SidebarHeader className="h-16 justify-center border-b border-sidebar-border px-3">
          <Link to={home} className="flex min-w-0 items-center gap-3 rounded-md px-1.5 py-1">
            <BrandLogo
              markClassName="h-8 w-8"
              textClassName="text-sidebar-foreground group-data-[collapsible=icon]:hidden"
              subtitle="Branch bill log"
            />
          </Link>
        </SidebarHeader>

        <SidebarContent className="px-2 py-3 space-y-4">
          {groups.map((group, idx) => (
            <SidebarGroup key={group.label ?? idx} className="px-0 py-0">
              {group.label && (
                <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden px-3 text-[10px] uppercase tracking-wider font-bold text-muted-foreground/80 mb-1.5">
                  {group.label}
                </SidebarGroupLabel>
              )}
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((it) => (
                    it.subItems && it.subItems.length > 0 ? (
                      <ShellCollapsibleNavItem key={it.label} item={it} activePath={loc.pathname} />
                    ) : (
                      <ShellNavItem key={it.to!} item={it} active={isActive(it.to!)} />
                    )
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
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
                <BrandLogo markClassName="h-7 w-7" textClassName="text-sm text-foreground" />
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
