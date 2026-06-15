import { db } from "./db.js";

function normalizeCode(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

export type ResolvedFundCode = {
  partnerId: string;
  code: string;
  name: string;
  organizationId: string | null;
  organizationName: string | null;
  receivesEducation: boolean;
  receivesEndowment: boolean;
};

export async function resolveFundCode(
  code: string | undefined | null
): Promise<ResolvedFundCode | null> {
  const key = normalizeCode(code ?? "");
  if (!key) return null;

  const res = await db.query(
    `select ep.id::text as partner_id,
            ep.code,
            ep.name,
            ep.organization_id,
            ep.receives_education_fund,
            ep.receives_endowment_fund,
            o.name as organization_name
     from education_partners ep
     left join organizations o on o.id = ep.organization_id
     where lower(ep.code) = $1 and ep.active = true`,
    [key]
  );

  const row = res.rows[0] as
    | {
        partner_id: string;
        code: string;
        name: string;
        organization_id: string | null;
        receives_education_fund: boolean;
        receives_endowment_fund: boolean;
        organization_name: string | null;
      }
    | undefined;

  if (!row) return null;

  return {
    partnerId: row.partner_id,
    code: row.code,
    name: row.name,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    receivesEducation: row.receives_education_fund !== false,
    receivesEndowment: row.receives_endowment_fund !== false,
  };
}

export async function resolveParticipantId(
  campaignId: string | undefined | null,
  sellerCode: string | undefined | null
): Promise<string | null> {
  const campId = (campaignId || "").trim();
  const code = normalizeCode(sellerCode);
  if (!campId || !code) return null;

  const res = await db.query(
    `select id::text from campaign_participants
     where campaign_id = $1 and lower(code) = $2 and active = true`,
    [campId, code]
  );
  return (res.rows[0] as { id: string } | undefined)?.id ?? null;
}
