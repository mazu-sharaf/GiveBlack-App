import type { FastifyPluginAsync } from "fastify";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../config/env.js";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", async () => {
    const expoPushDeliveryConfigured = Boolean(env.EXPO_TOKEN || env.EXPO_ACCESS_TOKEN);
    return {
      ok: true,
      service: "giveblack-api",
      ts: new Date().toISOString(),
      expoPushDeliveryConfigured
    };
  });

  // Serve landing page HTML at `/` (production + development).
  // Nginx already routes `/` to this API server.
  app.get("/", async (_req, reply) => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const templatePath = path.resolve(currentDir, "../../../../server/templates/landing-page.html");

    const template = await fs.readFile(templatePath, "utf8");
    const appName = "GiveBlack";
    const expsDomain = process.env.EXPO_PUBLIC_DOMAIN || "giveblackapp.com";

    const html = template
      .replaceAll("APP_NAME_PLACEHOLDER", appName)
      .replaceAll("EXPS_URL_PLACEHOLDER", expsDomain);

    return reply.type("text/html").send(html);
  });
};
