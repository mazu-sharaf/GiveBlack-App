import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { db } from "../lib/db.js";
import { sendBrevoEmail } from "../services/brevo.js";
import { sendExpoPush } from "../services/push.js";
import { broadcastChannel } from "../realtime/hub.js";
import {
  defaultNotificationPreferences,
  type NotificationPreferenceKey,
} from "../services/user-push.js";

const registerPushSchema = z.object({
  token: z.string().min(10),
  platform: z.enum(["ios", "android", "web"]).default("web")
});

const userNotifySchema = z.object({
  userId: z.string().uuid().optional(),
  email: z.string().email().optional(),
  pushTitle: z.string().min(1).max(120),
  pushBody: z.string().min(1).max(240),
  emailSubject: z.string().min(1).max(180),
  emailHtml: z.string().min(1)
});

const notificationSettingsSchema = z.object({
  donor_receipts: z.boolean().optional(),
  org_donations: z.boolean().optional(),
  org_volunteers: z.boolean().optional(),
  org_campaign_status: z.boolean().optional(),
  org_subscription: z.boolean().optional(),
  donor_new_campaigns_from_orgs_i_supported: z.boolean().optional(),
  new_campaigns: z.boolean().optional(),
});

const MAX_DONOR_NOTIFICATION_RECIPIENTS = 5000;

/**
 * Everyone who can appear in admin Users except platform operators.
 * Includes donor, user, charity, charity_owner, etc. — matches how roles are stored across signup + admin edits.
 */
const NOTIFY_RECIPIENT_ROLE_WHERE =
  "disabled_at is null and role is not null and role not in ('admin', 'super_admin', 'manager', 'staff')";

const CHARITY_BROADCAST_ROLE_WHERE = "disabled_at is null and role = 'charity_owner'";

const adminPushOnlySchema = z.object({
  pushTitle: z.string().min(1).max(120),
  pushBody: z.string().min(1).max(500)
});

const adminBulkMessageSchema = adminPushOnlySchema.extend({
  emailSubject: z.string().min(1).max(180),
  emailHtml: z.string().min(1)
});

async function deliverAdminBulkNotifications(
  rows: Array<{ id: string; email: string }>,
  body: z.infer<typeof adminPushOnlySchema> & Partial<Pick<z.infer<typeof adminBulkMessageSchema>, "emailSubject" | "emailHtml">>,
  emailTags: [string, string] = ["giveblack", "donor-notification"]
): Promise<{ pushTokenCount: number }> {
  if (rows.length === 0) return { pushTokenCount: 0 };

  const insertValues = rows
    .map((_, i) => {
      const o = i * 3;
      return `($${o + 1}, $${o + 2}, $${o + 3}, 'new')`;
    })
    .join(", ");
  const insertParams = rows.flatMap((r) => [r.id, body.pushTitle, body.pushBody]);
  await db.query(
    `insert into user_notifications (user_id, title, message, type) values ${insertValues}`,
    insertParams
  );

  const ids = rows.map((r) => r.id);
  const tokensRes = await db.query(
    `select expo_push_token from device_push_tokens where user_id = any($1::uuid[]) and disabled_at is null`,
    [ids]
  );
  const tokens = tokensRes.rows.map((r) => r.expo_push_token as string).filter(Boolean);
  if (tokens.length) {
    await sendExpoPush({ to: tokens, title: body.pushTitle, body: body.pushBody });
  }

  if (body.emailSubject && body.emailHtml) {
    const { emailLayout } = await import("../services/email-template.js");
    const brandedHtml = emailLayout(body.emailHtml);
    for (const row of rows) {
      try {
        await sendBrevoEmail({
          to: row.email as string,
          subject: body.emailSubject,
          html: brandedHtml,
          tags: emailTags,
        });
      } catch (err) {
        // Keep push delivery working even if email is misconfigured
        console.warn("[notifications] email send failed", err);
      }
    }
  }

  return { pushTokenCount: tokens.length };
}

