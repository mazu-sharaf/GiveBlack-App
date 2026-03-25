-- Add listing_status column to organizations table
-- This column is used by the API to filter approved organizations

ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS listing_status TEXT NOT NULL DEFAULT 'approved';

-- Update any existing organizations to approved status
UPDATE organizations 
SET listing_status = 'approved' 
WHERE listing_status IS NULL OR listing_status = '';

-- Create an index for faster queries
CREATE INDEX IF NOT EXISTS idx_organizations_listing_status 
ON organizations(listing_status);
