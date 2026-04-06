import type { FastifyPluginAsync } from "fastify";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../config/env.js";

function templatePath(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDir, "../../../../server/templates/support-page.html");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const supportPageRoutes: FastifyPluginAsync = async (app) => {
  const render = async () => {
    const supportEmail = env.SUPPORT_EMAIL || "info@giveblackapp.com";
    const siteUrl = env.APP_URL || "https://giveblackapp.com/";
    let siteLabel = "giveblackapp.com";
    try {
      siteLabel = new URL(siteUrl).hostname || siteLabel;
    } catch {
      siteLabel = "giveblackapp.com";
    }

    const storeBlocks: string[] = [];
    if (env.APP_STORE_URL) {
      const u = escapeHtml(env.APP_STORE_URL);
      storeBlocks.push(
        `<div class="card"><h2>App Store</h2><p class="links" style="margin:0"><a href="${u}" rel="noopener noreferrer">Download on the App Store</a></p></div>`
      );
    }
    if (env.PLAY_STORE_URL) {
      const u = escapeHtml(env.PLAY_STORE_URL);
      storeBlocks.push(
        `<div class="card"><h2>Google Play</h2><p class="links" style="margin:0"><a href="${u}" rel="noopener noreferrer">Get it on Google Play</a></p></div>`
      );
    }
    const storeLinksBlock = storeBlocks.length ? storeBlocks.join("\n") : "";

    const raw = await fs.readFile(templatePath(), "utf8");
    const mailtoHref = `mailto:${encodeURIComponent(supportEmail)}`;
    const html = raw
      .replaceAll("MAILTO_HREF_PLACEHOLDER", mailtoHref)
      .replaceAll("EMAIL_VISIBLE_PLACEHOLDER", escapeHtml(supportEmail))
      .replaceAll("SITE_URL_PLACEHOLDER", escapeHtml(siteUrl))
      .replaceAll("SITE_LABEL_PLACEHOLDER", escapeHtml(siteLabel))
      .replace("STORE_LINKS_BLOCK_PLACEHOLDER", storeLinksBlock);

    return html;
  };

  app.get("/support", async (_req, reply) => {
    return reply.redirect("/support/", 302);
  });

  app.get("/support/", async (_req, reply) => {
    const html = await render();
    return reply.type("text/html; charset=utf-8").send(html);
  });
};
