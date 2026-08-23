import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Migrations should use a direct connection. The runtime DATABASE_URL can
    // remain pooled for Vercel/serverless requests.
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/civiclens",
  },
});
