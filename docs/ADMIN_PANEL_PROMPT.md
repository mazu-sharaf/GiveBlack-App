# GiveBlack Admin Panel — Full Build Specification

## 1. Project Overview

**GiveBlack** is a mobile donation platform connecting donors with Black-owned charitable organizations. This document specifies a **Next.js admin panel** that connects to the existing GiveBlack Express.js backend API for full platform management.

### What the Admin Panel Does
- Real-time analytics dashboard (donations, revenue, growth)
- Full user management (donors & charities)
- Organization management with image uploads
- Donation and transaction monitoring
- Charity application review/approval workflow
- Category management with image uploads
- Volunteer tracking
- Push notification broadcasting
- App settings configuration
- System health monitoring

### Recommended Tech Stack
| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14+ (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Components | shadcn/ui |
| Charts | Recharts |
| Icons | Lucide React |
| HTTP Client | Native fetch (or axios) |
| State | React Context + SWR or React Query |
| Forms | React Hook Form + Zod validation |
| Notifications | Sonner (toast) |
| Tables | @tanstack/react-table |
| Date Handling | date-fns |

---

## 2. Backend Connection & Authentication

### API Base URL
The admin panel connects to the GiveBlack Express backend. Configure the base URL via environment variable:

```env
NEXT_PUBLIC_API_URL=https://your-giveblack-backend.replit.app
```

### CORS Configuration
On the **backend** side, the `ADMIN_PANEL_URL` environment variable must be set to the admin panel's URL (comma-separated for multiple origins):

```env
ADMIN_PANEL_URL=https://your-admin-panel.replit.app,http://localhost:3000
```

The backend CORS middleware allows:
- Methods: `GET, POST, PUT, DELETE, OPTIONS`
- Headers: `Content-Type, Authorization`
- Credentials: `true`
- All localhost origins are allowed by default for development

### Authentication Flow

**Login credentials:** `admin@gb.com` / `Admin@gb`

1. **POST** `/api/admin/login` with `{ "email": "admin@gb.com", "password": "..." }`
2. Backend returns: `{ "success": true, "token": "jwt-token-here", "admin": { "email": "admin@gb.com", "name": "GiveBlack Admin", "role": "admin" } }`
3. Store the JWT token in `localStorage` (key: `gb_admin_token`)
4. Include on all subsequent requests: `Authorization: Bearer <token>`
5. Token expires in **24 hours** — redirect to login on 401/403 responses
6. **GET** `/api/admin/me` to verify the current session (returns `{ email, name, role }`)

### API Client Pattern
Create a reusable API client:

```typescript
const API_URL = process.env.NEXT_PUBLIC_API_URL;

async function adminFetch(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem("gb_admin_token");
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (res.status === 401 || res.status === 403) {
    localStorage.removeItem("gb_admin_token");
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error || res.statusText);
  }
  return res.json();
}

async function adminUpload(path: string, formData: FormData) {
  const token = localStorage.getItem("gb_admin_token");
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error || res.statusText);
  }
  return res.json();
}
```

---

## 3. Complete API Reference

All endpoints below require `Authorization: Bearer <token>` unless noted otherwise.

### 3.1 Authentication

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/admin/login` | Authenticate admin |
| `GET` | `/api/admin/me` | Get current admin info |

**POST /api/admin/login**
```
Request:  { "email": string, "password": string }
Response: { "success": true, "token": string, "admin": { "email": string, "name": string, "role": "admin" } }
Error:    { "error": "Invalid credentials" } (401)
```

**GET /api/admin/me**
```
Response: { "email": string, "name": string, "role": "admin" }
```

---

### 3.2 Dashboard Overview

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/overview` | Full analytics dashboard data |

**GET /api/admin/overview**
```
Response: {
  "totalDonations": number,       // sum of all donation amounts
  "totalTransactions": number,    // count of all transactions
  "totalUsers": number,           // count of all users
  "totalOrganizations": number,   // count of all orgs
  "pendingCharities": number,     // count of pending charity requests
  "revenue": {
    "platformFees": number,
    "educationContributions": number,
    "endowmentContributions": number,
    "totalRevenue": number
  },
  "growth": {
    "weeklyNewUsers": number,
    "monthlyNewUsers": number,
    "weeklyNewOrgs": number,
    "monthlyNewOrgs": number
  },
  "topOrganizations": [
    { "id": string, "name": string, "raised": number, "donor_count": number }
  ],
  "topDonors": [
    { "user_id": string, "name": string, "email": string, "total": number, "count": number }
  ],
  "last30Days": [
    { "date": string, "total": number, "count": number }
  ],
  "recentTransactions": [
    { "id": string, "type": string, "title": string, "amount": number, "status": string, "created_at": string }
  ]
}
```

---

### 3.3 User Management

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/users` | List users (paginated) |
| `GET` | `/api/admin/users/:id` | Get user detail |
| `PUT` | `/api/admin/users/:id` | Update user |
| `DELETE` | `/api/admin/users/:id` | Delete user and all related data |
| `GET` | `/api/admin/users/:id/transactions` | User's transaction history |
| `GET` | `/api/admin/users/:id/donations` | User's donation history |

**GET /api/admin/users**
```
Query params: ?search=string&limit=number&offset=number
Response: {
  "users": [
    {
      "id": string,
      "email": string,
      "name": string,
      "user_type": "donor" | "charity",
      "created_at": string,
      "wallet_balance": number,
      "donation_count": number,
      "transaction_count": number
    }
  ],
  "total": number
}
```

**GET /api/admin/users/:id**
```
Response: {
  "id": string,
  "email": string,
  "name": string,
  "user_type": string,
  "created_at": string,
  "wallet": { "balance": number },
  "profile": { "full_name": string, "nickname": string, "phone": string, "avatar_url": string, ... },
  "donationCount": number,
  "transactionCount": number
}
```

**PUT /api/admin/users/:id**
```
Request:  { "name": string, "email": string, "userType": "donor" | "charity" }
Response: { "success": true, "user": { ... } }
```

**DELETE /api/admin/users/:id**
```
Response: { "success": true }
```

**GET /api/admin/users/:id/transactions**
```
Query params: ?limit=number&offset=number
Response: { "transactions": [...], "total": number }
```

**GET /api/admin/users/:id/donations**
```
Query params: ?limit=number&offset=number
Response: { "donations": [...], "total": number }
```

---

### 3.4 Organization Management

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/organizations` | List organizations |
| `GET` | `/api/admin/organizations/:id` | Get org detail |
| `POST` | `/api/admin/organizations` | Create organization |
| `PUT` | `/api/admin/organizations/:id` | Update organization |
| `DELETE` | `/api/admin/organizations/:id` | Delete org and related data |
| `PUT` | `/api/admin/organizations/:id/feature` | Toggle featured status |
| `PUT` | `/api/admin/organizations/:id/verify` | Toggle verified status |
| `POST` | `/api/admin/organizations/:id/image` | Upload org image |
| `DELETE` | `/api/admin/organizations/:id/image` | Remove org image |

**GET /api/admin/organizations**
```
Query params: ?search=string&category=string&limit=number&offset=number
Response: {
  "organizations": [
    {
      "id": string,
      "name": string,
      "category_id": string,
      "description": string,
      "raised": number,
      "goal": number,
      "donor_count": number,
      "image_color": string,
      "initials": string,
      "featured": boolean,
      "is_verified": boolean,
      "image_url": string,
      "thumbnail_url": string,
      "contact_email": string,
      "contact_name": string,
      "website_url": string,
      "created_at": string
    }
  ],
  "total": number
}
```

**POST /api/admin/organizations**
```
Request: {
  "name": string,          // required
  "categoryId": string,    // required
  "description": string,
  "goal": number,
  "contactEmail": string,
  "contactName": string,
  "websiteUrl": string,
  "bankName": string,
  "taxId": string
}
Response: { "success": true, "organization": { ... } }
```

**PUT /api/admin/organizations/:id**
```
Request: {
  "name": string,
  "description": string,
  "goal": number,
  "categoryId": string,
  "featured": boolean,
  "isVerified": boolean,
  "contactEmail": string,
  "contactName": string,
  "websiteUrl": string,
  "bankName": string,
  "taxId": string,
  "absorbFees": boolean,
  "ecosystemOptIn": boolean,
  "stripeConnectId": string
}
Response: { "success": true, "organization": { ... } }
```

**PUT /api/admin/organizations/:id/feature**
```
Request:  { "featured": boolean }
Response: { "success": true }
```

**PUT /api/admin/organizations/:id/verify**
```
Request:  { "verified": boolean }
Response: { "success": true }
```

**POST /api/admin/organizations/:id/image** (multipart form)
```
Content-Type: multipart/form-data
Field: "image" (file — JPEG, PNG, WebP, or SVG, max 5MB)
Response: { "success": true, "imageUrl": string, "thumbnailUrl": string }
```

**DELETE /api/admin/organizations/:id/image**
```
Response: { "success": true }
```

---

### 3.5 Donations

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/donations` | List all donations |
| `GET` | `/api/admin/donations/stats` | Donation analytics |

**GET /api/admin/donations**
```
Query params: ?orgId=string&userId=string&dateFrom=string&dateTo=string&limit=number&offset=number
Response: {
  "donations": [
    {
      "id": string,
      "user_id": string,
      "org_id": string,
      "org_name": string,
      "category_id": string,
      "amount": number,
      "message": string,
      "platform_fee": number,
      "education_contribution": number,
      "endowment_contribution": number,
      "net_to_org": number,
      "created_at": string
    }
  ],
  "total": number
}
```

**GET /api/admin/donations/stats**
```
Response: {
  "totalAmount": number,
  "totalCount": number,
  "averageDonation": number,
  "topOrganizations": [ { "org_id": string, "org_name": string, "total": number, "count": number } ],
  "topDonors": [ { "user_id": string, "email": string, "total": number, "count": number } ],
  "last30Days": [ { "date": string, "total": number, "count": number } ]
}
```

---

### 3.6 Transactions

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/transactions` | List all transactions |
| `GET` | `/api/admin/transactions/stats` | Transaction analytics |

**GET /api/admin/transactions**
```
Query params: ?type=string&status=string&dateFrom=string&dateTo=string&limit=number&offset=number
type values: "topup" | "donation" | "withdrawal"
status values: "completed" | "pending" | "failed"
Response: {
  "transactions": [
    {
      "id": string,
      "user_id": string,
      "type": string,
      "title": string,
      "amount": number,
      "status": string,
      "reference": string,
      "payment_method": string,
      "org_id": string,
      "org_name": string,
      "created_at": string
    }
  ],
  "total": number
}
```

**GET /api/admin/transactions/stats**
```
Response: {
  "totalVolume": number,
  "totalCount": number,
  "byType": { "topup": { "total": number, "count": number }, "donation": { ... }, "withdrawal": { ... } },
  "byStatus": { "completed": { "total": number, "count": number }, "pending": { ... }, "failed": { ... } }
}
```

---

### 3.7 Charity Requests (Approval Workflow)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/charity-requests` | List charity applications |
| `GET` | `/api/admin/charity-requests/:id` | Get application detail |
| `PUT` | `/api/admin/charity-requests/:id/approve` | Approve (creates org) |
| `PUT` | `/api/admin/charity-requests/:id/reject` | Reject with reason |

**GET /api/admin/charity-requests**
```
Query params: ?status=string  ("pending" | "approved" | "rejected")
Response: [
  {
    "id": string,
    "charity_name": string,
    "category": string,
    "description": string,
    "url": string,
    "contact_name": string,
    "email": string,
    "bank_name": string,
    "account_number": string,
    "routing_number": string,
    "last_four_ssn": string,
    "tax_id": string,
    "logo_url": string,
    "status": "pending" | "approved" | "rejected",
    "rejection_reason": string,
    "created_at": string
  }
]
```

**PUT /api/admin/charity-requests/:id/approve**
```
Request:  {} (empty body)
Response: { "success": true, "message": "Charity request approved and organization created", "organization": { ... } }
Side effect: Automatically creates an Organization record with the charity's details, assigns category, generates initials/color, copies logo_url to org image_url
```

**PUT /api/admin/charity-requests/:id/reject**
```
Request:  { "reason": string }
Response: { "success": true }
```

---

### 3.8 Categories

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/categories` | List all categories |
| `POST` | `/api/admin/categories` | Create category |
| `PUT` | `/api/admin/categories/:id` | Update category |
| `DELETE` | `/api/admin/categories/:id` | Delete category |
| `POST` | `/api/admin/categories/:id/image` | Upload category image |
| `DELETE` | `/api/admin/categories/:id/image` | Remove category image |

**GET /api/admin/categories**
```
Response: [
  { "id": string, "name": string, "icon": string, "icon_set": string, "color": string, "count": number, "image_url": string }
]
```

**POST /api/admin/categories**
```
Request:  { "name": string, "icon": string, "iconSet": string, "color": string }
Response: { "success": true, "category": { ... } }
```

**PUT /api/admin/categories/:id**
```
Request:  { "name": string, "icon": string, "iconSet": string, "color": string }
Response: { "success": true, "category": { ... } }
```

**POST /api/admin/categories/:id/image** (multipart form)
```
Content-Type: multipart/form-data
Field: "image" (file)
Response: { "success": true, "imageUrl": string, "thumbnailUrl": string }
```

---

### 3.9 Volunteers

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/volunteers` | List all volunteers |
| `GET` | `/api/admin/volunteers/:id` | Get volunteer detail |
| `DELETE` | `/api/admin/volunteers/:id` | Remove volunteer record |

**GET /api/admin/volunteers**
```
Query params: ?orgId=string&limit=number&offset=number
Response: {
  "volunteers": [
    { "id": string, "org_id": string, "name": string, "email": string, "skills": string, "availability": string, "created_at": string }
  ],
  "total": number
}
```

---

### 3.10 Activity Logs

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/activity-logs` | List activity logs |

**GET /api/admin/activity-logs**
```
Query params: ?limit=number&offset=number
Response: {
  "logs": [
    { "id": string, "type": string, "message": string, "details": object, "created_at": string }
  ],
  "total": number
}
```

---

### 3.11 App Settings

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/app-settings` | Get all settings |
| `PUT` | `/api/admin/app-settings` | Bulk update settings |

**GET /api/admin/app-settings**
```
Response: { "settings": { "key1": "value1", "key2": "value2", ... } }
```

**PUT /api/admin/app-settings**
```
Request:  { "settings": { "minDonation": "5", "maxDonation": "10000", "platformFeePercent": "3", ... } }
Response: { "success": true }
```

---

### 3.12 Push Notifications

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/admin/notifications/broadcast` | Send push notification |
| `GET` | `/api/admin/push-tokens` | List registered tokens |

**POST /api/admin/notifications/broadcast**
```
Request: {
  "title": string,
  "body": string,
  "targetUserIds": string[]  // optional — omit to broadcast to all
}
Response: { "success": true, "sent": number, "failed": number }
```

**GET /api/admin/push-tokens**
```
Response: [
  { "id": string, "user_id": string, "expo_push_token": string, "platform": string, "created_at": string }
]
```

---

### 3.13 System

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/system/health` | System health check |
| `POST` | `/api/admin/system/seed` | Seed initial data |

**GET /api/admin/system/health**
```
Response: {
  "status": "healthy",
  "uptime": number,
  "memory": { "rss": number, "heapUsed": number, "heapTotal": number },
  "supabase": "connected" | "error",
  "stripe": "configured" | "not configured",
  "timestamp": string
}
```

**POST /api/admin/system/seed**
```
Response: { "success": true, "message": "Data seeded", "categoriesCount": number }
```

### 3.14 Generic Image Upload

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/admin/upload` | Upload image to any bucket |

**POST /api/admin/upload** (multipart form)
```
Content-Type: multipart/form-data
Fields:
  "image" (file) — required
  "bucket" (string) — optional, default "organization-images"
  "prefix" (string) — optional, default "general"
Response: { "success": true, "imageUrl": string, "thumbnailUrl": string, "fileName": string }
```

---

## 4. Complete Database Schema

These are the Supabase PostgreSQL tables the admin panel reads/writes through the API. You do NOT connect directly to the database — this is for understanding data shapes.

### profiles
| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | References auth.users |
| name | TEXT | |
| email | TEXT | |
| user_type | TEXT | "donor" or "charity" |
| zip_code | TEXT | |
| college_attended | BOOLEAN | |
| charity_name | TEXT | For charity users |
| charity_category | TEXT | |
| charity_description | TEXT | |
| charity_url | TEXT | |
| created_at | TIMESTAMPTZ | |

### organizations
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT (PK) | Slug-based ID |
| name | TEXT | |
| category_id | TEXT (FK) | References categories.id |
| description | TEXT | |
| raised | NUMERIC | Total raised amount |
| goal | NUMERIC | Fundraising goal |
| donor_count | INTEGER | |
| image_color | TEXT | Hex color for avatar fallback |
| initials | TEXT | 2-letter initials for avatar fallback |
| featured | BOOLEAN | Show on homepage |
| is_verified | BOOLEAN | Verified badge |
| image_url | TEXT | Full-size image (Supabase Storage) |
| thumbnail_url | TEXT | 200x200 thumbnail |
| contact_email | TEXT | |
| contact_name | TEXT | |
| website_url | TEXT | |
| bank_name | TEXT | |
| bank_account_number | TEXT | |
| bank_routing_number | TEXT | |
| tax_id | TEXT | |
| stripe_connect_id | TEXT | |
| absorb_fees | BOOLEAN | |
| ecosystem_opt_in | BOOLEAN | |
| created_at | TIMESTAMPTZ | |

### categories
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT (PK) | Slug ID (e.g., "education") |
| name | TEXT | Display name |
| icon | TEXT | Ionicons/MaterialCommunityIcons name |
| icon_set | TEXT | "Ionicons" or "MaterialCommunityIcons" |
| color | TEXT | Hex color |
| count | INTEGER | Number of orgs |
| image_url | TEXT | Custom image (Supabase Storage) |

### donations
| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | |
| user_id | UUID (FK) | |
| org_id | TEXT (FK) | |
| org_name | TEXT | |
| category_id | TEXT | |
| amount | NUMERIC | |
| message | TEXT | |
| platform_fee | NUMERIC | |
| education_contribution | NUMERIC | |
| endowment_contribution | NUMERIC | |
| net_to_org | NUMERIC | |
| created_at | TIMESTAMPTZ | |

### transactions
| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | |
| user_id | UUID (FK) | |
| type | TEXT | "topup", "donation", "withdrawal" |
| title | TEXT | |
| amount | NUMERIC | |
| status | TEXT | "completed", "pending", "failed" |
| reference | TEXT | |
| payment_method | TEXT | |
| org_id | TEXT | |
| org_name | TEXT | |
| created_at | TIMESTAMPTZ | |

### wallets
| Column | Type | Notes |
|--------|------|-------|
| user_id | UUID (PK) | |
| balance | NUMERIC | |
| stripe_customer_id | TEXT | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### charity_requests
| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | |
| charity_name | TEXT | |
| category | TEXT | |
| description | TEXT | |
| url | TEXT | |
| contact_name | TEXT | |
| email | TEXT | |
| bank_name | TEXT | |
| account_number | TEXT | |
| routing_number | TEXT | |
| last_four_ssn | TEXT | |
| tax_id | TEXT | |
| logo_url | TEXT | Uploaded charity logo |
| status | TEXT | "pending", "approved", "rejected" |
| rejection_reason | TEXT | |
| created_at | TIMESTAMPTZ | |

### activity_logs
| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | |
| type | TEXT | e.g., "donation", "signup" |
| message | TEXT | Human-readable description |
| details | JSONB | Additional metadata |
| created_at | TIMESTAMPTZ | |

### app_settings
| Column | Type | Notes |
|--------|------|-------|
| key | TEXT (PK) | Setting name |
| value | TEXT | Setting value |
| updated_at | TIMESTAMPTZ | |

### volunteers
| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | |
| org_id | TEXT (FK) | |
| name | TEXT | |
| email | TEXT | |
| phone | TEXT | |
| skills | TEXT | |
| availability | TEXT | |
| message | TEXT | |
| created_at | TIMESTAMPTZ | |

### push_tokens
| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | |
| user_id | UUID (FK) | |
| expo_push_token | TEXT | |
| platform | TEXT | "ios", "android", "web" |
| created_at | TIMESTAMPTZ | |

### user_profiles
| Column | Type | Notes |
|--------|------|-------|
| user_id | UUID (PK) | |
| full_name | TEXT | |
| nickname | TEXT | |
| phone | TEXT | |
| avatar_url | TEXT | |
| pin_hash | TEXT | SHA-256 hashed PIN |
| donate_anonymous | BOOLEAN | |
| biometric_enabled | BOOLEAN | |
| push_enabled | BOOLEAN | |
| notification_donations | BOOLEAN | |
| notification_campaigns | BOOLEAN | |
| notification_impact | BOOLEAN | |

### saved_cards
| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | |
| user_id | UUID (FK) | |
| stripe_pm_id | TEXT | |
| brand | TEXT | "visa", "mastercard", etc. |
| last4 | TEXT | |
| exp_month | INTEGER | |
| exp_year | INTEGER | |
| card_holder | TEXT | |
| is_default | BOOLEAN | |

### favorites
| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | |
| user_id | UUID (FK) | |
| org_id | TEXT (FK) | |

---

## 5. Page-by-Page Specification

### App Layout
- **Sidebar navigation** (collapsible on mobile) with links to all sections
- **Top bar** with admin name, logout button, and dark/light mode toggle
- **Main content area** that fills the remaining space
- Sidebar sections:
  - Dashboard
  - Users
  - Organizations
  - Donations
  - Transactions
  - Charity Requests (show pending count badge)
  - Categories
  - Volunteers
  - Activity Logs
  - Settings (sub-items: App Settings, Notifications, System Health)

---

### 5.1 Login Page (`/login`)
- Full-screen centered login card
- GiveBlack logo at top (use green #2D9E6B as accent)
- Email and password fields
- "Sign In" button
- Error message display for invalid credentials
- Redirect to `/dashboard` on success
- If already authenticated (valid token in localStorage), redirect to `/dashboard`

---

### 5.2 Dashboard (`/dashboard`)
- **KPI Cards Row** (4 cards):
  - Total Donations (sum, formatted as currency)
  - Total Users (count)
  - Total Organizations (count)
  - Pending Charity Requests (count, with orange/yellow accent if > 0)
- **Revenue Breakdown Card**:
  - Platform Fees, Education Contributions, Endowment Contributions
  - Display as colored bars or pie chart
- **Growth Metrics Card**:
  - Weekly/monthly new users and orgs
  - Show as comparison badges (e.g., "+12 this week")
- **30-Day Donation Trend Chart** (Recharts AreaChart or LineChart):
  - X-axis: dates from `last30Days`
  - Y-axis: donation totals
  - Tooltip showing date + amount
- **Top Organizations Table** (top 5):
  - Columns: Name, Total Raised, Donor Count
  - Link org name to org detail
- **Top Donors Table** (top 5):
  - Columns: Name, Email, Total Donated, Donation Count
- **Recent Transactions List** (last 10):
  - Type badge (topup/donation), title, amount, status badge, timestamp
- **Data source:** Single call to `GET /api/admin/overview`

---

### 5.3 Users Page (`/users`)

**List View:**
- Search bar (filters by name/email)
- Data table with columns: Name, Email, Type (donor/charity badge), Wallet Balance, Donations, Joined Date
- Pagination controls
- Click row to open detail

**Detail View** (slide-out drawer or modal, or separate page `/users/[id]`):
- User info card: name, email, type, joined date, wallet balance
- Edit button to update name/email/userType
- Delete button with confirmation dialog ("This will permanently delete the user and all their data")
- Two tabs:
  - **Transactions** — paginated table of user's transactions
  - **Donations** — paginated table of user's donations

---

### 5.4 Organizations Page (`/organizations`)

**List View:**
- Search bar + category filter dropdown
- Data table with columns: Avatar (image or initials circle), Name, Category, Raised, Goal, Progress %, Featured star, Verified badge
- "Add Organization" button

**Create/Edit Form** (modal or page):
- Fields: Name, Category (dropdown from categories list), Description, Goal, Contact Name, Contact Email, Website URL, Bank Name, Tax ID
- For edit: additional toggles for Featured and Verified
- Image upload zone: drag-and-drop or click to upload org photo
  - Shows current image if one exists
  - "Remove Image" button to delete
  - Upload via `POST /api/admin/organizations/:id/image` (multipart form, field name "image")
  - Delete via `DELETE /api/admin/organizations/:id/image`

**Detail View:**
- Organization info card with all fields
- Image display (or initials circle fallback)
- Toggle switches for Featured and Verified (call respective PUT endpoints)
- Stats: total raised, donor count, volunteer count
- Delete button with confirmation

---

### 5.5 Donations Page (`/donations`)

**List View:**
- Filter bar: Organization dropdown, Date range picker (from/to), User ID search
- Data table with columns: ID (truncated), Organization, Amount, Platform Fee, Net to Org, Date
- Click row to show full details in a drawer
- Pagination

**Stats Sub-page** (`/donations/stats`):
- Total amount, total count, average donation (KPI cards)
- Top Organizations by donations (bar chart)
- Top Donors (table)
- 30-day trend (line chart)
- Data source: `GET /api/admin/donations/stats`

---

### 5.6 Transactions Page (`/transactions`)

**List View:**
- Filter bar: Type dropdown (topup/donation/withdrawal), Status dropdown (completed/pending/failed), Date range
- Data table with columns: ID (truncated), Type (color-coded badge), Title, Amount, Status (color-coded badge), Payment Method, Date
- Pagination

**Stats Sub-page** (`/transactions/stats`):
- Total volume, total count (KPI cards)
- Volume by type (donut chart)
- Count by status (bar chart)

---

### 5.7 Charity Requests Page (`/charity-requests`)

**List View:**
- Tab filters: All | Pending | Approved | Rejected
- Show pending count in the Pending tab label
- Data table with columns: Charity Name, Contact, Email, Category, Logo (thumbnail), Status Badge, Submitted Date
- Click row to open detail

**Detail View** (modal or page):
- Full application details:
  - Charity name, category, description, website URL
  - Contact: name, email
  - Banking: bank name, account (masked), routing (masked), last 4 SSN (masked), tax ID
  - Logo image (if uploaded) — display the logo_url
  - Status badge, submission date
- **Action buttons** (only visible for "pending" requests):
  - "Approve" — green button, confirmation dialog: "This will create a new organization from this charity request. Continue?"
    - On confirm: `PUT /api/admin/charity-requests/:id/approve`
    - Show success toast with org name
  - "Reject" — red button, opens a modal asking for rejection reason (required text field)
    - On confirm: `PUT /api/admin/charity-requests/:id/reject` with `{ "reason": "..." }`
- For approved requests: link to the created organization

---

### 5.8 Categories Page (`/categories`)

**List View:**
- Grid or table showing all categories
- Each card/row: Color swatch, Icon name, Category Name, Org Count, Image (if uploaded)
- "Add Category" button

**Create/Edit Form** (modal):
- Fields: Name, Icon name (text input with icon preview), Icon Set (dropdown: "Ionicons" or "MaterialCommunityIcons"), Color (color picker)
- Image upload zone (same pattern as org image upload)
  - Upload: `POST /api/admin/categories/:id/image`
  - Delete: `DELETE /api/admin/categories/:id/image`
- Delete button (on edit mode) with confirmation

---

### 5.9 Volunteers Page (`/volunteers`)

**List View:**
- Filter: Organization dropdown
- Data table with columns: Name, Email, Organization, Skills, Availability, Signed Up Date
- Delete button per row with confirmation
- Pagination

---

### 5.10 Activity Logs Page (`/activity-logs`)

- Timeline-style list of activity logs
- Each entry shows: type badge, message, timestamp, expandable details (JSON viewer for the `details` field)
- Pagination (load more or page numbers)
- Optional: filter by type

---

### 5.11 App Settings Page (`/settings`)

- Key-value editor
- Display all current settings as editable rows
- Each row: key (read-only), value (editable text input)
- "Add Setting" button to add new key-value pair
- "Save All" button to bulk update via `PUT /api/admin/app-settings`
- Common expected keys:
  - `minDonation`, `maxDonation`, `platformFeePercent`
  - `supportEmail`, `supportPhone`
  - `maintenanceMode`, `maintenanceMessage`
  - Any custom keys the admin defines

---

### 5.12 Push Notifications Page (`/notifications`)

**Broadcast Form:**
- Title field (required)
- Body/message field (required, textarea)
- Target: Radio buttons — "All Users" or "Specific Users"
- If "Specific Users": multi-select user picker or comma-separated user IDs
- "Send Notification" button with confirmation dialog
- Show results: sent count, failed count

**Registered Tokens Table:**
- List from `GET /api/admin/push-tokens`
- Columns: User ID, Token (truncated), Platform badge (ios/android/web), Registered Date

---

### 5.13 System Health Page (`/system`)

- Auto-refresh every 30 seconds
- **Server Status Card**:
  - Uptime (formatted as days/hours/minutes)
  - Memory usage: RSS, Heap Used / Heap Total (progress bars)
- **Service Connectivity**:
  - Supabase: green check or red X
  - Stripe: configured badge or "not configured" warning
- **Seed Database Button** (for initial setup):
  - Calls `POST /api/admin/system/seed`
  - Show result message
- Current timestamp from server

---

## 6. Image Upload Integration Guide

### How It Works
1. The backend uses `multer` for multipart form handling
2. Images are resized via `sharp`: full-size (800x800 max, fit inside) + thumbnail (200x200, cover crop)
3. Both versions are uploaded to Supabase Storage (public buckets)
4. Public URLs are returned and saved to the database record

### Supabase Storage Buckets
| Bucket | Purpose |
|--------|---------|
| `organization-images` | Organization logos/photos |
| `category-images` | Category custom icons |
| `charity-logos` | Logos uploaded during charity signup |

### Upload Component Pattern
```tsx
function ImageUploader({ currentImageUrl, onUpload, onRemove, uploading }) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("image", file);

    await onUpload(formData);
  }

  return (
    <div>
      {currentImageUrl ? (
        <div>
          <img src={currentImageUrl} alt="Current" className="w-32 h-32 rounded-lg object-cover" />
          <button onClick={onRemove}>Remove Image</button>
        </div>
      ) : (
        <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed rounded-lg p-8 cursor-pointer">
          <p>Click to upload image</p>
          <p className="text-sm text-muted">JPEG, PNG, WebP, or SVG. Max 5MB.</p>
        </div>
      )}
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
    </div>
  );
}
```

### Upload Request Example
```typescript
async function uploadOrgImage(orgId: string, formData: FormData) {
  const token = localStorage.getItem("gb_admin_token");
  const res = await fetch(`${API_URL}/api/admin/organizations/${orgId}/image`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData, // Do NOT set Content-Type — browser sets it with boundary
  });
  return res.json(); // { success, imageUrl, thumbnailUrl }
}
```

### Organization Avatar Display
When displaying org avatars, check for `image_url` first, fall back to initials circle:
```tsx
function OrgAvatar({ org }: { org: Organization }) {
  if (org.image_url) {
    return <img src={org.thumbnail_url || org.image_url} className="w-10 h-10 rounded-full object-cover" />;
  }
  return (
    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
         style={{ backgroundColor: org.image_color }}>
      {org.initials}
    </div>
  );
}
```

---

## 7. Brand & Design Guidelines

### Colors
| Name | Hex | Usage |
|------|-----|-------|
| Primary Green | `#2D9E6B` | Primary buttons, active states, success |
| Gold | `#D4AF37` | Accents, featured badges, highlights |
| Dark Background | `#1A1A2E` | Dark mode background |
| Surface Dark | `#16213E` | Dark mode cards |
| Cream | `#FAF8F4` | Light mode background |
| Text Dark | `#1A1A2E` | Light mode text |
| Text Light | `#E8E8E8` | Dark mode text |
| Red | `#EF4444` | Errors, delete actions, rejected status |
| Orange/Amber | `#F59E0B` | Warnings, pending status |
| Blue | `#3B82F6` | Info, links |

