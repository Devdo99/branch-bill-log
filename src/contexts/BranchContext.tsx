import { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface Branch { id: string; name: string }

interface BranchCtx {
  activeBranch: Branch | null;
  setActiveBranch: (b: Branch | null) => void;
  cashierBranch: Branch | null;
}

const Ctx = createContext<BranchCtx | undefined>(undefined);
const KEY = "notaku.activeBranch";

export function BranchProvider({ children }: { children: ReactNode }) {
  const { user, role } = useAuth();
  const [activeBranch, setActiveBranchState] = useState<Branch | null>(() => {
    try { const v = sessionStorage.getItem(KEY); return v ? JSON.parse(v) : null; } catch { return null; }
  });
  const [cashierBranch, setCashierBranch] = useState<Branch | null>(null);

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

  return (
    <Ctx.Provider value={{ activeBranch, setActiveBranch, cashierBranch }}>{children}</Ctx.Provider>
  );
}

export const useBranch = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useBranch must be used within BranchProvider");
  return c;
};