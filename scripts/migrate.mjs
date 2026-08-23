import { spawnSync } from "node:child_process";

const directUrl = process.env.DATABASE_URL_UNPOOLED;
if (!directUrl) {
  console.error("DATABASE_URL_UNPOOLED is required for schema migrations.");
  process.exit(1);
}

let hostname;
try {
  hostname = new URL(directUrl).hostname;
} catch {
  console.error("DATABASE_URL_UNPOOLED must be a valid PostgreSQL URL.");
  process.exit(1);
}

if (hostname.includes("-pooler")) {
  console.error("DATABASE_URL_UNPOOLED points to a pooled endpoint. Use the direct Neon hostname for migrations.");
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  ["node_modules/drizzle-kit/bin.cjs", "migrate"],
  { env: process.env, stdio: "inherit" },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
if (result.status !== 0) {
  console.error(`Migration process failed${result.signal ? ` with signal ${result.signal}` : ` with exit code ${result.status ?? "unknown"}`}.`);
  process.exit(result.status ?? 1);
}

console.log("\n✓ Database migrations are applied and up to date.");
