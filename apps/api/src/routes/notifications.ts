import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { db } from "../lib/db.js";
import { sendBrevoEmail } from "../services/brevo.js";
import { sendExpoPush } from "../services/push.js";
import { broadcastChannel } from "../realtime/hub.js";

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

export const notificationRoutes: FastifyPluginAsync = async (app) => {
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
    await sendBrevoEmail({
      to: targetEmail,
      subject: body.emailSubject,
      html: emailLayout(body.emailHtml),
      tags: ["giveblack", "user-notification"]
    });

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

  app.post(
    "/api/admin/notifications/broadcast",
    { preHandler: [app.authenticate, app.requireRole("admin", "super_admin")] },
    async (request) => {
      const body = z
        .object({
          pushTitle: z.string().min(1),
          pushBody: z.string().min(1),
          emailSubject: z.string().min(1),
          emailHtml: z.string().min(1)
        })
        .parse(request.body);

      const users = await db.query("select id, email from users where disabled_at is null");
      const allTokens = await db.query(
        "select expo_push_token from device_push_tokens where disabled_at is null"
      );
      const tokens = allTokens.rows.map((r) => r.expo_push_token as string).filter(Boolean);
      if (tokens.length) {
        await sendExpoPush({ to: tokens, title: body.pushTitle, body: body.pushBody });
      }

      if (users.rows.length > 0) {
        const insertValues = users.rows.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(", ");
        const insertParams = users.rows.flatMap((r) => [r.id, body.pushTitle, body.pushBody]);
        await db.query(
          `insert into user_notifications (user_id, title, message) values ${insertValues}`,
          insertParams
        );
      }

      const { emailLayout } = await import("../services/email-template.js");
      const brandedHtml = emailLayout(body.emailHtml);
      for (const row of users.rows) {
        await sendBrevoEmail({
          to: row.email as string,
          subject: body.emailSubject,
          html: brandedHtml,
          tags: ["giveblack", "broadcast"]
        });
      }

      broadcastChannel("admin_alerts", "broadcast.sent", {
        userCount: users.rowCount ?? 0,
        pushCount: tokens.length
      });

      return {
        success: true,
        users: users.rowCount ?? 0,
        pushTokens: tokens.length
      };
    }
  );
};
