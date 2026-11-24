import { and, eq, inArray, sql } from "drizzle-orm";
import { db, t } from "../db";
import type { CampaignSegment } from "../db/schema";
import { getSettings } from "../settings";
import { fillTemplate } from "../utils";
import { sendButtons } from "./whatsapp";

/** Customers matching a segment (never contacts opted-out or blacklisted customers). */
export async function segmentCustomers(segment: CampaignSegment) {
  const conds = [eq(t.customers.optOut, false), eq(t.customers.blacklisted, false)];
  if (segment.city) conds.push(eq(t.customers.city, segment.city));
  let customers = await db.select().from(t.customers).where(and(...conds));

  const orderRows = await db
    .select({ customerId: t.orders.customerId, status: t.orders.status, createdAt: t.orders.createdAt, id: t.orders.id })
    .from(t.orders);
  const byCustomer = new Map<number, typeof orderRows>();
  for (const o of orderRows) byCustomer.set(o.customerId, [...(byCustomer.get(o.customerId) ?? []), o]);

  let boughtSet: Set<number> | null = null;
  if (segment.boughtProductId) {
    const rows = await db
      .select({ customerId: t.orders.customerId })
      .from(t.orderItems)
      .innerJoin(t.orders, eq(t.orders.id, t.orderItems.orderId))
      .where(eq(t.orderItems.productId, segment.boughtProductId));
    boughtSet = new Set(rows.map((r) => r.customerId));
  }

  customers = customers.filter((c) => {
    const os = byCustomer.get(c.id) ?? [];
    if (!os.length) return false;
    if (segment.status === "DELIVERED" && !os.some((o) => o.status === "DELIVERED")) return false;
    if (boughtSet && !boughtSet.has(c.id)) return false;
    if (segment.inactiveDays) {
      const last = Math.max(...os.map((o) => o.createdAt.getTime()));
      if (Date.now() - last < segment.inactiveDays * 86400_000) return false;
    }
    return true;
  });
  return customers;
}

export const CAMPAIGN_BUTTONS = [
  { id: "campaign_order", title: "🛒 بغيت نطلب" },
  { id: "campaign_stop", title: "🚫 ما مهتمش" },
];

export async function sendCampaign(campaignId: number, actorId?: number) {
  const [campaign] = await db.select().from(t.campaigns).where(eq(t.campaigns.id, campaignId));
  if (!campaign) throw new Error("Campaign not found");
  if (campaign.status === "SENT") throw new Error("Campaign already sent");
  const settings = await getSettings();
  const product = campaign.productId ? (await db.select().from(t.products).where(eq(t.products.id, campaign.productId)))[0] : undefined;
  const recipients = await segmentCustomers(campaign.segment);
  for (const c of recipients) {
    const price = product ? Math.round(product.price * (1 - campaign.discountPct / 100)) : 0;
    const body = fillTemplate(campaign.message, {
      name: c.name.split(" ")[0] ?? c.name,
      product: product?.name ?? "",
      price,
      discount: campaign.discountPct,
      currency: settings.company.currency,
    });
    await sendButtons(c, body, CAMPAIGN_BUTTONS, { author: "CAMPAIGN", userId: actorId ?? null });
    await db.insert(t.messages).values({
      customerId: c.id,
      direction: "OUT",
      kind: "SYSTEM",
      body: `campaign:${campaign.id}`,
      author: "CAMPAIGN",
      meta: { campaignId: campaign.id },
      status: "SIMULATED",
    });
  }
  await db
    .update(t.campaigns)
    .set({ status: "SENT", recipients: recipients.length, sentAt: new Date() })
    .where(eq(t.campaigns.id, campaignId));
  return recipients.length;
}

/** Campaign results: orders created from it (attributed via campaign_id). */
export async function campaignResults() {
  const campaigns = await db.select().from(t.campaigns).orderBy(sql`${t.campaigns.id} desc`);
  const ids = campaigns.map((c) => c.id);
  const orders = ids.length
    ? await db.select().from(t.orders).where(inArray(t.orders.campaignId, ids))
    : [];
  return campaigns.map((c) => {
    const mine = orders.filter((o) => o.campaignId === c.id);
    return {
      ...c,
      orders: mine.length,
      revenue: mine.filter((o) => o.status !== "CANCELLED").reduce((s, o) => s + o.total, 0),
      conversion: c.recipients ? mine.length / c.recipients : 0,
    };
  });
}

/** When a customer taps "I want to order" on a campaign message, create an order with the campaign offer. */
export async function campaignReplyToOrder(customerId: number) {
  const [lastCampaignMsg] = await db
    .select()
    .from(t.messages)
    .where(and(eq(t.messages.customerId, customerId), eq(t.messages.kind, "SYSTEM"), eq(t.messages.author, "CAMPAIGN")))
    .orderBy(sql`${t.messages.id} desc`)
    .limit(1);
  const campaignId = (lastCampaignMsg?.meta as { campaignId?: number } | null)?.campaignId;
  if (!campaignId) return null;
  const [campaign] = await db.select().from(t.campaigns).where(eq(t.campaigns.id, campaignId));
  if (!campaign?.productId) return null;
  const [product] = await db.select().from(t.products).where(eq(t.products.id, campaign.productId));
  const [customer] = await db.select().from(t.customers).where(eq(t.customers.id, customerId));
  if (!product || !customer) return null;
  const { createOrder } = await import("./orders");
  const { order } = await createOrder({
    source: "campaign",
    campaignId,
    customer: { name: customer.name, phone: customer.phone, city: customer.city, address: customer.address },
    items: [{ productId: product.id, quantity: 1, unitPrice: product.price }],
    discount: Math.round((product.price * campaign.discountPct) / 100),
    note: `From campaign "${campaign.name}"`,
  });
  return order;
}
