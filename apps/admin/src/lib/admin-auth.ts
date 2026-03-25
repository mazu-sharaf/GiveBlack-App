export type AdminRole = "admin" | "super_admin" | "manager" | "staff";

const AUTH_KEY = "gb_admin_auth";
const ROLE_KEY = "gb_admin_role";
const NAME_KEY = "gb_admin_name";
const EMAIL_KEY = "gb_admin_email";

export const isAuthenticated = (): boolean => localStorage.getItem(AUTH_KEY) === "true";
export const getCurrentRole = (): AdminRole => (localStorage.getItem(ROLE_KEY) as AdminRole) || "staff";
export const getCurrentName = (): string => localStorage.getItem(NAME_KEY) || "";
export const getCurrentEmail = (): string => localStorage.getItem(EMAIL_KEY) || "";

export const setAuthenticatedFromApi = (email: string, role: AdminRole = "admin", name: string = "Admin"): void => {
  localStorage.setItem(AUTH_KEY, "true");
  localStorage.setItem(ROLE_KEY, role);
  localStorage.setItem(NAME_KEY, name);
  localStorage.setItem(EMAIL_KEY, email);
};

export const logout = () => {
  localStorage.removeItem(AUTH_KEY);
  localStorage.removeItem(ROLE_KEY);
  localStorage.removeItem(NAME_KEY);
  localStorage.removeItem(EMAIL_KEY);
  localStorage.removeItem("gb_admin_api_token");
};

export const canManageSettings = (role: AdminRole) => role === "admin";
export const canManageCampaigns = (role: AdminRole) => role === "admin" || role === "manager";
