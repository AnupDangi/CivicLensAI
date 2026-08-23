import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";

let database: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getDatabase() {
  if (!process.env.DATABASE_URL) return;
  if (!database) {
    const client = postgres(process.env.DATABASE_URL, { max: 2, idle_timeout: 20, connect_timeout: 10, prepare: false });
    database = drizzle(client, { schema });
  }
  return database;
}
