# GiveBlack Admin Dashboard — Build Prompt

Build a standalone admin web dashboard for the **GiveBlack** charitable donations platform. This dashboard is a separate Replit project that connects to the same Supabase database and Express backend used by the GiveBlack mobile app.

---

## 1. Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18+ |
| Build Tool | Vite |
| Styling | Tailwind CSS |
| Database Client | @supabase/supabase-js |
| Charts | Recharts |
| Icons | Lucide React |
| Routing | React Router v6 |
| HTTP Client | fetch (native) |
| Date Handling | date-fns |
| CSV Export | papaparse |
| State | React Context + useState |
| Rich Text | @tiptap/react (for content editor) |

---

## 2. Environment Variables

```
ADMIN_EMAIL=<admin login email>
ADMIN_PASSWORD=<admin login password>
EXPO_PUBLIC_SUPABASE_URL=<supabase project url>
SUPABASE_SERVICE_ROLE_KEY=<supabase service role key>
VITE_API_BASE_URL=<express backend url, e.g. https://<repl-slug>.replit.app>
```

- Use `SUPABASE_SERVICE_ROLE_KEY` (not the anon key) for all Supabase operations so the dashboard bypasses RLS.
- `ADMIN_EMAIL` and `ADMIN_PASSWORD` are used for the admin login form — validate client-side against these env vars (exposed via `import.meta.env`). Prefix them with `VITE_` in the actual `.env` file so Vite exposes them: `VITE_ADMIN_EMAIL`, `VITE_ADMIN_PASSWORD`.
- The Express backend runs at port 5000 on the GiveBlack mobile app Replit. Set `VITE_API_BASE_URL` to its public URL.

---

## 3. Supabase Table Schemas

### 3.1 profiles
```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  user_type TEXT NOT NULL DEFAULT 'donor' CHECK (user_type IN ('donor', 'charity')),
  zip_code TEXT,
  college_attended BOOLEAN,
  charity_name TEXT,
  charity_category TEXT,
  charity_description TEXT,
  charity_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.2 categories
```sql
CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  icon_set TEXT NOT NULL DEFAULT 'Ionicons',
  color TEXT NOT NULL DEFAULT '#E8E8E8',
  count INTEGER NOT NULL DEFAULT 0
);
```

### 3.3 organizations
```sql
CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category_id TEXT REFERENCES categories(id),
  description TEXT NOT NULL DEFAULT '',
  raised NUMERIC NOT NULL DEFAULT 0,
  goal NUMERIC NOT NULL DEFAULT 0,
  donor_count INTEGER NOT NULL DEFAULT 0,
  image_color TEXT NOT NULL DEFAULT '#333333',
  initials TEXT NOT NULL DEFAULT '',
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- Bank & verification fields
  bank_name TEXT DEFAULT '',
  bank_account_number TEXT DEFAULT '',
  bank_routing_number TEXT DEFAULT '',
  tax_id TEXT DEFAULT '',
  contact_email TEXT DEFAULT '',
  contact_name TEXT DEFAULT '',
  stripe_connect_id TEXT DEFAULT '',
  is_verified BOOLEAN DEFAULT FALSE,
  website_url TEXT DEFAULT ''
);
```

### 3.4 donations
```sql
CREATE TABLE donations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  org_id TEXT REFERENCES organizations(id),
  org_name TEXT NOT NULL,
  category_id TEXT,
  amount NUMERIC NOT NULL,
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.5 wallets
```sql
CREATE TABLE wallets (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance NUMERIC NOT NULL DEFAULT 0 CHECK (balance >= 0),
  stripe_customer_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.6 transactions
```sql
CREATE TABLE transactions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('topup', 'donation', 'withdrawal')),
  title TEXT NOT NULL DEFAULT '',
  amount NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'pending', 'failed')),
  reference TEXT NOT NULL DEFAULT '',
  payment_method TEXT DEFAULT 'wallet',
  org_id TEXT,
  org_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.7 saved_cards
