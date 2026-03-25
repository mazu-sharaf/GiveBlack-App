export type UserRole = "super_admin" | "admin" | "charity_owner" | "donor";

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

export interface AuthLoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface RealtimeMessage<T = Record<string, unknown>> {
  channel: "donation_updates" | "campaign_updates" | "admin_alerts";
  event: string;
  payload: T;
  ts: string;
}
