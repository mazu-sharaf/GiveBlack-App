import { db } from "../lib/db.js";
import { sendExpoPush, type PushMessage } from "./push.js";

export type NotificationPreferenceKey =
  | "donor_receipts"
  | "org_donations"
  | "org_volunteers"
  | "org_campaign_status"
  | "donor_new_campaigns_from_orgs_i_supported"
  | "new_campaigns";

const DEFAULT_PREFS: Record<NotificationPreferenceKey, boolean> = {
  donor_receipts: true,
  org_donations: true,
  org_volunteers: true,
  org_campaign_status: true,
  donor_new_campaigns_from_orgs_i_supported: true,
  new_campaigns: true,
};

export function defaultNotificationPreferences(): Record<NotificationPreferenceKey, boolean> {
  return { ...DEFAULT_PREFS };
}

function mergePrefs(raw: unknown): Record<NotificationPreferenceKey, boolean> {
  const base = defaultNotificationPreferences();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  for (const k of Object.keys(DEFAULT_PREFS) as NotificationPreferenceKey[]) {
    if (typeof o[k] === "boolean") base[k] = o[k];
  }
  return base;
}

export async function getNotificationPreferencesForUsers(
  userIds: string[]
): Promise<Map<string, Record<NotificationPreferenceKey, boolean>>> {
  const map = new Map<string, Record<NotificationPreferenceKey, boolean>>();
  if (!userIds.length) return map;
  const res = await db.query(
    `select id::text, notification_preferences from users where id = any($1::uuid[])`,
    [userIds]
  );
  for (const row of res.rows as Array<{ id: string; notification_preferences: unknown }>) {
    map.set(row.id, mergePrefs(row.notification_preferences));
  }
  for (const id of userIds) {
    if (!map.has(id)) map.set(id, defaultNotificationPreferences());
  }
  return map;
}

function filterByPreference(
  userIds: string[],
  prefMap: Map<string, Record<NotificationPreferenceKey, boolean>>,
  key: NotificationPreferenceKey
): string[] {
  return userIds.filter((id) => prefMap.get(id)?.[key] !== false);
}

async function fetchPushTokensForUsers(userIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (!userIds.length) return map;
  const res = await db.query(
    `select user_id::text as uid, expo_push_token from device_push_tokens
     where user_id = any($1::uuid[]) and disabled_at is null`,
    [userIds]
  );
  for (const row of res.rows as Array<{ uid: string; expo_push_token: string }>) {
    const t = row.expo_push_token;
    if (!t) continue;
    const list = map.get(row.uid) ?? [];
    list.push(t);
    map.set(row.uid, list);
  }
  return map;
}

export async function resolveCharityUserIdsForOrg(orgId: string): Promise<string[]> {
  const res = await db.query(
    `with org as (
       select id, name, contact_email from organizations where id = $1
     )
     select distinct u.id::text as id
     from users u
     cross join org
     where nullif(trim(org.contact_email), '') is not null
       and lower(trim(u.email)) = lower(trim(org.contact_email))
     union
     select distinct cr.user_id::text as id
     from charity_requests cr
     cross join org
     where cr.status = 'approved'
       and cr.user_id is not null
       and (
         regexp_replace(lower(coalesce(org.name, '')), '[^a-z0-9]', '', 'g') =
         regexp_replace(lower(coalesce(cr.charity_name, '')), '[^a-z0-9]', '', 'g')
         or lower(coalesce(org.contact_email, '')) = lower(coalesce(cr.contact_email, ''))
       )`,
    [orgId]
  );
  const ids = res.rows.map((r) => (r as { id: string }).id).filter(Boolean);
  return [...new Set(ids)];
}

async function tryClaimDedupe(key: string): Promise<boolean> {
  try {
    const ins = await db.query(
      `insert into notification_delivery_log (dedupe_key) values ($1) on conflict (dedupe_key) do nothing returning dedupe_key`,
      [key]
    );
    return Boolean(ins.rowCount && ins.rowCount > 0);
  } catch {
    return true;
  }
}

