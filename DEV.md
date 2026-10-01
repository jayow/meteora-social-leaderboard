# Developing Pool Party

## Run it locally

Needs Node 20+ and a local Postgres (e.g. `brew install postgresql`).

```bash
npm install
createdb pool_party
```

Create `.env.local` (gitignored):

```
DATABASE_URL=postgres://<you>@localhost:5432/pool_party
APP_SECRET=<openssl rand -hex 32>
```

Then:

```bash
set -a && . ./.env.local && set +a && npm run db:migrate   # apply drizzle/*.sql
npm run dev                                                # http://localhost:3000
```

The local DB starts empty. X sign-in needs `X_CLIENT_ID`, `X_CLIENT_SECRET` and an `X_CALLBACK_URL` registered in the X app; without them, test as the owner by minting a `pp_session` cookie (`makeUserSessionToken` in `lib/session.ts`).

## Ship

Push to `main` → Railway builds and deploys the `web` service. Migrations in `drizzle/` run on start (`scripts/migrate.mjs`). New migration: edit `lib/db/schema.ts`, then `npm run db:generate`.

## Production

- Site: https://lppool.party (the old `web-production-c8f29.up.railway.app` 308-redirects pages and `/api/x/*` there).
- Railway services: `web` (this repo), `Postgres` (internal only, nightly backup to R2 via `Backup CRON`), `sync-cron` (calls `/api/cron/sync-all` every 15 min with `Authorization: Bearer $CRON_SECRET`).
- `web` env: `DATABASE_URL`, `APP_SECRET`, `CRON_SECRET`, `X_CLIENT_ID`, `X_CLIENT_SECRET`, `X_CALLBACK_URL`, `APP_URL`, `ADMIN_WALLETS`, `BETA_CAP`, `INVITES_PER_USER`.
- X app callbacks: `https://lppool.party/api/x/callback` and `https://lppool.party/api/x/link-callback`.
- Health: `/api/health` (checks the DB).

Design and product rules: [THEME.md](THEME.md).
