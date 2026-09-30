import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

type DB = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __ppPool?: Pool; __ppDb?: DB };

export function hasDb(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getDb(): DB {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  if (!globalForDb.__ppDb) {
    const url = process.env.DATABASE_URL;
    const internal = url.includes(".railway.internal") || url.includes("localhost") || url.includes("127.0.0.1");
    globalForDb.__ppPool = new Pool({
      connectionString: url,
      max: 5,
      ssl: internal ? undefined : { rejectUnauthorized: false },
    });
    globalForDb.__ppDb = drizzle(globalForDb.__ppPool, { schema });
  }
  return globalForDb.__ppDb;
}

export function getPool(): Pool {
  getDb();
  return globalForDb.__ppPool as Pool;
}

export { schema };
