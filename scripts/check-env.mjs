const target = process.argv[2];

const required = target === "agent"
  ? ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"]
  : [
      "DATABASE_URL",
      "HOST_TOKEN_SECRET",
      "OPENROUTER_API_KEY",
      "TAVILY_API_KEY",
      "XPOZ_API_KEY",
      "LIVEKIT_URL",
      "LIVEKIT_API_KEY",
      "LIVEKIT_API_SECRET",
    ];

if (!target || !["web", "agent"].includes(target)) {
  console.error("Usage: node scripts/check-env.mjs <web|agent>");
  process.exit(1);
}

const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length) {
  console.error(`Missing ${target} environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (target === "web" && databaseUrl) {
  const parsed = new URL(databaseUrl);
  if (!parsed.hostname.includes("-pooler")) {
    console.error("DATABASE_URL must use the pooled Neon hostname for the Vercel runtime.");
    process.exit(1);
  }
}

if (!process.env.LIVEKIT_URL?.startsWith("wss://")) {
  console.error("LIVEKIT_URL must use wss://.");
  process.exit(1);
}

console.log(`✓ Required ${target} environment variables are configured.`);
