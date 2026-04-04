ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS story text null;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS about text null;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS main_image_url text null;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS location text null;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS donor_count integer not null default 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS updated_at timestamptz not null default now();

ALTER TABLE campaign_images ADD COLUMN IF NOT EXISTS campaign_id text null references campaigns(id) on delete cascade;

ALTER TABLE donations ADD COLUMN IF NOT EXISTS donor_name text null;
ALTER TABLE donations ADD COLUMN IF NOT EXISTS donor_email text null;
ALTER TABLE donations ADD COLUMN IF NOT EXISTS message text null;
ALTER TABLE donations ADD COLUMN IF NOT EXISTS is_anonymous boolean not null default false;

CREATE TABLE IF NOT EXISTS education_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS education_partners_code_lower_idx ON education_partners (lower(code));

ALTER TABLE donations ADD COLUMN IF NOT EXISTS education_partner_id uuid NULL REFERENCES education_partners(id) ON DELETE SET NULL;
ALTER TABLE donations ADD COLUMN IF NOT EXISTS reinvest_opt_in boolean NOT NULL DEFAULT false;
ALTER TABLE donations ADD COLUMN IF NOT EXISTS reinvest_amount numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE donations ADD COLUMN IF NOT EXISTS partner_reinvest_amount numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE donations ADD COLUMN IF NOT EXISTS general_reinvest_amount numeric(12,2) NOT NULL DEFAULT 0;
