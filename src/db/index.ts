import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });
export { pool };

export type Db = typeof db;
// The object handed to db.transaction(async (tx) => ...) — same query-builder
// surface as `db` (select/insert/update/delete), but must be used for every
// query inside a transaction since the pooled `db` may check out a different
// connection. Functions that must work both standalone and inside atomic()
// take this as a parameter instead of closing over the module-level `db`.
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;
