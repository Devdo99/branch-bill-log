import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useBranch } from "@/contexts/BranchContext";

interface Props {
  children: ReactNode;
  role?: "manager" | "kasir" | Array<"manager" | "kasir" | "admin">;
  requireBranch?: boolean;
}

export default function RequireAuth({ children, role, requireBranch }: Props) {
  const { user, role: userRole, loading } = useAuth();
  const { activeBranch } = useBranch();
  const loc = useLocation();

  if (loading) {
    return <div className="min-h-screen grid place-items-center text-muted-foreground">Memuat…</div>;
  }
  if (!user) return <Navigate to="/auth" state={{ from: loc }} replace />;
  if (!userRole) {
    return loc.pathname === "/manager/setup" ? <>{children}</> : <Navigate to="/manager/setup" replace />;
  }
  if (role) {
    const allowed = Array.isArray(role) ? role : [role];
    if (!allowed.includes(userRole as any)) {
      const fallback = userRole === "kasir" ? "/kasir" : "/manager/select-branch";
      return <Navigate to={fallback} replace />;
    }
  }
  if (requireBranch && !activeBranch) return <Navigate to="/manager/select-branch" replace />;
  return <>{children}</>;
}