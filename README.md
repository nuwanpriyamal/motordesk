# MotorDesk

Multi-tenant SaaS for vehicle service stations and garages. Each vendor (service center) gets its own isolated workspace, and the platform owner sells subscription plans with per-vendor pricing.

| Part | Stack |
| --- | --- |
| `apps/api` | NestJS 10, MongoDB (Mongoose 8), JWT auth, Redis cache (optional), Firebase Realtime Database (optional, SSE fallback), Swagger |
| `apps/web` | Angular 19 (standalone, signals), no UI framework dependency |

## Features

**For service centers (tenants)**

- **Job cards:** a kanban board (pending → in progress → waiting for parts → ready → delivered), labour and part lines, inspection checklist, technician assignment, start/stop time tracking, and a customer signature field.
- **Inventory:** parts come off stock automatically when a job is completed and go back if it is reopened. It also has receive/stock-count adjustments with a full movement history, low-stock alerts and stock valuation.
- **Invoices & quotes:** quotes convert to invoices, with tax and discounts, partial payments and refunds. Paid invoices earn loyalty points, and invoices print to PDF.
- **Appointments:**
  - Capacity is aware of service bays and open hours, and slots follow the tenant's time zone.
  - Check-in opens a job card.
  - There is a public online booking page at `/book/:slug`.
- **Customer self-service:** customers track a job at `/track/:slug` using the job number and their phone number.
- **Customers & vehicles:** service history, next-service-due by km and days, and insurance and revenue licence expiry dates.
- **Reminders:** a daily job plus an on-demand scan creates reminders for service due, insurance and licence expiry, overdue payments and birthdays. They are sent by SMS through Notify.lk, or logged when no SMS provider is configured.
- **Expenses:** expenses by category, which feed the profit figure.
- **Dashboard:** KPIs, 6-month revenue, top services, low stock, today's appointments and technician hours.
- **Staff roles:** owner, manager, technician and cashier, limited by the number of seats on the plan.
- **Realtime:** job status, new online bookings and low-stock alerts are pushed live.

**For the platform owner (super admin)**

- **Plans:** create plans with a price (monthly and yearly), a trial length, the modules they include, and limits (users, vehicles, SMS).
- **Vendors:**
  - Each vendor is on a plan. You can set a **custom price** or a **discount %**, and turn individual features on or off for that vendor only.
  - Record subscription payments, which extend the paid-until date.
  - Suspending a vendor makes their workspace read-only, and an expired trial does the same.
- **Overview:** MRR, collections over the last 30 days, and vendors by status.

Default plans (editable in the admin UI, prices in LKR):

| Plan | Monthly | Includes |
| --- | --- | --- |
| Starter | 2,900 | Customers, vehicles, job cards, invoicing, scheduling, reminders · 3 users |
| Professional | 6,900 | + inventory, expenses, analytics, online booking, SMS, realtime · 10 users |
| Enterprise | 14,900 | Everything · 50 users |

## Run locally

Requires Node 20+.

```bash
# API: with no MONGODB_URI it starts an in-memory MongoDB and seeds demo data
cd apps/api && npm install && npm run dev        # http://localhost:3000/api, docs at /api/docs

# Web
cd apps/web && npm install && npx ng serve       # http://localhost:4200
```

Demo logins (development seed only):

| Role | Email | Password |
| --- | --- | --- |
| Service center owner | owner@demo.local | Demo1234! |
| Technician | tech@demo.local | Demo1234! |
| Platform super admin | admin@motordesk.local | ChangeMe123! |

To use a real database, copy `apps/api/.env.example` to `apps/api/.env` and set `MONGODB_URI`. Then run `npm run build && npm run seed` (or `npm run seed:demo` for sample data).

## Tests

```bash
cd apps/api
npx jest                                       # unit
npx jest --config ./test/jest-e2e.json         # e2e against in-memory MongoDB
```

The e2e suite covers:
- tenant isolation and plan feature gating
- job → stock deduction → invoice → payment, and the stock returned on reopen
- vendor pricing and suspension
- public booking

## Environments

| Env | Branch | Web | API |
| --- | --- | --- | --- |
| Testing (staging) | `staging` | Firebase Hosting, target `staging` | Vercel Hobby serverless (`apps/api/vercel.json`) |
| Release (production) | `main` | Firebase Hosting, target `production` | Vercel, created when going live |

Free services used:
- MongoDB Atlas M0
- Firebase Hosting and Realtime Database on the Spark plan
- Vercel Hobby for the API, which needs no card. It runs as a serverless function, so the first request after an idle spell takes a few seconds. Live updates use Firebase there, because the SSE fallback needs a long-running server. The daily reminder scan runs as a Vercel Cron job that calls `/api/cron/reminders`, authorised with `CRON_SECRET`.
- Upstash Redis free tier (optional)

The API URL for each environment is set in `apps/web/src/environments/environment.<env>.ts`.

Deploy the web app to staging:

```bash
cd apps/web && npx ng build --configuration staging && cd ../..
npx firebase-tools deploy --only hosting:staging,database
```

## Configuration (API)

See `apps/api/.env.example`. The important settings:

- **Required:** `MONGODB_URI` and `JWT_SECRET`.
- **`CORS_ORIGINS`:** the web URL(s), comma separated.
- **Platform owner:** `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD`. The seed creates this account at startup, and outside development it is created only when a password is set.
- **Optional:**
  - `REDIS_URL`
  - `FIREBASE_SERVICE_ACCOUNT` (JSON or base64), together with `FIREBASE_DATABASE_URL` and `FIREBASE_WEB_CONFIG`
  - `NOTIFY_LK_USER_ID`, `NOTIFY_LK_API_KEY` and `NOTIFY_LK_SENDER_ID`

## Not built yet

- Email delivery. Reminders and campaigns are logged, and no SMTP or provider is wired in.
- Online card payments, for both customer invoices and vendor subscriptions. Payments are recorded manually today.
- Native mobile apps. The web app is responsive.
- Receipt OCR, a drag-and-drop workflow builder and A/B email campaigns.
