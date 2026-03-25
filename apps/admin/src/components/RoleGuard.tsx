import { Navigate, useLocation } from "react-router-dom";
import { getCurrentRole } from "@/lib/admin-auth";
import { canAccessRoute } from "@/lib/role-access";

/** Redirects to dashboard if current role cannot access the route. */
export function RoleGuard({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const role = getCurrentRole();
  const pathname = location.pathname;
  if (!canAccessRoute(role, pathname)) return <Navigate to="/" replace />;
  return <>{children}</>;
}
