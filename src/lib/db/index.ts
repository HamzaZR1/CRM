import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";
import fs from "node:fs";

const url = process.env.DATABASE_URL ?? "file:./data/zcrm.db";

function makeClient(): Client {
  if (url.startsWith("file:")) {
    const dir = url.slice(5).replace(/\/[^/]+$/, "");
    if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
  return createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
}

const g = globalThis as unknown as { __zcrmDb?: LibSQLDatabase<typeof schema>; __zcrmClient?: Client };

export const client = g.__zcrmClient ?? makeClient();
export const db = g.__zcrmDb ?? drizzle(client, { schema });

if (process.env.NODE_ENV !== "production") {
  g.__zcrmClient = client;
  g.__zcrmDb = db;
}

export * as t from "./schema";