### Typography
- Font family: **Poppins** (Google Fonts) — import weights 400, 500, 600, 700
- Headings: Poppins 600/700
- Body: Poppins 400/500
- Monospace for IDs/codes: system monospace

### Status Badges
| Status | Color | Background |
|--------|-------|------------|
| Completed / Approved | Green text | Green/10% bg |
| Pending | Amber text | Amber/10% bg |
| Failed / Rejected | Red text | Red/10% bg |
| Featured | Gold text | Gold/10% bg |
| Verified | Green text with checkmark | Green/10% bg |
| Donor | Blue badge | Blue/10% bg |
| Charity | Purple badge | Purple/10% bg |

### Dark Mode
- Implement via Tailwind's `dark:` classes or a theme provider
- Use `next-themes` package for toggling
- All colors should have dark mode variants
- Sidebar: darker shade in dark mode
- Cards: subtle border in dark mode for separation

### Responsive Design
- Desktop: full sidebar + content area
- Tablet: collapsible sidebar
- Mobile: hamburger menu, stacked layouts, responsive tables (card view on small screens)

---

## 8. Step-by-Step Setup Guide

### Step 1: Create a New Project
1. Create a new Replit project using the **Next.js** template
2. Choose TypeScript

### Step 2: Install Dependencies
```bash
npx shadcn@latest init
npx shadcn@latest add button card input label table dialog dropdown-menu badge separator tabs toast sheet avatar switch textarea select popover command
npm install recharts date-fns @tanstack/react-table next-themes lucide-react sonner react-hook-form @hookform/resolvers zod
npm install @expo-google-fonts/poppins  # or add via Google Fonts CDN in layout
```

