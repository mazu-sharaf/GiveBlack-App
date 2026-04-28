import { db } from "../lib/db.js";

export type AdminPermissionKey =
  | "canManageUsers"
  | "canChangeRoles"
  | "canAccessSettings"
  | "canManagePayments";

export type AdminPermissionMap = Record<AdminPermissionKey, boolean>;

const ALL_TRUE: AdminPermissionMap = {
  canManageUsers: true,
  canChangeRoles: true,
  canAccessSettings: true,
  canManagePayments: true,
};

export function baseAdminPermissionsForRole(role: string): AdminPermissionMap {
  const r = String(role || "").toLowerCase();
  if (r === "admin" || r === "super_admin") return { ...ALL_TRUE };
  if (r === "manager") {
    return {
      canManageUsers: false,
      canChangeRoles: false,
      canAccessSettings: false,
      canManagePayments: false,
    };
  }
  // staff + unknown: minimal
  return {
    canManageUsers: false,
    canChangeRoles: false,
    canAccessSettings: false,
    canManagePayments: false,
  };
}

function mergeOverrides(base: AdminPermissionMap, overrides: unknown): AdminPermissionMap {
  if (!overrides || typeof overrides !== "object") return base;
  const o = overrides as Record<string, unknown>;
  const out: AdminPermissionMap = { ...base };
  for (const k of Object.keys(ALL_TRUE) as AdminPermissionKey[]) {
    if (typeof o[k] === "boolean") out[k] = o[k] as boolean;
  }
  return out;
}

export async function getEffectiveAdminPermissions(userId: string): Promise<AdminPermissionMap> {
  const res = await db.query("select role, admin_permissions from users where id = $1 limit 1", [userId]);
  const row = res.rows[0] as { role?: string; admin_permissions?: unknown } | undefined;
  const base = baseAdminPermissionsForRole(row?.role || "");
  return mergeOverrides(base, row?.admin_permissions);
}

