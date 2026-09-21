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