### Step 3: Configure Environment Variables
In your Replit project, set these environment variables (Secrets tab):

```env
NEXT_PUBLIC_API_URL=https://your-giveblack-backend-url.replit.app
```

### Step 4: Configure the Backend
In your **GiveBlack backend** Replit project, set this environment variable:

```env
ADMIN_PANEL_URL=https://your-admin-panel-url.replit.app
```

This tells the backend CORS to accept requests from your admin panel.

### Step 5: Set Up App Structure
```
app/
  layout.tsx              # Root layout with providers (ThemeProvider, Toaster)
  login/
    page.tsx              # Login page
  (admin)/
    layout.tsx            # Admin layout with sidebar + top bar + auth guard
    dashboard/
      page.tsx            # Dashboard
    users/
      page.tsx            # Users list
      [id]/
        page.tsx          # User detail
    organizations/
      page.tsx            # Organizations list
      new/
        page.tsx          # Create organization
      [id]/
        page.tsx          # Organization detail/edit
    donations/
      page.tsx            # Donations list
      stats/
        page.tsx          # Donation analytics
    transactions/
      page.tsx            # Transactions list
      stats/
        page.tsx          # Transaction analytics
    charity-requests/
      page.tsx            # Charity requests list
      [id]/
        page.tsx          # Request detail
    categories/
      page.tsx            # Categories management
    volunteers/
      page.tsx            # Volunteers list
    activity-logs/
      page.tsx            # Activity logs
    settings/
      page.tsx            # App settings
    notifications/
      page.tsx            # Push notifications
    system/
      page.tsx            # System health
lib/
  api.ts                  # API client (adminFetch, adminUpload functions)
  utils.ts                # Formatting helpers (currency, dates, truncateId)
  types.ts                # TypeScript interfaces for all data models
components/
  sidebar.tsx             # Navigation sidebar
  top-bar.tsx             # Top bar with user info + theme toggle
  auth-guard.tsx          # Redirect to login if no valid token
  org-avatar.tsx          # Organization avatar (image or initials)
  image-uploader.tsx      # Reusable image upload component
  status-badge.tsx        # Reusable status badge
  data-table.tsx          # Reusable sortable/paginated data table
  kpi-card.tsx            # Dashboard KPI card
  confirm-dialog.tsx      # Reusable confirmation dialog
```

