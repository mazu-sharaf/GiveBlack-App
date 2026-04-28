import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { db } from "../lib/db.js";
import { getStripe } from "../services/stripe.js";
import { resolveDonorAvatarUrl } from "../lib/donor-portrait.js";

function splitNameParts(display: string): { first_name: string; last_name: string } {
  const t = display.trim();
  if (!t) return { first_name: "", last_name: "" };
  const i = t.indexOf(" ");
  if (i === -1) return { first_name: t, last_name: "" };
  return { first_name: t.slice(0, i), last_name: t.slice(i + 1).trim() };
}

type TopDonorRow = {
  id: string;
  email?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
  total_amount_cents: number | string | bigint;
  donation_count: number;
  last_donation_at?: string | null;
};

async function queryTopDonorRows(limit: number) {
  const res = await db.query(
    `select u.id,
            u.email,
            u.full_name,
            u.avatar_url,
            s.total_amount_cents,
            s.donation_count,
            s.last_donation_at
     from donor_stats s
     join users u on u.id = s.user_id
     order by s.total_amount_cents desc,
              s.donation_count desc,
              s.last_donation_at desc nulls last,
              s.user_id desc
     limit $1`,
    [limit]
  );
  return res.rows as TopDonorRow[];
}

function mapTopDonorRow(row: TopDonorRow, includeEmail: boolean) {
  const display = String(row.full_name || "").trim() || "Anonymous supporter";
  const { first_name, last_name } = splitNameParts(display);
  const cents = Number(row.total_amount_cents ?? 0);
  const avatar_url = resolveDonorAvatarUrl(row.id, first_name, row.avatar_url, last_name);
  const base = {
    id: row.id,
    name: display,
    first_name,
    last_name,
    avatar_url,
    total_amount_cents: cents,
    donation_count: row.donation_count,
  };
  if (includeEmail) {
    return { ...base, email: String(row.email || "").trim() || null };
  }
  return base;
}

