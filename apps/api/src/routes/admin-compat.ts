import type { FastifyPluginAsync } from "fastify";
import path from "node:path";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db.js";
import { broadcastChannel } from "../realtime/hub.js";
import { env } from "../config/env.js";
import { getStripe } from "../services/stripe.js";
import { stripeId } from "../lib/stripe-ids.js";
import { maybeNotifyOrgSubscriptionPlanUpgrade } from "../services/user-push.js";

const TABLES = new Set([
  "organizations",
  "categories",
  "campaigns",
  "campaign_images",
  "education_partners",
  "donations",
  "volunteers",
  "transactions",
  "donation_splits",
  "charity_requests",
  "community_campaigns",
  "community_campaign_updates",
  "community_campaign_donations",
  "community_campaign_reports",
  "profiles",
  "app_settings",
  "org_subscriptions",
  "ledger_entries",
  "staff_accounts",
  "users"
]);

function assertTable(table: string): string {
  if (!TABLES.has(table)) throw new Error(`Table not allowed: ${table}`);
  return table;
}

function assertColumn(column: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(column)) throw new Error(`Invalid column: ${column}`);
  return column;
}

const SENSITIVE_COLUMNS = new Set(["password_hash"]);

const MAX_ADMIN_EMAILS = 5;
const ADMIN_SUBSCRIPTION_TIERS = new Set(["growth", "institutional"]);

function adminTierFromProductId(productId: string | null | undefined): string {
  if (!productId) return "free";
  if (productId === env.STRIPE_PRODUCT_GROWTH) return "growth";
  if (productId === env.STRIPE_PRODUCT_INSTITUTIONAL) return "institutional";
  return "free";
}

function adminTierForStatus(status: string, paidTier: string): string {
  if (status === "active" || status === "trialing") return paidTier;
  return "free";
}

function adminPriceIdForTier(tier: string): string {
  if (tier === "growth") return env.STRIPE_PRICE_GROWTH;
  if (tier === "institutional") return env.STRIPE_PRICE_INSTITUTIONAL;
  throw new Error(`No price configured for tier ${tier}`);
}

function normalizeStripeAdminError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const msg = error.message || fallback;
  if (msg.includes("invalid-canceled-subscription-fields")) {
    return "This Stripe subscription is already canceled. Create a new subscription instead.";
  }
  if (msg.toLowerCase().includes("canceled subscription")) {
    return "This Stripe subscription is already canceled. Create a new subscription instead.";
  }
  return msg;
}

async function upsertOrgSubscriptionFromStripe(
  subscription: Record<string, unknown>,
  fallbackOrgId?: string
): Promise<{
  orgId: string;
  tier: string;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  subscriptionId: string;
}> {
  const metadata = (subscription.metadata || {}) as Record<string, string>;
  const orgId = metadata.org_id || fallbackOrgId;
  if (!orgId) throw new Error("Missing organization id for subscription");

  const items = subscription.items as { data?: Array<{ price?: { product?: string } }> } | undefined;
  const productId = items?.data?.[0]?.price?.product as string | undefined;
  const resolvedTier = metadata.tier || adminTierFromProductId(productId);
  const status = String(subscription.status || "incomplete");
  const effectiveTier = adminTierForStatus(status, resolvedTier);
  const customerId = String(subscription.customer || "");
  const subscriptionId = String(subscription.id || "");
  const periodStart = subscription.current_period_start
    ? new Date(Number(subscription.current_period_start) * 1000).toISOString()
    : null;
  const periodEnd = subscription.current_period_end
    ? new Date(Number(subscription.current_period_end) * 1000).toISOString()
    : null;
  const cancelAtPeriodEnd = Boolean(subscription.cancel_at_period_end);
  const canceledAt = subscription.canceled_at
    ? new Date(Number(subscription.canceled_at) * 1000).toISOString()
    : null;

  let previousTier: string | null | undefined;
  let previousStatus: string | null | undefined;
  if (subscriptionId) {
    const prevRes = await db.query(
      `select tier, status from org_subscriptions where stripe_subscription_id = $1 limit 1`,
      [subscriptionId]
    );
    const prow = prevRes.rows[0] as { tier?: string; status?: string } | undefined;
    previousTier = prow?.tier;
    previousStatus = prow?.status;
  }

  await db.query(
    `insert into org_subscriptions (org_id, tier, status, stripe_customer_id, stripe_subscription_id, current_period_start, current_period_end, cancel_at_period_end, canceled_at, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
     on conflict (stripe_subscription_id) do update set
       tier = excluded.tier,
       status = excluded.status,
       stripe_customer_id = excluded.stripe_customer_id,
       current_period_start = excluded.current_period_start,
       current_period_end = excluded.current_period_end,
       cancel_at_period_end = excluded.cancel_at_period_end,
       canceled_at = excluded.canceled_at,
       updated_at = now()`,
    [orgId, effectiveTier, status, customerId || null, subscriptionId, periodStart, periodEnd, cancelAtPeriodEnd, canceledAt]
  );

  if (subscriptionId) {
    const afterRes = await db.query(
      `select tier, status, current_period_end from org_subscriptions where stripe_subscription_id = $1 limit 1`,
      [subscriptionId]
    );
    const after = afterRes.rows[0] as { tier?: string; status?: string; current_period_end?: string | null } | undefined;
    const periodEndIso = after?.current_period_end != null ? String(after.current_period_end) : null;
    void maybeNotifyOrgSubscriptionPlanUpgrade({
      orgId,
      stripeSubscriptionId: subscriptionId,
      previousTier,
      newTier: after?.tier ?? effectiveTier,
      previousStatus,
      newStatus: after?.status ?? status,
      currentPeriodEndIso: periodEndIso,
    }).catch((err) => {
      console.warn("[admin-compat] subscription upgrade notify failed", err);
    });
  }

  return {
    orgId,
    tier: effectiveTier,
    status,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd,
    subscriptionId
  };
}

async function getAdminBccEmails(): Promise<Array<{ email: string }>> {
  const list: Array<{ email: string }> = [];
  if (env.ADMIN_EMAIL) list.push({ email: env.ADMIN_EMAIL });
  const rows = await db.query("select email from admin_emails order by created_at asc");
  for (const row of rows.rows as { email: string }[]) {
    const e = row?.email?.trim?.();
    if (e && !list.some((x) => x.email.toLowerCase() === e.toLowerCase())) list.push({ email: e });
  }
  return list;
}

function assertSafeSelect(table: string, selectCols: string, role: string): void {
  if (table !== "users") return;
  if (selectCols === "*" && !["admin", "super_admin"].includes(role)) {
    throw new Error("Restricted: staff/manager cannot select * from users");
  }
  const cols = selectCols.split(",").map((c) => c.trim().replace(/^[a-z_]+\./i, "").split(/\s+/)[0]);
  for (const col of cols) {
    if (SENSITIVE_COLUMNS.has(col)) {
      throw new Error(`Restricted: column ${col} is not accessible`);
    }
  }
}

