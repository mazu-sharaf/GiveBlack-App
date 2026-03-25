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
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { publicRoutes } from "./routes/public.js";
import { stripeRoutes } from "./routes/stripe.js";
import { donorsRoutes } from "./routes/donors.js";
import { notificationRoutes } from "./routes/notifications.js";
import { parseChannels, filterAllowedChannels, registerClient } from "./realtime/hub.js";
import { adminCompatRoutes } from "./routes/admin-compat.js";
import { receiptPdfRoutes } from "./routes/receipt-pdf.js";
import { orgCampaignRoutes } from "./routes/org-campaigns.js";
import { uploadRoutes } from "./routes/upload.js";
import { campaignPageRoutes } from "./routes/campaign-page.js";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: any, reply: any) => Promise<void>;
    requireRole: (...roles: string[]) => (request: any, reply: any) => Promise<void>;
  }
}

export function buildServer() {
  const app = Fastify({
    logger: true
  });

  app.register(cors, {
    origin: getCorsOrigins(),
    credentials: true
  });
  app.register(helmet, {
    contentSecurityPolicy: env.NODE_ENV === "development" ? false : undefined,
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
      prefix: "/uploads/"
    });
  }

  app.decorate("authenticate", async (request: any, reply: any) => {
    try {
      await request.jwtVerify();
    } catch {
      reply.code(401).send({ error: "Unauthorized" });
    }
  });

  app.decorate("requireRole", (...roles: string[]) => {
    return async (request: any, reply: any) => {
      const role = request.user?.role;
      if (!role || !roles.includes(role)) {
        reply.code(403).send({ error: "Forbidden" });
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
  app.register(orgCampaignRoutes);
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
    app.register(publicRoutes);
    app.register(authRoutes);
    app.register(donorsRoutes);
    app.register(notificationRoutes);
    app.register(adminCompatRoutes);
    app.register(receiptPdfRoutes);
  }

  const adminPort = parseInt(process.env.ADMIN_DEV_PORT || "8080", 10);
  if (env.NODE_ENV === "development") {
    app.register(httpProxy, {
      upstream: `http://127.0.0.1:${adminPort}`,
      prefix: "/admin",
      rewritePrefix: "/admin",
      websocket: false,
    });
  } else {
    const adminDist = path.resolve(
      new URL(".", import.meta.url).pathname,
      "../../..",
      "apps/admin/dist"
    );
    app.register(fastifyStatic, {
      root: adminDist,
      prefix: "/admin/",
      decorateReply: false,
      wildcard: false,
    });
    app.get("/admin", async (_req, reply) => {
      return reply.redirect("/admin/");
    });
    app.get("/admin/*", async (_req, reply) => {
      return reply.sendFile("index.html", adminDist);
    });
  }

  app.get("/api/system/features", async () => {
    return {
      auth: true,
      realtime: true,
      stripe: Boolean(env.STRIPE_SECRET_KEY),
      brevo: Boolean(env.BREVO_API_KEY),
      expoPush: Boolean(env.EXPO_ACCESS_TOKEN)
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
    return reply.code(404).send({ error: "Not Found" });
  });

  return app;
}
