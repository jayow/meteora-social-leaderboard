# Meteora Social Leaderboard

MVP social trading leaderboard for Meteora:

- Write / save a trading thesis
- Mock X (Twitter) connect
- PnL calendar inspired by Meteora portfolio UI
- Leaderboard ranked by total PnL

Data is stored in `localStorage` with sample traders on first load.

## Local

```bash
npm install
npm run dev
```

## Railway

Configured via `railway.toml` / `nixpacks.toml`.

- Build: `npm run build`
- Start: `npm start` (binds `PORT`)

Deploy from GitHub: `jayow/meteora-social-leaderboard`
