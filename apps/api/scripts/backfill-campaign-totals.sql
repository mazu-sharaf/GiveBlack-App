-- Optional one-off: align denormalized campaigns.raised / campaigns.donor_count with
-- succeeded donations (same rules as API lateral aggregates in public.ts).
-- Run manually against your DB when fixing legacy drift; safe to re-run.

BEGIN;

UPDATE campaigns c
SET
  raised = agg.raised,
  donor_count = agg.cnt,
  updated_at = now()
FROM (
  SELECT
    d.campaign_id,
    coalesce(sum(d.amount), 0)::numeric AS raised,
    count(*)::int AS cnt
  FROM donations d
  WHERE d.status = 'succeeded'
    AND d.campaign_id IS NOT NULL
  GROUP BY d.campaign_id
) agg
WHERE c.id = agg.campaign_id
  AND (
    c.raised IS DISTINCT FROM agg.raised
    OR c.donor_count IS DISTINCT FROM agg.cnt
  );

-- Campaigns with no succeeded donations: reset counters if they were non-zero incorrectly.
UPDATE campaigns c
SET
  raised = 0,
  donor_count = 0,
  updated_at = now()
WHERE NOT EXISTS (
  SELECT 1
  FROM donations d
  WHERE d.campaign_id = c.id
    AND d.status = 'succeeded'
)
AND (coalesce(c.raised, 0) <> 0 OR coalesce(c.donor_count, 0) <> 0);

COMMIT;
