/* Ops smoke test (run with tsx against seeded data): shipping, carrier sync & webhook, stock moves, campaign → order. */
import { eq } from "drizzle-orm";
import { db, t } from "../src/lib/db";
import { shipOrder, syncShipments, handleCarrierWebhook } from "../src/lib/services/carriers";
import { createOrder, changeStatus } from "../src/lib/services/orders";
import { sendCampaign } from "../src/lib/services/campaigns";
import { handleInbound } from "../src/lib/services/confirmation";

async function main() {
  const [carrier] = await db.select().from(t.carriers).where(eq(t.carriers.code, "ozon"));
  const [product] = await db.select().from(t.products).where(eq(t.products.name, "Montre Classic Gold"));
  const [variant] = await db.select().from(t.variants).where(eq(t.variants.productId, product!.id));
  const before = variant!.stock;

  const { order } = await createOrder({ source: "manual", customer: { name: "Ops Test", phone: "0664000004", city: "Tanger" }, items: [{ productId: product!.id, variantId: variant!.id, quantity: 2 }] }, { skipAutomation: true });
  await changeStatus(order.id, "CONFIRMED", { via: "CALL" });
  const tracking = await shipOrder(order.id, carrier!.id);
  const [v1] = await db.select().from(t.variants).where(eq(t.variants.id, variant!.id));
  console.log("shipped", tracking, "stock", before, "→", v1!.stock);

  // Simulator: backdate shipment so the sync moves it forward
  await db.update(t.orders).set({ shippedAt: new Date(Date.now() - 4 * 60_000) }).where(eq(t.orders.id, order.id));
  console.log("sync", await syncShipments());
  console.log("status after sync:", (await db.select().from(t.orders).where(eq(t.orders.id, order.id)))[0]!.status);

  console.log("carrier webhook (returned):", await handleCarrierWebhook("ozon", { trackingNumber: tracking, status: "Retourné à l'expéditeur" }));
  const [o2] = await db.select().from(t.orders).where(eq(t.orders.id, order.id));
  const [v2] = await db.select().from(t.variants).where(eq(t.variants.id, variant!.id));
  console.log("after return:", o2!.status, "deliveryCost", o2!.deliveryCost, "stock back to", v2!.stock);

  const [camp] = await db.insert(t.campaigns).values({ name: "Test", message: "عرض {product} بـ {price}", productId: product!.id, discountPct: 20, segment: { status: "DELIVERED", city: "Agadir" } }).returning();
  const n = await sendCampaign(camp!.id);
  const [msg] = await db.select().from(t.messages).where(eq(t.messages.body, `campaign:${camp!.id}`)).limit(1);
  const [cust] = await db.select().from(t.customers).where(eq(t.customers.id, msg!.customerId));
  const r = await handleInbound({ phone: cust!.phone, buttonId: "campaign_order", buttonTitle: "🛒 بغيت نطلب" });
  const [co] = await db.select().from(t.orders).where(eq(t.orders.id, (r as { orderId: number }).orderId));
  console.log(`campaign sent to ${n}; reply created ${co!.reference} source=${co!.source} total=${co!.total} (price ${product!.price} −20%) status=${co!.status}`);
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
