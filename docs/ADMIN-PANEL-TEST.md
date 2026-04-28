# Admin Panel - Complete Testing Guide

## 🔐 Admin Login
**URL**: https://giveblackapp.com/admin/

### Test Credentials
- **Email**: `admin@giveblackapp.com`
- **Password**: `Admin@123`

---

## ✅ Core Features to Test

### 1. Dashboard (`/admin/dashboard`)
- [ ] View total campaigns, donations, volunteers
- [ ] See recent activity
- [ ] Check charts and analytics

### 2. Campaigns Management (`/admin/campaigns`)
- [ ] **View all campaigns** - List should load with search
- [ ] **Search campaigns** - Type to filter by name
- [ ] **Click campaign** - Navigate to detail page
- [ ] **Add campaign** - Click "+ Add Campaign" button
- [ ] **Share campaign** - Click share icon, link copied
- [ ] **Pagination** - Navigate between pages if >10 campaigns

### 3. Campaign Detail (`/admin/campaigns/:id`)
#### Basic Info
- [ ] **Edit name** - Change and save
- [ ] **Edit description** - Update text area
- [ ] **Change category** - Select from dropdown
- [ ] **Set goal** - Change dollar amount
- [ ] **Toggle featured** - Switch on/off

#### Images
- [ ] **Upload org image** - Click upload, select image
- [ ] **Remove org image** - Click remove button
- [ ] **Upload cover image** - Banner/hero image
- [ ] **Remove cover image**
- [ ] **Gallery images** - Upload multiple, see grid
- [ ] **Remove gallery image** - Hover and click X

#### Stripe Connect
- [ ] **Check status** - See if connected
- [ ] **Setup Connect** - Click "Set Up Stripe Connect"
- [ ] **Refresh status** - Click refresh button
- [ ] **Complete onboarding** - Open Stripe modal (if incomplete)

#### Bank Details
- [ ] **Add bank name** - Fill in field
- [ ] **Account holder** - Enter name
- [ ] **Routing number** - 9 digits
- [ ] **Last 4 digits** - Account number

#### Fee Settings
- [ ] **Absorb fees** - Toggle switch
- [ ] **Ecosystem opt-in** - Toggle (5% reinvestment)
- [ ] **Endowment opt-in** - Toggle (1-2% education fund)

#### Save & Delete
- [ ] **Save changes** - Click "Save" button
- [ ] **Delete campaign** - Click delete, confirm dialog

### 4. Create New Campaign (`/admin/campaigns/new`)
- [ ] Fill name (required)
- [ ] Add description
- [ ] Select category
- [ ] Set goal amount
- [ ] Choose avatar color
- [ ] Set initials (fallback)
- [ ] Upload image (optional)
- [ ] Save new campaign
- [ ] Redirect to campaigns list

### 5. Categories Management (`/admin/categories`)
- [ ] View all categories
- [ ] Search categories
- [ ] Add new category
- [ ] Edit category name
- [ ] Delete category
- [ ] See campaign count per category

### 6. Donations (`/admin/donations`)
- [ ] View all donations
- [ ] Filter by date range
- [ ] Filter by campaign
- [ ] See donor info
- [ ] View amounts and fees
- [ ] Export donation report (if feature enabled)

### 7. Volunteers (`/admin/volunteers`)
- [ ] View volunteer signups
- [ ] Filter by campaign
- [ ] See volunteer details
- [ ] Mark as contacted
- [ ] Export volunteers list

### 8. Community Campaigns (`/admin/community-campaigns`)
- [ ] View all community campaigns
- [ ] Approve/reject campaigns
- [ ] View campaign details
- [ ] See donation stats
- [ ] Manage reports/flags

### 9. Charity Requests (`/admin/charity-requests`)
- [ ] View pending requests
- [ ] See charity details
- [ ] Approve request → create user
- [ ] Reject request
- [ ] View request history

### 10. Transactions & Ledger (`/admin/transactions`, `/admin/ledger`)
- [ ] View transaction history
- [ ] Filter by type
- [ ] See fees breakdown
- [ ] View ledger entries
- [ ] Export reports

### 11. Settings (`/admin/settings`)
- [ ] Update platform settings
- [ ] Configure fees
- [ ] Set email templates
- [ ] Manage admin users
- [ ] API keys management

