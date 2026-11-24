import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  await db.run(sql`select 1`);
  return NextResponse.json({ ok: true, app: "zcrm" });
}