```sql
CREATE TABLE saved_cards (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  stripe_pm_id TEXT,
  brand TEXT NOT NULL DEFAULT 'visa',
  last4 TEXT NOT NULL DEFAULT '****',
  exp_month INTEGER,
  exp_year INTEGER,
  card_holder TEXT NOT NULL DEFAULT '',
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.8 user_profiles
```sql
CREATE TABLE user_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  nickname TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  donate_anonymous BOOLEAN DEFAULT FALSE,
  biometric_enabled BOOLEAN DEFAULT FALSE,
  pin_hash TEXT,
  push_enabled BOOLEAN DEFAULT TRUE,
  notification_donations BOOLEAN DEFAULT TRUE,
  notification_campaigns BOOLEAN DEFAULT TRUE,
  notification_impact BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.9 favorites
```sql
CREATE TABLE favorites (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, org_id)
);
```

### 3.10 push_tokens
```sql
CREATE TABLE push_tokens (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  expo_push_token TEXT NOT NULL,
  platform TEXT DEFAULT 'unknown',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, expo_push_token)
);
```

### 3.11 app_settings
```sql
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Default rows:
-- stripe_enabled | 'false'
-- stripe_connect_enabled | 'false'
-- brevo_enabled | 'false'
-- brevo_api_key | ''
-- stripe_publishable_key | ''
-- support_email | 'support@giveblack.org'
-- support_phone | '(832) 555-0199'
-- min_donation_amount | '1'
-- max_donation_amount | '10000'
-- platform_fee_percent | '0'
```

---

## 4. Express Backend API Endpoints

The Express backend runs on the GiveBlack mobile app Replit at port 5000. The admin dashboard calls these endpoints using `VITE_API_BASE_URL`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/overview` | Returns KPI data: totalDonations, totalTransactions, pendingCharities, approvedCharities, rejectedCharities, totalCharityRequests, uniqueDonors, uniqueOrgs, avgDonation, last7Days (array of {date, amount, count}), recentTransactions (last 5), recentLogs (last 10) |
| GET | `/api/charity-requests` | List all charity signup requests with status (pending/approved/rejected) |
| POST | `/api/charity-requests` | Submit a charity request |
| PUT | `/api/charity-requests/:id/approve` | Approve a charity request — creates org in organizations table with bank details |
| PUT | `/api/charity-requests/:id/reject` | Reject a charity request — body: `{ reason: string }` |
| GET | `/api/transactions` | List all transactions (in-memory server array) |
| POST | `/api/transactions` | Create a transaction record |
| GET | `/api/activity-logs` | List recent activity logs (last 500) |
| POST | `/api/notifications/send` | Send push notifications — body: `{ title: string, body: string, targetUserIds?: string[] }` — returns `{ success, deviceCount }` |
| GET | `/api/categories` | List all categories from Supabase |
| GET | `/api/organizations` | List all organizations from Supabase |
| GET | `/api/organizations/featured` | List featured organizations |
| GET | `/api/stats` | Aggregated stats: totalRaised, totalDonors, orgCount |
| GET | `/api/health` | Health check |
| GET | `/api/config` | App config: stripeEnabled, brevoEnabled, minDonation, maxDonation, supportEmail, supportPhone |

---

## 5. Design System & Visual Guidelines

### 5.1 Layout
- **Dark sidebar** (left, 260px wide, background: `#1A1A2E` or `#0F0F23`)
- **Light content area** (right, background: `#F8F9FA`)
- **Top header bar** within the content area showing page title, search, and admin avatar
- Sidebar is collapsible on smaller screens (hamburger menu)

### 5.2 Brand Colors
| Token | Value | Usage |
|-------|-------|-------|
| Primary / Accent | `#2D9E6B` | Buttons, active sidebar items, links, success states |
| Primary Hover | `#258756` | Button hover states |
| Sidebar BG | `#1A1A2E` | Sidebar background |
| Sidebar Active | `#2D9E6B` with 15% opacity bg | Active nav item |
| Content BG | `#F8F9FA` | Main content background |
| Card BG | `#FFFFFF` | Cards, tables, modals |
| Text Primary | `#1F2937` | Headings, body text |
| Text Secondary | `#6B7280` | Labels, placeholders |
| Danger | `#EF4444` | Delete buttons, reject actions |
| Warning | `#F59E0B` | Pending states |
| Info | `#3B82F6` | Info badges |

