import { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface Branch { id: string; name: string }

export interface AdminPerms {
  manage_invoices: boolean;
  mark_paid: boolean;
  manage_suppliers: boolean;
  manage_revenues: boolean;
  manage_cashiers: boolean;
  view_reports: boolean;
}

interface BranchCtx {
  activeBranch: Branch | null;
  setActiveBranch: (b: Branch | null) => void;
  cashierBranch: Branch | null;
  adminPerms: AdminPerms | null;
  adminBranches: Branch[];
}

const Ctx = createContext<BranchCtx | undefined>(undefined);
const KEY = "notaku.activeBranch";

export function BranchProvider({ children }: { children: ReactNode }) {
  const { user, role } = useAuth();
  const [activeBranch, setActiveBranchState] = useState<Branch | null>(() => {
    try { const v = sessionStorage.getItem(KEY); return v ? JSON.parse(v) : null; } catch { return null; }
  });
  const [cashierBranch, setCashierBranch] = useState<Branch | null>(null);
  const [adminPerms, setAdminPerms] = useState<AdminPerms | null>(null);
  const [adminBranches, setAdminBranches] = useState<Branch[]>([]);

  const setActiveBranch = (b: Branch | null) => {
    setActiveBranchState(b);
    if (b) sessionStorage.setItem(KEY, JSON.stringify(b));
    else sessionStorage.removeItem(KEY);
  };

  // For kasir: auto-load assigned branch
  useEffect(() => {
    if (!user || role !== "kasir") return;
    (async () => {
      const { data } = await supabase
        .from("branch_users")
        .select("branch_id, branches(id, name)")
        .eq("user_id", user.id)
        .maybeSingle();
      const b = (data as any)?.branches;
      if (b) {
        setCashierBranch({ id: b.id, name: b.name });
        setActiveBranch({ id: b.id, name: b.name });
      }
    })();
  }, [user, role]);

  // For admin: load assigned branches
  useEffect(() => {
    if (!user || role !== "admin") { setAdminBranches([]); return; }
    (async () => {
      const { data } = await (supabase.from("admin_permissions" as any) as any)
        .select("branch_id, branches(id, name)")
        .eq("user_id", user.id);
      const rows = (data ?? []) as any[];
      const list: Branch[] = rows
        .map((r) => r.branches)
        .filter(Boolean)
        .map((b: any) => ({ id: b.id, name: b.name }));
      setAdminBranches(list);
      if (list.length === 1 && !activeBranch) setActiveBranch(list[0]);
    })();
  }, [user, role]);

  // For admin: load permissions for active branch
  useEffect(() => {
    if (!user || role !== "admin" || !activeBranch) { setAdminPerms(null); return; }
    (async () => {
      const { data } = await (supabase.from("admin_permissions" as any) as any)
        .select("manage_invoices, mark_paid, manage_suppliers, manage_revenues, manage_cashiers, view_reports")
        .eq("user_id", user.id)
        .eq("branch_id", activeBranch.id)
        .maybeSingle();
      setAdminPerms((data as any) ?? null);
    })();
  }, [user, role, activeBranch?.id]);

  return (
    <Ctx.Provider value={{ activeBranch, setActiveBranch, cashierBranch, adminPerms, adminBranches }}>{children}</Ctx.Provider>
  );
}

export const useBranch = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useBranch must be used within BranchProvider");
  return c;
};