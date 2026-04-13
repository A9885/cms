# Signtral CMS

Xibo CMS v4.4.0 REST API Web Application — multi-tenant advertising platform with slot-based screen management, real-time stats, and partner provisioning.

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js v24+ |
| Framework | Express 5.2.1 |
| Database | MySQL 8+ via mysql2/promise (connection pooling) |
| Real-time | Socket.io 4.x |
| Auth | Better Auth + JWT |
| Security | Helmet.js (HTTP headers) + Express Rate Limit (100 req/15 min on `/api/`) |
| File uploads | Multer |
| CMS | Xibo CMS v4.4.0 REST API |

## Getting Started

```bash
# 1. Clone the repo
git clone https://github.com/A9885/cms.git
cd web-app

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env — fill in DB credentials and Xibo API keys

# 4. Create the database schema
mysql -u root -p xibo_crm < migrations/mysql_schema.sql

# 5. Start dev server
npm run dev
```

Server starts at **http://localhost:3000**

## Folder Structure

```
/
├── server.js              — Express app entry point
├── package.json
├── .env.example           — Environment variable template
│
├── /src                   — Application source code
│   ├── /config            — DB pool and config (db.js)
│   ├── /routes            — Express route handlers
│   ├── /services          — Business logic (Xibo, stats, screen, activity)
│   ├── /middleware        — Auth middleware
│   └── auth.js            — Better Auth setup
│
├── /public                — Static frontend files (admin, brand, partner portals)
├── /migrations            — MySQL schema and migration SQL files
├── /tests                 — Test scripts (see tests/README.md)
├── /scripts               — Utility and debug scripts
├── /uploads               — Temporary file upload storage (gitignored)
└── /data                  — Static data files
```

## Environment Variables

Copy `.env.example` to `.env` and fill in your values.

| Variable | Required | Description |
|---|---|---|
| `DB_HOST` | ✅ | MySQL host |
| `DB_PORT` | ✅ | MySQL port (default: 3306) |
| `DB_USER` | ✅ | MySQL username |
| `DB_PASSWORD` | ✅ | MySQL password |
| `DB_NAME` | ✅ | MySQL database name |
| `XIBO_BASE_URL` | ✅ | Xibo CMS instance URL |
| `XIBO_CLIENT_ID` | ✅ | Xibo OAuth client ID |
| `XIBO_CLIENT_SECRET` | ✅ | Xibo OAuth client secret |
| `JWT_SECRET` | ✅ | JWT signing secret (min 64 chars) |
| `BETTER_AUTH_SECRET` | ✅ | Better Auth session secret |
| `PORT` | — | Server port (default: 3000) |
| `NODE_ENV` | — | `production` or `development` |

> The server will **refuse to start** if `DB_HOST`, `DB_USER`, `DB_PASSWORD`, or `DB_NAME` are missing.

## API Overview

| Route prefix | Description |
|---|---|
| `/api/auth/*` | Better Auth (login, session, logout) |
| `/admin/api/*` | Admin portal — users, brands, partners, screens |
| `/brandportal/api/*` | Brand portal — media, stats |
| `/partnerportal/api/*` | Partner portal — screens, revenue |
| `/xibo/*` | Xibo CMS proxy (displays, slots, upload, stats) |

## Security

- **Helmet.js** — sets 14 HTTP security headers on every response
- **Rate limiting** — 100 requests per 15 minutes per IP on all `/api/` routes
- **Production error handler** — stack traces hidden when `NODE_ENV=production`
- **Startup validation** — server exits immediately if required DB env vars are missing

## Running Tests

```bash
node tests/test_db.js              # DB connection
node tests/test_cms_connection.js  # Xibo API
node tests/test_e2e_pipeline.js    # Full pipeline
```

See [`tests/README.md`](tests/README.md) for full list.