### 5.3 Typography
- Font: Inter (Google Fonts)
- Headings: 600 weight, sizes 24px (h1), 20px (h2), 16px (h3)
- Body: 400 weight, 14px
- Small/labels: 12px

### 5.4 Components
- **KPI Cards**: White card with colored left border (4px), large number, label, and small trend indicator (up/down arrow with percentage)
- **Tables**: Striped rows, sticky header, hover highlight, pagination (10/25/50 per page)
- **Modals**: Centered overlay, max-width 600px, rounded-lg, shadow-xl
- **Buttons**: Rounded-md, primary uses `#2D9E6B`, destructive uses `#EF4444`, outlined variant for secondary actions
- **Badges/Pills**: Rounded-full, small text, colored bg based on status (green=approved, yellow=pending, red=rejected)
- **Form inputs**: border-gray-300, focus:ring-2 focus:ring-green-500, rounded-md

### 5.5 Logo
- Display "GiveBlack" text in the sidebar header or use the logo images from `assets/images/logo-white.png` (for dark sidebar) and `assets/images/logo-black.png`
- Subtitle under logo: "Admin Dashboard"

---

## 6. Page Specifications

### 6.1 Login Page (`/login`)
- Full-screen centered card with GiveBlack logo
- Email + password form fields
- Validate against `VITE_ADMIN_EMAIL` and `VITE_ADMIN_PASSWORD` env vars
- On success, store auth state in React context and localStorage (simple token/flag)
- Redirect to `/` (dashboard)
- Show error toast on invalid credentials
- Protected route wrapper: redirect to `/login` if not authenticated

### 6.2 Dashboard (`/`)
**KPI Cards Row** (4 cards):
1. **Total Donations** — sum of all donation amounts (from `/api/admin/overview` → `totalDonations` + Supabase `donations` table)
2. **Active Campaigns** — count of organizations (Supabase `organizations` table count)
3. **Total Users** — count of profiles (Supabase `profiles` table count)
4. **Revenue** — total platform fees collected (totalDonations * platform_fee_percent / 100)

**Charts Row** (2 charts):
1. **Donations Over Time** — Line/area chart using `last7Days` data from `/api/admin/overview`. X-axis: dates, Y-axis: amounts. Extend to 30 days by querying Supabase `donations` table grouped by date.
2. **Top Campaigns** — Horizontal bar chart showing top 10 organizations by `raised` amount from Supabase.

**Recent Activity Feed** — Card showing last 10 activity logs from `/api/activity-logs`. Each entry: icon based on type, message, relative timestamp. Types: donation, charity_signup, charity_approved, charity_rejected, donor_login, system, topup, payment.

**Recent Transactions Table** — Last 5 transactions from `/api/admin/overview` → `recentTransactions`. Columns: Ref, Donor, Organization, Amount, Status, Date.

### 6.3 Organizations (`/organizations`)
Full CRUD on the `organizations` Supabase table using the service_role key.

**List View**:
- Table with columns: Name, Category, Raised, Goal, Progress (bar), Donors, Featured (toggle), Verified (badge), Actions
- Search bar (filter by name)
- Filter by category dropdown
- Toggle `featured` directly from the table row (PATCH update)
- Pagination

**Create/Edit Modal**:
- Fields: name, category_id (dropdown from categories), description, goal, image_color (color picker), initials, featured (toggle), bank_name, bank_account_number, bank_routing_number, tax_id, contact_email, contact_name, stripe_connect_id, is_verified (toggle), website_url
- On create: generate `id` from name (lowercase, replace non-alphanumeric with hyphens)
- Supabase operations: `supabase.from('organizations').insert(...)`, `.update(...)`, `.delete(...)`

