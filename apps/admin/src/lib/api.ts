const API_URL = import.meta.env.VITE_API_URL || "";
const TOKEN_KEY = "gb_admin_api_token";

export function resolveImageUrl(url?: string | null): string {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  return `${API_URL.replace(/\/$/, "")}${url}`;
}

export function getApiToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setApiToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function hasApiConfig(): boolean {
  return true;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getApiToken();
  const url = `${API_URL.replace(/\/$/, "")}${path}`;
  const hasJsonBody = options.body !== undefined && options.body !== null;
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(hasJsonBody ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  if (res.status === 401) {
    setApiToken(null);
    localStorage.removeItem("gb_admin_auth");
    window.location.href = "/admin/login";
    throw new Error("Session expired. Please log in again.");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as Record<string, string>).error || res.statusText);
  }
  return res.json();
}

export async function loginViaApi(email: string, password: string) {
  const url = `${API_URL.replace(/\/$/, "")}/api/admin/login`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    throw new Error("Unable to reach server. Please try again.");
  }

  const body = (await res.json().catch(
    () =>
      ({} as {
        error?: string;
        success?: boolean;
        token?: string;
        role?: string;
        name?: string;
      })
  )) as {
    error?: string;
    success?: boolean;
    token?: string;
    role?: string;
    name?: string;
  };

  if (res.status === 400) {
    throw new Error(body.error || "Email and password are required.");
  }
  if (res.status === 401) {
    throw new Error("Incorrect email or password.");
  }
  if (res.status === 403) {
    throw new Error(body.error || "You do not have admin access.");
  }
  if (!res.ok) {
    throw new Error(body.error || "Login failed. Please try again.");
  }

  if (!body.success || !body.token) throw new Error("Login failed. Please try again.");

  setApiToken(body.token);
  return { token: body.token, role: body.role || "admin", name: body.name || email };
}

export interface QueryOptions {
  select?: string;
  filters?: Array<{ column: string; op: string; value: unknown }>;
  order?: { column: string; ascending?: boolean };
  limit?: number;
  offset?: number;
  orRaw?: string;
  single?: boolean;
  count?: "exact";
  head?: boolean;
}

export async function dbQuery<T = Record<string, unknown>>(
  table: string,
  opts?: QueryOptions
): Promise<{ data: T[]; count?: number }> {
  return request("/api/admin/db/query", {
    method: "POST",
    body: JSON.stringify({ table, ...opts }),
  });
}

export async function dbQuerySingle<T = Record<string, unknown>>(
  table: string,
  opts?: Omit<QueryOptions, "single">
): Promise<{ data: T | null }> {
  return request("/api/admin/db/query", {
    method: "POST",
    body: JSON.stringify({ table, ...opts, single: true }),
  });
}

export async function dbMutate(
  table: string,
  operation: string,
  data: Record<string, unknown>,
  filters?: Array<{ column: string; op: string; value: unknown }>
) {
  return request<{ success: boolean; data?: unknown }>("/api/admin/db/mutate", {
    method: "POST",
    body: JSON.stringify({ table, operation, data, filters }),
  });
}

export async function fetchLedger(params?: { page?: number; limit?: number; account_type?: string }) {
  const q = new URLSearchParams();
  if (params?.page) q.set("page", String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.account_type) q.set("account_type", params.account_type);
  return request<{ entries: Record<string, unknown>[]; total: number }>(`/api/admin/ledger?${q}`);
}

export async function fetchSubscriptions() {
  return request<{ subscriptions: Record<string, unknown>[] }>("/api/admin/subscriptions");
}

