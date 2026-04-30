import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import websocket from "@fastify/websocket";
import rawBody from "fastify-raw-body";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import httpProxy from "@fastify/http-proxy";
import path from "node:path";
import { env, getCorsOrigins } from "./config/env.js";
import { isBrevoConfigured } from "./services/brevo.js";
import { healthRoutes } from "./routes/health.js";
import { supportPageRoutes } from "./routes/support-page.js";
import { adminGuidePageRoutes } from "./routes/admin-guide-page.js";
import { authRoutes } from "./routes/auth.js";
import { oauthRoutes } from "./routes/oauth.js";
import { publicRoutes } from "./routes/public.js";
import { educationPartnersRoutes } from "./routes/education-partners.js";
import { stripeRoutes } from "./routes/stripe.js";
import { donorsRoutes } from "./routes/donors.js";
import { notificationRoutes } from "./routes/notifications.js";
import { parseChannels, filterAllowedChannels, registerClient } from "./realtime/hub.js";
import { adminCompatRoutes } from "./routes/admin-compat.js";
import { receiptPdfRoutes } from "./routes/receipt-pdf.js";
import { orgCampaignRoutes } from "./routes/org-campaigns.js";
import { orgConnectRoutes } from "./routes/org-connect.js";
import { adminFundReleaseRoutes } from "./routes/admin-fund-release.js";
import { uploadRoutes } from "./routes/upload.js";
import { campaignPageRoutes } from "./routes/campaign-page.js";
import { orgVolunteerRoutes } from "./routes/org-volunteers.js";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: any, reply: any) => Promise<void>;
    requireRole: (...roles: string[]) => (request: any, reply: any) => Promise<void>;
    requireAdminPermission: (perm: import("./services/admin-permissions.js").AdminPermissionKey) => (request: any, reply: any) => Promise<void>;
  }
}

