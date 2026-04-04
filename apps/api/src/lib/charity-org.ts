import { db } from "./db.js";

export type ResolvedCharityOrg = { id: string; name: string };

/**
 * Same resolution as GET /api/charity/my-subscription: primary match on contact_email,
 * then approved charity_requests + organizations fallback (name slug / request email).
 */
export async function resolveOrgForCharityUser(
  userId: string,
  email: string
): Promise<ResolvedCharityOrg | null> {
  const primary = await db.query(
    `select id, name from organizations
     where lower(trim(contact_email)) = lower(trim($1))
     limit 1`,
    [email]
  );
  const row = primary.rows[0] as { id: string; name: string } | undefined;
  if (row?.id) return row;

  const fallback = await db.query(
    `select o.id, o.name
     from charity_requests cr
     join organizations o
       on (
         regexp_replace(lower(coalesce(o.name, '')), '[^a-z0-9]', '', 'g') =
         regexp_replace(lower(coalesce(cr.charity_name, '')), '[^a-z0-9]', '', 'g')
         or lower(coalesce(o.contact_email, '')) = lower(coalesce(cr.contact_email, ''))
       )
     where cr.status = 'approved'
       and (
         cr.user_id = $1
         or lower(coalesce(cr.contact_email, '')) = lower(coalesce($2, ''))
       )
     order by cr.reviewed_at desc nulls last, cr.created_at desc
     limit 1`,
    [userId, email]
  );
  const f = fallback.rows[0] as { id: string; name: string } | undefined;
  return f?.id ? f : null;
}
