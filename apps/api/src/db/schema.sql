create extension if not exists "pgcrypto";

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  full_name text not null,
  password_hash text not null,
  role text not null default 'donor',
  disabled_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  avatar_url text null,
  avatar_source text null
);

create table if not exists user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  refresh_token_hash text not null unique,
  user_agent text null,
  ip_address text null,
  expires_at timestamptz not null,
  revoked_at timestamptz null,
  created_at timestamptz not null default now()
);

create table if not exists categories (
  id text primary key default gen_random_uuid()::text,
  name text not null unique,
  icon text null,
  color text null,
  image_url text null,
  created_at timestamptz not null default now()
);

create table if not exists organizations (
  id text primary key,
  name text not null,
  description text null,
  category_id text null references categories(id),
  image_url text null,
  cover_image_url text null,
  image_color text null default '#333333',
  initials text null,
  raised numeric(12,2) not null default 0,
  goal numeric(12,2) not null default 0,
  donor_count integer not null default 0,
  featured boolean not null default false,
  verified boolean not null default false,
  stripe_account_id text null,
  payouts_enabled boolean not null default false,
  bank_name text null,
  account_holder_name text null,
  account_last4 text null,
  routing_number text null,
  tax_id text null,
  contact_name text null,
  contact_email text null,
  website text null,
  absorb_fees boolean not null default false,
  ecosystem_opt_in boolean not null default true,
  endowment_opt_in boolean not null default true,
  archived_at timestamptz null,
  created_at timestamptz not null default now()
);

