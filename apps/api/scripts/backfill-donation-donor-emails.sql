-- One-time: copy normalized email from users onto donations where missing,
-- so /api/account/transactions and /api/me/donations/summary can match by email.

UPDATE donations d
SET donor_email = lower(trim(u.email))
FROM users u
WHERE d.user_id = u.id
  AND (d.donor_email IS NULL OR trim(d.donor_email) = '');
