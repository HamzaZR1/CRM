import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, t } from "@/lib/db";
import { handleCarrierWebhook } from "@/lib/services/carriers";

export const dynamic = "force-dynamic";

/** Carriers push status updates: { trackingNumber | reference, status }. Auth: Bearer {carrier.apiKey} when set. */
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const [carrier] = await db.select().from(t.carriers).where(eq(t.carriers.code, code));
  if (!carrier) return NextResponse.json({ error: "unknown carrier" }, { status: 404 });
  if (carrier.apiKey && req.headers.get("authorization") !== `Bearer ${carrier.apiKey}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const updates = Array.isArray(body) ? body : [body];
    let changed = 0;
    for (const u of updates) if (await handleCarrierWebhook(code, u)) changed++;
    return NextResponse.json({ ok: true, changed });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }
}
