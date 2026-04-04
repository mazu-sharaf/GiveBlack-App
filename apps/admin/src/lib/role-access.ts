/**
 * Role-based access: which routes and nav items each role can see and use.
 *
 * Visibility by role:
 * - admin / super_admin: All features. Only they can add/edit/remove staff and change roles.
 * - manager: Dashboard, Organizations, Campaigns, Community Campaigns, Donations, Volunteers, Transactions. No Users, Charity Requests, Subscriptions, Ledger, Categories, Staff, Admin Emails, Settings.
 * - staff: Dashboard, Organizations, Campaigns, Donations, Volunteers. No Transactions, Community, Users, Charity, Subscriptions, Ledger, Categories, Staff, Admin Emails, Settings.
 */

export type AdminRole = "admin" | "super_admin" | "manager" | "staff";

/** Top-level nav paths allowed per role (exact match for sidebar). */
const ADMIN_NAV = new Set(["/", "/users", "/organizations", "/campaigns", "/donations", "/community-campaigns", "/charity-requests", "/volunteers", "/subscriptions", "/transactions", "/fund-release", "/ledger", "/categories", "/education-partners", "/staff", "/admin-emails", "/settings"]);
const MANAGER_NAV = new Set(["/", "/organizations", "/campaigns", "/donations", "/community-campaigns", "/volunteers", "/transactions"]);
const STAFF_NAV = new Set(["/", "/organizations", "/campaigns", "/donations", "/volunteers"]);

const ADMIN_ROUTES = new Set([
  "/", "/users", "/organizations", "/organizations/:id", "/campaigns", "/campaigns/:id",
  "/donations", "/donors/:email", "/community-campaigns", "/community-campaigns/:id",
  "/charity-requests", "/volunteers", "/subscriptions", "/transactions", "/fund-release", "/ledger",
  "/categories", "/education-partners", "/staff", "/admin-emails", "/settings",
]);
const MANAGER_ROUTES = new Set([
  "/", "/organizations", "/organizations/:id", "/campaigns", "/campaigns/:id",
  "/donations", "/donors/:email", "/community-campaigns", "/community-campaigns/:id",
  "/volunteers", "/transactions",
]);
const STAFF_ROUTES = new Set([
  "/", "/organizations", "/organizations/:id", "/campaigns", "/campaigns/:id",
  "/donations", "/donors/:email", "/volunteers",
]);

function navSetFor(role: AdminRole): Set<string> {
  if (role === "admin" || role === "super_admin") return ADMIN_NAV;
  if (role === "manager") return MANAGER_NAV;
  return STAFF_NAV;
}

function routeSetFor(role: AdminRole): Set<string> {
  if (role === "admin" || role === "super_admin") return ADMIN_ROUTES;
  if (role === "manager") return MANAGER_ROUTES;
  return STAFF_ROUTES;
}

/** Whether this nav URL is visible for the role (for sidebar). */
export function canAccessNav(role: AdminRole, url: string): boolean {
  return navSetFor(role).has(url);
}

/**
 * Strip a leading /admin *segment* only (e.g. /admin/users → /users).
 * Must not treat /admin-emails as /admin + emails — that broke RoleGuard redirects.
 */
export function normalizeAdminPathname(pathname: string): string {
  if (pathname === "/admin" || pathname === "/admin/") return "/";
  if (pathname.startsWith("/admin/")) {
    const rest = pathname.slice("/admin".length);
    return rest || "/";
  }
  return pathname;
}

/** Check if current pathname is allowed for role (for route guard). */
export function canAccessRoute(role: AdminRole, pathname: string): boolean {
  const path = normalizeAdminPathname(pathname) || "/";
  const allowed = routeSetFor(role);
  if (allowed.has(path)) return true;
  if (path.startsWith("/donors/")) return allowed.has("/donors/:email");
  if (path.startsWith("/organizations/")) return allowed.has("/organizations/:id");
  if (path.startsWith("/campaigns/") && path !== "/campaigns") return allowed.has("/campaigns/:id");
  if (path.startsWith("/community-campaigns/")) return allowed.has("/community-campaigns/:id");
  return false;
}

/** Only admin/super_admin can add, edit, remove staff and change roles. */
export function canManageStaff(role: AdminRole): boolean {
  return role === "admin" || role === "super_admin";
}