export async function insertUserNotification(
  userId: string,
  title: string,
  message: string,
  type: "success" | "info" | "new" | "warning" = "info"
): Promise<void> {
  await db.query(
    `insert into user_notifications (user_id, title, message, type) values ($1, $2, $3, $4)`,
    [userId, title, message, type]
  );
}

export async function notifyUsers(options: {
  userIds: string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
  preferenceKey: NotificationPreferenceKey;
  channelId?: string;
  notificationType?: "success" | "info" | "new" | "warning";
}): Promise<void> {
  const { userIds, title, body, data, preferenceKey, channelId, notificationType = "info" } = options;
  const unique = [...new Set(userIds.filter(Boolean))];
  if (!unique.length) return;

  const prefMap = await getNotificationPreferencesForUsers(unique);
  const allowed = filterByPreference(unique, prefMap, preferenceKey);
  if (!allowed.length) return;

  for (const uid of allowed) {
    try {
      await insertUserNotification(uid, title, body, notificationType);
    } catch (e) {
      console.warn("[user-push] insert notification failed", e);
    }
  }

  const tokenMap = await fetchPushTokensForUsers(allowed);
  const allTokens: string[] = [];
  for (const uid of allowed) {
    const tokens = tokenMap.get(uid) ?? [];
    allTokens.push(...tokens);
  }
  if (!allTokens.length) return;

  const msg: PushMessage = {
    to: allTokens,
    title,
    body,
    data: data ?? {},
    channelId,
  };
  try {
    await sendExpoPush(msg);
  } catch (e) {
    console.error("[user-push] Expo push failed", e);
  }
}

/** After a successful donation (Stripe payment intent id). Idempotent per PI. */
export async function notifyDonationFromPaymentIntent(stripePaymentIntentId: string): Promise<void> {
  const ok = await tryClaimDedupe(`donation_pi:${stripePaymentIntentId}`);
  if (!ok) return;

  const res = await db.query(
    `select d.id, d.user_id, d.amount::text, d.campaign_id, d.org_id,
            c.title as campaign_title,
            coalesce(c.organization_id, d.org_id) as resolved_org_id,
            o.name as org_name
     from donations d
     left join campaigns c on c.id = d.campaign_id
     left join organizations o on o.id = coalesce(c.organization_id, d.org_id)
     where d.stripe_payment_intent_id = $1 and d.status = 'succeeded'
     limit 1`,
    [stripePaymentIntentId]
  );
  const row = res.rows[0] as
    | {
        user_id: string | null;
        amount: string;
        campaign_title: string | null;
        resolved_org_id: string | null;
        org_name: string | null;
        campaign_id: string | null;
      }
    | undefined;
  if (!row?.resolved_org_id) return;

  const amt = Number(row.amount || 0);
  const amtStr = amt.toLocaleString("en-US", { style: "currency", currency: "USD" });
  const orgLabel = row.org_name || "your organization";
  const campLabel = row.campaign_title || "General support";

  const charityIds = await resolveCharityUserIdsForOrg(row.resolved_org_id);
  await notifyUsers({
    userIds: charityIds,
    title: "New donation",
    body: `${amtStr} — ${campLabel}`,
    data: {
      type: "donation",
      orgId: row.resolved_org_id,
      campaignId: row.campaign_id ?? "",
      paymentIntentId: stripePaymentIntentId,
    },
    preferenceKey: "org_donations",
    channelId: "donations",
    notificationType: "new",
  });

  if (row.user_id) {
    await notifyUsers({
      userIds: [row.user_id],
      title: "Thank you",
      body: `Your ${amtStr} gift to ${orgLabel} was received.`,
      data: {
        type: "donation",
        orgId: row.resolved_org_id,
        campaignId: row.campaign_id ?? "",
        paymentIntentId: stripePaymentIntentId,
      },
      preferenceKey: "donor_receipts",
      channelId: "donations",
      notificationType: "success",
    });
  }
}

