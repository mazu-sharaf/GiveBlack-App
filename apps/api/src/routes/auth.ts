import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { db } from "../lib/db.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { generateRefreshToken, hashToken } from "../lib/tokens.js";
import { env } from "../config/env.js";
import { notifyAdminsNewCharityRequest } from "../services/admin-notify.js";

const donorSignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(2).max(120),
  zipCode: z.string().optional(),
  collegeAttended: z.boolean().optional()
});

const charitySignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(2).max(120),
  charityName: z.string().min(2),
  category: z.string().optional(),
  categoryId: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  url: z.string().optional(),
  bank_name: z.string().trim().max(200).optional(),
  account_holder_name: z.string().trim().max(200).optional(),
  routing_number: z.string().trim().max(32).optional(),
  account_last4: z.string().trim().max(4).optional(),
  account_number: z.string().trim().max(32).optional(),
  tax_id: z.string().trim().max(50).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

const refreshSchema = z.object({
  refreshToken: z.string().min(24)
});

const roleSchema = z.enum(["super_admin", "admin", "charity_owner", "donor"]);
type Role = z.infer<typeof roleSchema>;

function makeAccessToken(app: { jwt: { sign: (payload: Record<string, unknown>, opts: Record<string, unknown>) => string } }, user: { id: string; email: string; role: Role }): string {
  return app.jwt.sign(
    { role: user.role, email: user.email },
    {
      sub: user.id,
      expiresIn: env.JWT_ACCESS_TTL
    }
  );
}

type JwtApp = { jwt: { sign: (payload: Record<string, unknown>, opts: Record<string, unknown>) => string } };