**Delete**: Confirmation modal before deleting

### 6.4 Categories (`/categories`)
Full CRUD on `categories` Supabase table.

**List View**:
- Table: ID, Name, Icon, Icon Set, Color (color swatch), Org Count, Actions
- Inline editing for quick changes

**Create/Edit Modal**:
- Fields: id (auto-generated from name on create), name, icon (text input for icon name), icon_set (dropdown: Ionicons, MaterialIcons, Feather, FontAwesome, MaterialCommunityIcons), color (color picker)
- Supabase operations: `.insert(...)`, `.update(...)`, `.delete(...)`

### 6.5 Users (`/users`)
Read from Supabase `profiles` table joined with `user_profiles`, `wallets`.

**List View**:
- Two tabs: **Donors** (user_type='donor') and **Charities** (user_type='charity')
- Table columns (Donors): Name, Email, Zip Code, Wallet Balance, Total Donated, Joined Date, Status, Actions
- Table columns (Charities): Name, Email, Charity Name, Category, Verified, Joined Date, Status, Actions
- Search by name or email
- Total donated: sum from `donations` table where user_id matches

**User Detail Drawer/Modal**:
- Profile info from `profiles` + `user_profiles`
- Wallet balance from `wallets`
- Donation history from `donations` table (list with org name, amount, date)
- Transaction history from `transactions` table
- Favorites from `favorites` table (org names)
- Saved cards count from `saved_cards`
- Suspend/Activate toggle (add a `suspended` field to profiles or use Supabase auth admin API to disable user)

### 6.6 Charity Requests (`/charity-requests`)
Uses Express endpoints for charity request management.

**Queue View**:
- Three tabs: **Pending**, **Approved**, **Rejected**
- Table columns: Charity Name, Contact Name, Email, Category, Bank Name, Status, Submitted Date, Actions
- Pending tab shows Approve/Reject buttons

**Request Detail Modal**:
- All submitted info: charityName, category, description, url, contactName, email
- **Bank Details Section** (highlighted): bankName, accountNumber (masked, show last 4), routingNumber, taxId
- Approve button → `PUT /api/charity-requests/:id/approve`
- Reject button → opens reason textarea → `PUT /api/charity-requests/:id/reject` with `{ reason }`

**Bank Details Flow**:
When admin approves a charity:
1. The Express backend creates an organization record with bank details (bank_name, bank_account_number, bank_routing_number, tax_id) stored in the `organizations` table
2. The org is marked `is_verified: true`
3. Future donations to this org are routed directly to the charity's bank account
4. The admin can later edit bank details from the Organizations page

### 6.7 Transactions (`/transactions`)
Browse all transactions from both Express (`/api/transactions`) and Supabase (`transactions` table).

**Table Columns**: Reference, Donor Name, Donor Email, Organization, Category, Amount, Status (badge), Payment Method, Bank Routed (yes/no), Date

**Filters**:
- Date range picker (start/end)
- Type dropdown: topup, donation, withdrawal
- Status dropdown: completed, pending, failed
- Amount range: min/max inputs
- Search: by donor name, email, org name, or reference

**Export CSV**: Button to export filtered results as CSV using papaparse. Columns match the table.

**Transaction Detail Modal**: Click a row to see full details including bank routing info (if available).

### 6.8 Push Notifications (`/notifications`)
Compose and send push notifications via `POST /api/notifications/send`.

**Compose Form**:
- Title (text input, required)
- Body (textarea, required)
- Target segment radio buttons:
  - All Users (no targetUserIds)
  - Donors Only (query `profiles` where user_type='donor', get user IDs, pass as targetUserIds)
  - Charities Only (query `profiles` where user_type='charity', get user IDs)
  - Custom (multi-select user picker)
- Preview card showing how the notification will appear
- Send button with confirmation dialog
- Response shows device count reached

**History**: Display recent notification logs from `/api/activity-logs` filtered by type='system' where message contains "Push notification".

### 6.9 Settings (`/settings`)

Read/write to Supabase `app_settings` table using service_role key. Each setting is a key-value row.

