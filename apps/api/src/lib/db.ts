import { Pool, type PoolClient } from "pg";
import { env } from "../config/env.js";

export const db = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20
});

export async function withTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
