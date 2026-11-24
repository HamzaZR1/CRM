import { NextResponse } from "next/server";
import { handleInbound } from "@/lib/services/confirmation";
import { parseWebhook, verifySignature } from "@/lib/services/whatsapp";

export const dynamic = "force-dynamic";

/** Meta webhook verification handshake. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const expected = process.env.WHATSAPP_VERIFY_TOKEN ?? "zcrm-verify";
  if (url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === expected) {
    return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("forbidden", { status: 403 });
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  const inbound = parseWebhook(JSON.parse(raw || "{}"));
  for (const m of inbound) {
    try {
      await handleInbound(m);
    } catch (e) {
      console.error("[whatsapp] inbound failed", e);
    }
  }
  // Always 200 so Meta does not retry storms; failures are logged.
  return NextResponse.json({ ok: true, processed: inbound.length });
}
