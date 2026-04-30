# App Store Review — GiveBlack (resubmission)

Use this text in **App Review Information → Notes** and attach your **screen recording** (physical iPhone) as required.

## Guideline 5.1.1(ii) — Photo library purpose string

We updated `NSPhotoLibraryUsageDescription` in the iOS build to clearly describe that photo access is used only when the user chooses an image—for example a donor profile photo or charity/campaign images for upload.

## Guideline 5.1.1(v) — Account deletion

- **Where in the app:** Account tab → **Settings** (gear) → **Privacy & Security** → scroll to **Delete Account** (under **Data**).
- **What happens:** The app calls the server to remove the donor account. Charity and admin accounts are blocked from self-deletion in-app with an explanatory message (charities must contact support to close an organization).
- **Recording:** Sign in with a **test donor** account → open the path above → **Delete Account** → confirm → show that the app returns to a logged-out state and the account cannot sign in again.

## Guideline 3.2.2(iv) — Charitable donations (Safari / SFSafariViewController)

GiveBlack is **not** an approved nonprofit. On **iOS**, donations do not use the in-app Stripe Payment Sheet. The user is taken to **Stripe Checkout in the system browser** (SFSafariViewController via `expo-web-browser`), completes payment there, and returns to the app via the `giveblack://` / universal-link flow to the checkout result screen.

- **Recording:** From the **Give** flow, open an organization → **Donate** → enter amount → continue → complete (or cancel) checkout in the browser sheet; show return to the app.

## Nonprofit status (if applicable)

GiveBlack is **not** listed as an approved nonprofit with Benevity or Candid.

## Build

Increment **iOS build number** in `app.json` for each submission; keep **version** aligned with App Store Connect.
