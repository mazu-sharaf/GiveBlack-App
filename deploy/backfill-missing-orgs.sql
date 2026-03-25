-- Create organizations for approved charity requests that have no matching org.
-- Safe/idempotent: only inserts rows that don't already exist.
insert into organizations (id, name, contact_email)
select
  'org-' || lower(regexp_replace(cr.charity_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(cr.id::text, 1, 8),
  cr.charity_name,
  cr.contact_email
from charity_requests cr
where cr.status = 'approved'
  and not exists (
    select 1 from organizations o
    where
      lower(trim(o.name)) = lower(trim(cr.charity_name))
      or (cr.contact_email is not null and trim(cr.contact_email) <> '' and lower(trim(o.contact_email)) = lower(trim(cr.contact_email)))
  )
on conflict (id) do nothing;

-- Also backfill contact_email on orgs that match by name but have null contact_email.
update organizations o
set contact_email = cr.contact_email
from charity_requests cr
where cr.status = 'approved'
  and cr.contact_email is not null
  and trim(cr.contact_email) <> ''
  and lower(trim(o.name)) = lower(trim(cr.charity_name))
  and (o.contact_email is null or trim(o.contact_email) = '');

select id, name, contact_email from organizations order by created_at desc limit 30;
