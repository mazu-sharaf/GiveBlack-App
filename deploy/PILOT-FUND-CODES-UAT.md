# Pilot UAT — Organizational Codes + Participant Fundraising

Use this checklist when validating the Phase 1 rollout with 2–3 pilot organizations.

## Prerequisites

1. Run DB migration: `npm run api:db:init` from repo root.
2. Pilot orgs must complete **Stripe Connect** onboarding (`payouts_enabled = true`).
3. In **Admin → Organizational codes**, create codes linked to each pilot org:
   - Set **Linked organization**
   - Enable **Receives education fund** and **Receives endowment fund**
   - Example: `HARLEM2026` → Harlem Youth Initiative

## Organizational code flow

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open `/donate/{orgId}?code=HARLEM2026` | Green banner shows linked org name |
| 2 | Complete a $5 test donation with education + endowment toggles on | Donation succeeds |
| 3 | Admin → Donations | Row shows education/endowment amounts, fund code org |
| 4 | After hold period (7–14 days) or admin **Fund Release** | Primary org receives net; fund-code org receives education + endowment via Connect transfer |
| 5 | Stripe Dashboard → Transfers | Two slice types may appear on same org if code org ≠ primary org |

## Participant fundraising flow

| Step | Action | Expected |
|------|--------|----------|
| 1 | Org app → Campaigns → **Fundraisers** on active campaign | Modal opens |
| 2 | Add participant (e.g. Maria, code `MARIA2026`) | Share URL returned |
| 3 | Open `https://giveblackapp.com/link/c/{campaignId}?seller=MARIA2026` | Banner: "Supporting Maria's fundraiser" |
| 4 | Donate with optional org code at checkout | Donation attributed to participant |
| 5 | Org **Fundraisers** leaderboard | Maria's raised total increments |

## Receipt verification

- Mobile success screen and PDF receipt show **stored** platform/education/endowment amounts (not hardcoded 5%/1%).

## Rollback

- Deactivate organizational codes in admin (`active = false`).
- Deactivate participants (`active = false` via DB if needed).
- Existing in-hold transfers continue through normal release flow.

## Pilot org roster (fill in)

| Organization | Code | Connect onboarded | Campaign | Participant codes |
|--------------|------|-------------------|----------|-------------------|
| | | ☐ | | |
| | | ☐ | | |
| | | ☐ | | |