### Step 6: Create Auth Guard
The admin layout should check for a valid token on mount:

```typescript
// components/auth-guard.tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("gb_admin_token");
    if (!token) {
      router.replace("/login");
    } else {
      // Optionally verify token with GET /api/admin/me
      setChecked(true);
    }
  }, []);

  if (!checked) return <div>Loading...</div>;
  return <>{children}</>;
}
```

### Step 7: Build and Test
1. Start with the Login page — verify you can authenticate and store the token
2. Build the Dashboard — verify the overview data loads
3. Build each management page one at a time
4. Test image uploads with a real organization
5. Test the charity request approve/reject workflow

### Step 8: Deploy
Once everything works, deploy both:
1. The admin panel (your Next.js project)
2. Make sure the backend's `ADMIN_PANEL_URL` includes the deployed admin panel URL

---

## 9. Key Implementation Notes

### Currency Formatting
```typescript
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}
```

### Date Formatting
```typescript
import { format, formatDistanceToNow } from "date-fns";

function formatDate(date: string): string {
  return format(new Date(date), "MMM d, yyyy");
}

function formatRelative(date: string): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}
```

### ID Truncation
Database IDs are UUIDs — truncate for display:
```typescript
function truncateId(id: string): string {
  return id.slice(0, 8) + "...";
}
```