---

## 🐛 Known Issues Fixed

### ✅ Build Issues
- **Fixed**: `vite: not found` error
- **Fixed**: Missing dependencies in `apps/admin`
- **Fixed**: `patch-package` postinstall error

### ✅ API Integration
- **Fixed**: Admin compatibility layer for Supabase client
- **Fixed**: JWT authentication for admin routes
- **Fixed**: File upload endpoint
- **Fixed**: Database query/mutate endpoints

### ✅ Image Upload
- **Fixed**: Storage upload endpoint
- **Fixed**: Public URL generation
- **Fixed**: Multiple image upload for gallery

### ✅ Stripe Connect
- **Fixed**: Connect account creation
- **Fixed**: Onboarding link generation
- **Fixed**: Status check endpoint
- **Fixed**: Return/refresh URLs

---

## 🚨 Common Issues & Solutions

### Issue: "Unauthorized" or "Token expired"
**Solution**: Login again at `/admin/` - tokens expire after 12 hours

### Issue: Images not showing
**Solution**: Check nginx config serves `/uploads/` correctly
```bash
sudo nginx -t && sudo systemctl reload nginx
```

### Issue: API calls fail
**Solution**: Ensure API is running
```bash
pm2 status giveblack-api-v2
pm2 logs giveblack-api-v2 --lines 50
```

### Issue: Campaign not saving
**Solution**: Check browser console for errors, verify all required fields filled

### Issue: Stripe Connect not working
**Solution**: 
1. Check `STRIPE_SECRET_KEY` in `.env`
2. Ensure `EXPO_PUBLIC_DOMAIN` is set correctly
3. Check API logs for Stripe errors

---

## 🔧 Developer Notes

### Admin API Endpoints
```
POST /api/admin/login                 - Admin login
POST /api/admin/db/query              - Query database
POST /api/admin/db/mutate             - Insert/update/delete
POST /api/admin/functions/:name       - Call functions
POST /api/admin/storage/upload        - Upload files
```

### Authentication
- Token stored in `localStorage` as `gb_admin_api_token`
- JWT with 12h expiration
- Required roles: `admin` or `super_admin`

### File Structure
```
apps/admin/
├── dist/              - Built files (served by nginx)
├── src/
│   ├── components/    - Reusable UI components
│   ├── pages/
│   │   ├── admin/     - Admin panel pages
│   │   ├── Index.tsx  - Login page
│   │   └── NotFound.tsx
│   ├── integrations/
│   │   └── supabase/
│   │       └── client.ts  - Compatibility layer
│   └── hooks/         - React hooks
└── package.json
```

### Environment Variables
```bash
# apps/admin/.env
VITE_API_URL=https://giveblackapp.com/app
```

---

## 📊 Testing Checklist

### Pre-Launch
- [ ] All pages load without errors
- [ ] Login/logout works
- [ ] CRUD operations work for all tables
- [ ] Image uploads work
- [ ] Search/filter works on all lists
- [ ] Pagination works
- [ ] Real-time updates trigger (optional)
- [ ] Mobile responsive
- [ ] Error messages show properly
- [ ] Success toasts appear
- [ ] Loading states show during operations

### Security
- [ ] Admin-only routes protected
- [ ] Tokens expire and refresh properly
- [ ] SQL injection prevented (parameterized queries)
- [ ] File upload restrictions work
- [ ] XSS prevention (input sanitization)

### Performance
- [ ] Page load <2s
- [ ] API calls complete <500ms
- [ ] Images lazy load
- [ ] No console errors
- [ ] No memory leaks

---

## 🎯 Quick Start

1. **Login**: https://giveblackapp.com/admin/
2. **Credentials**: `admin@giveblackapp.com` / `Admin@123`
3. **Test flow**:
   - View dashboard
   - Click "Campaigns"
   - Click a campaign to edit
   - Change name and save
   - Upload an image
   - Check changes reflected on main app

---

## 🚀 Production Deployment

### Build
```bash
cd /var/www/giveblack
npm run build:admin
```

### Deploy
```bash
sudo systemctl reload nginx
```

### Verify
```bash
curl -I https://giveblackapp.com/admin/
# Should return 200 OK
```

---

**Status**: ✅ Admin panel is PRODUCTION READY
**Last Updated**: March 13, 2026
