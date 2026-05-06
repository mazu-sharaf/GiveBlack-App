import { db } from "../lib/db.js";
import { sendExpoPush, type PushMessage } from "./push.js";

/** Cap for "all new campaigns on GiveBlack" fan-out (per publish). */
const MAX_NEW_CAMPAIGN_BROADCAST = 5000;

export type NotificationPreferenceKey =
  | "donor_receipts"
  | "org_donations"
  | "org_volunteers"
  | "org_campaign_status"
  | "org_subscription"
  | "donor_new_campaigns_from_orgs_i_supported"
  | "new_campaigns";

const DEFAULT_PREFS: Record<NotificationPreferenceKey, boolean> = {
  donor_receipts: true,
  org_donations: true,
  org_volunteers: true,
  org_campaign_status: true,
  org_subscription: true,
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
  /** Match org owners the same way billing/org routes do: contact_email on the org row, then approved charity_requests. */
  const res = await db.query(
    `with org as (
       select id,
              nullif(trim(lower(coalesce(contact_email, ''))), '') as contact_email_lc,
              regexp_replace(lower(coalesce(name, '')), '[^a-z0-9]', '', 'g') as name_key
       from organizations
       where id = $1
     )
     select distinct u.id::text as id
     from users u
     cross join org o
     where o.contact_email_lc is not null
       and nullif(trim(lower(coalesce(u.email, ''))), '') = o.contact_email_lc
     union
     select distinct u.id::text as id
     from users u
     cross join org o
     where exists (
       select 1
       from charity_requests cr
       where cr.status = 'approved'
         and (
           cr.user_id = u.id
           or nullif(trim(lower(coalesce(cr.contact_email, ''))), '') = nullif(trim(lower(coalesce(u.email, ''))), '')
         )
         and (
           regexp_replace(lower(coalesce(cr.charity_name, '')), '[^a-z0-9]', '', 'g') = o.name_key
           or (
             o.contact_email_lc is not null
             and nullif(trim(lower(coalesce(cr.contact_email, ''))), '') = o.contact_email_lc
           )
         )
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

/** Admin approved charity request: always deliver (no notification_preferences gate). */
export async function notifyCharityApplicationApproved(
  userId: string,
  charityName: string,
  orgId: string
): Promise<void> {
  const title = "Application approved";
  const body = `${charityName} is approved on GiveBlack. Open the app to manage your organization and campaigns.`;
  try {
    await insertUserNotification(userId, title, body, "success");
  } catch (e) {
    console.warn("[user-push] charity approved in-app notification failed", e);
  }
  const tokenMap = await fetchPushTokensForUsers([userId]);
  const tokens = tokenMap.get(userId) ?? [];
  if (!tokens.length) return;
  const msg: PushMessage = {
    to: tokens,
    title,
    body,
    data: { type: "charity_approved", audience: "org", orgId },
    channelId: "default",
  };
  try {
    await sendExpoPush(msg);
  } catch (e) {
    console.error("[user-push] charity approved push failed", e);
  }
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

  try {
    if (allowed.length <= 100) {
      for (const uid of allowed) {
        await insertUserNotification(uid, title, body, notificationType);
      }
    } else {
      await db.query(
        `insert into user_notifications (user_id, title, message, type)
         select unnest($1::uuid[]), $2, $3, $4`,
        [allowed, title, body, notificationType]
      );
    }
  } catch (e) {
    console.warn("[user-push] bulk insert notifications failed, falling back per-user", e);
    for (const uid of allowed) {
      try {
        await insertUserNotification(uid, title, body, notificationType);
      } catch (err) {
        console.warn("[user-push] insert notification failed", err);
      }
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

  const ok = await tryClaimDedupe(`donation_pi:${stripePaymentIntentId}`);
  if (!ok) return;

  const amt = Number(row.amount || 0);
  const amtStr = amt.toLocaleString("en-US", { style: "currency", currency: "USD" });
  const orgLabel = row.org_name || "your organization";
  const campLabel = row.campaign_title || "General support";

  const charityIds = await resolveCharityUserIdsForOrg(row.resolved_org_id);
  await notifyUsers({
    userIds: charityIds,
    title: "New donation",
    body: `${amtStr}: ${campLabel}`,
    data: {
      type: "donation",
      audience: "org",
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
      body: `Your ${amtStr} donation to ${orgLabel} was received.`,
      data: {
        type: "donation",
        audience: "donor",
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
    data: { type: "volunteer", audience: "org", orgId, volunteerId },
    preferenceKey: "org_volunteers",
    channelId: "volunteers",
    notificationType: "new",
  });
}

function subscriptionTierRank(tier: string | null | undefined): number {
  const t = String(tier || "").toLowerCase();
  if (t === "institutional") return 2;
  if (t === "growth") return 1;
  return 0;
}

function subscriptionTierDisplay(tier: string): string {
  const t = String(tier || "").toLowerCase();
  if (t === "institutional") return "Institutional";
  if (t === "growth") return "Growth";
  return "Free";
}

/** When an org's Stripe subscription moves to a higher paid tier (e.g. Free → Growth). Idempotent per billing period end so webhook retries dedupe but a later re-upgrade can notify again. */
export async function maybeNotifyOrgSubscriptionPlanUpgrade(input: {
  orgId: string;
  stripeSubscriptionId: string;
  previousTier: string | null | undefined;
  newTier: string;
  previousStatus: string | null | undefined;
  newStatus: string;
  /** Current period end from DB after upsert (dedupe component). */
  currentPeriodEndIso: string | null | undefined;
}): Promise<void> {
  const { orgId, stripeSubscriptionId, previousTier, newTier, newStatus, currentPeriodEndIso } = input;
  if (!orgId || !stripeSubscriptionId) return;

  const oldRank = subscriptionTierRank(previousTier ?? "free");
  const newRank = subscriptionTierRank(newTier);
  const statusOk = ["active", "trialing"].includes(String(newStatus).toLowerCase());
  if (!statusOk || newRank <= oldRank) return;

  const periodKey = currentPeriodEndIso ? String(currentPeriodEndIso) : "none";
  const dedupeKey = `org_sub_upgrade:${orgId}:${stripeSubscriptionId}:${String(newTier).toLowerCase()}:${periodKey}`;
  const claimed = await tryClaimDedupe(dedupeKey);
  if (!claimed) return;

  const charityIds = await resolveCharityUserIdsForOrg(orgId);
  const label = subscriptionTierDisplay(newTier);
  await notifyUsers({
    userIds: charityIds,
    title: "Plan upgraded",
    body: `Your organization is now on the ${label} plan. Open Subscriptions to manage your plan.`,
    data: {
      type: "subscription",
      audience: "org",
      orgId,
      tier: newTier,
    },
    preferenceKey: "org_subscription",
    channelId: "subscriptions",
    notificationType: "success",
  });
}

/** Admin did not publish the campaign (e.g. sent back for edits). Notifies org users who opted into campaign status updates. */
export async function notifyCampaignReviewOutcome(input: {
  campaignId: string;
  orgId: string;
  title: string;
  newStatus: string;
}): Promise<void> {
  const ok = await tryClaimDedupe(`campaign_review:${input.campaignId}:${input.newStatus}`);
  if (!ok) return;

  const charityIds = await resolveCharityUserIdsForOrg(input.orgId);
  const statusLabel = input.newStatus.replace(/_/g, " ");
  await notifyUsers({
    userIds: charityIds,
    title: "Campaign update",
    body: `"${input.title}" was not published yet (status: ${statusLabel}). Open Campaigns for details.`,
    data: {
      type: "campaign",
      audience: "org",
      campaignId: input.campaignId,
      orgId: input.orgId,
      reviewStatus: input.newStatus,
    },
    preferenceKey: "org_campaign_status",
    channelId: "campaigns",
    notificationType: "warning",
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
    data: { type: "campaign", audience: "org", campaignId: input.campaignId, orgId: input.orgId },
    preferenceKey: "org_campaign_status",
    channelId: "campaigns",
    notificationType: "success",
  });

  const donorRes = await db.query(
    `select distinct d.user_id::text as id
     from donations d
     left join campaigns c on c.id = d.campaign_id
     inner join users u on u.id = d.user_id
     where u.role = 'donor'
       and d.status = 'succeeded'
       and d.user_id is not null
       and d.created_at >= now() - interval '12 months'
       and (d.org_id = $1 or c.organization_id = $1)`,
    [input.orgId]
  );
  const charitySet = new Set(charityIds);
  const orgDonorIds = [...new Set((donorRes.rows as { id: string }[]).map((r) => r.id).filter(Boolean))].filter(
    (id) => !charitySet.has(id)
  );
  if (orgDonorIds.length) {
    await notifyUsers({
      userIds: orgDonorIds,
      title: `New campaign: ${orgName}`,
      body: `${input.title} just launched. Tap to view.`,
      data: { type: "campaign", audience: "donor", campaignId: input.campaignId, orgId: input.orgId },
      preferenceKey: "donor_new_campaigns_from_orgs_i_supported",
      channelId: "campaigns",
      notificationType: "new",
    });
  }

  const orgDonorSet = new Set(orgDonorIds);
  const excludedIds = [...charitySet, ...orgDonorSet].filter(Boolean);
  const allDonorsRes = await db.query(
    `select u.id::text as id
     from users u
     where u.disabled_at is null
       and u.role = 'donor'
       and (cardinality($1::uuid[]) = 0 or not (u.id = any($1::uuid[])))
     order by u.created_at desc
     limit $2`,
    [excludedIds.length ? excludedIds : [], MAX_NEW_CAMPAIGN_BROADCAST]
  );
  const allPlatformDonorIds = (allDonorsRes.rows as { id: string }[]).map((r) => r.id).filter(Boolean);
  if (allPlatformDonorIds.length >= MAX_NEW_CAMPAIGN_BROADCAST) {
    console.warn("[user-push] new_campaigns broadcast hit recipient cap", {
      campaignId: input.campaignId,
      cap: MAX_NEW_CAMPAIGN_BROADCAST,
    });
  }
  if (allPlatformDonorIds.length) {
    await notifyUsers({
      userIds: allPlatformDonorIds,
      title: `New campaign on GiveBlack`,
      body: `"${input.title}" by ${orgName} is now live. Tap to view.`,
      data: { type: "campaign", audience: "donor", campaignId: input.campaignId, orgId: input.orgId },
      preferenceKey: "new_campaigns",
      channelId: "campaigns",
      notificationType: "new",
    });
  }
}