**Sections**:

#### Payment Settings
| Setting | app_settings key | Input Type |
|---------|-----------------|------------|
| Stripe Enabled | `stripe_enabled` | Toggle (true/false) |
| Stripe Publishable Key | `stripe_publishable_key` | Text input (masked) |
| Stripe Connect Enabled | `stripe_connect_enabled` | Toggle |
| Min Donation Amount | `min_donation_amount` | Number input |
| Max Donation Amount | `max_donation_amount` | Number input |
| Platform Fee % | `platform_fee_percent` | Number input (0-100) |

#### Notification Settings
| Setting | app_settings key | Input Type |
|---------|-----------------|------------|
| Brevo Enabled | `brevo_enabled` | Toggle |
| Brevo API Key | `brevo_api_key` | Text input (masked, show last 4 chars) |

#### Support Settings
| Setting | app_settings key | Input Type |
|---------|-----------------|------------|
| Support Email | `support_email` | Email input |
| Support Phone | `support_phone` | Phone input |

**Save Logic**:
- Load all settings on mount: `supabase.from('app_settings').select('*')`
- On save: upsert each changed setting: `supabase.from('app_settings').upsert({ key, value, updated_at: new Date().toISOString() })`
- Show success toast on save

#### Stripe Connect Configuration
- When Stripe Connect is enabled, admin can assign `stripe_connect_id` to individual organizations from the Organizations page
- Display a guide section explaining the Stripe Connect onboarding flow

#### Brevo Configuration
- When Brevo is enabled and API key is set, the backend can send transactional email/SMS notifications for donations
- Display a test button to verify the Brevo API key works

### 6.10 Content Editor (`/content`)
Manage legal and informational content stored in `app_settings` table.

**Tabs**:
1. **Terms of Service** — key: `terms_of_service`, rich text editor
2. **Privacy Policy** — key: `privacy_policy`, rich text editor
3. **FAQ** — key: `faq_content`, structured editor (list of question/answer pairs stored as JSON)

**Editor**:
- Use Tiptap for rich text editing (bold, italic, headings, lists, links)
- Auto-save indicator
- Preview mode toggle
- Save to `app_settings` table with the respective key

### 6.11 Analytics (`/analytics`)
Advanced analytics page with data from Supabase.

**Donation Trends** (Line Chart):
- Query `donations` table grouped by day/week/month
- Toggle between daily, weekly, monthly views
- Date range selector
- Show total and average donation amounts

**Top Organizations** (Bar Chart):
- Top 10 organizations by total raised
- Show goal progress percentage

**Donor Retention** (Table/Chart):
- Query donors who donated more than once
- Show repeat donor count vs one-time donors
- Monthly active donors trend

**Category Distribution** (Pie/Donut Chart):
- Donations grouped by category
- Show percentage breakdown

**Geographic Distribution** (Table):
- Donors grouped by zip_code from `profiles` table
- Top 10 zip codes by donation volume

---

## 7. Sidebar Navigation Structure

```
GiveBlack Logo
"Admin Dashboard"

---

Dashboard          (icon: LayoutDashboard)
Organizations      (icon: Building2)
Categories         (icon: Grid3x3)
Users              (icon: Users)
Charity Requests   (icon: ClipboardCheck)  [badge: pending count]
Transactions       (icon: ArrowLeftRight)
Notifications      (icon: Bell)
Analytics          (icon: BarChart3)
Content            (icon: FileText)
Settings           (icon: Settings)

---

Logout             (icon: LogOut)
```

---

## 8. Supabase Client Setup

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

