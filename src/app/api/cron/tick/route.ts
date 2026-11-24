import { NextResponse } from "next/server";
import { tick } from "@/lib/services/jobs";

export const dynamic = "force-dynamic";

async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret && process.env.NODE_ENV === "production") return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? new URL(req.url).searchParams.get("secret");
  if (secret && given !== secret) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await tick());
}
export const GET = handle;
export const POST = handle;
