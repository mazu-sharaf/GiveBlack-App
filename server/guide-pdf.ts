import PDFDocument from "pdfkit";
import type { Response } from "express";

const GREEN = "#2D9E6B";
const DARK = "#1A1A1A";
const GRAY = "#555555";
const LIGHT_BG = "#F5F5F5";

function addHeader(doc: PDFKit.PDFDocument, text: string, yOffset?: number) {
  if (yOffset) doc.moveDown(yOffset);
  if (doc.y > 700) doc.addPage();
  doc.fontSize(18).fillColor(GREEN).font("Helvetica-Bold").text(text);
  doc.moveDown(0.3);
  doc
    .moveTo(doc.x, doc.y)
    .lineTo(doc.x + 460, doc.y)
    .strokeColor(GREEN)
    .lineWidth(1.5)
    .stroke();
  doc.moveDown(0.5);
  doc.fillColor(DARK);
}

function addSubHeader(doc: PDFKit.PDFDocument, text: string) {
  if (doc.y > 710) doc.addPage();
  doc.fontSize(13).fillColor(GREEN).font("Helvetica-Bold").text(text);
  doc.moveDown(0.3);
  doc.fillColor(DARK);
}

function addParagraph(doc: PDFKit.PDFDocument, text: string) {
  if (doc.y > 710) doc.addPage();
  doc.fontSize(10).fillColor(GRAY).font("Helvetica").text(text, { lineGap: 3 });
  doc.moveDown(0.4);
}

function addCode(doc: PDFKit.PDFDocument, code: string) {
  if (doc.y > 680) doc.addPage();
  const x = doc.x;
  const lines = code.split("\n");
  const blockHeight = lines.length * 13 + 16;
  doc.save();
  doc.roundedRect(x - 4, doc.y - 4, 468, blockHeight, 4).fill("#1E1E1E");
  doc.fontSize(9).fillColor("#D4D4D4").font("Courier");
  lines.forEach((line) => {
    doc.text(line, x + 6, undefined as any, { lineGap: 2 });
  });
  doc.restore();
  doc.moveDown(0.6);
  doc.fillColor(DARK).font("Helvetica");
}

function addBullet(doc: PDFKit.PDFDocument, text: string) {
  if (doc.y > 720) doc.addPage();
  doc
    .fontSize(10)
    .fillColor(GRAY)
    .font("Helvetica")
    .text(`  \u2022  ${text}`, { lineGap: 2 });
}

function addNumbered(doc: PDFKit.PDFDocument, num: number, text: string) {
  if (doc.y > 720) doc.addPage();
  doc
    .fontSize(10)
    .fillColor(GRAY)
    .font("Helvetica")
    .text(`  ${num}.  ${text}`, { lineGap: 2 });
}