export const supabase = createClient(supabaseUrl, supabaseServiceKey);
```

Use the service_role key so the admin dashboard bypasses all Row Level Security policies and has full read/write access to all tables.

---

## 9. API Helper

```typescript
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function apiPost<T>(path: string, body: any): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function apiPut<T>(path: string, body?: any): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
```

---

## 10. File Structure

```
admin-dashboard/
├── index.html
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── tsconfig.json
├── .env
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css               # Tailwind directives + custom styles
│   ├── lib/
│   │   ├── supabase.ts         # Supabase client (service_role)
│   │   └── api.ts              # Express API helpers
│   ├── context/
│   │   └── AuthContext.tsx      # Admin auth state
│   ├── components/
│   │   ├── Layout.tsx           # Sidebar + content wrapper
│   │   ├── Sidebar.tsx          # Navigation sidebar
│   │   ├── Header.tsx           # Top bar with search + avatar
│   │   ├── KPICard.tsx          # Stat card component
│   │   ├── DataTable.tsx        # Reusable table with pagination, sort, search
│   │   ├── Modal.tsx            # Reusable modal
│   │   ├── Badge.tsx            # Status badge
│   │   ├── ConfirmDialog.tsx    # Confirmation dialog
│   │   └── Toast.tsx            # Toast notifications
│   ├── pages/
│   │   ├── Login.tsx
│   │   ├── Dashboard.tsx
│   │   ├── Organizations.tsx
│   │   ├── Categories.tsx
│   │   ├── Users.tsx
│   │   ├── CharityRequests.tsx
│   │   ├── Transactions.tsx
│   │   ├── Notifications.tsx
│   │   ├── Analytics.tsx
│   │   ├── Content.tsx
│   │   └── Settings.tsx
│   └── types/
│       └── index.ts             # TypeScript interfaces for all entities
```

---

## 11. TypeScript Interfaces

```typescript
interface Profile {
  id: string;
  name: string;
  email: string;
  user_type: 'donor' | 'charity';
  zip_code: string | null;
  college_attended: boolean | null;
  charity_name: string | null;
  charity_category: string | null;
  charity_description: string | null;
  charity_url: string | null;
  created_at: string;
}

interface Category {
  id: string;
  name: string;
  icon: string;
  icon_set: string;
  color: string;
  count: number;
}

interface Organization {
  id: string;
  name: string;
  category_id: string | null;
  description: string;
  raised: number;
  goal: number;
  donor_count: number;
  image_color: string;
  initials: string;
  featured: boolean;
  created_at: string;
  bank_name: string;
  bank_account_number: string;
  bank_routing_number: string;
  tax_id: string;
  contact_email: string;
  contact_name: string;
  stripe_connect_id: string;
  is_verified: boolean;
  website_url: string;
}

interface Donation {
  id: string;
  user_id: string | null;
  org_id: string;
  org_name: string;
  category_id: string | null;
  amount: number;
  message: string | null;
  created_at: string;
}

interface Transaction {
  id: string;
  user_id: string | null;
  type: 'topup' | 'donation' | 'withdrawal';
  title: string;
  amount: number;
  status: 'completed' | 'pending' | 'failed';
  reference: string;
  payment_method: string;
  org_id: string | null;
  org_name: string | null;
  created_at: string;
}

interface Wallet {
  user_id: string;
  balance: number;
  stripe_customer_id: string | null;
  created_at: string;
  updated_at: string;
}

interface UserProfile {
  user_id: string;
  full_name: string;
  nickname: string;
  phone: string;
  avatar_url: string;
  donate_anonymous: boolean;
  biometric_enabled: boolean;
  push_enabled: boolean;
  notification_donations: boolean;
  notification_campaigns: boolean;
  notification_impact: boolean;
  created_at: string;
  updated_at: string;
}

interface CharityRequest {
  id: string;
  charityName: string;
  category: string;
  description: string;
  url: string;
  contactName: string;
  email: string;
  bankName: string;
  accountNumber: string;
  routingNumber: string;
  lastFourSSN: string;
  taxId: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  createdAt: string;
}

interface ServerTransaction {
  id: string;
  donorName: string;
  donorEmail: string;
  orgId: string;
  orgName: string;
  categoryId: string;
  amount: number;
  message: string;
  bankName: string;
  accountNumber: string;
  routingNumber: string;
  taxId: string;
  charityEmail: string;
  status: 'completed' | 'pending' | 'failed';
  transactionRef: string;
  createdAt: string;
}