export async function adminCancelSubscription(id: string, immediate = false) {
  return request<{ success: boolean }>(`/api/admin/subscriptions/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
    body: JSON.stringify({ immediate }),
  });
}

export async function adminResumeSubscription(id: string) {
  return request<{ success: boolean }>(`/api/admin/subscriptions/${encodeURIComponent(id)}/resume`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function adminChangeSubscriptionTier(id: string, tier: "growth" | "institutional") {
  return request<{ success: boolean }>(`/api/admin/subscriptions/${encodeURIComponent(id)}/change-tier`, {
    method: "POST",
    body: JSON.stringify({ tier }),
  });
}

export async function adminBanSubscription(id: string, cancel_now = true) {
  return request<{ success: boolean }>(`/api/admin/subscriptions/${encodeURIComponent(id)}/ban`, {
    method: "POST",
    body: JSON.stringify({ cancel_now }),
  });
}

export interface EnrichedDonation {
  id: string;
  campaign_id: string | null;
  org_id: string | null;
  user_id: string | null;
  user_email: string | null;
  category_id: string | null;
  amount: string | number;
  currency: string;
  status: string;
  stripe_payment_intent_id: string | null;
  paid_at: string | null;
  created_at: string;
  donor_name: string | null;
  org_name: string | null;
  platform_fee: number;
  net_to_org: number;
  is_anonymous?: boolean;
}

export async function fetchDonations(params?: {
  page?: number; limit?: number; status?: string; search?: string;
  date_from?: string; date_to?: string;
}) {
  const q = new URLSearchParams();
  if (params?.page) q.set("page", String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.status) q.set("status", params.status);
  if (params?.search) q.set("search", params.search);
  if (params?.date_from) q.set("date_from", params.date_from);
  if (params?.date_to) q.set("date_to", params.date_to);
  return request<{
    donations: EnrichedDonation[];
    total: number; page: number; limit: number; totalPages: number;
  }>(`/api/admin/donations?${q}`);
}

export async function fetchCommunityCampaigns(params?: {
  page?: number; limit?: number; status?: string; verification_status?: string; search?: string;
}) {
  const q = new URLSearchParams();
  if (params?.page) q.set("page", String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.status) q.set("status", params.status);
  if (params?.verification_status) q.set("verification_status", params.verification_status);
  if (params?.search) q.set("search", params.search);
  return request<{ campaigns: Record<string, unknown>[]; total: number }>(`/api/admin/community-campaigns?${q}`);
}

export async function fetchCommunityCampaign(id: string) {
  return request<{
    campaign: Record<string, unknown>;
    updates: Record<string, unknown>[];
    donations: Record<string, unknown>[];
    reports: Record<string, unknown>[];
    creator: Record<string, unknown>;
  }>(`/api/admin/community-campaigns/${id}`);
}

export async function updateCommunityCampaignVerify(id: string, verified: boolean) {
  return request<{ success: boolean }>(`/api/admin/community-campaigns/${id}/verify`, {
    method: "PUT",
    body: JSON.stringify({ verified }),
  });
}

export async function setCommunityCampaignVerification(id: string, verification_status: string) {
  return request<{ success: boolean }>(`/api/admin/community-campaigns/${id}/verify`, {
    method: "PUT",
    body: JSON.stringify({ verification_status }),
  });
}

export async function updateCommunityCampaignStatus(id: string, status: string) {
  return request<{ success: boolean }>(`/api/admin/community-campaigns/${id}/status`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });
}

export async function updateCommunityReport(id: string, data: { status?: string; admin_notes?: string }) {
  return request<{ success: boolean }>(`/api/admin/community-campaign-reports/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function createCheckout(org_id: string, tier: string) {
  return request<{ url: string; sessionId: string }>("/api/subscriptions/create-checkout", {
    method: "POST",
    body: JSON.stringify({ org_id, tier }),
  });
}

export async function createPortalSession(org_id: string, return_url?: string) {
  return request<{ url: string }>("/api/subscriptions/create-portal-session", {
    method: "POST",
    body: JSON.stringify({ org_id, return_url }),
  });
}

export async function fetchCategories() {
  return request<{ categories: Array<{ id: string; name: string; icon: string; color: string; count: number; image_url?: string | null }> }>(
    "/api/admin/categories"
  );
}

export async function createCategory(body: { name: string; icon?: string; color?: string }) {
  return request<{ success: boolean; id: string }>("/api/admin/categories", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateCategory(id: string, body: { name?: string; icon?: string; color?: string }) {
  return request<{ success: boolean }>(`/api/admin/categories/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function deleteCategory(id: string) {
  return request<{ success: boolean }>(`/api/admin/categories/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function createStaff(body: { email: string; name: string; password: string; role: string }) {
  return request<{ success: boolean }>("/api/admin/staff", { method: "POST", body: JSON.stringify(body) });
}

export async function updateStaff(targetEmail: string, body: { name?: string; email?: string; password?: string; role?: string }) {
  return request<{ success: boolean }>("/api/admin/staff", {
    method: "PUT",
    body: JSON.stringify({ targetEmail, ...body }),
  });
}

export async function deleteStaff(email: string) {
  return request<{ success: boolean }>(`/api/admin/staff?email=${encodeURIComponent(email)}`, { method: "DELETE" });
}

export async function approveCharityRequest(id: string, notes: string) {
  return request<{ success: boolean; org_id?: string }>("/api/admin/charity-requests/approve", {
    method: "POST",
    body: JSON.stringify({ id, admin_notes: notes }),
  });
}

export async function rejectCharityRequest(id: string, reason: string) {
  return request<{ success: boolean }>("/api/admin/charity-requests/reject", {
    method: "POST",
    body: JSON.stringify({ id, rejection_reason: reason }),
  });
}

export interface AdminEmailRow {
  id: string;
  email: string;
  created_at: string;
}

export interface AdminEmailsResponse {
  emails: AdminEmailRow[];
  mainAdminEmail: string | null;
}

export async function getAdminEmails(): Promise<AdminEmailsResponse> {
  const res = await request<{ emails: AdminEmailRow[]; mainAdminEmail?: string | null }>("/api/admin/admin-emails");
  return { emails: res.emails || [], mainAdminEmail: res.mainAdminEmail ?? null };
}

export async function addAdminEmail(email: string): Promise<AdminEmailRow[]> {
  const res = await request<{ success: boolean; emails: AdminEmailRow[] }>("/api/admin/admin-emails", {
    method: "POST",
    body: JSON.stringify({ email: email.trim() }),
  });
  return res.emails || [];
}

export async function deleteAdminEmail(email: string): Promise<AdminEmailRow[]> {
  const res = await request<{ success: boolean; emails: AdminEmailRow[] }>(
    `/api/admin/admin-emails/${encodeURIComponent(email)}`,
    { method: "DELETE" }
  );
  return res.emails || [];
}

export async function sendTestAdminEmail(email: string): Promise<void> {
  await request<{ success: boolean; message?: string }>("/api/admin/admin-emails/send-test", {
    method: "POST",
    body: JSON.stringify({ email: email.trim() }),
  });
}

export async function sendTestToAllAdminEmails(): Promise<{ sent: number; failed: number; total: number }> {
  const res = await request<{ success: boolean; sent: number; failed: number; total: number }>(
    "/api/admin/admin-emails/send-test-all",
    { method: "POST" }
  );
  return { sent: res.sent, failed: res.failed, total: res.total };
}

export async function invokeFunction<T = unknown>(name: string, body: unknown = {}): Promise<T> {
  const res = await request<{ data: T; error: unknown }>(
    `/api/admin/functions/${encodeURIComponent(name)}`,
    { method: "POST", body: JSON.stringify(body) }
  );
  if (res.error) {
    const msg = typeof res.error === "object" && res.error !== null && "message" in res.error
      ? String((res.error as Record<string, unknown>).message)
      : String(res.error);
    throw new Error(msg);
  }
  return res.data;
}

export async function uploadFile(file: File): Promise<string> {
  const token = getApiToken();
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_URL.replace(/\/$/, "")}/api/admin/storage/upload`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!res.ok) throw new Error("Upload failed");
  const result = await res.json() as { data?: { publicUrl?: string; path?: string } };
  return result.data?.publicUrl || result.data?.path || "";
}

interface ConnectStatus { connected: boolean; accountId: string | null; charges_enabled?: boolean; payouts_enabled?: boolean; details_submitted?: boolean }
interface ConnectCreate { url: string; accountId: string }

export async function checkConnectStatus(orgId: string): Promise<ConnectStatus> {
  return invokeFunction<ConnectStatus>("check-connect-status", { orgId });
}

export async function createConnectAccount(orgId: string): Promise<ConnectCreate> {
  return invokeFunction<ConnectCreate>("create-connect-account", { orgId });
}
