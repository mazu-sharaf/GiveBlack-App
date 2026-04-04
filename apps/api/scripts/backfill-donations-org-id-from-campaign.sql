-- One-time: set donations.org_id from the campaign when missing but campaign_id is set.
-- Fixes org Donations tab / analytics when rows were linked only via campaign.

UPDATE donations d
SET org_id = c.organization_id
FROM campaigns c
WHERE d.campaign_id = c.id
  AND c.organization_id IS NOT NULL
  AND (d.org_id IS NULL OR trim(d.org_id) = '');
