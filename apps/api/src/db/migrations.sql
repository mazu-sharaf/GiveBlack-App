ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS story text null;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS about text null;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS main_image_url text null;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS location text null;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS donor_count integer not null default 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS updated_at timestamptz not null default now();
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS featured boolean not null default false;

ALTER TABLE campaign_images ADD COLUMN IF NOT EXISTS campaign_id text null references campaigns(id) on delete cascade;

ALTER TABLE donations ADD COLUMN IF NOT EXISTS donor_name text null;
ALTER TABLE donations ADD COLUMN IF NOT EXISTS donor_email text null;
ALTER TABLE donations ADD COLUMN IF NOT EXISTS message text null;
ALTER TABLE donations ADD COLUMN IF NOT EXISTS is_anonymous boolean not null default false;

ALTER TABLE volunteers ADD COLUMN IF NOT EXISTS campaign_id text null references campaigns(id) on delete set null;

CREATE TABLE IF NOT EXISTS education_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS education_partners_code_lower_idx ON education_partners (lower(code));

ALTER TABLE donations ADD COLUMN IF NOT EXISTS education_partner_id uuid NULL REFERENCES education_partners(id) ON DELETE SET NULL;

ALTER TABLE categories ADD COLUMN IF NOT EXISTS icon_bg_color text null;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS icon_border_color text null;

ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url text null;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_source text null;

-- Admin 2FA (TOTP)
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_secret_enc text null;
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_recovery_codes jsonb null;
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_updated_at timestamptz null;

-- Admin allowlist auth (Google OAuth + Email OTP) and permission overrides
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_permissions jsonb null;
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_oauth_provider text null;
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_oauth_sub text null;
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_otp_code_hash text null;
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_otp_expires_at timestamptz null;
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_otp_attempts int not null default 0;
CREATE INDEX IF NOT EXISTS users_admin_oauth_sub_idx ON users (admin_oauth_sub);

CREATE TABLE IF NOT EXISTS oauth_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  provider text not null check (provider in ('google', 'apple', 'facebook')),
  provider_user_id text not null,
  created_at timestamptz not null default now(),
  unique (provider, provider_user_id)
);
CREATE INDEX IF NOT EXISTS oauth_identities_user_id_idx ON oauth_identities(user_id);
ALTER TABLE donations ADD COLUMN IF NOT EXISTS reinvest_opt_in boolean NOT NULL DEFAULT false;
ALTER TABLE donations ADD COLUMN IF NOT EXISTS reinvest_amount numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE donations ADD COLUMN IF NOT EXISTS partner_reinvest_amount numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE donations ADD COLUMN IF NOT EXISTS general_reinvest_amount numeric(12,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS guest_stripe_customers (
  email text primary key,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now()
);
