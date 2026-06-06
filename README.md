# Zephlo Backend

NestJS API for the configurable multi-department inventory prototype.

## Quick start

### Docker (with frontend)

From the parent `zephlo` folder:

```bash
docker compose up --build
```

### Local

```bash
npm install
cp .env.example .env
npx prisma migrate dev
npm run db:seed
npm run start:dev
```

API base: `http://localhost:3000/api/v1`

Health (no tenant header): `GET /api/v1/health`

All other routes require tenant context via header `X-Tenant-Slug: demo` (default from `.env`).

## Demo flow for clients

1. **Departments** — `GET/POST /departments`
2. **Custom fields** — `GET/POST /departments/:id/fields`
3. **Connections** — `GET/POST /connections` (transfer routes + approval rules)
4. **Stock** — `GET/POST /departments/:id/items`
5. **Transfers** — `POST /transfers`, `PATCH /transfers/:id/review`
6. **Reports** — `GET /reports/overview`

Seed data includes Kitchen, Bar, Central Stores with sample stock and connections.

## Stack

- NestJS 11, Prisma 6, SQLite (prototype; swap to PostgreSQL for production)
- class-validator DTOs, global API envelope, tenant middleware
