import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import Auth from "./pages/Auth.tsx";
import ManagerSetup from "./pages/ManagerSetup.tsx";
import SelectBranch from "./pages/SelectBranch.tsx";
import ManagerDashboard from "./pages/ManagerDashboard.tsx";
import ManagerInvoices from "./pages/ManagerInvoices.tsx";
import ManagerCashiers from "./pages/ManagerCashiers.tsx";
import ManagerBranches from "./pages/ManagerBranches.tsx";
import ManagerSuppliers from "./pages/ManagerSuppliers.tsx";
import ManagerOmset from "./pages/ManagerOmset.tsx";
import ManagerFinance from "./pages/ManagerFinance.tsx";
import ManagerProfitLoss from "./pages/ManagerProfitLoss.tsx";
import ManagerAdmins from "./pages/ManagerAdmins.tsx";
import KasirDashboard from "./pages/KasirDashboard.tsx";
import KasirInputNota from "./pages/KasirInputNota.tsx";
import { AuthProvider } from "./contexts/AuthContext";
import { BranchProvider } from "./contexts/BranchContext";
import RequireAuth from "./components/RequireAuth";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <BranchProvider>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/manager/setup" element={<RequireAuth><ManagerSetup /></RequireAuth>} />
              <Route path="/manager/branches" element={<RequireAuth role="manager"><ManagerBranches /></RequireAuth>} />
              <Route path="/manager/select-branch" element={<RequireAuth role={["manager", "admin"]}><SelectBranch /></RequireAuth>} />
              <Route path="/manager" element={<RequireAuth role={["manager", "admin"]} requireBranch><ManagerDashboard /></RequireAuth>} />
              <Route path="/manager/invoices" element={<RequireAuth role={["manager", "admin"]} requireBranch><ManagerInvoices /></RequireAuth>} />
              <Route path="/manager/suppliers" element={<RequireAuth role={["manager", "admin"]} requireBranch><ManagerSuppliers /></RequireAuth>} />
              <Route path="/manager/omset" element={<RequireAuth role={["manager", "admin"]} requireBranch><ManagerOmset /></RequireAuth>} />
              <Route path="/manager/finance" element={<RequireAuth role={["manager", "admin"]} requireBranch><ManagerFinance /></RequireAuth>} />
              <Route path="/manager/profit-loss" element={<RequireAuth role={["manager", "admin"]} requireBranch><ManagerProfitLoss /></RequireAuth>} />
              <Route path="/manager/cashiers" element={<RequireAuth role={["manager", "admin"]} requireBranch><ManagerCashiers /></RequireAuth>} />
              <Route path="/manager/admins" element={<RequireAuth role="manager" requireBranch><ManagerAdmins /></RequireAuth>} />
              <Route path="/kasir" element={<RequireAuth role="kasir"><KasirDashboard /></RequireAuth>} />
              <Route path="/kasir/input" element={<RequireAuth role="kasir"><KasirInputNota /></RequireAuth>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BranchProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
