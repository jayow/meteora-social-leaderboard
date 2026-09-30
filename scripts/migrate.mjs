// Runs Drizzle SQL migrations from ./drizzle before the server starts.
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const url = process.env.DATABASE_URL;
if (!url) {
  console.warn("[migrate] DATABASE_URL not set; skipping migrations");
  process.exit(0);
}
const internal = url.includes(".railway.internal") || url.includes("localhost") || url.includes("127.0.0.1");
const pool = new pg.Pool({ connectionString: url, ssl: internal ? undefined : { rejectUnauthorized: false } });

let attempt = 0;
while (true) {
  attempt++;
  try {
    const result = await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
    console.log(`[migrate] ${result?.length ?? 0} migrations applied successfully`);
    break;
  } catch (err) {
    console.error(`[migrate] attempt ${attempt} failed:`, err instanceof Error ? err.message : err);
    if (attempt >= 5) {
      console.error("[migrate] FATAL: max retries exceeded, exiting with code 1");
      await pool.end();
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 3000 * attempt));
  }
}
await pool.end();
