import type { FastifyPluginAsync } from "fastify";
import { db } from "../lib/db.js";

const WEBSITE = "https://giveblackapp.com";
const SUPPORT_EMAIL = "info@giveblackapp.com";

export const receiptPdfRoutes: FastifyPluginAsync = async (app) => {
  const handler = async (request: any, reply: any) => {
    const q = request.query as Record<string, string>;
    const donationId = q.donationId;

    let orgName: string;
    let donorName: string;
    let isAnonymous: boolean;
    let date: string;
    let reference: string;
    let amount: number;
    let netToOrg: number;
    let platformFee: number;
    let educationAmount: number;
    let endowmentAmount: number;

    if (donationId) {
      const res = await db.query(
        `select d.id, d.amount, d.currency, d.paid_at, d.created_at,
                d.donor_name, d.donor_email, d.is_anonymous, d.stripe_payment_intent_id,
                o.name as org_name, o.absorb_fees
         from donations d
         left join organizations o on o.id = d.org_id
         where d.id = $1 and d.status = 'succeeded'
         limit 1`,
        [donationId]
      );
      const row = res.rows[0] as Record<string, unknown> | undefined;
      if (!row) {
        return reply.code(404).send({ error: "Donation not found or not yet completed" });
      }

      isAnonymous = Boolean(row.is_anonymous);
      orgName = (row.org_name as string) || "Organization";
      donorName = isAnonymous ? "Anonymous Donor" : ((row.donor_name as string) || "Donor");
      const paidDate = row.paid_at ? new Date(row.paid_at as string) : new Date(row.created_at as string);
      date = paidDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
      reference = (row.stripe_payment_intent_id as string || row.id as string).slice(-12).toUpperCase();
      amount = Number(row.amount);
      platformFee = parseFloat((amount * 0.03).toFixed(2));
      educationAmount = parseFloat((amount * 0.05).toFixed(2));
      endowmentAmount = parseFloat((amount * 0.01).toFixed(2));
      netToOrg = parseFloat((amount - platformFee - educationAmount - endowmentAmount).toFixed(2));
    } else {
      isAnonymous = q.isAnonymous === "true";
      orgName = q.orgName || "Organization";
      donorName = isAnonymous ? "Anonymous Donor" : (q.donorName || "Donor");
      date = q.date || new Date().toLocaleDateString();
      reference = q.reference || "N/A";
      amount = parseFloat(q.amount || "0");
      netToOrg = parseFloat(q.netToOrg || "0");
      platformFee = parseFloat(q.platformFee || "0");
      educationAmount = parseFloat(q.educationAmount || "0");
      endowmentAmount = parseFloat(q.endowmentAmount || "0");
    }

    // @ts-ignore -- pdfkit has no type declarations
    const PDFDocument = (await import("pdfkit")).default;
    const doc = new PDFDocument({ size: "A4", margin: 50 });

    reply.type("application/pdf");
    reply.header("Content-Disposition", `attachment; filename="GiveBlack-Receipt-${reference}.pdf"`);
    reply.header("Cache-Control", "no-cache");

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));

    const pdfReady = new Promise<Buffer>((resolve) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
    });

    const green = "#059669";
    const darkBg = "#111111";
    const gray = "#888888";
    const black = "#111111";
    const lightGray = "#e0e0e0";

    // ── Header ──────────────────────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 120).fill(darkBg);
    doc.fontSize(28).fillColor("#ffffff").text("GiveBlack", 50, 38, { align: "left" });
    doc.fontSize(12).fillColor(green).text("Donation Receipt", 50, 76, { align: "left" });

    // ── Donor / org details ─────────────────────────────────────────────
    let y = 150;

    const labelX = 50;
    const valueX = 220;

    function row(label: string, value: string, valueColor = black) {
      doc.fontSize(11).fillColor(gray).text(label, labelX, y);
      doc.fontSize(12).fillColor(valueColor).text(value, valueX, y);
      y += 26;
    }

    row("Date", date);
    row("Reference", reference);
    row("Donor", donorName);
    row("Organization", orgName);

    // ── Divider ─────────────────────────────────────────────────────────
    y += 10;
    doc.moveTo(50, y).lineTo(545, y).strokeColor(lightGray).stroke();
    y += 22;

    // ── Payment Summary ─────────────────────────────────────────────────
    doc.fontSize(14).fillColor(black).text("Payment Details", labelX, y);
    y += 32;

    function amountRow(label: string, value: number, color = black) {
      doc.fontSize(11).fillColor(gray).text(label, labelX, y);
      doc.fontSize(12).fillColor(color).text(`$${value.toFixed(2)}`, 400, y, { width: 145, align: "right" });
      y += 26;
    }

    amountRow("Total Charged", amount);
    amountRow("Platform Fee (3%)", platformFee);
    amountRow("Education Investment (5%)", educationAmount);
    amountRow("Endowment Contribution (1%)", endowmentAmount);

    // Divider before net line
    y += 4;
    doc.moveTo(labelX, y).lineTo(545, y).strokeColor(lightGray).stroke();
    y += 16;

    amountRow("Net to Organization", netToOrg, green);

    // ── Divider ─────────────────────────────────────────────────────────
    y += 16;
    doc.moveTo(50, y).lineTo(545, y).strokeColor(lightGray).stroke();
    y += 24;

    // ── Disclaimer ──────────────────────────────────────────────────────
    doc.fontSize(10).fillColor(gray).text(
      "This receipt is provided for your records. GiveBlack is a platform that facilitates donations to Black-led educational organizations. Please consult your tax advisor regarding the deductibility of this donation.",
      labelX, y, { width: 495, lineGap: 4 }
    );

    y += 58;

    // ── Footer ───────────────────────────────────────────────────────────
    doc.moveTo(50, y).lineTo(545, y).strokeColor(lightGray).stroke();
    y += 16;

    doc.fontSize(9).fillColor("#888888")
      .text(`GiveBlack · ${WEBSITE} · ${SUPPORT_EMAIL}`, labelX, y, { align: "center", width: 495 });

    doc.end();

    const pdfBuffer = await pdfReady;
    return reply.send(pdfBuffer);
  };

  // NOTE: In production nginx only proxies `/c/*` and `/app/*` to the API.
  // Keep `/receipt-pdf` for local/dev, and serve `/c/receipt-pdf` for the public donation thank-you flow.
  app.get("/receipt-pdf", handler);
  app.get("/c/receipt-pdf", handler);
};
