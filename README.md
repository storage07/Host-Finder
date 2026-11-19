# Host Finder — Hosting, Domain, Client & Payment Management Platform

Host Finder is a full-stack SaaS administration console built with React, Tailwind CSS, Express.js, TypeScript, and MongoDB Atlas (Mongoose ODM) to manage clients, hosting services, domains, provider credentials, payment gateways, banking references, GST invoices, Excel workbooks, and automated expiry alerts.

---

## Key Capabilities

- **Dashboard**: 8 live KPIs (Total Clients, Total Hosting, Total Domains, Active Services, Upcoming Expiry, Expired Services, Total Revenue, Pending Payments), search/filter, Excel shortcuts, renewal watchlist, and expiry reminders.
- **Client Management**: Auto-generated Client IDs (`HF-CLT-XXXX`), full CRUD, search & filter, detail drawer, and Excel import/export.
- **Hosting & Domain Management**: Separate Hosting and Domain tracking with AES-256-GCM encrypted credentials, DNS & nameserver tracking, automatic status classification (`Active`, `Upcoming Expiry`, `Expired`, `Renewed`, `Cancelled`), and 30 / 15 / 7 / 1-day expiry alerts.
- **Provider Management**: Supports Domain, Hosting, Server, Email, and Payment providers with encrypted portal passwords, API keys, and secrets.
- **Payment Gateways (Test & Live Isolation)**: Dedicated modules for Razorpay, SMTP, Google Play Store, and Apple App Store with strict separation between Test Mode and Live Mode credentials.
- **Cards & Bank Details (PCI-Safe)**: Stores tokenized card references (last 4 digits only—never CVV or full PAN), UPI handles, and AES-256-GCM encrypted bank account details (Admin-only).
- **Tax Management & PDF Invoices**: Configurable GST/tax rate with `With Tax` and `Without Tax` modes, automated totals, payment ledger, and downloadable PDF invoices (`PDFKit`).
- **Excel Import & Export**: `.xlsx` import with row-level validation, duplicate email detection, preview confirmation, and filtered workbook exports (`ExcelJS`).
- **Security & RBAC**: `bcryptjs` password hashing, JWT HTTP-only cookie auth, 5-attempt account lockout, forced password change on first login, password reset flow, optional RFC 6238 TOTP 2FA with QR enrollment, Helmet, rate limiting, NoSQL injection sanitization, and `Admin` / `Staff` / `Viewer` role enforcement.

---

## MongoDB Collections (12)

1. `users`
2. `clients`
3. `hosting_services`
4. `domains`
5. `providers`
6. `payment_gateways`
7. `bank_accounts`
8. `payment_records`
9. `invoices`
10. `notifications`
11. `activity_logs`
12. `settings`

---

## Environment Configuration

Copy `.env.example` to `.env` (or configure AI Studio Secrets):

```env
PORT=3000
NODE_ENV=development
MONGO_URI="mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/host_finder?retryWrites=true&w=majority"
MONGO_DB_NAME="host_finder"
MONGO_MIN_POOL_SIZE=2
MONGO_MAX_POOL_SIZE=10
MONGO_SERVER_SELECTION_TIMEOUT_MS=8000
MONGO_SOCKET_TIMEOUT_MS=45000
JWT_SECRET="replace-with-strong-random-jwt-secret-min-32-chars"
ENCRYPTION_KEY="replace-with-strong-32-byte-encryption-secret"
ADMIN_INITIAL_PASSWORD="HostFinder@2026!"
```

> **Note:** `MONGO_URI` (or `MONGODB_URI`) is required on startup. The database utility (`server/config/database.ts`) validates the URI, manages the Mongoose connection pool (`minPoolSize: 2`, `maxPoolSize: 10`), logs lifecycle events, retries up to 3 times on startup, and exits if Atlas is unreachable.

---

## Installation & Local Development

```bash
# 1. Install dependencies
npm install

# 2. Configure .env from .env.example
cp .env.example .env

# 3. Start full-stack Express + Vite dev server on port 3000
npm run dev
```

### Default Development Admin Credentials
- **Username**: `admin`
- **Password**: `HostFinder@2026!`
- You will be prompted to change this temporary password immediately on first login.

---

## Production Deployment

```bash
# 1. Build frontend bundle
npm run build

# 2. Set production environment variables (including MONGO_URI, JWT_SECRET, ENCRYPTION_KEY, ADMIN_INITIAL_PASSWORD)
export NODE_ENV=production

# 3. Start production server (serves API + built dist/ behind HTTPS reverse proxy)
npm start
```

---

## REST API Overview

| Method | Endpoint | Access | Purpose |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/login` | Public (Rate Limited) | Login, 5-attempt lockout, optional TOTP 2FA |
| `POST` | `/api/auth/change-password` | Authenticated | Update password & clear first-login flag |
| `POST` | `/api/auth/2fa/setup` & `/enable` | Authenticated | Generate QR code and enable TOTP 2FA |
| `GET` | `/api/dashboard/summary` | All Roles | 8 KPIs, expiry watchlist, notifications |
| `GET/POST/PUT/DELETE` | `/api/clients` | Admin (Write) / Scoped Read | Client management CRUD |
| `GET/POST/PUT/DELETE` | `/api/hosting` | Admin / Authorized Staff | Hosting services CRUD |
| `GET/POST/PUT/DELETE` | `/api/domains` | Admin / Authorized Staff | Domain & DNS management CRUD |
| `GET/POST/PUT/DELETE` | `/api/providers` | Admin (Write) | Service provider credentials |
| `POST` | `/api/secrets/reveal` | Admin Only | Audited decryption of masked secrets |
| `GET/PUT` | `/api/gateways` | Admin Only | Razorpay, SMTP, Play Store, App Store (Test/Live) |
| `GET/POST/DELETE` | `/api/bank-accounts` | Admin Only | Tokenized cards, UPI, encrypted bank accounts |
| `GET/POST/PATCH/DELETE` | `/api/invoices` | Admin (Write) | GST / non-tax invoices & payment ledger |
| `GET` | `/api/invoices/:id/pdf` | All Roles | Download formatted PDF invoice |
| `POST` | `/api/excel/import/preview` & `/confirm` | Admin Only | Validate & import `.xlsx` client sheets |
| `GET` | `/api/excel/export` | Admin / Staff | Filtered `.xlsx` export |
| `GET/PATCH/POST` | `/api/notifications` | All Roles | 30/15/7/1d reminders & manual scan |
| `GET/POST/PUT/DELETE` | `/api/users` | Admin Only | RBAC user management & lockout unlock |
| `GET/PUT` | `/api/settings` | Admin (Write) | Tax defaults, company profile, DB info |