export const notificationRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/me/notification-settings", { preHandler: [app.authenticate] }, async (request) => {
    const user = request.user as { sub: string };
    const res = await db.query(`select notification_preferences from users where id = $1`, [user.sub]);
    const raw = (res.rows[0] as { notification_preferences?: unknown } | undefined)?.notification_preferences;
    const defaults = defaultNotificationPreferences();
    const merged = { ...defaults };
    if (raw && typeof raw === "object") {
      const o = raw as Record<string, boolean>;
      for (const k of Object.keys(defaults) as NotificationPreferenceKey[]) {
        if (typeof o[k] === "boolean") merged[k] = o[k];
      }
    }
    return { preferences: merged };
  });

  app.patch("/api/me/notification-settings", { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { sub: string };
    const body = notificationSettingsSchema.parse(request.body ?? {});
    const cur = await db.query(`select notification_preferences from users where id = $1`, [user.sub]);
    const existingRaw = (cur.rows[0] as { notification_preferences?: unknown } | undefined)?.notification_preferences;
    const base = defaultNotificationPreferences();
    if (existingRaw && typeof existingRaw === "object") {
      const o = existingRaw as Record<string, boolean>;
      for (const k of Object.keys(base) as NotificationPreferenceKey[]) {
        if (typeof o[k] === "boolean") base[k] = o[k];
      }
    }
    for (const k of Object.keys(body) as (keyof typeof body)[]) {
      const v = body[k];
      if (typeof v === "boolean" && k in base) {
        (base as Record<string, boolean>)[k] = v;
      }
    }
    await db.query(`update users set notification_preferences = $2::jsonb, updated_at = now() where id = $1`, [
      user.sub,
      JSON.stringify(base),
    ]);
    return { preferences: base };
  });

  app.get("/api/notifications", { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { sub: string };
    const limit = Math.min(Number((request.query as Record<string, string>).limit) || 50, 100);
    const offset = Number((request.query as Record<string, string>).offset) || 0;
    const result = await db.query(
      `select id, title, message, type, read, created_at
       from user_notifications
       where user_id = $1
       order by created_at desc
       limit $2 offset $3`,
      [user.sub, limit, offset]
    );
    const countResult = await db.query(
      "select count(*)::int as total, count(*) filter (where read = false)::int as unread from user_notifications where user_id = $1",
      [user.sub]
    );
    const { total, unread } = countResult.rows[0];
    return { notifications: result.rows, total, unread };
  });

  app.patch("/api/notifications/:id/read", { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { sub: string };
    const { id } = request.params as { id: string };
    const result = await db.query(
      "update user_notifications set read = true where id = $1 and user_id = $2 returning id",
      [id, user.sub]
    );
    if (!result.rowCount) return reply.code(404).send({ error: "Notification not found" });
    return { success: true };
  });

  app.post("/api/notifications/push-token", { preHandler: [app.authenticate] }, async (request) => {
    const body = registerPushSchema.parse(request.body);
    const user = request.user as { sub: string };

    await db.query(
      `insert into device_push_tokens (user_id, expo_push_token, platform)
       values ($1, $2, $3)
       on conflict (expo_push_token)
       do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now()`,
      [user.sub, body.token, body.platform]
    );

    return { success: true };
  });

  app.post("/api/notifications/send-user", { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = userNotifySchema.parse(request.body);
    const requester = request.user as { sub: string; role: string; email: string };
    const targetUserId = body.userId ?? requester.sub;
    const isSelf = targetUserId === requester.sub;
    const isAdmin = requester.role === "admin" || requester.role === "super_admin";
    if (!isSelf && !isAdmin) {
      return reply.code(403).send({ error: "Only admin can notify other users" });
    }

    const userQuery = await db.query("select id, email from users where id = $1", [targetUserId]);
    if (!userQuery.rowCount && !body.email) {
      return reply.code(404).send({ error: "User not found" });
    }
    const targetEmail = body.email ?? userQuery.rows[0].email;

    await db.query(
      "insert into user_notifications (user_id, title, message, type) values ($1, $2, $3, 'info')",
      [targetUserId, body.pushTitle, body.pushBody]
    );

    const { emailLayout } = await import("../services/email-template.js");
    try {
      await sendBrevoEmail({
        to: targetEmail,
        subject: body.emailSubject,
        html: emailLayout(body.emailHtml),
        tags: ["giveblack", "user-notification"],
      });
    } catch (err) {
      request.log.error({ err, targetEmail }, "notify-user email failed");
      return reply.code(503).send({ error: err instanceof Error ? err.message : "Email send failed" });
    }

    const tokensQuery = await db.query(
      "select expo_push_token from device_push_tokens where user_id = $1 and disabled_at is null",
      [targetUserId]
    );
    const tokens = tokensQuery.rows.map((r) => r.expo_push_token as string).filter(Boolean);
    if (tokens.length) {
      await sendExpoPush({
        to: tokens,
        title: body.pushTitle,
        body: body.pushBody
      });
    }

    broadcastChannel("admin_alerts", "notification.sent", {
      targetUserId,
      by: requester.sub,
      hasPush: tokens.length > 0
    });

    return { success: true, pushCount: tokens.length };
  });

  const adminNotifyOnly = [app.authenticate, app.requireRole("admin", "super_admin")];

  app.get("/api/admin/notifications/donor-recipients", { preHandler: adminNotifyOnly }, async (request) => {
    const q = request.query as { q?: string; page?: string; limit?: string };
    const page = Math.max(1, parseInt(q.page || "1", 10));
    const limit = Math.min(200, Math.max(1, parseInt(q.limit || "50", 10)));
    const offset = (page - 1) * limit;
    const search = (q.q || "").trim();
    const baseWhere = NOTIFY_RECIPIENT_ROLE_WHERE;

    if (search) {
      const needle = `%${search}%`;
      const countRes = await db.query(
        `select count(*)::int as c from users where ${baseWhere} and (email ilike $1 or full_name ilike $1)`,
        [needle]
      );
      const total = Number(countRes.rows[0]?.c ?? 0);
      const listRes = await db.query(
        `select id, email, full_name, role from users where ${baseWhere} and (email ilike $1 or full_name ilike $1)
         order by full_name asc nulls last, email asc
         limit $2 offset $3`,
        [needle, limit, offset]
      );
      return { donors: listRes.rows, total };
    }

    const countRes = await db.query(`select count(*)::int as c from users where ${baseWhere}`);
    const total = Number(countRes.rows[0]?.c ?? 0);
    const listRes = await db.query(
      `select id, email, full_name, role from users where ${baseWhere}
       order by full_name asc nulls last, email asc
       limit $1 offset $2`,
      [limit, offset]
    );
    return { donors: listRes.rows, total };
  });

  app.get("/api/admin/notifications/donor-recipient-ids", { preHandler: adminNotifyOnly }, async (request, reply) => {
    const q = request.query as { q?: string };
    const search = (q.q || "").trim();
    const baseWhere = NOTIFY_RECIPIENT_ROLE_WHERE;

    const countRes = search
      ? await db.query(
          `select count(*)::int as c from users where ${baseWhere} and (email ilike $1 or full_name ilike $1)`,
          [`%${search}%`]
        )
      : await db.query(`select count(*)::int as c from users where ${baseWhere}`);
    const total = Number(countRes.rows[0]?.c ?? 0);

    if (total > MAX_DONOR_NOTIFICATION_RECIPIENTS) {
      return reply.code(400).send({
        error: `Too many donors match (${total}). Refine your search to ${MAX_DONOR_NOTIFICATION_RECIPIENTS} or fewer.`
      });
    }

    const listRes = search
      ? await db.query(
          `select id from users where ${baseWhere} and (email ilike $1 or full_name ilike $1)
           order by full_name asc nulls last, email asc
           limit $2`,
          [`%${search}%`, MAX_DONOR_NOTIFICATION_RECIPIENTS]
        )
      : await db.query(
          `select id from users where ${baseWhere}
           order by full_name asc nulls last, email asc
           limit $1`,
          [MAX_DONOR_NOTIFICATION_RECIPIENTS]
        );

    const ids = (listRes.rows as { id: string }[]).map((r) => r.id);
    return { ids, total };
  });

  app.get("/api/admin/notifications/charity-recipients", { preHandler: adminNotifyOnly }, async (request) => {
    const q = request.query as { q?: string; page?: string; limit?: string };
    const page = Math.max(1, parseInt(q.page || "1", 10));
    const limit = Math.min(200, Math.max(1, parseInt(q.limit || "50", 10)));
    const offset = (page - 1) * limit;
    const search = (q.q || "").trim();

    if (search) {
      const needle = `%${search}%`;
      const countRes = await db.query(
        `select count(*)::int as c from users where ${CHARITY_BROADCAST_ROLE_WHERE} and (email ilike $1 or full_name ilike $1)`,
        [needle]
      );
      const total = Number(countRes.rows[0]?.c ?? 0);
      const listRes = await db.query(
        `select id, email, full_name, role from users where ${CHARITY_BROADCAST_ROLE_WHERE} and (email ilike $1 or full_name ilike $1)
         order by full_name asc nulls last, email asc
         limit $2 offset $3`,
        [needle, limit, offset]
      );
      return { charities: listRes.rows, total };
    }

    const countRes = await db.query(`select count(*)::int as c from users where ${CHARITY_BROADCAST_ROLE_WHERE}`);
    const total = Number(countRes.rows[0]?.c ?? 0);
    const listRes = await db.query(
      `select id, email, full_name, role from users where ${CHARITY_BROADCAST_ROLE_WHERE}
       order by full_name asc nulls last, email asc
       limit $1 offset $2`,
      [limit, offset]
    );
    return { charities: listRes.rows, total };
  });

  app.get("/api/admin/notifications/charity-recipient-ids", { preHandler: adminNotifyOnly }, async (request, reply) => {
    const q = request.query as { q?: string };
    const search = (q.q || "").trim();

    const countRes = search
      ? await db.query(
          `select count(*)::int as c from users where ${CHARITY_BROADCAST_ROLE_WHERE} and (email ilike $1 or full_name ilike $1)`,
          [`%${search}%`]
        )
      : await db.query(`select count(*)::int as c from users where ${CHARITY_BROADCAST_ROLE_WHERE}`);
    const total = Number(countRes.rows[0]?.c ?? 0);

    if (total > MAX_DONOR_NOTIFICATION_RECIPIENTS) {
      return reply.code(400).send({
        error: `Too many charity accounts match (${total}). Refine your search to ${MAX_DONOR_NOTIFICATION_RECIPIENTS} or fewer.`,
      });
    }

    const listRes = search
      ? await db.query(
          `select id from users where ${CHARITY_BROADCAST_ROLE_WHERE} and (email ilike $1 or full_name ilike $1)
           order by full_name asc nulls last, email asc
           limit $2`,
          [`%${search}%`, MAX_DONOR_NOTIFICATION_RECIPIENTS]
        )
      : await db.query(
          `select id from users where ${CHARITY_BROADCAST_ROLE_WHERE}
           order by full_name asc nulls last, email asc
           limit $1`,
          [MAX_DONOR_NOTIFICATION_RECIPIENTS]
        );

    const ids = (listRes.rows as { id: string }[]).map((r) => r.id);
    return { ids, total };
  });

  app.post("/api/admin/notifications/send-to-users", { preHandler: adminNotifyOnly }, async (request, reply) => {
    const parsed = z
      .object({
        userIds: z.array(z.string().uuid()).min(1).max(MAX_DONOR_NOTIFICATION_RECIPIENTS)
      })
      .merge(adminPushOnlySchema)
      .parse(request.body);

    const uniqueIds = [...new Set(parsed.userIds)];
    if (uniqueIds.length > MAX_DONOR_NOTIFICATION_RECIPIENTS) {
      return reply.code(400).send({ error: `At most ${MAX_DONOR_NOTIFICATION_RECIPIENTS} recipients per send.` });
    }

    const userRes = await db.query(
      `select id, email from users
       where id = any($1::uuid[])
         and disabled_at is null
         and role is not null
         and role not in ('admin', 'super_admin', 'manager', 'staff')`,
      [uniqueIds]
    );
    const found = new Map(userRes.rows.map((r) => [r.id as string, r.email as string]));
    if (found.size !== uniqueIds.length) {
      const missing = uniqueIds.filter((id) => !found.has(id));
      return reply.code(400).send({
        error:
          "Some user ids are not eligible (disabled, missing role, or platform admin/manager/staff account).",
        invalidUserIds: missing.slice(0, 50),
        invalidCount: missing.length
      });
    }

    const rows = uniqueIds.map((id) => ({ id, email: found.get(id)! }));
    const { pushTokenCount } = await deliverAdminBulkNotifications(
      rows,
      { pushTitle: parsed.pushTitle, pushBody: parsed.pushBody },
      ["giveblack", "donor-notification"]
    );

    broadcastChannel("admin_alerts", "donor_notification_batch.sent", {
      userCount: rows.length,
      pushCount: pushTokenCount
    });

    return {
      success: true,
      users: rows.length,
      pushTokens: pushTokenCount
    };
  });

  app.post("/api/admin/notifications/send-to-charity-users", { preHandler: adminNotifyOnly }, async (request, reply) => {
    const parsed = z
      .object({
        userIds: z.array(z.string().uuid()).min(1).max(MAX_DONOR_NOTIFICATION_RECIPIENTS),
      })
      .merge(adminPushOnlySchema)
      .parse(request.body);

    const uniqueIds = [...new Set(parsed.userIds)];
    if (uniqueIds.length > MAX_DONOR_NOTIFICATION_RECIPIENTS) {
      return reply.code(400).send({ error: `At most ${MAX_DONOR_NOTIFICATION_RECIPIENTS} recipients per send.` });
    }

    const userRes = await db.query(
      `select id, email from users
       where id = any($1::uuid[])
         and disabled_at is null
         and role = 'charity_owner'`,
      [uniqueIds]
    );
    const found = new Map(userRes.rows.map((r) => [r.id as string, r.email as string]));
    if (found.size !== uniqueIds.length) {
      const missing = uniqueIds.filter((id) => !found.has(id));
      return reply.code(400).send({
        error: "Some user ids are not eligible charity_owner accounts (or disabled).",
        invalidUserIds: missing.slice(0, 50),
        invalidCount: missing.length,
      });
    }

    const rows = uniqueIds.map((id) => ({ id, email: found.get(id)! }));
    const { pushTokenCount } = await deliverAdminBulkNotifications(
      rows,
      { pushTitle: parsed.pushTitle, pushBody: parsed.pushBody },
      ["giveblack", "charity-notification"]
    );

    broadcastChannel("admin_alerts", "charity_notification_batch.sent", {
      userCount: rows.length,
      pushCount: pushTokenCount,
    });

    return {
      success: true,
      users: rows.length,
      pushTokens: pushTokenCount,
    };
  });

  app.post("/api/admin/notifications/broadcast", { preHandler: adminNotifyOnly }, async (request) => {
    const body = adminBulkMessageSchema.parse(request.body);
    const users = await db.query("select id, email from users where disabled_at is null");
    const { pushTokenCount } = await deliverAdminBulkNotifications(
      users.rows as Array<{ id: string; email: string }>,
      body,
      ["giveblack", "broadcast"]
    );

    broadcastChannel("admin_alerts", "broadcast.sent", {
      userCount: users.rowCount ?? 0,
      pushCount: pushTokenCount
    });

    return {
      success: true,
      users: users.rowCount ?? 0,
      pushTokens: pushTokenCount
    };
  });
};
