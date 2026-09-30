# Pool Party 🎉

Social trading leaderboard for Meteora DLMM liquidity providers.

## Features

- **Solana Wallet Connect** - Connect Phantom or Solflare wallet to see your real portfolio
- **Live Meteora DLMM Data** - Real-time portfolio stats from Meteora Data API when wallet connected
- **PnL Calendar** - Visual calendar showing daily profit/loss from Meteora events
- **Trading Thesis** - Write and save your trading strategy
- **Mock X Connect** - Placeholder for Twitter integration
- **Leaderboard** - Ranked by total PnL with sample traders

## How It Works

### Without Wallet
- Browse sample leaderboard with mock traders
- Explore interface with sample PnL data
- Edit your thesis and profile

### With Wallet Connected
- **Live Portfolio Summary** - Total value, PnL, fees, and open positions from Meteora
- **Live PnL Calendar** - Historical events (deposits, withdrawals, claims, closes) aggregated by date
- **Real-time Updates** - Data refreshed every 60 seconds via API cache

### Meteora API Integration

Uses Meteora Data API (`https://dlmm.datapi.meteora.ag`) with 30 RPS rate limit:

- `GET /portfolio/open?user={wallet}` - Open positions
- `GET /portfolio?user={wallet}` - Historical events
- `GET /portfolio/total?user={wallet}` - Portfolio totals

API calls proxied through Next.js API routes (`/app/api/meteora/*`) for CORS handling and caching.

**Note:** PnL calendar aggregates Meteora events by UTC date. This is an approximation based on available events, not tick-by-tick calculation.

## Tech Stack

- Next.js 15 (App Router) + TypeScript
- Tailwind CSS v4
- Solana Wallet Adapter (Phantom, Solflare)
- Meteora Data API
- localStorage for profile data

## Local Development

```bash
npm install
npm run dev
```

Open http://localhost:3000

## Railway Deployment

Configured via `railway.toml` / `nixpacks.toml`.

- Build: `npm run build`
- Start: `npm start` (binds to `PORT` environment variable)

No environment secrets required - Meteora Data API is public.

Live: https://web-production-c8f29.up.railway.app  
Repo: `jayow/meteora-social-leaderboard`

## Coming Soon

- X (Twitter) OAuth integration for real profiles
- Social leaderboard rankings by live PnL
- Position analytics and optimization tips
- NFT badges for top performers

## Pool Party v2 (database-backed leaderboard)

- **DB:** Railway Postgres via `DATABASE_URL`. Schema in `lib/db/schema.ts` (Drizzle); SQL migrations in `drizzle/` run on every start (`scripts/migrate.mjs`).
- **Tables:** `users` (wallet unique, X identity, country, thesis) and `pnl_snapshots` (one row per user per UTC day: lifetime/7D/30D PnL, deposit volume, fees, win rates, positions, top pool, raw source JSON).
- **Endpoints:**
  - `POST /api/users` `{wallet}`: register a wallet (upsert + first sync). Operator fields (xHandle, country, thesis) need `Authorization: Bearer $CRON_SECRET`.
  - `GET/PATCH /api/users/:id` (id = wallet, numeric id or X handle). PATCH (thesis, country, unlinkX) needs a wallet-signed session.
  - `POST /api/auth/wallet` `{wallet, issuedAt, signature}`: verify a signed message and set the `pp_session` cookie. `GET/DELETE /api/auth/session`.
  - `POST|GET /api/sync/:wallet`: pull Meteora stats and upsert today's snapshot (rate-limited to once per 5 min unless called with the cron secret).
  - `POST|GET /api/cron/sync-all` with `Authorization: Bearer $CRON_SECRET`: refresh every user (daily Railway cron service).
  - `GET /api/leaderboard?range=7d|30d|all&country=XX&sort=pnl|volume|winrate`.
  - `GET /api/health`: DB status, tables, migration count.
- **Env:** `DATABASE_URL`, `CRON_SECRET`, `APP_SECRET` (cookie signing), plus the existing `X_CLIENT_ID`, `X_CLIENT_SECRET`, `X_CALLBACK_URL`.
