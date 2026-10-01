-- Slim per-position details for each open_positions pool row (range, in-range, value, fees, PnL, open time).
-- No position or wallet addresses. Idempotent.
ALTER TABLE "open_positions" ADD COLUMN IF NOT EXISTS "positions" jsonb;
