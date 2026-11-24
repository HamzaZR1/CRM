import type { Config } from "drizzle-kit";

export default {
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: process.env.DATABASE_AUTH_TOKEN ? "turso" : "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "file:./data/zcrm.db",
    ...(process.env.DATABASE_AUTH_TOKEN ? { authToken: process.env.DATABASE_AUTH_TOKEN } : {}),
  },
} as Config;