export const donorsRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/api/me/donations/pending-count",
    { preHandler: [app.authenticate] },
    async (request) => {
      const user = request.user as { sub: string };
      const res = await db.query(
        `SELECT COUNT(*)::int AS pending_count
         FROM donations
         WHERE user_id = $1::uuid
           AND status = 'pending'`,
        [user.sub]
      );
      const row = res.rows[0] as { pending_count: number } | undefined;
      return { pending_count: row?.pending_count ?? 0 };
    }
  );

  app.get(
    "/api/me/donations/summary",
    { preHandler: [app.authenticate] },
    async (request) => {
      const user = request.user as { sub: string };

      // Primary source for leaderboard + rank: donor_stats (kept in sync during donation flows).
      const statsRes = await db.query(
        `select total_amount_cents, donation_count, first_donation_at, last_donation_at
         from donor_stats
         where user_id = $1::uuid
         limit 1`,
        [user.sub]
      );
      const s = statsRes.rows[0] as
        | { total_amount_cents: string | bigint; donation_count: number; first_donation_at: string | null; last_donation_at: string | null }
        | undefined;

      let total = Number(s?.total_amount_cents ?? 0);
      let donationCount = Number(s?.donation_count ?? 0);
      let firstDonationAt = s?.first_donation_at ?? null;
      let lastDonationAt = s?.last_donation_at ?? null;

      // Safety net: donor_stats can be missing OR stale (e.g. webhook lag, older rows).
      // Recompute from source-of-truth donations when needed.
      const sumRes = await db.query(
        `select
           coalesce(sum((d.amount * 100)::bigint), 0)::bigint as total_amount_cents,
           count(d.id)::int as donation_count,
           min(d.created_at) as first_donation_at,
           max(d.created_at) as last_donation_at
         from donations d
         where d.status = 'succeeded'
           and d.user_id = $1::uuid`,
        [user.sub]
      );
      const agg = sumRes.rows[0] as {
        total_amount_cents: string | bigint;
        donation_count: number;
        first_donation_at: string | null;
        last_donation_at: string | null;
      };
      const srcTotal = Number(agg.total_amount_cents ?? 0);
      const srcCount = Number(agg.donation_count ?? 0);
      const srcFirst = agg.first_donation_at ?? null;
      const srcLast = agg.last_donation_at ?? null;

      const stale =
        !s ||
        total !== srcTotal ||
        donationCount !== srcCount ||
        String(lastDonationAt ?? "") !== String(srcLast ?? "");

      if (stale) {
        total = srcTotal;
        donationCount = srcCount;
        firstDonationAt = srcFirst;
        lastDonationAt = srcLast;
        await db.query(
          `insert into donor_stats (user_id, total_amount_cents, donation_count, first_donation_at, last_donation_at)
           values ($1, $2, $3, $4, $5)
           on conflict (user_id) do update set
             total_amount_cents = excluded.total_amount_cents,
             donation_count = excluded.donation_count,
             first_donation_at = excluded.first_donation_at,
             last_donation_at = excluded.last_donation_at`,
          [user.sub, total, donationCount, firstDonationAt, lastDonationAt]
        );
      }

      const rankRes = await db.query(
        `select (1 + count(*)::int) as rank
         from donor_stats s
         where
           (s.total_amount_cents > $1::bigint)
           or (s.total_amount_cents = $1::bigint and s.donation_count > $2::int)
           or (
             s.total_amount_cents = $1::bigint
             and s.donation_count = $2::int
             and coalesce(s.last_donation_at, '1970-01-01'::timestamptz) > coalesce($3::timestamptz, '1970-01-01'::timestamptz)
           )
           or (
             s.total_amount_cents = $1::bigint
             and s.donation_count = $2::int
             and coalesce(s.last_donation_at, '1970-01-01'::timestamptz) = coalesce($3::timestamptz, '1970-01-01'::timestamptz)
             and s.user_id::text > $4::text
           )`,
        [total, donationCount, lastDonationAt, user.sub]
      );
      const rankRow = rankRes.rows[0] as { rank: number } | undefined;

      return {
        total_amount_cents: total,
        donation_count: donationCount,
        first_donation_at: firstDonationAt,
        last_donation_at: lastDonationAt,
        rank: rankRow?.rank ?? null,
      };
    }
  );

  app.get("/api/donors/top", async (request) => {
    const { limit = "20" } = request.query as { limit?: string };
    const lim = Math.min(Math.max(parseInt(limit || "20", 10) || 20, 1), 100);

    const rows = await queryTopDonorRows(lim);
    const donors = rows.map((r) => mapTopDonorRow(r, false));
    return { donors };
  });

  app.get(
    "/api/admin/donors/top",
    { preHandler: [app.authenticate, app.requireRole("admin", "super_admin", "manager", "staff")] },
    async (request) => {
      const { limit = "20" } = request.query as { limit?: string };
      const lim = Math.min(Math.max(parseInt(limit || "20", 10) || 20, 1), 100);
      const rows = await queryTopDonorRows(lim);
      const donors = rows.map((r) => mapTopDonorRow(r, true));
      return { donors };
    }
  );

  app.patch(
    "/api/me/profile",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const user = request.user as { sub: string };
      const body = request.body as { name?: string };
      const name = typeof body.name === "string" ? body.name.trim() : undefined;
      if (!name) return reply.code(400).send({ error: "name is required" });
      if (name.length > 120) return reply.code(400).send({ error: "name is too long" });

      await db.query("update users set full_name = $1 where id = $2", [name, user.sub]);
      await db.query(
        `update profiles set name = $1 where id = $2`,
        [name, user.sub]
      );

      return { success: true, name };
    }
  );

  app.post(
    "/api/profile/avatar",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const user = request.user as { sub: string };
      const body = request.body as { avatar_url?: string };
      if (!body.avatar_url) return reply.code(400).send({ error: "avatar_url required" });

      await db.query(
        "update users set avatar_url = $1, avatar_source = 'manual' where id = $2",
        [body.avatar_url, user.sub]
      );

      return { avatar_url: body.avatar_url };
    }
  );

  app.delete(
    "/api/profile/avatar",
    { preHandler: [app.authenticate] },
    async (request) => {
      const user = request.user as { sub: string };
      await db.query("update users set avatar_url = null, avatar_source = null where id = $1", [user.sub]);
      return { success: true };
    }
  );

  const claimDonationSchema = z.object({
    stripeCheckoutSessionId: z.string().min(1),
  });

  app.post(
    "/api/donations/claim",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const body = claimDonationSchema.parse(request.body);
      const user = request.user as { sub: string; role?: string };
      if (user.role !== "donor") {
        return reply.code(403).send({ error: "Only donor accounts can claim donations" });
      }

      const stripe = getStripe();
      if (!stripe) return reply.code(503).send({ error: "Payments not configured" });

      const session = await stripe.checkout.sessions.retrieve(body.stripeCheckoutSessionId);
      const piId = typeof session.payment_intent === "string" ? session.payment_intent : null;

      const donRes = await db.query(
        `SELECT id, user_id, donor_email, is_anonymous, amount, status, created_at
         FROM donations
         WHERE stripe_payment_intent_id = $1 OR ($2::text IS NOT NULL AND stripe_payment_intent_id = $2)
         LIMIT 1`,
        [session.id, piId]
      );
      if (!donRes.rowCount) return reply.code(404).send({ error: "Donation not found" });

      const d = donRes.rows[0] as {
        id: string;
        user_id: string | null;
        donor_email: string | null;
        is_anonymous: boolean;
        amount: string;
        status: string;
        created_at: string;
      };

      if (d.user_id && d.user_id !== user.sub) {
        return reply.code(409).send({ error: "This donation is already linked to another account" });
      }
      if (d.user_id === user.sub) {
        return { success: true, alreadyLinked: true, donationId: d.id };
      }

      const ures = await db.query("select lower(trim(email)) as email from users where id = $1", [user.sub]);
      const userEmail = String((ures.rows[0] as { email?: string })?.email || "").toLowerCase();
      const sess = session as unknown as { customer_details?: { email?: string | null }; customer_email?: string | null };
      const stripeEmail = String(sess.customer_details?.email || sess.customer_email || "").toLowerCase();
      const donorEmail = String(d.donor_email || "").toLowerCase();

      const emailOk = donorEmail ? donorEmail === userEmail : Boolean(stripeEmail && stripeEmail === userEmail);
      if (!emailOk) {
        return reply.code(403).send({ error: "Email must match the donation or Stripe receipt" });
      }

      await db.query(`UPDATE donations SET user_id = $1 WHERE id = $2`, [user.sub, d.id]);

      if (d.status === "succeeded") {
        const cents = Math.round(Number(d.amount) * 100);
        await db.query(
          `insert into donor_stats (user_id, total_amount_cents, donation_count, first_donation_at, last_donation_at)
           values ($1, $2::bigint, 1, $3::timestamptz, $3::timestamptz)
           on conflict (user_id) do update set
             total_amount_cents = donor_stats.total_amount_cents + EXCLUDED.total_amount_cents,
             donation_count = donor_stats.donation_count + 1,
             first_donation_at = least(donor_stats.first_donation_at, EXCLUDED.first_donation_at),
             last_donation_at = greatest(donor_stats.last_donation_at, EXCLUDED.last_donation_at)`,
          [user.sub, cents, d.created_at]
        );
      }

      return { success: true, donationId: d.id };
    }
  );
};