export const adminCompatRoutes: FastifyPluginAsync = async (app) => {
  app.post("/api/admin/login", async (request, reply) => {
    const body = (request.body ?? {}) as { email?: string; password?: string };
    if (!body.email || !body.password) return reply.code(400).send({ error: "email and password required" });

    const user = await db.query(
      "select id, email, role, password_hash, full_name from users where email = $1 limit 1",
      [body.email.toLowerCase()]
    );
    if (!user.rowCount) return reply.code(401).send({ error: "Invalid credentials" });
    const row = user.rows[0] as { id: string; email: string; role: string; password_hash: string };
    const bcrypt = await import("bcryptjs");
    const ok = await bcrypt.default.compare(body.password, row.password_hash);
    if (!ok) return reply.code(401).send({ error: "Invalid credentials" });
    if (!["admin", "super_admin", "manager", "staff"].includes(row.role)) {
      return reply.code(403).send({ error: "Admin panel access required" });
    }
    const fullName = (row as Record<string, unknown>).full_name as string | null;
    const token = app.jwt.sign({ role: row.role, email: row.email }, { sub: row.id, expiresIn: "12h" });
    return { success: true, token, role: row.role, name: fullName || row.email };
  });

  app.post(
    "/api/admin/db/query",
    { preHandler: [app.authenticate, app.requireRole("admin", "super_admin", "manager", "staff")] },
    async (request, reply) => {
      try {
        const body = (request.body ?? {}) as {
          table: string;
          select?: string;
          filters?: Array<{ column: string; op: "eq" | "ilike"; value: unknown }>;
          order?: { column: string; ascending?: boolean };
          limit?: number;
          offset?: number;
          single?: boolean;
          count?: "exact";
          head?: boolean;
          orRaw?: string;
        };
        const table = assertTable(body.table);
        const baseAlias = table === "community_campaigns" ? "cc" : null;
        const values: unknown[] = [];
        const where: string[] = [];
        for (const f of body.filters ?? []) {
          const col = assertColumn(f.column);
          values.push(f.value);
          const idx = values.length;
          const ref = baseAlias ? `${baseAlias}.${col}` : col;
          if (f.op === "ilike") where.push(`${ref} ilike $${idx}`);
          else where.push(`${ref} = $${idx}`);
        }
        if (body.orRaw) {
          const pieces = String(body.orRaw)
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          const orParts: string[] = [];
          for (const piece of pieces) {
            const match = /^([a-zA-Z_][a-zA-Z0-9_]*)\.ilike\.\%(.*)\%$/.exec(piece);
            if (!match) continue;
            const [, col, needle] = match;
            assertColumn(col);
            values.push(`%${needle}%`);
            const ref = baseAlias ? `${baseAlias}.${col}` : col;
            orParts.push(`${ref} ilike $${values.length}`);
          }
          if (orParts.length) where.push(`(${orParts.join(" or ")})`);
        }
        const userRole = (request.user as { role?: string })?.role || "";
        let selectCols = "*";
        if (body.select && body.select.trim().length && body.select.trim() !== "*") {
          const parts = body.select.split(",").map((s) => s.trim()).filter(Boolean);
          const validatedParts: string[] = [];
          for (const part of parts) {
            if (part.includes("(")) continue;
            const cleaned = part.replace(/^[a-z_]+\./i, "");
            if (/^[a-zA-Z_][a-zA-Z0-9_]*(\s+as\s+[a-zA-Z_][a-zA-Z0-9_]*)?$/i.test(cleaned)) {
              validatedParts.push(part);
            }
          }
          selectCols = validatedParts.length ? validatedParts.join(", ") : "*";
        }
        assertSafeSelect(table, selectCols, userRole);
        let sql = `select ${selectCols} from ${table}`;
        const wantsCommunityCategory =
          table === "community_campaigns" &&
          typeof body.select === "string" &&
          body.select.includes("community_campaign_categories(name)");
        if (wantsCommunityCategory) {
          sql = `select cc.*, jsonb_build_object('name', cat.name) as community_campaign_categories
                 from community_campaigns cc
                 left join categories cat on cat.id = cc.category_id`;
        }
        if (where.length) sql += ` where ${where.join(" and ")}`;
        if (body.order) {
          const col = assertColumn(body.order.column);
          const ref = baseAlias ? `${baseAlias}.${col}` : col;
          sql += ` order by ${ref} ${body.order.ascending === false ? "desc" : "asc"}`;
        }
        if (body.limit && Number.isFinite(body.limit)) {
          sql += ` limit ${Math.max(1, Math.min(body.limit, 1000))}`;
        }
        if (body.offset && Number.isFinite(body.offset)) {
          sql += ` offset ${Math.max(0, body.offset)}`;
        }

        const result = await db.query(sql, values);
        let count: number | null = null;
        if (body.count === "exact") {
          const countFrom = baseAlias ? `${table} ${baseAlias}` : table;
          const countSql = `select count(*)::int as c from ${countFrom}${where.length ? ` where ${where.join(" and ")}` : ""}`;
          const countRes = await db.query(countSql, values);
          count = Number(countRes.rows[0]?.c ?? 0);
        }
        if (body.head) {
          return { data: null, error: null, count };
        }
        const data = body.single ? result.rows[0] ?? null : result.rows;
        return { data, error: null, count };
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Query failed";
        return reply.code(400).send({ data: null, error: { message: msg }, count: null });
      }
    }
  );

  app.post(
    "/api/admin/db/mutate",
    { preHandler: [app.authenticate, app.requireRole("admin", "super_admin", "manager")] },
    async (request, reply) => {
      try {
        const body = (request.body ?? {}) as {
          table: string;
          operation: "insert" | "update" | "delete" | "upsert";
          data?: Record<string, unknown> | Record<string, unknown>[];
          filters?: Array<{ column: string; op: "eq"; value: unknown }>;
          single?: boolean;
          returning?: boolean;
          onConflict?: string;
        };
        const table = assertTable(body.table);
        const userRole = (request.user as { role?: string })?.role || "";
        const isAdmin = ["admin", "super_admin"].includes(userRole);

        const ADMIN_ONLY_TABLES = new Set(["users", "staff_accounts", "app_settings", "education_partners"]);
        if (ADMIN_ONLY_TABLES.has(table) && !isAdmin) {
          return reply.code(403).send({ data: null, error: { message: `Only admins can modify ${table}` } });
        }

        if (table === "users") {
          if (body.operation === "delete") {
            return reply.code(403).send({ data: null, error: { message: "Use /api/admin/staff endpoint to delete users" } });
          }
          const rowData = (body.data ?? {}) as Record<string, unknown>;
          const BLOCKED_USER_COLS = new Set(["password_hash", "email"]);
          for (const col of Object.keys(rowData)) {
            if (BLOCKED_USER_COLS.has(col)) {
              return reply.code(403).send({ data: null, error: { message: `Cannot modify ${col} via this endpoint` } });
            }
          }
          if (rowData.role !== undefined) {
            if (["admin", "super_admin"].includes(String(rowData.role))) {
              return reply.code(403).send({ data: null, error: { message: "Cannot assign admin/super_admin via this endpoint" } });
            }
          }
        }
        const filters = body.filters ?? [];
        const filterParts: string[] = [];
        const values: unknown[] = [];
        for (const f of filters) {
          const col = assertColumn(f.column);
          values.push(f.value);
          filterParts.push(`${col} = $${values.length}`);
        }
        let sql = "";
        if (body.operation === "upsert") {
          const rows = Array.isArray(body.data) ? body.data : [body.data ?? {}];
          if (!rows.length) throw new Error("Missing upsert data");
          const first = rows[0];
          const columns = Object.keys(first).map(assertColumn);
          if (!columns.length) throw new Error("Upsert row is empty");
          const placeholders: string[] = [];
          for (const row of rows) {
            const rowObj = row as Record<string, unknown>;
            const p = columns.map((c) => {
              values.push(rowObj[c] ?? null);
              return `$${values.length}`;
            });
            placeholders.push(`(${p.join(",")})`);
          }
          const conflictCol = body.onConflict ? assertColumn(body.onConflict) : columns[0];
          const updateSets = columns
            .filter((c) => c !== conflictCol)
            .map((c) => `${c} = excluded.${c}`)
            .join(", ");
          sql = `insert into ${table} (${columns.join(",")}) values ${placeholders.join(",")}`;
          if (updateSets) {
            sql += ` on conflict (${conflictCol}) do update set ${updateSets}`;
          } else {
            sql += ` on conflict (${conflictCol}) do nothing`;
          }
        } else if (body.operation === "insert") {
          const rows = Array.isArray(body.data) ? body.data : [body.data ?? {}];
          if (!rows.length) throw new Error("Missing insert data");
          const first = rows[0];
          const columns = Object.keys(first).map(assertColumn);
          if (!columns.length) throw new Error("Insert row is empty");
          const placeholders: string[] = [];
          for (const row of rows) {
            const rowObj = row as Record<string, unknown>;
            const p = columns.map((c) => {
              values.push(rowObj[c] ?? null);
              return `$${values.length}`;
            });
            placeholders.push(`(${p.join(",")})`);
          }
          sql = `insert into ${table} (${columns.join(",")}) values ${placeholders.join(",")}`;
        } else if (body.operation === "update") {
          const row = (body.data ?? {}) as Record<string, unknown>;
          const columns = Object.keys(row).map(assertColumn);
          if (!columns.length) throw new Error("Update data is empty");
          const sets = columns.map((c) => {
            values.push(row[c] ?? null);
            return `${c} = $${values.length}`;
          });
          sql = `update ${table} set ${sets.join(", ")}`;
          if (filterParts.length) sql += ` where ${filterParts.join(" and ")}`;
        } else {
          sql = `delete from ${table}`;
          if (filterParts.length) sql += ` where ${filterParts.join(" and ")}`;
        }

        let prevCampaign: { id: string; status: string; organization_id: string; title: string } | null = null;
        if (table === "campaigns" && body.operation === "update") {
          const idFilter = filters.find((f) => f.column === "id" && f.op === "eq");
          if (idFilter?.value != null && String(idFilter.value).length > 0) {
            const prevRes = await db.query(
              `select id, status, organization_id, title from campaigns where id = $1`,
              [idFilter.value]
            );
            const pr = prevRes.rows[0] as
              | { id: string; status: string; organization_id: string; title: string }
              | undefined;
            if (pr) prevCampaign = pr;
          }
        }

        if (body.returning) sql += " returning *";
        const result = await db.query(sql, values);

        if (table === "campaigns" && body.operation === "update" && prevCampaign) {
          const rowData = (Array.isArray(body.data) ? body.data[0] : body.data) as Record<string, unknown> | undefined;
          const newStatus =
            rowData && rowData.status !== undefined ? String(rowData.status) : undefined;
          if (prevCampaign.status === "pending_review" && newStatus === "active") {
            const { notifyCampaignWentLive } = await import("../services/user-push.js");
            void notifyCampaignWentLive({
              campaignId: prevCampaign.id,
              orgId: prevCampaign.organization_id,
              title: prevCampaign.title,
            }).catch((err) => console.error("[admin] notifyCampaignWentLive", err));
          } else if (prevCampaign.status === "pending_review" && newStatus && newStatus !== "active") {
            const { notifyCampaignReviewOutcome } = await import("../services/user-push.js");
            void notifyCampaignReviewOutcome({
              campaignId: prevCampaign.id,
              orgId: prevCampaign.organization_id,
              title: prevCampaign.title,
              newStatus,
            }).catch((err) => console.error("[admin] notifyCampaignReviewOutcome", err));
          }
        }

        if (table === "organizations" || table === "campaigns") {
          broadcastChannel("campaign_updates", "campaign.changed", {
            table,
            operation: body.operation
          });
        }

        return {
          data: body.returning ? (body.single ? result.rows[0] ?? null : result.rows) : null,
          error: null
        };
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Mutation failed";
        return reply.code(400).send({ data: null, error: { message: msg } });
      }
    }
  );

  app.get(
    "/api/admin/ledger",
    { preHandler: [app.authenticate, app.requireRole("admin", "super_admin")] },
    async (request) => {
      const q = request.query as Record<string, string>;
      const page = Math.max(1, parseInt(q.page || "1", 10));
      const limit = Math.min(100, Math.max(1, parseInt(q.limit || "50", 10)));
      const offset = (page - 1) * limit;
      const values: unknown[] = [];
      const where: string[] = [];
      if (q.account_type) {
        values.push(q.account_type);
        where.push(`account_type = $${values.length}`);
      }
      const w = where.length ? `where ${where.join(" and ")}` : "";
      const countRes = await db.query(`select count(*)::int as c from ledger_entries ${w}`, values);
      const total = Number(countRes.rows[0]?.c ?? 0);
      const result = await db.query(
        `select * from ledger_entries ${w} order by created_at desc limit $${values.length + 1} offset $${values.length + 2}`,
        [...values, limit, offset]
      );
      const sumRes = await db.query(
        `select account_type, coalesce(sum(amount), 0)::numeric as total from ledger_entries group by account_type`
      );
      const summary: Record<string, number> = { platform: 0, org: 0, endowment: 0, ecosystem: 0 };
      for (const row of sumRes.rows) {
        const acct = String(row.account_type || "");
        if (acct in summary) summary[acct] = Number(row.total || 0);
      }
      return { entries: result.rows, total, page, limit, totalPages: Math.ceil(total / limit), summary };
    }
  );

  app.get(
    "/api/admin/subscriptions",
    { preHandler: [app.authenticate, app.requireRole("admin", "super_admin")] },
    async () => {
      const result = await db.query(
        `select distinct on (s.org_id) s.*,
                o.name as org_name,
                o.contact_email as org_contact_email
         from org_subscriptions s
         left join organizations o on o.id = s.org_id
         order by
           s.org_id,
           case when s.status = 'active' then 0 else 1 end,
           s.created_at desc`
      );
      const subscriptions = result.rows.map((row: Record<string, unknown>) => ({
        ...row,
        org: row.org_name ? { name: row.org_name as string, contact_email: row.org_contact_email as string } : null,
      }));
      return { subscriptions };
    }
  );

  // Manual subscription entitlement controls for the admin panel.
  // Admin decides when subscriptions become active/inactive. Stripe lifecycle events should not auto-expire entitlements.
  app.post(
    "/api/admin/subscriptions/:id/add",
    { preHandler: [app.authenticate, app.requireRole("admin", "super_admin")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = (request.body ?? {}) as { tier?: string };
      const tier = String(body.tier || "").toLowerCase();

      if (!ADMIN_SUBSCRIPTION_TIERS.has(tier)) {
        return reply.code(400).send({ error: "tier must be growth or institutional" });
      }

      const subRes = await db.query(`select * from org_subscriptions where id = $1 limit 1`, [id]);
      const sub = subRes.rows[0] as Record<string, unknown> | undefined;
      if (!sub) return reply.code(404).send({ error: "Subscription not found" });

      await db.query(
        `update org_subscriptions
         set tier = $2,
             status = 'active',
             cancel_at_period_end = false,
             canceled_at = null,
             current_period_end = null,
             updated_at = now()
         where id = $1`,
        [id, tier]
      );

      return { success: true };
    }
  );

  app.post(
    "/api/admin/subscriptions/:id/remove",
    { preHandler: [app.authenticate, app.requireRole("admin", "super_admin")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const subRes = await db.query(`select * from org_subscriptions where id = $1 limit 1`, [id]);
      const sub = subRes.rows[0] as Record<string, unknown> | undefined;
      if (!sub) return reply.code(404).send({ error: "Subscription not found" });

      await db.query(
        `update org_subscriptions
         set tier = 'free',
             status = 'canceled',
             cancel_at_period_end = false,
             canceled_at = now(),
             current_period_end = null,
             updated_at = now()
         where id = $1`,
        [id]
      );

      return { success: true };
    }
  );

  app.post(
    "/api/admin/subscriptions/org/:orgId/add",
    { preHandler: [app.authenticate, app.requireRole("admin", "super_admin")] },
    async (request, reply) => {
      const { orgId } = request.params as { orgId: string };
      const body = (request.body ?? {}) as { tier?: string };
      const tier = String(body.tier || "").toLowerCase();
      if (!ADMIN_SUBSCRIPTION_TIERS.has(tier)) {
        return reply.code(400).send({ error: "tier must be growth or institutional" });
      }

      const orgRes = await db.query(`select id from organizations where id = $1 limit 1`, [orgId]);
      if (!orgRes.rowCount) return reply.code(404).send({ error: "Organization not found" });

      const latestRes = await db.query(
        `select id from org_subscriptions where org_id = $1 order by created_at desc limit 1`,
        [orgId]
      );
      const latestId = (latestRes.rows[0] as { id: string } | undefined)?.id;

      if (latestId) {
        await db.query(
          `update org_subscriptions
           set tier = $2,
               status = 'active',
               cancel_at_period_end = false,
               canceled_at = null,
               current_period_end = null,
               updated_at = now()
           where id = $1`,
          [latestId, tier]
        );
      } else {
        await db.query(
          `insert into org_subscriptions (id, org_id, tier, status, cancel_at_period_end, created_at, updated_at)
           values ($1, $2, $3, 'active', false, now(), now())`,
          [randomUUID(), orgId, tier]
        );
      }
      return { success: true };
    }
  );

  app.post(
    "/api/admin/subscriptions/org/:orgId/remove",
    { preHandler: [app.authenticate, app.requireRole("admin", "super_admin")] },
    async (request, reply) => {
      const { orgId } = request.params as { orgId: string };
      const orgRes = await db.query(`select id from organizations where id = $1 limit 1`, [orgId]);
      if (!orgRes.rowCount) return reply.code(404).send({ error: "Organization not found" });

      const latestRes = await db.query(
        `select id from org_subscriptions where org_id = $1 order by created_at desc limit 1`,
        [orgId]
      );
      const latestId = (latestRes.rows[0] as { id: string } | undefined)?.id;

      if (latestId) {
        await db.query(
          `update org_subscriptions
           set tier = 'free',
               status = 'canceled',
               cancel_at_period_end = false,
               canceled_at = now(),
               current_period_end = null,
               updated_at = now()
           where id = $1`,
          [latestId]
        );
      } else {
        await db.query(
          `insert into org_subscriptions (id, org_id, tier, status, cancel_at_period_end, canceled_at, created_at, updated_at)
           values ($1, $2, 'free', 'canceled', false, now(), now(), now())`,
          [randomUUID(), orgId]
        );
      }
      return { success: true };
    }
  );

  app.post(
    "/api/admin/subscriptions/:id/cancel",
    { preHandler: [app.authenticate, app.requireRole("admin", "super_admin")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = (request.body ?? {}) as { immediate?: boolean };
      const subRes = await db.query(`select * from org_subscriptions where id = $1 limit 1`, [id]);
      const sub = subRes.rows[0] as Record<string, unknown> | undefined;
      if (!sub) return reply.code(404).send({ error: "Subscription not found" });

      const stripeSubId = String(sub.stripe_subscription_id || "");
      const immediate = Boolean(body.immediate);
      if (stripeSubId && env.STRIPE_SECRET_KEY) {
        const stripe = getStripe();
        const updated = immediate
          ? await stripe.subscriptions.cancel(stripeSubId)
          : await stripe.subscriptions.update(stripeSubId, { cancel_at_period_end: true });
        const saved = await upsertOrgSubscriptionFromStripe(updated as unknown as Record<string, unknown>, String(sub.org_id || ""));
        return { success: true, subscription: saved };
      }

      await db.query(
        `update org_subscriptions
         set status = $2,
             cancel_at_period_end = $3,
             canceled_at = case when $2 = 'canceled' then now() else canceled_at end,
             updated_at = now()
         where id = $1`,
        [id, immediate ? "canceled" : String(sub.status || "active"), !immediate]
      );
      return { success: true };
    }
  );

  app.post(
    "/api/admin/subscriptions/:id/resume",
    { preHandler: [app.authenticate, app.requireRole("admin", "super_admin")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const subRes = await db.query(`select * from org_subscriptions where id = $1 limit 1`, [id]);
      const sub = subRes.rows[0] as Record<string, unknown> | undefined;
      if (!sub) return reply.code(404).send({ error: "Subscription not found" });

      const stripeSubId = String(sub.stripe_subscription_id || "");
      if (stripeSubId && env.STRIPE_SECRET_KEY) {
        try {
          const stripe = getStripe();
          const updated = await stripe.subscriptions.update(stripeSubId, { cancel_at_period_end: false });
          const saved = await upsertOrgSubscriptionFromStripe(updated as unknown as Record<string, unknown>, String(sub.org_id || ""));
          return { success: true, subscription: saved };
        } catch (error) {
          const friendly = normalizeStripeAdminError(error, "Failed to resume subscription");
          return reply.code(400).send({ error: friendly });
        }
      }

      await db.query(
        `update org_subscriptions set cancel_at_period_end = false, canceled_at = null, updated_at = now() where id = $1`,
        [id]
      );
      return { success: true };
    }
  );

  app.post(
    "/api/admin/subscriptions/:id/change-tier",
    { preHandler: [app.authenticate, app.requireRole("admin", "super_admin")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = (request.body ?? {}) as { tier?: string };
      const tier = String(body.tier || "").toLowerCase();
      if (!ADMIN_SUBSCRIPTION_TIERS.has(tier)) {
        return reply.code(400).send({ error: "tier must be growth or institutional" });
      }

      const subRes = await db.query(`select * from org_subscriptions where id = $1 limit 1`, [id]);
      const sub = subRes.rows[0] as Record<string, unknown> | undefined;
      if (!sub) return reply.code(404).send({ error: "Subscription not found" });

      const stripeSubId = String(sub.stripe_subscription_id || "");
      if (stripeSubId && env.STRIPE_SECRET_KEY) {
        try {
          const stripe = getStripe();
          const current = await stripe.subscriptions.retrieve(stripeSubId);
          const itemId = current.items.data[0]?.id;
          if (!itemId) return reply.code(400).send({ error: "Subscription item not found in Stripe" });
          const updated = await stripe.subscriptions.update(stripeSubId, {
            items: [{ id: itemId, price: adminPriceIdForTier(tier) }],
            metadata: { ...(current.metadata || {}), tier, org_id: String(sub.org_id || "") },
            proration_behavior: "create_prorations"
          });
          const saved = await upsertOrgSubscriptionFromStripe(updated as unknown as Record<string, unknown>, String(sub.org_id || ""));
          return { success: true, subscription: saved };
        } catch (error) {
          const friendly = normalizeStripeAdminError(error, "Failed to change subscription tier");
          return reply.code(400).send({ error: friendly });
        }
      }

      await db.query(`update org_subscriptions set tier = $2, updated_at = now() where id = $1`, [id, tier]);
      return { success: true };
    }
  );

  app.post(
    "/api/admin/subscriptions/:id/ban",
    { preHandler: [app.authenticate, app.requireRole("admin", "super_admin")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = (request.body ?? {}) as { cancel_now?: boolean };
      const subRes = await db.query(`select * from org_subscriptions where id = $1 limit 1`, [id]);
      const sub = subRes.rows[0] as Record<string, unknown> | undefined;
      if (!sub) return reply.code(404).send({ error: "Subscription not found" });

      const orgId = String(sub.org_id || "");
      const cancelNow = body.cancel_now !== false;
      let subscription: unknown = null;

      const stripeSubId = String(sub.stripe_subscription_id || "");
      if (cancelNow && stripeSubId && env.STRIPE_SECRET_KEY) {
        const stripe = getStripe();
        const canceled = await stripe.subscriptions.cancel(stripeSubId);
        subscription = await upsertOrgSubscriptionFromStripe(canceled as unknown as Record<string, unknown>, orgId);
      } else if (cancelNow) {
        await db.query(
          `update org_subscriptions set status = 'canceled', cancel_at_period_end = false, canceled_at = now(), updated_at = now() where id = $1`,
          [id]
        );
      }

      await db.query(`update organizations set archived_at = now(), updated_at = now() where id = $1`, [orgId]);
      const orgRes = await db.query(`select contact_email from organizations where id = $1 limit 1`, [orgId]);
      const orgEmail = String((orgRes.rows[0] as Record<string, unknown> | undefined)?.contact_email || "").trim().toLowerCase();
      if (orgEmail) {
        await db.query(`update users set disabled_at = now(), updated_at = now() where lower(trim(email)) = $1`, [orgEmail]);
      }
      await db.query(
        `update users
         set disabled_at = now(), updated_at = now()
         where id in (
           select cr.user_id
           from charity_requests cr
           where cr.status = 'approved'
             and lower(trim(coalesce(cr.contact_email, ''))) = $1
         )`,
        [orgEmail]
      );
      await db.query(
        `update user_sessions
         set revoked_at = now()
         where revoked_at is null
           and user_id in (
             select u.id
             from users u
             where u.disabled_at is not null
               and lower(trim(u.email)) = $1
           )`,
        [orgEmail]
      );

      return { success: true, subscription };
    }
  );

  app.get(
    "/api/admin/community-campaigns",
    { preHandler: [app.authenticate, app.requireRole("admin", "super_admin", "manager")] },
    async (request) => {
      const q = request.query as Record<string, string>;
      const page = Math.max(1, parseInt(q.page || "1", 10));
      const limit = Math.min(100, Math.max(1, parseInt(q.limit || "50", 10)));
      const offset = (page - 1) * limit;
      const values: unknown[] = [];
      const where: string[] = [];
      if (q.status) { values.push(q.status); where.push(`cc.status = $${values.length}`); }
      if (q.verification_status) { values.push(q.verification_status); where.push(`cc.verification_status = $${values.length}`); }
      if (q.category_id) { values.push(q.category_id); where.push(`cc.category_id = $${values.length}`); }
      if (q.search) { values.push(`%${q.search}%`); where.push(`(cc.title ilike $${values.length} or cc.description ilike $${values.length})`); }
      const w = where.length ? `where ${where.join(" and ")}` : "";
      const countRes = await db.query(`select count(*)::int as c from community_campaigns cc ${w}`, values);
      const total = Number(countRes.rows[0]?.c ?? 0);
      const result = await db.query(
        `select cc.*, cc.goal_amount as goal, cc.raised_amount as raised, u.full_name as creator_name, cat.name as category_name
         from community_campaigns cc
         left join users u on u.id = cc.creator_id
         left join categories cat on cat.id = cc.category_id
         ${w} order by cc.created_at desc limit $${values.length + 1} offset $${values.length + 2}`,
        [...values, limit, offset]
      );
      return { campaigns: result.rows, total, page, limit, totalPages: Math.ceil(total / limit) };
    }
  );

  app.get(
    "/api/admin/community-campaigns/:id",
    { preHandler: [app.authenticate, app.requireRole("admin", "super_admin", "manager")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const campRes = await db.query(
        `select cc.*, cc.goal_amount as goal, cc.raised_amount as raised, u.full_name as creator_name, u.email as creator_email
         from community_campaigns cc left join users u on u.id = cc.creator_id where cc.id = $1`,
        [id]
      );
      if (!campRes.rowCount) return reply.code(404).send({ error: "Not found" });
      const updates = await db.query(`select * from community_campaign_updates where campaign_id = $1 order by created_at desc`, [id]);
      const donations = await db.query(`select d.*, u.full_name as donor_name from community_campaign_donations d left join users u on u.id = d.user_id where d.campaign_id = $1 order by d.created_at desc`, [id]);
      const reports = await db.query(`select r.*, u.full_name as reporter_name from community_campaign_reports r left join users u on u.id = r.reporter_id where r.campaign_id = $1 order by r.created_at desc`, [id]);
      const camp = campRes.rows[0] as Record<string, unknown>;
      return {
        campaign: camp,
        updates: updates.rows,
        donations: donations.rows,
        reports: reports.rows,
        creator: { name: camp.creator_name, email: camp.creator_email }
      };
    }
  );

  app.put(
    "/api/admin/community-campaigns/:id/verify",
    { preHandler: [app.authenticate, app.requireRole("admin", "super_admin")] },
    async (request) => {
      const { id } = request.params as { id: string };
      const body = (request.body ?? {}) as { verified?: boolean; verification_status?: string };
      const allowed = ["pending", "verified", "flagged"];
      let status = "pending";
      if (body.verification_status && allowed.includes(body.verification_status)) {
        status = body.verification_status;
      } else if (body.verified !== undefined) {
        status = body.verified ? "verified" : "pending";
      }
      await db.query(
        `update community_campaigns set verification_status = $2 where id = $1`,
        [id, status]
      );
      return { success: true };
    }
  );

  app.put(
    "/api/admin/community-campaigns/:id/status",
    { preHandler: [app.authenticate, app.requireRole("admin", "super_admin")] },
    async (request) => {
      const { id } = request.params as { id: string };
      const body = (request.body ?? {}) as { status: string };
      await db.query(`update community_campaigns set status = $2 where id = $1`, [id, body.status]);
      return { success: true };
    }
  );

  app.put(
    "/api/admin/community-campaign-reports/:id",
    { preHandler: [app.authenticate, app.requireRole("admin", "super_admin")] },
    async (request) => {
      const { id } = request.params as { id: string };
      const body = (request.body ?? {}) as { status?: string; admin_notes?: string };
      const sets: string[] = [];
      const values: unknown[] = [];
      if (body.status !== undefined) { values.push(body.status); sets.push(`status = $${values.length}`); }
      if (body.admin_notes !== undefined) { values.push(body.admin_notes); sets.push(`admin_notes = $${values.length}`); }
      if (sets.length) {
        values.push(id);
        await db.query(`update community_campaign_reports set ${sets.join(", ")} where id = $${values.length}`, values);
      }
      return { success: true };
    }
  );

  app.get(
    "/api/admin/categories",
    { preHandler: [app.authenticate, app.requireRole("admin", "super_admin")] },
    async () => {
      const result = await db.query(
        `select c.id, c.name, c.icon, c.color, c.image_url,
                c.icon_bg_color, c.icon_border_color,
                coalesce(oc.cnt, 0)::int as count
         from categories c
         left join (
           select category_id, count(*)::int as cnt
           from organizations
           where archived_at is null and category_id is not null
           group by category_id
         ) oc on oc.category_id = c.id
         order by c.name`
      );
      return { categories: result.rows };
    }
  );

  app.post(
    "/api/admin/categories",
    { preHandler: [app.authenticate, app.requireRole("admin", "super_admin")] },
    async (request) => {
      const body = (request.body ?? {}) as {
        name: string;
        icon?: string;
        color?: string;
        image_url?: string | null;
        icon_bg_color?: string | null;
        icon_border_color?: string | null;
      };
      const id = `cat-${body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "")}`;
      await db.query(
        `insert into categories (id, name, icon, color, image_url, icon_bg_color, icon_border_color) values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          id,
          body.name,
          body.icon || null,
          body.color || null,
          body.image_url || null,
          body.icon_bg_color ?? null,
          body.icon_border_color ?? null,
        ]
      );
      return { success: true, id };
    }
  );

  app.put(
    "/api/admin/categories/:id",
    { preHandler: [app.authenticate, app.requireRole("admin", "super_admin")] },
    async (request) => {
      const { id } = request.params as { id: string };
      const body = (request.body ?? {}) as {
        name?: string;
        icon?: string;
        color?: string;
        image_url?: string | null;
        icon_bg_color?: string | null;
        icon_border_color?: string | null;
      };
      const sets: string[] = [];
      const values: unknown[] = [];
      if (body.name !== undefined) { values.push(body.name); sets.push(`name = $${values.length}`); }
      if (body.icon !== undefined) { values.push(body.icon); sets.push(`icon = $${values.length}`); }
      if (body.color !== undefined) { values.push(body.color); sets.push(`color = $${values.length}`); }
      if (body.image_url !== undefined) { values.push(body.image_url); sets.push(`image_url = $${values.length}`); }
      if (body.icon_bg_color !== undefined) { values.push(body.icon_bg_color); sets.push(`icon_bg_color = $${values.length}`); }
      if (body.icon_border_color !== undefined) { values.push(body.icon_border_color); sets.push(`icon_border_color = $${values.length}`); }
      if (sets.length) {
        values.push(id);
        await db.query(`update categories set ${sets.join(", ")} where id = $${values.length}`, values);
      }
      return { success: true };
    }
  );

  app.delete(
    "/api/admin/categories/:id",
    { preHandler: [app.authenticate, app.requireRole("admin", "super_admin")] },
    async (request) => {
      const { id } = request.params as { id: string };
      // Keep the UI promise: organizations using this category become uncategorized.
      // Without this, Postgres rejects the delete due to the FK constraint.
      await db.query(`update organizations set category_id = null where category_id = $1`, [id]);
      await db.query(`delete from categories where id = $1`, [id]);
      return { success: true };
    }
  );

  app.post(
    "/api/admin/staff",
    { preHandler: [app.authenticate, app.requireRole("admin", "super_admin")] },
    async (request, reply) => {
      const body = (request.body ?? {}) as { email: string; name: string; password: string; role: string };
      if (!body.email || !body.name || !body.password) {
        return reply.code(400).send({ error: "email, name, and password are required" });
      }
      if (!["admin", "manager", "staff"].includes(body.role || "")) {
        return reply.code(400).send({ error: "role must be admin, manager, or staff" });
      }
      const bcrypt = await import("bcryptjs");
      const hash = await bcrypt.default.hash(body.password, 12);
      try {
        await db.query(
          `insert into users (email, full_name, password_hash, role) values ($1, $2, $3, $4)`,
          [body.email.toLowerCase(), body.name, hash, body.role]
        );
        return { success: true };
      } catch (e: unknown) {
        const pgErr = e as { code?: string };
        if (pgErr.code === "23505") return reply.code(409).send({ error: "Email already exists" });
        return reply.code(500).send({ error: "Failed to create account" });
      }
    }
  );

  app.put(
    "/api/admin/staff",
    { preHandler: [app.authenticate, app.requireRole("admin", "super_admin")] },
    async (request, reply) => {
      const body = (request.body ?? {}) as { targetEmail: string; name?: string; email?: string; password?: string; role?: string };
      if (!body.targetEmail) return reply.code(400).send({ error: "targetEmail is required" });
      const sets: string[] = [];
      const values: unknown[] = [];
      if (body.name) { values.push(body.name); sets.push(`full_name = $${values.length}`); }
      if (body.email) { values.push(body.email.toLowerCase()); sets.push(`email = $${values.length}`); }
      if (body.role && ["admin", "manager", "staff"].includes(body.role)) { values.push(body.role); sets.push(`role = $${values.length}`); }
      if (body.password) {
        const bcrypt = await import("bcryptjs");
        const hash = await bcrypt.default.hash(body.password, 12);
        values.push(hash);
        sets.push(`password_hash = $${values.length}`);
      }
      if (!sets.length) return { success: true };
      values.push(body.targetEmail.toLowerCase());
      sets.push(`updated_at = now()`);
      await db.query(`update users set ${sets.join(", ")} where email = $${values.length}`, values);
      return { success: true };
    }
  );

  app.delete(
    "/api/admin/staff",
    { preHandler: [app.authenticate, app.requireRole("admin", "super_admin")] },
    async (request, reply) => {
      const email = (request.query as Record<string, string>)?.email;
      if (!email) return reply.code(400).send({ error: "email query parameter required" });
      const currentUser = request.user as { sub: string; email: string };
      if (email.toLowerCase() === currentUser.email?.toLowerCase()) {
        return reply.code(400).send({ error: "Cannot delete your own account" });
      }
      await db.query(`delete from users where email = $1`, [email.toLowerCase()]);
      return { success: true };
    }
  );

  app.get(
    "/api/admin/donations",
    { preHandler: [app.authenticate, app.requireRole("admin", "super_admin", "manager", "staff")] },
    async (request) => {
      const q = request.query as Record<string, string>;
      const page = Math.max(1, parseInt(q.page || "1", 10));
      const limit = Math.min(200, Math.max(1, parseInt(q.limit || "100", 10)));
      const offset = (page - 1) * limit;
      const values: unknown[] = [];
      const where: string[] = [];
      if (q.status) { values.push(q.status); where.push(`d.status = $${values.length}`); }
      if (q.search) {
        values.push(`%${q.search}%`);
        where.push(`(u.full_name ilike $${values.length} or d.user_email ilike $${values.length} or o.name ilike $${values.length})`);
      }
      if (q.date_from) { values.push(q.date_from); where.push(`d.created_at >= $${values.length}::timestamptz`); }
      if (q.date_to) { values.push(q.date_to + "T23:59:59Z"); where.push(`d.created_at <= $${values.length}::timestamptz`); }
      const w = where.length ? `where ${where.join(" and ")}` : "";
      const countRes = await db.query(
        `select count(*)::int as c from donations d left join users u on u.id = d.user_id left join organizations o on o.id = d.org_id ${w}`,
        values
      );
      const total = Number(countRes.rows[0]?.c ?? 0);
      const result = await db.query(
        `select d.*,
                case when d.is_anonymous then 'Anonymous Donor'
                     else coalesce(d.donor_name, u.full_name, 'Unknown')
                end as donor_name,
                coalesce(d.donor_email, u.email) as user_email,
                o.name as org_name,
                ep.name as education_partner_name,
                coalesce(ds.platform_fee, 0) as platform_fee,
                coalesce(ds.net_to_org, 0) as net_to_org
         from donations d
         left join users u on u.id = d.user_id
         left join organizations o on o.id = d.org_id
         left join education_partners ep on ep.id = d.education_partner_id
         left join donation_splits ds on ds.donation_id = d.id
         ${w} order by d.created_at desc
         limit $${values.length + 1} offset $${values.length + 2}`,
        [...values, limit, offset]
      );
      return { donations: result.rows, total, page, limit, totalPages: Math.ceil(total / limit) };
    }
  );

  app.post(
    "/api/admin/charity-requests/approve",
    { preHandler: [app.authenticate, app.requireRole("admin", "super_admin")] },
    async (request, reply) => {
      const body = (request.body ?? {}) as { id: string; admin_notes?: string };
      if (!body.id) return reply.code(400).send({ error: "id is required" });
      const reqRes = await db.query("select * from charity_requests where id = $1", [body.id]);
      if (!reqRes.rowCount) return reply.code(404).send({ error: "Request not found" });
      const req = reqRes.rows[0] as Record<string, unknown>;
      if (req.status !== "pending") return reply.code(400).send({ error: "Request is not pending" });
      const orgId = String(req.charity_name || "org")
        .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "")
        + "-" + Date.now().toString(36);
      await db.query("BEGIN");
      try {
        await db.query(
          `insert into organizations (id, name, description, contact_email, bank_name, account_holder_name, account_last4, routing_number)
           values ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            orgId,
            req.charity_name || "New Organization",
            req.description || "",
            req.contact_email || null,
            req.bank_name || null,
            req.account_holder_name || null,
            req.account_last4 || null,
            req.routing_number || null,
          ]
        );
        await db.query(
          `update charity_requests set status = 'approved', admin_notes = $2, reviewed_at = now() where id = $1`,
          [body.id, body.admin_notes || null]
        );
        await db.query("COMMIT");

        const contactEmail = req.contact_email as string | null;
        const charityName = req.charity_name as string || "your organization";
        if (contactEmail) {
          try {
            const { sendBrevoEmail } = await import("../services/brevo.js");
            const { emailLayout, ctaButton } = await import("../services/email-template.js");
            const appUrl = env.APP_URL || "https://giveblackapp.com";
            const content = `
              <h2 style="color:#ffffff;margin:0 0 8px 0;font-size:22px;">Application Approved</h2>
              <p style="color:#cccccc;margin:0 0 24px 0;font-size:16px;">Congratulations! <strong>${charityName}</strong> has been approved on GiveBlack.</p>
              <div style="background:#1a1a1a;border-radius:12px;padding:20px;margin-bottom:24px;">
                <p style="color:#cccccc;margin:0 0 12px 0;">You can now:</p>
                <ul style="color:#cccccc;padding-left:20px;margin:0;">
                  <li style="margin-bottom:8px;">Log in with your charity account</li>
                  <li style="margin-bottom:8px;">Create campaigns to raise funds</li>
                  <li style="margin-bottom:8px;">Manage your organization profile</li>
                  <li>Start receiving donations</li>
                </ul>
              </div>
              <div style="text-align:center;margin-bottom:24px;">${ctaButton(appUrl, "Log In Now")}</div>
            `;
            const bccList = await getAdminBccEmails();
            await sendBrevoEmail({
              to: contactEmail,
              subject: "Your GiveBlack Application Has Been Approved",
              bcc: bccList.length ? bccList : undefined,
              html: emailLayout(content),
              tags: ["giveblack", "charity-approved"],
            });
          } catch (emailErr) {
            app.log.error({ err: emailErr, email: contactEmail }, "Failed to send approval email");
          }
        }

        const applicantUserId = req.user_id as string | null | undefined;
        if (applicantUserId) {
          const { notifyCharityApplicationApproved } = await import("../services/user-push.js");
          void notifyCharityApplicationApproved(String(applicantUserId), charityName, orgId).catch((err) =>
            app.log.error({ err }, "notifyCharityApplicationApproved")
          );
        }

        return { success: true, org_id: orgId };
      } catch (e) {
        await db.query("ROLLBACK");
        throw e;
      }
    }
  );

  app.post(
    "/api/admin/charity-requests/reject",
    { preHandler: [app.authenticate, app.requireRole("admin", "super_admin")] },
    async (request, reply) => {
      const body = (request.body ?? {}) as { id: string; rejection_reason?: string };
      if (!body.id) return reply.code(400).send({ error: "id is required" });

      const reqRes = await db.query("select charity_name, contact_email, status from charity_requests where id = $1", [body.id]);
      const charityReq = reqRes.rows[0] as Record<string, unknown> | undefined;
      if (!charityReq) return reply.code(404).send({ error: "Request not found" });
      if (charityReq.status !== "pending") return reply.code(400).send({ error: "Request is not pending" });

      await db.query(
        `update charity_requests set status = 'rejected', rejection_reason = $2, reviewed_at = now() where id = $1`,
        [body.id, body.rejection_reason || null]
      );

      const contactEmail = charityReq?.contact_email as string | null;
      const charityName = charityReq?.charity_name as string || "your organization";
      if (contactEmail) {
        try {
          const { sendBrevoEmail } = await import("../services/brevo.js");
          const { emailLayout } = await import("../services/email-template.js");
          const supportEmail = env.SUPPORT_EMAIL || "info@giveblackapp.com";
          const content = `
            <h2 style="color:#ffffff;margin:0 0 8px 0;font-size:22px;">Application Update</h2>
            <p style="color:#cccccc;margin:0 0 24px 0;font-size:16px;">We have reviewed the application for <strong>${charityName}</strong>.</p>
            <div style="background:#1a1a1a;border-radius:12px;padding:20px;margin-bottom:24px;">
              <p style="color:#cccccc;margin:0 0 12px 0;">Unfortunately, we are unable to approve your application at this time.</p>
              ${body.rejection_reason ? `<p style="color:#999999;margin:12px 0 0 0;"><strong>Reason:</strong> ${body.rejection_reason}</p>` : ""}
            </div>
            <p style="color:#999999;font-size:14px;">If you believe this was an error or have additional information, please contact us at <a href="mailto:${supportEmail}" style="color:#059669;text-decoration:none;">${supportEmail}</a>.</p>
          `;
          const bccList = await getAdminBccEmails();
          await sendBrevoEmail({
            to: contactEmail,
            subject: "Update on Your GiveBlack Application",
            bcc: bccList.length ? bccList : undefined,
            html: emailLayout(content),
            tags: ["giveblack", "charity-rejected"],
          });
        } catch (emailErr) {
          app.log.error({ err: emailErr, email: contactEmail }, "Failed to send rejection email");
        }
      }

      return { success: true };
    }
  );

  app.get(
    "/api/admin/admin-emails",
    { preHandler: [app.authenticate, app.requireRole("admin", "super_admin")] },
    async (_request, reply) => {
      const rows = await db.query("select id, email, created_at from admin_emails order by created_at asc");
      return {
        emails: rows.rows as { id: string; email: string; created_at: string }[],
        mainAdminEmail: env.ADMIN_EMAIL || null,
      };
    }
  );

  app.post(
    "/api/admin/admin-emails",
    { preHandler: [app.authenticate, app.requireRole("admin", "super_admin")] },
    async (request, reply) => {
      const body = (request.body ?? {}) as { email?: string };
      const raw = body.email?.trim?.();
      if (!raw) return reply.code(400).send({ error: "email is required" });
      const email = raw.toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) return reply.code(400).send({ error: "Invalid email address" });
      const countRes = await db.query("select count(*)::int as c from admin_emails");
      const count = (countRes.rows[0] as { c: number })?.c ?? 0;
      if (count >= MAX_ADMIN_EMAILS) return reply.code(400).send({ error: `Maximum ${MAX_ADMIN_EMAILS} admin emails allowed. Remove one before adding another.` });
      const existing = await db.query("select 1 from admin_emails where email = $1", [email]);
      if (existing.rowCount) return reply.code(400).send({ error: "This email is already in the list" });
      await db.query("insert into admin_emails (email) values ($1)", [email]);
      const rows = await db.query("select id, email, created_at from admin_emails order by created_at asc");
      return { success: true, emails: rows.rows as { id: string; email: string; created_at: string }[] };
    }
  );

  app.delete(
    "/api/admin/admin-emails/:email",
    { preHandler: [app.authenticate, app.requireRole("admin", "super_admin")] },
    async (request, reply) => {
      const email = decodeURIComponent((request.params as { email: string }).email);
      if (!email?.trim()) return reply.code(400).send({ error: "email is required" });
      const result = await db.query("delete from admin_emails where email = $1 returning id", [email.trim().toLowerCase()]);
      if (!result.rowCount) return reply.code(404).send({ error: "Admin email not found" });
      const rows = await db.query("select id, email, created_at from admin_emails order by created_at asc");
      return { success: true, emails: rows.rows as { id: string; email: string; created_at: string }[] };
    }
  );

  app.post(
    "/api/admin/admin-emails/send-test",
    { preHandler: [app.authenticate, app.requireRole("admin", "super_admin")] },
    async (request, reply) => {
      const body = (request.body ?? {}) as { email?: string };
      const raw = body.email?.trim?.();
      if (!raw) return reply.code(400).send({ error: "email is required" });
      const email = raw.toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) return reply.code(400).send({ error: "Invalid email address" });
      try {
        const { sendBrevoEmail } = await import("../services/brevo.js");
        const { emailLayout } = await import("../services/email-template.js");
        const content = `
          <h2 style="color:#ffffff;margin:0 0 8px 0;font-size:22px;">Test email</h2>
          <p style="color:#cccccc;margin:0 0 16px 0;font-size:16px;">This is a test from the GiveBlack admin panel. If you received this, Brevo is connected and email is working.</p>
          <p style="color:#999999;font-size:14px;">Sent at ${new Date().toISOString()}</p>
        `;
        await sendBrevoEmail({
          to: email,
          subject: "GiveBlack – Test email (Brevo connected)",
          html: emailLayout(content),
          tags: ["giveblack", "test-admin"],
        });
        return { success: true, message: "Test email sent successfully." };
      } catch (err) {
        app.log.error({ err, email }, "Send test admin email failed");
        const message = err instanceof Error ? err.message : "Failed to send email";
        return reply.code(503).send({ error: message });
      }
    }
  );

  app.post(
    "/api/admin/admin-emails/send-test-all",
    { preHandler: [app.authenticate, app.requireRole("admin", "super_admin")] },
    async (_request, reply) => {
      const toSend: string[] = [];
      if (env.ADMIN_EMAIL) toSend.push(env.ADMIN_EMAIL);
      const rows = await db.query("select email from admin_emails order by created_at asc");
      for (const row of rows.rows as { email: string }[]) {
        const e = row?.email?.trim?.();
        if (e && !toSend.includes(e.toLowerCase())) toSend.push(e.toLowerCase());
      }
      if (toSend.length === 0) return reply.code(400).send({ error: "No admin emails to send to. Add at least one admin email first." });
      const { sendBrevoEmail } = await import("../services/brevo.js");
      const { emailLayout } = await import("../services/email-template.js");
      const content = `
        <h2 style="color:#ffffff;margin:0 0 8px 0;font-size:22px;">Test email (all)</h2>
        <p style="color:#cccccc;margin:0 0 16px 0;font-size:16px;">This is a test from the GiveBlack admin panel sent to all admin emails. If you received this, Brevo is connected and email is working.</p>
        <p style="color:#999999;font-size:14px;">Sent at ${new Date().toISOString()}</p>
      `;
      let sent = 0;
      let failed = 0;
      for (const email of toSend) {
        try {
          await sendBrevoEmail({
            to: email,
            subject: "GiveBlack – Test email (Brevo connected)",
            html: emailLayout(content),
            tags: ["giveblack", "test-admin"],
          });
          sent++;
        } catch (err) {
          app.log.error({ err, email }, "Send test to all: failed for one");
          failed++;
        }
      }
      if (sent === 0) return reply.code(503).send({ error: "Failed to send to any recipient. Check Brevo configuration." });
      return { success: true, sent, failed, total: toSend.length };
    }
  );

  app.post(
    "/api/admin/functions/:name",
    { preHandler: [app.authenticate, app.requireRole("admin", "super_admin")] },
    async (request, reply) => {
      const { name } = request.params as { name: string };
      const body = (request.body ?? {}) as Record<string, unknown>;
      if (name === "check-connect-status") {
        const orgId = String(body.orgId ?? "");
        const org = await db.query(
          "select stripe_account_id, payouts_enabled from organizations where id = $1 limit 1",
          [orgId]
        );
        const row = org.rows[0] as { stripe_account_id?: string | null; payouts_enabled?: boolean } | undefined;
        return {
          data: {
            connected: Boolean(row?.stripe_account_id),
            accountId: row?.stripe_account_id ?? null,
            charges_enabled: Boolean(row?.stripe_account_id),
            payouts_enabled: Boolean(row?.payouts_enabled),
            details_submitted: Boolean(row?.stripe_account_id)
          },
          error: null
        };
      }

      if (name === "create-connect-account") {
        const orgId = String(body.orgId ?? "");
        if (!env.STRIPE_SECRET_KEY) return reply.code(503).send({ error: { message: "Stripe not configured" } });
        const stripe = getStripe();
        let accountId: string | null = null;
        const org = await db.query("select id, name, stripe_account_id from organizations where id = $1", [orgId]);
        const row = org.rows[0] as { id: string; name: string; stripe_account_id?: string | null } | undefined;
        if (!row) return reply.code(404).send({ error: { message: "Organization not found" } });
        if (row.stripe_account_id) {
          accountId = row.stripe_account_id;
        } else {
          const account = await stripe.accounts.create({
            type: "express",
            business_type: "company",
            metadata: { org_id: row.id, org_name: row.name }
          });
          accountId = account.id;
          await db.query("update organizations set stripe_account_id = $2 where id = $1", [row.id, accountId]);
        }
        const domain = process.env.EXPO_PUBLIC_DOMAIN || "giveblackapp.com";
        const link = await stripe.accountLinks.create({
          account: accountId,
          type: "account_onboarding",
          refresh_url: `https://${domain}/admin/campaigns/${orgId}?connect=refresh`,
          return_url: `https://${domain}/admin/campaigns/${orgId}?connect=complete`
        });
        return { data: { url: link.url, accountId }, error: null };
      }

      if (name === "check-subscription") {
        return { data: { tier: "starter", status: "active", features: [] }, error: null };
      }

      if (name === "create-donation-checkout") {
        if (!env.STRIPE_SECRET_KEY) return reply.code(503).send({ error: { message: "Stripe not configured" } });
        const stripe = getStripe();
        const user = request.user as { sub: string };

        const dOrgId = String(body.orgId ?? "");
        const dCampaignId = String(body.campaignId ?? "");
        const dAmount = Number(body.amount ?? 0);
        const dCurrency = String(body.currency ?? "usd");

        if (!dOrgId || dAmount <= 0) return reply.code(400).send({ error: { message: "orgId and amount are required" } });

        const orgRes = await db.query("select name from organizations where id = $1", [dOrgId]);
        const orgName = (orgRes.rows[0] as Record<string, unknown> | undefined)?.name as string || "Organization";

        let campTitle = "";
        if (dCampaignId) {
          const campRes = await db.query("select title from campaigns where id = $1", [dCampaignId]);
          campTitle = (campRes.rows[0] as Record<string, unknown> | undefined)?.title as string || "";
        }

        const desc = campTitle ? `Donation to ${orgName} - ${campTitle}` : `Donation to ${orgName}`;

        const baseUrl = env.EXPO_PUBLIC_API_URL
          ? env.EXPO_PUBLIC_API_URL.replace(/\/app\/?$/, "").replace(/\/$/, "")
          : `${request.protocol}://${request.hostname}`;

        const session = await stripe.checkout.sessions.create({
          mode: "payment",
          line_items: [{ price_data: { currency: dCurrency, unit_amount: Math.round(dAmount * 100), product_data: { name: desc } }, quantity: 1 }],
          payment_intent_data: { metadata: { orgId: dOrgId, campaignId: dCampaignId, donorUserId: user.sub, type: "donation" } },
          success_url: `${baseUrl}/api/payments/checkout-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${baseUrl}/api/payments/checkout-cancel`,
          metadata: { orgId: dOrgId, campaignId: dCampaignId, donorUserId: user.sub },
        });

        const adminPiId = stripeId(session.payment_intent);
        if (adminPiId) {
          await stripe.paymentIntents.update(adminPiId, {
            metadata: {
              orgId: dOrgId,
              campaignId: dCampaignId || "",
              donorUserId: user.sub,
              type: "donation",
              checkoutSessionId: session.id,
            },
          });
        }

        await db.query(
          `insert into donations (
             org_id, campaign_id, user_id, amount, currency, status, stripe_payment_intent_id,
             education_partner_id, reinvest_opt_in, reinvest_amount, partner_reinvest_amount, general_reinvest_amount
           ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            dOrgId,
            dCampaignId || null,
            user.sub,
            dAmount,
            dCurrency,
            "pending",
            session.id,
            null,
            false,
            0,
            0,
            0,
          ]
        );

        return { data: { url: session.url, sessionId: session.id }, error: null };
      }

      if (name === "create-checkout") {
        return reply.code(501).send({ error: { message: `${name} not yet migrated to custom backend` } });
      }

      return reply.code(404).send({ error: { message: `Function ${name} not found` } });
    }
  );

  app.post(
    "/api/admin/storage/upload",
    { preHandler: [app.authenticate, app.requireRole("admin", "super_admin")] },
    async (request, reply) => {
      const file = await request.file();
      if (!file) return reply.code(400).send({ error: { message: "File required" } });
      const folderField = file.fields.folder;
      const folderValue =
        folderField && !Array.isArray(folderField) && "value" in folderField
          ? (folderField.value as string)
          : "org-images";
      const folder = String(folderValue || "org-images");
      const safeFolder = folder.replace(/[^a-zA-Z0-9-_]/g, "") || "org-images";

      const pathField = file.fields.path;
      const clientPath =
        pathField && !Array.isArray(pathField) && "value" in pathField
          ? String(pathField.value)
          : "";
      let fileName: string;
      if (clientPath) {
        fileName = path.basename(clientPath).replace(/[^a-zA-Z0-9._-]/g, "");
        if (!fileName) fileName = `${Date.now()}${path.extname(file.filename || "") || ".bin"}`;
      } else {
        const ext = path.extname(file.filename || "") || ".bin";
        fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
      }

      const targetDir = path.resolve(process.cwd(), "uploads", safeFolder);
      await fs.mkdir(targetDir, { recursive: true });
      const targetFile = path.join(targetDir, fileName);
      const buffer = await file.toBuffer();
      await fs.writeFile(targetFile, buffer);
      const storedPath = `${safeFolder}/${fileName}`;
      const publicUrl = `/uploads/${storedPath}`;
      return {
        data: { path: storedPath, publicUrl },
        error: null
      };
    }
  );
};
