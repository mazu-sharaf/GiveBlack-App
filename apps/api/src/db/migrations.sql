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
