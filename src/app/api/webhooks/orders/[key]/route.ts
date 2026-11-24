import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, t } from "@/lib/db";
import { createOrder } from "@/lib/services/orders";
import { NORMALIZERS, verifyStoreSignature } from "@/lib/services/integrations";

export const dynamic = "force-dynamic";

/**
 * Order intake for every connected store:
 *   POST /api/webhooks/orders/{storeWebhookKey}
 * The store's platform (YouCan, Shopify, WooCommerce, API) decides how the payload is parsed.
 */
export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const [store] = await db.select().from(t.stores).where(eq(t.stores.webhookKey, key));
  if (!store || !store.active) return NextResponse.json({ error: "unknown store" }, { status: 404 });

  const raw = await req.text();
  if (!verifyStoreSignature(store, raw, req.headers)) return NextResponse.json({ error: "invalid signature" }, { status: 401 });

  let payload: Record<string, unknown>;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  // WooCommerce sends a ping with only webhook_id when the webhook is created.
  if (store.platform === "woocommerce" && payload.webhook_id && !payload.id) return NextResponse.json({ ok: true, ping: true });

  const normalize = NORMALIZERS[store.platform] ?? NORMALIZERS.api!;
  try {
    const input = normalize(payload);
    if (!input.customer.phone) return NextResponse.json({ error: "customer phone missing" }, { status: 422 });
    const { order, duplicate } = await createOrder({ ...input, storeId: store.id, source: store.platform });
    return NextResponse.json({ ok: true, duplicate, reference: order.reference, status: order.status });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }
}
