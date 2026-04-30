import type { FastifyPluginAsync } from "fastify";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../config/env.js";

function templatePath(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDir, "../../../../server/templates/admin-guide.html");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function originFromAppUrl(): string {
  const siteUrl = env.APP_URL || "https://giveblackapp.com/";
  try {
    const u = new URL(siteUrl);
    return u.origin;
  } catch {
    return "https://giveblackapp.com";
  }
}

/** Public URL for this guide: `/app/adminguide/` when API is behind nginx `/app/` (production); otherwise `/adminguide/`. */
function publicAdminguideUrl(origin: string): string {
  try {
    const { hostname } = new URL(origin);
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return `${origin}/adminguide/`;
    }
  } catch {
    /* use /app path below */
  }
  return `${origin}/app/adminguide/`;
}

export const adminGuidePageRoutes: FastifyPluginAsync = async (app) => {
  const render = async () => {
    const supportEmail = env.SUPPORT_EMAIL || "info@giveblackapp.com";
    const siteUrl = env.APP_URL || "https://giveblackapp.com/";
    let siteLabel = "giveblackapp.com";
    try {
      siteLabel = new URL(siteUrl).hostname || siteLabel;
    } catch {
      siteLabel = "giveblackapp.com";
    }
    const origin = originFromAppUrl();
    const backofficeUrl = `${origin}/backoffice/`;
    const adminguideUrl = publicAdminguideUrl(origin);
    let supportPageUrl = `${origin}/support/`;
    try {
      supportPageUrl = new URL("/support/", siteUrl).href;
    } catch {
      supportPageUrl = `${origin}/support/`;
    }

    const raw = await fs.readFile(templatePath(), "utf8");
    const mailtoHref = `mailto:${encodeURIComponent(supportEmail)}`;
    const html = raw
      .replaceAll("MAILTO_HREF_PLACEHOLDER", mailtoHref)
      .replaceAll("EMAIL_VISIBLE_PLACEHOLDER", escapeHtml(supportEmail))
      .replaceAll("SITE_URL_PLACEHOLDER", escapeHtml(siteUrl))
      .replaceAll("SITE_LABEL_PLACEHOLDER", escapeHtml(siteLabel))
      .replaceAll("BACKOFFICE_URL_PLACEHOLDER", escapeHtml(backofficeUrl))
      .replaceAll("ADMINGUIDE_URL_PLACEHOLDER", escapeHtml(adminguideUrl))
      .replaceAll("SUPPORT_PAGE_URL_PLACEHOLDER", escapeHtml(supportPageUrl));

    return html;
  };

  app.get("/adminguide", async (_req, reply) => {
    return reply.redirect("/adminguide/", 302);
  });

  app.get("/adminguide/", async (_req, reply) => {
    const html = await render();
    return reply.type("text/html; charset=utf-8").send(html);
  });
};
