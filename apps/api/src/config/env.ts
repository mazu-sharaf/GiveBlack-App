import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(5000),
  API_HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().default(""),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().default(30),
  CORS_ORIGINS: z.string().default("*"),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_GROWTH: z.string().default("price_1TA2CPBk2z7Pp8h03aNgWKxt"),
  STRIPE_PRICE_INSTITUTIONAL: z.string().default("price_1TA2DnBk2z7Pp8h0GFcDMfQ3"),
  STRIPE_PRODUCT_GROWTH: z.string().default("prod_U8Iotu17CesgKO"),
  STRIPE_PRODUCT_INSTITUTIONAL: z.string().default("prod_U8IpZXR2R0SNHb"),
  BREVO_API_KEY: z.string().optional(),
  /** Legacy/alternate env name sometimes used for Brevo/Sendinblue */
  SENDINBLUE_API_KEY: z.string().optional(),
  BREVO_SENDER_EMAIL: z.string().email().optional(),
  /** Legacy/alternate env name for from-address */
  BREVO_FROM_EMAIL: z.string().email().optional(),
  BREVO_SENDER_NAME: z.string().default("GiveBlack"),
  ADMIN_EMAIL: z.string().email().optional(),
  APP_URL: z.string().url().optional(),
  /** Site origin for admin deep links in emails (paths are under /admin/...). Optional; falls back to APP_URL. */
  ADMIN_PANEL_URL: z.string().url().optional(),
  SUPPORT_EMAIL: z.string().email().optional(),
  EMAIL_LOGO_URL: z.string().url().optional(),
  /** Expo access token used for push delivery (preferred name). */
  EXPO_TOKEN: z.string().min(1).optional(),
  /** Back-compat alias for EXPO_TOKEN (some deploy setups use this name). */
  EXPO_ACCESS_TOKEN: z.string().min(1).optional(),
  EXPO_PUBLIC_API_URL: z.string().optional(),
  /** Public App Store / Play Store links for thank-you and marketing pages */
  APP_STORE_URL: z.string().optional(),
  PLAY_STORE_URL: z.string().optional(),
  /** Optional web URL for donor login (e.g. deep link or landing) */
  DONOR_LOGIN_WEB_URL: z.string().optional(),
  /** Comma-separated Google OAuth client IDs (Web, iOS, Android) for id_token audience checks */
  GOOGLE_OAUTH_CLIENT_IDS: z.string().optional(),
  /** Sign in with Apple: usually the iOS bundle id (e.g. com.giveblack.app) */
  APPLE_CLIENT_ID: z.string().optional()
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Invalid API environment variables:\n${issues}`);
}

export const env = parsed.data;

export function getCorsOrigins(): string[] | true {
  if (env.CORS_ORIGINS.trim() === "*") return true;
  return env.CORS_ORIGINS.split(",").map((v) => v.trim()).filter(Boolean);
}