interface ActivityLog {
  id: string;
  type: 'donation' | 'charity_signup' | 'charity_approved' | 'charity_rejected' | 'donor_login' | 'charity_login' | 'system' | 'topup' | 'payment';
  message: string;
  details: Record<string, any>;
  createdAt: string;
}

interface AppSetting {
  key: string;
  value: string;
  updated_at: string;
}

interface AdminOverview {
  totalDonations: number;
  totalTransactions: number;
  pendingCharities: number;
  approvedCharities: number;
  rejectedCharities: number;
  totalCharityRequests: number;
  uniqueDonors: number;
  uniqueOrgs: number;
  avgDonation: number;
  last7Days: { date: string; amount: number; count: number }[];
  recentTransactions: ServerTransaction[];
  recentLogs: ActivityLog[];
}
```

---

## 12. Key Implementation Notes

1. **Authentication is simple**: Compare email/password against env vars. No JWT or session management needed beyond localStorage flag. This is an internal admin tool.

2. **Dual data sources**: Some data lives in Supabase (organizations, categories, profiles, donations, wallets, transactions, app_settings) and some in the Express server's in-memory arrays (charity requests, server transactions, activity logs). The dashboard must query both.

3. **Service role key**: All Supabase queries use the service_role key to bypass RLS. This means the admin can read/write any row in any table.

4. **Bank details are sensitive**: Mask account numbers in the UI (show only last 4 digits). Only reveal full details in a detail modal with a "Show" toggle button.

5. **Real-time updates**: Optionally subscribe to Supabase realtime on `organizations` and `donations` tables to auto-refresh dashboard KPIs.

6. **Responsive**: The dashboard should work on desktop (1200px+) and tablet (768px+). Mobile is not required but the sidebar should collapse to a hamburger menu below 1024px.

7. **Loading states**: Show skeleton loaders while data is fetching. Show empty states with helpful messages when no data exists.

8. **Error handling**: Wrap all API calls in try/catch. Show error toasts with the error message. Never crash silently.

9. **Optimistic updates**: For toggle operations (featured, verified), update the UI immediately and revert on error.

10. **Pagination**: All list pages should paginate. Use Supabase `.range(from, to)` for database queries. Default 25 items per page.

---

## 13. Stripe Connect Integration Details

- Each organization can optionally have a `stripe_connect_id` field
- Admin can input/edit this from the Organizations edit modal
- When `stripe_connect_enabled` is `true` in app_settings and an org has a `stripe_connect_id`, donations to that org go through Stripe Connect transfers
- The Settings page should show a section explaining how to onboard charities to Stripe Connect
- Display connection status for each org in the Organizations table (connected/not connected)

---

## 14. Brevo Integration Details

- Brevo is used for transactional email and SMS notifications (donation receipts, charity approval emails, etc.)
- Admin configures the Brevo API key in Settings → stored in `app_settings` as `brevo_api_key`
- When `brevo_enabled` is `true` and API key is set, the backend sends email notifications
- Settings page includes a "Test Connection" button that validates the API key
- Show integration status indicator (connected/disconnected) in the Settings page

---

## 15. CSV Export Specification

The Transactions page export should produce a CSV with these columns:
```
Reference, Date, Donor Name, Donor Email, Organization, Category, Amount, Status, Payment Method, Bank Name, Account (Last 4), Routing Number, Tax ID
```

Use the papaparse library:
```typescript
import Papa from 'papaparse';

function exportCSV(data: any[], filename: string) {
  const csv = Papa.unparse(data);
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

---

## 16. Toast Notification System

Implement a simple toast system using React context:
- Success (green), Error (red), Warning (yellow), Info (blue)
- Auto-dismiss after 5 seconds
- Stack in bottom-right corner
- Show on: CRUD operations, settings saved, notifications sent, errors

---

This prompt contains everything needed to build the complete GiveBlack Admin Dashboard. Follow the design system closely, implement all pages listed, and ensure both Supabase and Express API data sources are properly integrated.