export function buildServer() {
  const app = Fastify({
    logger: true,
    /** Campaign forms can send long descriptions; default 1MB is easy to exceed. */
    bodyLimit: 10 * 1024 * 1024,
    /**
     * In production the app sits behind a trusted reverse proxy (Replit gateway / CDN),
     * so trust X-Forwarded-For to get the real client IP for rate limiting.
     * Disabled in development to avoid IP-spoof bypass when running without a proxy.
     */
    trustProxy: env.NODE_ENV === "production",
  });

  // Universal Links / App Links verification files
  app.get("/.well-known/apple-app-site-association", async (_request, reply) => {
    // iOS Team ID + bundle id
    const appID = "W5NB3UT9SS.com.giveblack.app";
    reply.type("application/json");
    return {
      applinks: {
        apps: [],
        details: [
          {
            appID,
            paths: ["/link/*"],
          },
        ],
      },
    };
  });

  app.get("/.well-known/assetlinks.json", async (_request, reply) => {
    const pkg = "com.giveblack";
    const raw = (env.ANDROID_APP_LINK_SHA256_FINGERPRINTS || "").trim();
    const fps = raw
      ? raw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    reply.type("application/json");
    return [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: pkg,
          sha256_cert_fingerprints: fps,
        },
      },
    ];
  });

  app.register(cors, {
    origin: getCorsOrigins(),
    credentials: true
  });
  app.register(helmet, {
    contentSecurityPolicy:
      env.NODE_ENV === "development"
        ? false
        : {
            useDefaults: true,
            directives: {
              // Default is img-src 'self' data:; campaign pages embed org-hosted hero/gallery URLs.
              imgSrc: ["'self'", "data:", "https:", "blob:"],
              // Admin Google sign-in requires loading Google Identity Services script + iframe.
              scriptSrc: ["'self'", "https://accounts.google.com"],
              frameSrc: ["'self'", "https://accounts.google.com"],
              connectSrc: ["'self'", "https://accounts.google.com", "https://www.googleapis.com"],
            },
          },
    crossOriginEmbedderPolicy: false,
  });
  app.register(websocket);
  app.register(multipart, { limits: { fileSize: 8 * 1024 * 1024 } });
  app.register(rawBody, {
    global: false,
    routes: ["/api/webhooks/stripe"]
  });
  app.register(jwt, {
    secret: env.JWT_ACCESS_SECRET
  });
  if (!process.env.VPS_BACKEND_URL) {
    app.register(fastifyStatic, {
      root: path.resolve(process.cwd(), "uploads"),
      prefix: "/uploads/",
      setHeaders(res) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      },
    });
  }

  // Static assets served by the API (shared by admin + mobile).
  // Includes donor placeholder headshots at `/assets/donors/*`.
  app.register(fastifyStatic, {
    root: path.resolve(process.cwd(), "apps/api/assets"),
    prefix: "/assets/",
    decorateReply: false,
    wildcard: true,
    setHeaders(res) {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    },
  });

  app.decorate("authenticate", async (request: any, reply: any) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({ error: "Unauthorized" });
    }
  });

  app.decorate("requireRole", (...roles: string[]) => {
    return async (request: any, reply: any) => {
      const role = request.user?.role;
      if (!role || !roles.includes(role)) {
        return reply.code(403).send({ error: "Forbidden" });
      }
    };
  });

  app.decorate("requireAdminPermission", (perm) => {
    return async (request: any, reply: any) => {
      const role = request.user?.role;
      if (!role || !["admin", "super_admin", "manager", "staff"].includes(role)) {
        return reply.code(403).send({ error: "Forbidden" });
      }
      const uid = String(request.user?.sub || "");
      if (!uid) return reply.code(403).send({ error: "Forbidden" });
      const { getEffectiveAdminPermissions } = await import("./services/admin-permissions.js");
      const perms = await getEffectiveAdminPermissions(uid);
      if (!perms[perm]) {
        const hint: Record<string, string> = {
          canManageUsers: "manage users / staff",
          canChangeRoles: "change roles",
          canAccessSettings: "platform settings",
          canManagePayments: "payments / subscriptions",
        };
        return reply.code(403).send({
          error: `Not allowed: missing "${hint[perm] || perm}". Ask a super admin to update your permissions.`,
        });
      }
    };
  });

  app.register(async function wsRoutes(fastify) {
    fastify.get(
      "/ws",
      { websocket: true },
      (socket: any, request: any) => {
        const query = (request.query ?? {}) as Record<string, unknown>;
        const token = String(query.token ?? "");
        const channels = parseChannels(
          typeof query.channels === "string" ? query.channels.split(",") : query.channels
        );
        if (!token || token === "public") {
          const allowed = filterAllowedChannels("public", channels);
          registerClient({
            userId: "public",
            role: "public",
            socket,
            channels: allowed
          });
          socket.send(
            JSON.stringify({
              event: "connected",
              channels: Array.from(allowed),
              ts: new Date().toISOString()
            })
          );
          return;
        }
        try {
          const user = app.jwt.verify(token) as { sub: string; role: string };
          const allowed = filterAllowedChannels(user.role, channels);
          registerClient({
            userId: user.sub,
            role: user.role,
            socket,
            channels: allowed
          });
          socket.send(
            JSON.stringify({
              event: "connected",
              channels: Array.from(allowed),
              ts: new Date().toISOString()
            })
          );
        } catch {
          socket.close(4002, "invalid token");
        }
      }
    );
  });

  app.register(healthRoutes);
  app.register(supportPageRoutes);
  app.register(adminGuidePageRoutes);
  app.register(orgCampaignRoutes);
  app.register(orgVolunteerRoutes);
  app.register(orgConnectRoutes);
  app.register(uploadRoutes);
  app.register(campaignPageRoutes);

  const vpsBackendUrl = process.env.VPS_BACKEND_URL;
  if (vpsBackendUrl) {
    const vpsUrl = new URL(vpsBackendUrl);
    const vpsOrigin = vpsUrl.origin;
    const vpsPathPrefix = vpsUrl.pathname.replace(/\/$/, "");
    app.log.info(`Proxying /api/* requests to VPS: ${vpsOrigin}${vpsPathPrefix}`);
    app.register(httpProxy, {
      upstream: vpsOrigin,
      prefix: "/api",
      rewritePrefix: `${vpsPathPrefix}/api`,
      websocket: false,
    });
    app.register(httpProxy, {
      upstream: vpsOrigin,
      prefix: "/uploads",
      rewritePrefix: `${vpsPathPrefix}/uploads`,
      websocket: false,
    });
  } else {
    app.register(stripeRoutes);
    app.register(educationPartnersRoutes);
    app.register(publicRoutes);
    app.register(authRoutes);
    app.register(oauthRoutes);
    app.register(donorsRoutes);
    app.register(notificationRoutes);
    app.register(adminCompatRoutes);
    app.register(adminFundReleaseRoutes);
    app.register(receiptPdfRoutes);
  }

  const adminPort = parseInt(process.env.ADMIN_DEV_PORT || "8080", 10);
  /** Production admin SPA root (for static files + index.html fallback). */
  let adminSpaRoot: string | undefined;
  if (env.NODE_ENV === "development") {
    app.register(httpProxy, {
      upstream: `http://127.0.0.1:${adminPort}`,
      prefix: "/backoffice",
      rewritePrefix: "/backoffice",
      websocket: false,
    });
  } else {
    adminSpaRoot = path.resolve(
      new URL(".", import.meta.url).pathname,
      "../../..",
      "apps/admin/dist"
    );
    // wildcard: true registers all files under dist (e.g. /admin/assets/*.js). Do NOT use a catch-all
    // route for /admin/*: it would return index.html for JS/CSS and break the app (blank white page).
    app.register(fastifyStatic, {
      root: adminSpaRoot,
      prefix: "/backoffice/",
      decorateReply: false,
      wildcard: true,
    });
    app.get("/backoffice", async (_req, reply) => {
      return reply.redirect("/backoffice/");
    });
    // Hide legacy /admin path.
    app.get("/admin", async (_req, reply) => reply.code(404).send({ error: "Not Found" }));
  }

  app.get("/api/system/features", async () => {
    const expoPushEnabled = Boolean(env.EXPO_TOKEN || (env as { EXPO_ACCESS_TOKEN?: string }).EXPO_ACCESS_TOKEN);
    return {
      auth: true,
      realtime: true,
      stripe: Boolean(env.STRIPE_SECRET_KEY),
      brevo: isBrevoConfigured(),
      expoPush: expoPushEnabled
    };
  });

  app.setNotFoundHandler(async (request, reply) => {
    if (env.NODE_ENV === "development" && !request.url.startsWith("/api/")) {
      const expoPort = parseInt(process.env.EXPO_DEV_PORT || "8081", 10);
      try {
        const skipHeaders = new Set(["transfer-encoding", "content-encoding", "content-length", "host", "connection"]);
        const fwdHeaders: Record<string, string> = {};
        for (const [k, v] of Object.entries(request.headers)) {
          if (typeof v === "string" && !skipHeaders.has(k.toLowerCase())) {
            fwdHeaders[k] = v;
          }
        }
        const url = `http://127.0.0.1:${expoPort}${request.url}`;
        const res = await fetch(url, {
          method: request.method,
          headers: fwdHeaders,
        });
        reply.code(res.status);
        const resSkip = new Set(["transfer-encoding", "content-encoding", "content-length"]);
        for (const [key, value] of res.headers.entries()) {
          if (!resSkip.has(key.toLowerCase())) {
            reply.header(key, value);
          }
        }
        const body = Buffer.from(await res.arrayBuffer());
        return reply.send(body);
      } catch {
        return reply.code(502).send({ error: "Expo dev server not ready" });
      }
    }
    // React Router: serve index.html for non-asset paths under /backoffice/ (production only).
    if (
      adminSpaRoot &&
      (request.method === "GET" || request.method === "HEAD") &&
      request.url.startsWith("/backoffice/") &&
      !request.url.startsWith("/backoffice/assets/")
    ) {
      return reply.sendFile("index.html", adminSpaRoot);
    }
    return reply.code(404).send({ error: "Not Found" });
  });

  app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    request.log.error({ err: error }, request.url);
    const statusCode = typeof error.statusCode === "number" ? error.statusCode : 500;
    const safePublic =
      statusCode >= 500 && env.NODE_ENV === "production"
        ? "Internal Server Error"
        : error.message || "Request failed";
    if (reply.sent) return;
    return reply.code(statusCode).send({ error: safePublic });
  });

  return app;
}