/** Create refresh session + access token (used by login and donor signup). */
export async function issueSessionForUser(
  app: JwtApp,
  request: { headers: Record<string, string | string[] | undefined>; ip?: string },
  user: { id: string; email: string; role: Role }
): Promise<{ accessToken: string; refreshToken: string }> {
  const refreshToken = generateRefreshToken();
  const refreshHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + env.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
  await db.query(
    `insert into user_sessions (user_id, refresh_token_hash, user_agent, ip_address, expires_at)
     values ($1, $2, $3, $4, $5)`,
    [user.id, refreshHash, request.headers["user-agent"] ?? null, request.ip ?? null, expiresAt]
  );
  return {
    accessToken: makeAccessToken(app, user),
    refreshToken,
  };
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  // Donor signup endpoint
  app.post("/api/auth/signup/donor", async (request, reply) => {
    const body = donorSignupSchema.parse(request.body);
    const email = body.email.toLowerCase();
    const existing = await db.query("select id from users where email = $1 limit 1", [email]);
    if (existing.rowCount) {
      return reply.code(409).send({ error: "Email already in use" });
    }

    const passwordHash = await hashPassword(body.password);
    const created = await db.query(
      `insert into users (email, full_name, password_hash, role)
       values ($1, $2, $3, $4)
       returning id, email, full_name as name, role`,
      [email, body.name, passwordHash, "donor"]
    );
    const user = created.rows[0] as { id: string; email: string; name: string; role: Role };

    // Store additional profile data
    if (body.zipCode || body.collegeAttended !== undefined) {
      await db.query(
        `insert into profiles (id, name, email, user_type, zip_code, college_attended) 
         values ($1, $2, $3, $4, $5, $6)
         on conflict (id) do update set
           zip_code = excluded.zip_code,
           college_attended = excluded.college_attended`,
        [user.id, body.name, email, "donor", body.zipCode || null, body.collegeAttended || false]
      ).catch(() => {}); // Ignore profile errors
    }

    const tokens = await issueSessionForUser(app, request, {
      id: user.id,
      email: user.email,
      role: user.role,
    });

    return reply.code(201).send({
      success: true,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, type: "donor" },
    });
  });

  // Charity signup endpoint (creates pending charity request)
  app.post("/api/auth/signup/charity", async (request, reply) => {
    const body = charitySignupSchema.parse(request.body);
    const email = body.email.toLowerCase();
    const existing = await db.query("select id from users where email = $1 limit 1", [email]);
    if (existing.rowCount) {
      return reply.code(409).send({ error: "Email already in use" });
    }

    const passwordHash = await hashPassword(body.password);
    
    // Create user with charity_owner role (pending approval)
    const created = await db.query(
      `insert into users (email, full_name, password_hash, role)
       values ($1, $2, $3, $4)
       returning id, email, full_name as name, role`,
      [email, body.name, passwordHash, "charity_owner"]
    );
    const user = created.rows[0] as { id: string; email: string; name: string; role: Role };

    let categoryLabel = body.category?.trim() || "other";
    if (body.categoryId) {
      const catRow = await db.query("select name from categories where id = $1 limit 1", [body.categoryId]);
      const name = (catRow.rows[0] as { name?: string } | undefined)?.name;
      if (name) categoryLabel = name;
    }

    // Store charity request details
    try {
      const reqIns = await db.query(
        `insert into charity_requests (
           user_id, charity_name, contact_name, contact_email, category, description, website, status,
           tax_id, bank_name, account_holder_name, account_number, account_last4, routing_number
         )
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         returning id`,
        [
          user.id,
          body.charityName,
          body.name,
          email,
          categoryLabel,
          body.description || "",
          body.url || "",
          "pending",
          body.tax_id?.trim() || null,
          body.bank_name?.trim() || null,
          body.account_holder_name?.trim() || null,
          body.account_number?.trim() || null,
          body.account_last4?.trim() || null,
          body.routing_number?.trim() || null,
        ]
      );
      const requestId = (reqIns.rows[0] as { id: string } | undefined)?.id;
      if (requestId) {
        await notifyAdminsNewCharityRequest({
          requestId,
          charityName: body.charityName,
          contactName: body.name,
          contactEmail: email,
        }).catch((err) => {
          app.log.warn({ err, msg: "Failed to notify admins of charity request" });
        });
      }
    } catch (err) {
      app.log.warn({ err, msg: "Failed to insert charity request" });
    }

    // Store profile
    const profileCategory = categoryLabel;
    await db.query(
      `insert into profiles (id, name, email, user_type, charity_name, charity_category, charity_description, charity_url) 
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (id) do update set
         charity_name = excluded.charity_name,
         charity_category = excluded.charity_category,
         charity_description = excluded.charity_description,
         charity_url = excluded.charity_url`,
      [user.id, body.name, email, "charity", body.charityName, profileCategory, body.description || "", body.url || ""]
    ).catch((err) => { app.log.warn({ err, msg: "Failed to insert charity profile" }); });

    return reply.code(201).send({ 
      success: true,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, type: "charity" }
    });
  });

  // Legacy signup endpoint (backwards compatibility)
  app.post("/api/auth/signup", async (request, reply) => {
    // Forward to donor signup for backwards compatibility
    const body = donorSignupSchema.parse(request.body);
    const email = body.email.toLowerCase();
    const existing = await db.query("select id from users where email = $1 limit 1", [email]);
    if (existing.rowCount) {
      return reply.code(409).send({ error: "Email already in use" });
    }

    const passwordHash = await hashPassword(body.password);
    const created = await db.query(
      `insert into users (email, full_name, password_hash, role)
       values ($1, $2, $3, $4)
       returning id, email, full_name as name, role`,
      [email, body.name, passwordHash, "donor"]
    );
    const user = created.rows[0] as { id: string; email: string; name: string; role: Role };

    if (body.zipCode || body.collegeAttended !== undefined) {
      await db.query(
        `insert into profiles (id, name, email, user_type, zip_code, college_attended) 
         values ($1, $2, $3, $4, $5, $6)
         on conflict (id) do update set
           zip_code = excluded.zip_code,
           college_attended = excluded.college_attended`,
        [user.id, body.name, email, "donor", body.zipCode || null, body.collegeAttended || false]
      ).catch(() => {});
    }

    const tokens = await issueSessionForUser(app, request, {
      id: user.id,
      email: user.email,
      role: user.role,
    });

    return reply.code(201).send({
      success: true,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, type: "donor" },
    });
  });

  app.post("/api/auth/login", async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const userQuery = await db.query(
      "select id, email, full_name, role, password_hash, disabled_at from users where email = $1 limit 1",
      [body.email.toLowerCase()]
    );
    if (!userQuery.rowCount) return reply.code(401).send({ error: "Invalid credentials" });

    const user = userQuery.rows[0] as {
      id: string;
      email: string;
      full_name: string;
      role: Role;
      password_hash: string;
      disabled_at?: string | null;
    };

    if (user.disabled_at) return reply.code(403).send({ error: "This account has been disabled." });

    const ok = await verifyPassword(body.password, user.password_hash);
    if (!ok) return reply.code(401).send({ error: "Invalid credentials" });

    // For charity owners, require that their charity request is approved
    if (user.role === "charity_owner") {
      try {
        const reqRes = await db.query(
          "select status from charity_requests where user_id = $1 order by created_at desc limit 1",
          [user.id]
        );
        const status = (reqRes.rows[0] as { status: string } | undefined)?.status;
        if (status !== "approved") {
          return reply.code(403).send({ error: "Your charity account is not approved yet." });
        }
      } catch (e) {
        app.log.error({ err: e, msg: "Failed to load charity request status" });
        return reply.code(403).send({ error: "Your charity account is not approved yet." });
      }
    }

    const tokens = await issueSessionForUser(app, request, {
      id: user.id,
      email: user.email,
      role: user.role,
    });

    // Get profile data
    let profileData: Record<string, unknown> = {};
    try {
      const profileQuery = await db.query(
        "select user_type, zip_code, college_attended, charity_name, charity_category, charity_description, charity_url from profiles where id = $1 limit 1",
        [user.id]
      );
      if (profileQuery.rowCount) {
        profileData = profileQuery.rows[0];
      }
    } catch (e) {
      // Profile table may not exist or have these columns
    }

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.full_name,
        role: user.role,
        type: profileData.user_type || (user.role === "charity_owner" ? "charity" : "donor"),
        zipCode: profileData.zip_code,
        collegeAttended: profileData.college_attended,
        charityName: profileData.charity_name,
        charityCategory: profileData.charity_category,
        charityDescription: profileData.charity_description,
        charityUrl: profileData.charity_url
      }
    };
  });

  app.post("/api/auth/refresh", async (request, reply) => {
    const body = refreshSchema.parse(request.body);
    const oldHash = hashToken(body.refreshToken);
    const sessionQuery = await db.query(
      `select s.id, s.user_id, s.expires_at, u.email, u.role, u.disabled_at
       from user_sessions s
       join users u on u.id = s.user_id
       where s.refresh_token_hash = $1 and s.revoked_at is null
       limit 1`,
      [oldHash]
    );
    if (!sessionQuery.rowCount) return reply.code(401).send({ error: "Invalid refresh token" });

    const session = sessionQuery.rows[0] as {
      id: string;
      user_id: string;
      email: string;
      role: Role;
      expires_at: string;
      disabled_at?: string | null;
    };
    if (session.disabled_at) return reply.code(403).send({ error: "This account has been disabled." });
    if (new Date(session.expires_at).getTime() < Date.now()) {
      return reply.code(401).send({ error: "Refresh token expired" });
    }

    const nextRefreshToken = generateRefreshToken();
    await db.query("update user_sessions set refresh_token_hash = $2 where id = $1", [
      session.id,
      hashToken(nextRefreshToken)
    ]);

    return {
      accessToken: makeAccessToken(app, {
        id: session.user_id,
        email: session.email,
        role: roleSchema.parse(session.role)
      }),
      refreshToken: nextRefreshToken
    };
  });

  app.post("/api/auth/logout", async (request, reply) => {
    const body = refreshSchema.parse(request.body);
    await db.query("update user_sessions set revoked_at = now() where refresh_token_hash = $1", [
      hashToken(body.refreshToken)
    ]);
    return reply.code(204).send();
  });

  app.get("/api/auth/me", { preHandler: [app.authenticate] }, async (request) => {
    const user = request.user as { sub: string; role: Role; email: string };
    return {
      id: user.sub,
      role: user.role,
      email: user.email
    };
  });

  const resetAttempts = new Map<string, { count: number; resetAt: number }>();

  app.post("/api/auth/request-password-reset", async (request, reply) => {
    const body = z.object({ email: z.string().email() }).parse(request.body);
    const email = body.email.toLowerCase();

    const now = Date.now();
    const key = email;
    const entry = resetAttempts.get(key);
    if (entry && entry.resetAt > now && entry.count >= 3) {
      return reply.code(429).send({ error: "Too many requests. Please try again later." });
    }
    if (!entry || entry.resetAt <= now) {
      resetAttempts.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
    } else {
      entry.count++;
    }

    const userQuery = await db.query(
      "select id, email from users where email = $1 limit 1",
      [email]
    );

    if (!userQuery.rowCount) {
      return { success: true, message: "If that email exists, a reset code has been sent." };
    }

    const userId = userQuery.rows[0].id as string;
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const { hashToken: hashT } = await import("../lib/tokens.js");
    const tokenHash = hashT(resetCode);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await db.query(
      `insert into password_reset_tokens (user_id, token_hash, expires_at)
       values ($1, $2, $3)`,
      [userId, tokenHash, expiresAt]
    );

    if (process.env.NODE_ENV !== "production") {
      app.log.info({ resetCode, email }, "DEV: Password reset code generated");
    }

    try {
      const { sendBrevoEmail } = await import("../services/brevo.js");
      const { emailLayout } = await import("../services/email-template.js");
      const content = `
        <h2 style="color:#ffffff;margin:0 0 8px 0;font-size:22px;">Password Reset</h2>
        <p style="color:#cccccc;margin:0 0 24px 0;font-size:16px;">Use the code below to reset your password. This code expires in 30 minutes.</p>
        <div style="background:#1a1a1a;border:2px solid #059669;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
          <span style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#059669;">${resetCode}</span>
        </div>
        <p style="color:#666666;font-size:13px;">If you did not request this reset, you can safely ignore this email.</p>
      `;
      await sendBrevoEmail({
        to: email,
        subject: "Your GiveBlack Password Reset Code",
        html: emailLayout(content),
        tags: ["giveblack", "password-reset"],
      });
    } catch (emailErr) {
      app.log.error({ err: emailErr, email }, "Failed to send password reset email");
    }

    return { success: true, message: "If that email exists, a reset code has been sent." };
  });

  const resetConfirmAttempts = new Map<string, { count: number; resetAt: number }>();

  app.post("/api/auth/reset-password", async (request, reply) => {
    const body = z.object({
      email: z.string().email(),
      code: z.string().length(6),
      newPassword: z.string().min(6)
    }).parse(request.body);

    const email = body.email.toLowerCase();

    const now = Date.now();
    const entry = resetConfirmAttempts.get(email);
    if (entry && entry.resetAt > now && entry.count >= 5) {
      return reply.code(429).send({ error: "Too many attempts. Please request a new code." });
    }
    if (!entry || entry.resetAt <= now) {
      resetConfirmAttempts.set(email, { count: 1, resetAt: now + 15 * 60 * 1000 });
    } else {
      entry.count++;
    }

    const { hashToken: hashT } = await import("../lib/tokens.js");
    const codeHash = hashT(body.code);

    const tokenQuery = await db.query(
      `select prt.id, prt.user_id, prt.expires_at
       from password_reset_tokens prt
       join users u on u.id = prt.user_id
       where prt.token_hash = $1 and u.email = $2 and prt.used_at is null
       order by prt.created_at desc
       limit 1`,
      [codeHash, email]
    );

    if (!tokenQuery.rowCount) {
      return reply.code(400).send({ error: "Invalid or expired reset code" });
    }

    const row = tokenQuery.rows[0] as { id: string; user_id: string; expires_at: string };
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return reply.code(400).send({ error: "Reset code has expired" });
    }

    const newHash = await hashPassword(body.newPassword);
    await db.query("update users set password_hash = $2, updated_at = now() where id = $1", [
      row.user_id,
      newHash
    ]);
    await db.query("update password_reset_tokens set used_at = now() where id = $1", [row.id]);
    await db.query("update user_sessions set revoked_at = now() where user_id = $1 and revoked_at is null", [row.user_id]);

    return { success: true, message: "Password has been reset. Please log in with your new password." };
  });
};