export async function notifyVolunteerSignup(orgId: string, volunteerName: string, volunteerId: string): Promise<void> {
  const orgRes = await db.query(`select name from organizations where id = $1`, [orgId]);
  const orgName = ((orgRes.rows[0] as { name?: string } | undefined)?.name || "Your organization").trim();
  const charityIds = await resolveCharityUserIdsForOrg(orgId);
  const firstName = volunteerName.split(/\s+/)[0] || volunteerName;
  await notifyUsers({
    userIds: charityIds,
    title: "New volunteer signup",
    body: `${firstName} applied to volunteer with ${orgName}.`,
    data: { type: "volunteer", orgId, volunteerId },
    preferenceKey: "org_volunteers",
    channelId: "volunteers",
    notificationType: "new",
  });
}

export async function notifyCampaignWentLive(input: {
  campaignId: string;
  orgId: string;
  title: string;
}): Promise<void> {
  const ok = await tryClaimDedupe(`campaign_live:${input.campaignId}`);
  if (!ok) return;

  const orgRes = await db.query(`select name from organizations where id = $1`, [input.orgId]);
  const orgName = ((orgRes.rows[0] as { name?: string } | undefined)?.name || "Organization").trim();

  const charityIds = await resolveCharityUserIdsForOrg(input.orgId);
  await notifyUsers({
    userIds: charityIds,
    title: "Campaign is live",
    body: `"${input.title}" is now published on GiveBlack.`,
    data: { type: "campaign", campaignId: input.campaignId, orgId: input.orgId },
    preferenceKey: "org_campaign_status",
    channelId: "campaigns",
    notificationType: "success",
  });

  const donorRes = await db.query(
    `select distinct d.user_id::text as id
     from donations d
     inner join campaigns c on c.id = d.campaign_id
     where c.organization_id = $1
       and d.status = 'succeeded'
       and d.user_id is not null
       and d.created_at >= now() - interval '12 months'`,
    [input.orgId]
  );
  const charitySet = new Set(charityIds);
  const orgDonorIds = [...new Set((donorRes.rows as { id: string }[]).map((r) => r.id).filter(Boolean))].filter(
    (id) => !charitySet.has(id)
  );
  if (orgDonorIds.length) {
    await notifyUsers({
      userIds: orgDonorIds,
      title: `New campaign — ${orgName}`,
      body: `${input.title} just launched. Tap to view.`,
      data: { type: "campaign", campaignId: input.campaignId, orgId: input.orgId },
      preferenceKey: "donor_new_campaigns_from_orgs_i_supported",
      channelId: "campaigns",
      notificationType: "new",
    });
  }

  const orgDonorSet = new Set(orgDonorIds);
  const allDonorsRes = await db.query(
    `select distinct u.id::text as id
     from users u
     where u.disabled_at is null
       and u.role not in ('admin', 'super_admin', 'manager', 'staff')
       and not exists (
         select 1 from device_push_tokens dpt
         where dpt.user_id = u.id and dpt.disabled_at is null
         having count(*) = 0
       )`,
    []
  );
  const allPlatformDonorIds = (allDonorsRes.rows as { id: string }[])
    .map((r) => r.id)
    .filter((id) => id && !charitySet.has(id) && !orgDonorSet.has(id));
  if (allPlatformDonorIds.length) {
    await notifyUsers({
      userIds: allPlatformDonorIds,
      title: `New campaign on GiveBlack`,
      body: `"${input.title}" by ${orgName} is now live. Tap to view.`,
      data: { type: "campaign", campaignId: input.campaignId, orgId: input.orgId },
      preferenceKey: "new_campaigns",
      channelId: "campaigns",
      notificationType: "new",
    });
  }
}