create table if not exists campaigns (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  title text not null,
  description text null,
  story text null,
  about text null,
  main_image_url text null,
  location text null,
  goal numeric(12,2) not null default 0,
  raised numeric(12,2) not null default 0,
  donor_count integer not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists campaign_images (
  id text primary key,
  campaign_id text null references campaigns(id) on delete cascade,
  org_id text null references organizations(id) on delete cascade,
  image_url text not null,
  caption text null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- Partner institutions / programs that receive attributed "reinvest in education" allocation
create table if not exists education_partners (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists education_partners_code_lower_idx on education_partners (lower(code));

create table if not exists donations (
  id uuid primary key default gen_random_uuid(),
  campaign_id text null references campaigns(id) on delete cascade,
  org_id text null references organizations(id) on delete set null,
  user_id uuid null references users(id) on delete set null,
  user_email text null,
  category_id text null,
  amount numeric(12,2) not null,
  currency text not null default 'usd',
  status text not null default 'pending',
  stripe_payment_intent_id text null unique,
  donor_name text null,
  donor_email text null,
  message text null,
  is_anonymous boolean not null default false,
  education_partner_id uuid null references education_partners(id) on delete set null,
  reinvest_opt_in boolean not null default false,
  reinvest_amount numeric(12,2) not null default 0,
  partner_reinvest_amount numeric(12,2) not null default 0,
  general_reinvest_amount numeric(12,2) not null default 0,
  paid_at timestamptz null,
  payout_release_at timestamptz null,
  payout_transfer_status text not null default 'legacy',
  net_amount_cents bigint null,
  stripe_transfer_id text null,
  created_at timestamptz not null default now()
);

-- Aggregate donor statistics for rankings and totals
create table if not exists donor_stats (
  user_id uuid primary key references users(id) on delete cascade,
  total_amount_cents bigint not null default 0,
  donation_count int not null default 0,
  first_donation_at timestamptz,
  last_donation_at timestamptz
);

create index if not exists donor_stats_total_amount_idx
  on donor_stats (total_amount_cents desc);

create table if not exists webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique(provider, event_id)
);

create table if not exists device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  expo_push_token text not null unique,
  platform text not null,
  disabled_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists volunteers (
  id uuid primary key default gen_random_uuid(),
  org_id text null references organizations(id) on delete set null,
  name text null,
  email text null,
  phone text null,
  skills text null,
  message text null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references users(id) on delete set null,
  amount numeric(12,2) not null default 0,
  type text null,
  description text null,
  created_at timestamptz not null default now()
);

create table if not exists donation_splits (
  id uuid primary key default gen_random_uuid(),
  donation_id uuid null references donations(id) on delete cascade,
  platform_fee numeric(12,2) not null default 0,
  net_to_org numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists charity_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references users(id) on delete set null,
  charity_name text null,
  contact_name text null,
  contact_email text null,
  contact_phone text null,
  category text null,
  description text null,
  website text null,
  tax_id text null,
  bank_name text null,
  account_holder_name text null,
  account_number text null,
  account_last4 text null,
  routing_number text null,
  status text not null default 'pending',
  rejection_reason text null,
  admin_notes text null,
  reviewed_at timestamptz null,
  created_at timestamptz not null default now()
);

create table if not exists community_campaigns (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid null references users(id) on delete set null,
  title text not null,
  description text null,
  goal_amount numeric(12,2) not null default 0,
  raised_amount numeric(12,2) not null default 0,
  status text not null default 'active',
  category_id text null references categories(id),
  verification_status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists community_campaign_updates (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references community_campaigns(id) on delete cascade,
  title text null,
  content text null,
  created_at timestamptz not null default now()
);

create table if not exists community_campaign_donations (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references community_campaigns(id) on delete cascade,
  user_id uuid null references users(id) on delete set null,
  amount numeric(12,2) not null default 0,
  message text null,
  created_at timestamptz not null default now()
);

create table if not exists community_campaign_reports (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references community_campaigns(id) on delete cascade,
  reporter_id uuid null references users(id) on delete set null,
  status text not null default 'open',
  reason text null,
  admin_notes text null,
  created_at timestamptz not null default now()
);

create table if not exists profiles (
  id uuid primary key,
  name text null,
  email text null,
  user_type text null,
  zip_code text null,
  college_attended boolean null default false,
  charity_name text null,
  charity_category text null,
  charity_description text null,
  charity_url text null,
  avatar_url text null,
  created_at timestamptz not null default now()
);

create table if not exists password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz null,
  created_at timestamptz not null default now()
);

create table if not exists app_settings (
  key text primary key,
  value text null,
  updated_at timestamptz not null default now()
);

create table if not exists admin_emails (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists org_subscriptions (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organizations(id) on delete cascade,
  tier text not null default 'free',
  status text not null default 'active',
  stripe_customer_id text null,
  stripe_subscription_id text null unique,
  current_period_start timestamptz null,
  current_period_end timestamptz null,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ledger_entries (
  id uuid primary key default gen_random_uuid(),
  org_id text null references organizations(id) on delete set null,
  donation_id uuid null references donations(id) on delete set null,
  account_type text null,
  amount numeric(12,2) not null default 0,
  released boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists staff_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  department text null,
  permissions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists user_stripe_customers (
  user_id uuid primary key references users(id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  title text not null,
  message text not null,
  type text not null default 'info' check (type in ('success', 'info', 'new', 'warning')),
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_notifications_user on user_notifications(user_id, created_at desc);
create index if not exists idx_campaigns_org on campaigns(organization_id);
create index if not exists idx_donations_campaign on donations(campaign_id);
create index if not exists idx_donations_user on donations(user_id);
create index if not exists idx_sessions_user on user_sessions(user_id);
create index if not exists idx_charity_requests_status on charity_requests(status);
create index if not exists idx_volunteers_org on volunteers(org_id);
create index if not exists idx_ledger_org on ledger_entries(org_id);
create index if not exists idx_password_reset_tokens_user on password_reset_tokens(user_id);

-- Manual Connect release: existing DBs created before payout columns
alter table donations add column if not exists payout_release_at timestamptz null;
alter table donations add column if not exists payout_transfer_status text not null default 'legacy';
alter table donations add column if not exists net_amount_cents bigint null;
alter table donations add column if not exists stripe_transfer_id text null;

update donations
set payout_transfer_status = 'released'
where status = 'succeeded' and payout_transfer_status = 'legacy';

update donations
set net_amount_cents = greatest(
  0,
  floor(amount * 100)::bigint - round(amount::numeric * 100 * 0.029 + 30)::bigint
)
where status = 'succeeded' and net_amount_cents is null;

create index if not exists idx_donations_org_payout on donations (org_id, payout_transfer_status)
  where status = 'succeeded';

alter table users add column if not exists notification_preferences jsonb;

create table if not exists notification_delivery_log (
  dedupe_key text primary key,
  created_at timestamptz not null default now()
);