export function generateVPSGuide(res: Response) {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 50, bottom: 50, left: 55, right: 55 },
    info: {
      Title: "GiveBlack VPS Deployment Guide",
      Author: "GiveBlack Team",
      Subject: "How to deploy and run GiveBlack on a VPS",
    },
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    "attachment; filename=GiveBlack-VPS-Deployment-Guide.pdf",
  );
  doc.pipe(res);

  // ── Title Page ──
  doc.moveDown(6);
  doc
    .fontSize(36)
    .fillColor(GREEN)
    .font("Helvetica-Bold")
    .text("GiveBlack", { align: "center" });
  doc.moveDown(0.3);
  doc
    .fontSize(16)
    .fillColor(DARK)
    .font("Helvetica")
    .text("VPS Deployment Guide", { align: "center" });
  doc.moveDown(0.5);
  doc
    .fontSize(10)
    .fillColor(GRAY)
    .text("Complete guide to deploying and running the GiveBlack", {
      align: "center",
    });
  doc.text("donation platform on your own server", { align: "center" });
  doc.moveDown(2);
  doc
    .moveTo(180, doc.y)
    .lineTo(415, doc.y)
    .strokeColor(GREEN)
    .lineWidth(2)
    .stroke();
  doc.moveDown(2);
  doc.fontSize(10).fillColor(GRAY).text("Version 1.0", { align: "center" });
  doc.text(
    new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    { align: "center" },
  );

  // ── Table of Contents ──
  doc.addPage();
  addHeader(doc, "Table of Contents");
  doc.moveDown(0.3);
  const toc = [
    "1. Prerequisites",
    "2. Clone the Repository",
    "3. Install Dependencies",
    "4. Environment Configuration",
    "5. Database Setup (PostgreSQL)",
    "6. Build the Application",
    "7. Run with PM2 (Process Manager)",
    "8. Nginx Reverse Proxy & SSL",
    "9. Accessing the App",
    "10. Updating the App",
    "11. Troubleshooting",
    "12. Useful Commands Reference",
  ];
  toc.forEach((item) => {
    doc
      .fontSize(11)
      .fillColor(DARK)
      .font("Helvetica")
      .text(item, { lineGap: 6 });
  });

  // ── 1. Prerequisites ──
  doc.addPage();
  addHeader(doc, "1. Prerequisites");
  addParagraph(
    doc,
    "Before you begin, make sure your VPS has the following installed:",
  );
  doc.moveDown(0.2);
  addBullet(doc, "Ubuntu 20.04+ or Debian 11+ (recommended)");
  addBullet(doc, "Node.js 20 or later (use nvm for easy management)");
  addBullet(doc, "npm (comes with Node.js)");
  addBullet(doc, "Git");
  addBullet(doc, "PM2 (process manager for Node.js)");
  addBullet(doc, "Nginx (reverse proxy and SSL termination)");
  addBullet(doc, "Certbot (free SSL certificates from Let's Encrypt)");
  doc.moveDown(0.5);

  addSubHeader(doc, "Install Node.js 20 via nvm");
  addCode(
    doc,
    `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash\nsource ~/.bashrc\nnvm install 20\nnvm use 20\nnvm alias default 20`,
  );

  addSubHeader(doc, "Install PM2, Nginx, and Certbot");
  addCode(
    doc,
    `npm install -g pm2\nsudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx`,
  );

  // ── 2. Clone Repository ──
  addHeader(doc, "2. Clone the Repository", 1);
  addParagraph(
    doc,
    "Push your code from Replit to GitHub first, then clone it on your VPS:",
  );
  addCode(
    doc,
    `cd /home/your-user\ngit clone https://github.com/YOUR_USERNAME/giveblack.git\ncd giveblack`,
  );

  // ── 3. Install Dependencies ──
  addHeader(doc, "3. Install Dependencies", 1);
  addParagraph(doc, "Install all Node.js packages:");
  addCode(doc, `npm install`);
  addParagraph(
    doc,
    "This installs both frontend (Expo/React Native) and backend (Express) dependencies.",
  );

  // ── 4. Environment Configuration ──
  doc.addPage();
  addHeader(doc, "4. Environment Configuration");
  addParagraph(
    doc,
    "Copy the example environment file and fill in your values:",
  );
  addCode(doc, `cp .env.example .env\nnano .env`);
  doc.moveDown(0.3);

  addSubHeader(doc, "Required Environment Variables");
  doc.moveDown(0.2);

  const envVars = [
    [
      "DATABASE_URL",
      "PostgreSQL connection string",
      "postgresql://user:pass@localhost:5432/giveblack_db",
    ],
    [
      "EXPO_PUBLIC_DOMAIN",
      "Your production domain (no protocol)",
      "giveblack.yourdomain.com",
    ],
    ["STRIPE_SECRET_KEY", "Stripe secret key for payments", "sk_live_..."],
    ["PORT", "Server port (default: 5000)", "5000"],
    [
      "SESSION_SECRET",
      "Random string for session security",
      "your-random-secret-here",
    ],
  ];

  envVars.forEach(([name, desc, example]) => {
    doc
      .fontSize(10)
      .fillColor(GREEN)
      .font("Helvetica-Bold")
      .text(name!, { continued: true });
    doc.fillColor(GRAY).font("Helvetica").text(`  -  ${desc}`);
    doc
      .fontSize(9)
      .fillColor("#888888")
      .font("Courier")
      .text(`    Example: ${example}`);
    doc.moveDown(0.2);
  });

  addParagraph(
    doc,
    "Important: The EXPO_PUBLIC_ variables must match their non-prefixed counterparts. The EXPO_PUBLIC_ prefix makes them available to the Expo frontend at build time.",
  );

  // ── 5. Database Setup ──
  doc.addPage();
  addHeader(doc, "5. Database Setup (PostgreSQL)");
  addParagraph(
    doc,
    "GiveBlack uses PostgreSQL for its database. Your database should already be set up from Replit development. Connect using DATABASE_URL.",
  );
  doc.moveDown(0.3);

  addSubHeader(doc, "Verify Tables Exist");
  addParagraph(
    doc,
    "Connect to your PostgreSQL database and confirm these tables exist:",
  );
  addBullet(doc, "user_profiles - User profile data");
  addBullet(doc, "organizations - Charity/organization listings");
  addBullet(doc, "categories - Organization categories");
  addBullet(doc, "donations - Donation records");
  addBullet(doc, "transactions - Transaction history (top-ups, donations)");
  addBullet(doc, "wallets - User wallet balances");
  addBullet(doc, "favorites - User favorite organizations");
  addBullet(doc, "saved_cards - Saved payment methods");
  addBullet(doc, "push_tokens - Push notification tokens");
  addBullet(doc, "campaigns - Campaign data");
  doc.moveDown(0.3);

  addSubHeader(doc, "Row Level Security (RLS)");
  addParagraph(
    doc,
    "Ensure RLS is enabled on all user-facing tables. Each table should have policies that restrict SELECT and INSERT to rows matching auth.uid() = user_id. This is critical for data isolation between users.",
  );
  doc.moveDown(0.3);

  addSubHeader(doc, "Push Schema with Drizzle (Optional)");
  addCode(doc, `npm run db:push`);
  addParagraph(
    doc,
    "This syncs your Drizzle schema definitions with the database. Only needed if you've made schema changes.",
  );

  // ── 6. Build the Application ──
  doc.addPage();
  addHeader(doc, "6. Build the Application");
  addParagraph(
    doc,
    "The build process has two steps: building the Expo frontend bundles and building the Express backend.",
  );
  doc.moveDown(0.3);

  addSubHeader(doc, "Step 1: Build Expo Static Bundles");
  addCode(doc, `npm run expo:static:build`);
  addParagraph(doc, "This command:");
  addNumbered(doc, 1, "Starts a local Metro bundler");
  addNumbered(doc, 2, "Downloads iOS and Android JavaScript bundles");
  addNumbered(doc, 3, "Extracts all assets (images, fonts)");
  addNumbered(doc, 4, "Generates manifest files with your production domain");
  addNumbered(doc, 5, "Saves everything to the static-build/ directory");
  doc.moveDown(0.3);
  addParagraph(
    doc,
    "Note: This step requires your EXPO_PUBLIC_DOMAIN to be set correctly in .env before building.",
  );
  doc.moveDown(0.3);

  addSubHeader(doc, "Step 2: Build the Express Server");
  addCode(doc, `npm run server:build`);
  addParagraph(
    doc,
    "This bundles the TypeScript server code into optimized JavaScript in the server_dist/ directory using esbuild.",
  );

  // ── 7. Run with PM2 ──
  addHeader(doc, "7. Run with PM2 (Process Manager)", 1.5);
  addParagraph(
    doc,
    "PM2 keeps your app running 24/7, auto-restarts on crashes, and survives server reboots.",
  );
  doc.moveDown(0.3);

  addSubHeader(doc, "Start the Production Server");
  addCode(doc, `pm2 start "npm run server:prod" --name giveblack-api`);
  doc.moveDown(0.2);

  addSubHeader(doc, "Save and Enable Auto-Start");
  addCode(doc, `pm2 save\npm2 startup`);
  addParagraph(
    doc,
    "The pm2 startup command outputs a system command. Copy and run it to enable PM2 to start on boot.",
  );
  doc.moveDown(0.3);

  addSubHeader(doc, "Verify It's Running");
  addCode(doc, `pm2 status\npm2 logs giveblack-api`);

  // ── 8. Nginx Reverse Proxy ──
  doc.addPage();
  addHeader(doc, "8. Nginx Reverse Proxy & SSL");
  addParagraph(
    doc,
    "Nginx acts as a reverse proxy, forwarding requests from port 80/443 to your Node.js app on port 5000. It also handles SSL termination.",
  );
  doc.moveDown(0.3);

  addSubHeader(doc, "Create Nginx Configuration");
  addCode(doc, `sudo nano /etc/nginx/sites-available/giveblack`);
  doc.moveDown(0.2);
  addParagraph(
    doc,
    "Paste the following configuration (replace giveblack.yourdomain.com with your actual domain):",
  );
  addCode(
    doc,
    `server {\n    listen 80;\n    server_name giveblack.yourdomain.com;\n\n    location / {\n        proxy_pass http://127.0.0.1:5000;\n        proxy_http_version 1.1;\n        proxy_set_header Upgrade $http_upgrade;\n        proxy_set_header Connection 'upgrade';\n        proxy_set_header Host $host;\n        proxy_set_header X-Real-IP $remote_addr;\n        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n        proxy_set_header X-Forwarded-Proto $scheme;\n        proxy_cache_bypass $http_upgrade;\n    }\n}`,
  );

  addSubHeader(doc, "Enable the Site");
  addCode(
    doc,
    `sudo ln -s /etc/nginx/sites-available/giveblack /etc/nginx/sites-enabled/\nsudo nginx -t\nsudo systemctl reload nginx`,
  );

  addSubHeader(doc, "Install SSL Certificate (Let's Encrypt)");
  addCode(doc, `sudo certbot --nginx -d giveblack.yourdomain.com`);
  addParagraph(
    doc,
    "Certbot will automatically configure HTTPS and set up auto-renewal. Follow the prompts to complete the SSL setup.",
  );

  // ── 9. Accessing the App ──
  doc.addPage();
  addHeader(doc, "9. Accessing the App");
  addParagraph(doc, "Once deployed, your app is accessible in multiple ways:");
  doc.moveDown(0.3);

  addSubHeader(doc, "Landing Page (Web Browser)");
  addParagraph(
    doc,
    "Visit https://giveblack.yourdomain.com in any browser. You'll see the GiveBlack landing page with a QR code and deep link to open the app in Expo Go.",
  );
  doc.moveDown(0.3);

  addSubHeader(doc, "Expo Go (Mobile Device)");
  addNumbered(doc, 1, "Install Expo Go from the App Store or Google Play");
  addNumbered(doc, 2, "Visit your domain on your phone's browser");
  addNumbered(doc, 3, "Tap the 'Open in Expo Go' link or scan the QR code");
  addNumbered(doc, 4, "The app loads from your server's static bundles");
  doc.moveDown(0.3);

  addSubHeader(doc, "Web View");
  addParagraph(
    doc,
    "The app also runs as a web app. Visit your domain and the Expo web bundle will load directly in the browser.",
  );
  doc.moveDown(0.3);

  addSubHeader(doc, "API Endpoints");
  addParagraph(
    doc,
    "The Express backend serves API endpoints at /api/*. For example:",
  );
  addBullet(doc, "GET  /api/admin/overview - Admin dashboard stats");
  addBullet(doc, "POST /api/transactions - Create a transaction");
  addBullet(doc, "POST /api/wallet/topup - Top up wallet");
  addBullet(doc, "GET  /api/charity-donations/:email - Charity donations");

  // ── 10. Updating the App ──
  addHeader(doc, "10. Updating the App", 1.5);
  addParagraph(
    doc,
    "When you push changes from Replit to GitHub, update your VPS with these steps:",
  );
  doc.moveDown(0.3);
  addCode(
    doc,
    `cd /home/your-user/giveblack\n\n# Pull latest changes\ngit pull origin main\n\n# Install any new dependencies\nnpm install\n\n# Rebuild Expo bundles (if frontend changed)\nnpm run expo:static:build\n\n# Rebuild server (if backend changed)\nnpm run server:build\n\n# Restart the app\npm2 restart giveblack-api`,
  );
  doc.moveDown(0.3);
  addParagraph(
    doc,
    "Tip: If only the backend changed, you can skip the expo:static:build step. If only the frontend changed, you can skip server:build.",
  );

  // ── 11. Troubleshooting ──
  doc.addPage();
  addHeader(doc, "11. Troubleshooting");
  doc.moveDown(0.3);

  addSubHeader(doc, "App won't start");
  addBullet(doc, "Check logs: pm2 logs giveblack-api");
  addBullet(doc, "Verify .env file has all required variables");
  addBullet(doc, "Make sure port 5000 is not in use: lsof -i :5000");
  addBullet(doc, "Check Node.js version: node --version (must be 20+)");
  doc.moveDown(0.3);

  addSubHeader(doc, "502 Bad Gateway (Nginx)");
  addBullet(doc, "The Node.js app is not running - check pm2 status");
  addBullet(doc, "Wrong port in Nginx config - must match PORT in .env");
  addBullet(
    doc,
    "Check Nginx error log: sudo tail -f /var/log/nginx/error.log",
  );
  doc.moveDown(0.3);

  addSubHeader(doc, "Expo Go can't connect");
  addBullet(
    doc,
    "Verify EXPO_PUBLIC_DOMAIN in .env matches your actual domain",
  );
  addBullet(
    doc,
    "Rebuild static bundles after changing the domain: npm run expo:static:build",
  );
  addBullet(
    doc,
    "Check that /manifest returns valid JSON: curl https://yourdomain.com/manifest",
  );
  doc.moveDown(0.3);

  addSubHeader(doc, "Database connection issues");
  addBullet(doc, "Verify DATABASE_URL is correct and the PostgreSQL server is reachable");
  addBullet(doc, "Check PostgreSQL logs for connection or query errors");
  addBullet(doc, "Ensure the database user has the required permissions");
  doc.moveDown(0.3);

  addSubHeader(doc, "SSL certificate issues");
  addBullet(doc, "Re-run: sudo certbot --nginx -d giveblack.yourdomain.com");
  addBullet(doc, "Check certificate renewal: sudo certbot renew --dry-run");
  addBullet(
    doc,
    "Certbot auto-renews via systemd timer - check: systemctl status certbot.timer",
  );

  // ── 12. Useful Commands ──
  addHeader(doc, "12. Useful Commands Reference", 1.5);
  doc.moveDown(0.3);

  const commands = [
    ["pm2 status", "Show all running processes"],
    ["pm2 logs giveblack-api", "View app logs (live)"],
    ["pm2 restart giveblack-api", "Restart the app"],
    ["pm2 stop giveblack-api", "Stop the app"],
    ["pm2 delete giveblack-api", "Remove from PM2"],
    ["pm2 monit", "Real-time monitoring dashboard"],
    ["sudo systemctl restart nginx", "Restart Nginx"],
    ["sudo nginx -t", "Test Nginx config for errors"],
    ["sudo certbot renew", "Renew SSL certificates"],
    ["npm run server:prod", "Run server directly (without PM2)"],
    ["npm run expo:static:build", "Rebuild Expo bundles"],
    ["npm run server:build", "Rebuild Express server"],
    ["npm run db:push", "Sync Drizzle schema to database"],
  ];

  commands.forEach(([cmd, desc]) => {
    doc
      .fontSize(9)
      .fillColor("#D4D4D4")
      .font("Courier")
      .text(`  ${cmd}`, { continued: true });
    doc.fontSize(9).fillColor(GRAY).font("Helvetica").text(`   ${desc}`);
    doc.moveDown(0.1);
  });

  // ── Footer ──
  doc.moveDown(3);
  doc
    .moveTo(55, doc.y)
    .lineTo(540, doc.y)
    .strokeColor(GREEN)
    .lineWidth(1)
    .stroke();
  doc.moveDown(0.5);
  doc
    .fontSize(9)
    .fillColor(GRAY)
    .font("Helvetica")
    .text(
      "GiveBlack Deployment Guide  |  Generated " +
        new Date().toISOString().slice(0, 10),
      { align: "center" },
    );
  doc.text("For support, contact the GiveBlack development team.", {
    align: "center",
  });

  doc.end();
}
