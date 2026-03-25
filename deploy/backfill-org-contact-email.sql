-- Backfill missing organizations.contact_email from approved charity requests.
-- Safe/idempotent: updates only org rows where contact_email is null/blank.
-- Match key: normalized organization name <-> approved charity_name.

with approved_requests as (
  select
    lower(trim(charity_name)) as normalized_charity_name,
    max(contact_email) filter (where contact_email is not null and trim(contact_email) <> '') as contact_email
  from charity_requests
  where status = 'approved'
  group by lower(trim(charity_name))
),
orgs_to_fix as (
  select
    o.id as org_id,
    ar.contact_email
  from organizations o
  join approved_requests ar
    on lower(trim(o.name)) = ar.normalized_charity_name
  where (o.contact_email is null or trim(o.contact_email) = '')
    and ar.contact_email is not null
)
update organizations o
set contact_email = f.contact_email
from orgs_to_fix f
where o.id = f.org_id;