### Error Handling
- Show toast notifications for all API errors (use Sonner)
- Show inline form validation errors (use React Hook Form + Zod)
- Handle 401 responses globally by redirecting to login
- Show loading skeletons while data is being fetched

### Pagination Pattern
Most list endpoints support `?limit=N&offset=N` and return `{ data: [...], total: number }`. Implement page-based pagination:
```typescript
const limit = 20;
const offset = (page - 1) * limit;
const totalPages = Math.ceil(total / limit);
```

### Masking Sensitive Data
For charity request banking details, mask sensitive fields:
```typescript
function maskAccount(acc: string): string {
  if (!acc || acc.length < 4) return "****";
  return "****" + acc.slice(-4);
}
```

---

## 10. Testing Checklist

After building, verify these flows:

- [ ] Login with admin@gb.com / Admin@gb
- [ ] Dashboard loads with real data (KPIs, charts, tables)
- [ ] Users: search, view detail, edit, delete
- [ ] Organizations: list, create new, edit, toggle featured/verified, upload image, delete image, delete org
- [ ] Donations: list with filters, view stats page
- [ ] Transactions: list with filters, view stats page
- [ ] Charity Requests: view pending, approve (creates org), reject (with reason)
- [ ] Categories: create, edit, upload image, delete
- [ ] Volunteers: list, filter by org, delete
- [ ] Activity Logs: view, paginate
- [ ] App Settings: edit values, save
- [ ] Push Notifications: send broadcast
- [ ] System Health: view stats, seed data
- [ ] Dark mode toggle works across all pages
- [ ] Responsive layout works on mobile/tablet
- [ ] All error states show appropriate messages
- [ ] Logout clears token and redirects to login
