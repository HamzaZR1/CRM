import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, t } from "../db";
import type { OrderStatus, Platform } from "../db/schema";
import { normalizePhone } from "../utils";
import { getSettings } from "../settings";
import { assignOrder } from "./assignment";
import { startConfirmation } from "./confirmation";

export async function logEvent(orderId: number, type: string, message: string, userId?: number | null) {
  await db.insert(t.orderEvents).values({ orderId, type, message, userId: userId ?? null });
}

async function nextReference() {
  const [row] = await db.select({ max: sql<number>`coalesce(max(${t.orders.id}), 0)` }).from(t.orders);
  return `ZC-${1001 + Number(row?.max ?? 0)}`;
}

export async function upsertCustomer(input: { name: string; phone: string; city?: string | null; address?: string | null }) {
  const phone = normalizePhone(input.phone);
  if (!phone) throw new Error("Customer phone is required");
  const [existing] = await db.select().from(t.customers).where(eq(t.customers.phone, phone));
  if (existing) {
    const patch: Partial<typeof t.customers.$inferInsert> = {};
    if (input.city && input.city !== existing.city) patch.city = input.city;
    if (input.address && input.address !== existing.address) patch.address = input.address;
    if (input.name && existing.name === "Customer") patch.name = input.name;
    if (Object.keys(patch).length) await db.update(t.customers).set(patch).where(eq(t.customers.id, existing.id));
    return { ...existing, ...patch };
  }
  const [created] = await db
    .insert(t.customers)
    .values({ name: input.name || "Customer", phone, city: input.city ?? null, address: input.address ?? null })
    .returning();
  return created!;
}

export interface NewOrderItem {
  productId?: number;
  variantId?: number | null;
  sku?: string | null;
  name?: string | null;
  variantName?: string | null;
  quantity: number;
  unitPrice?: number;
}

export interface NewOrderInput {
  storeId?: number | null;
  source: Platform;
  externalId?: string | null;
  customer: { name: string; phone: string; city?: string | null; address?: string | null };
  items: NewOrderItem[];
  shippingPrice?: number;
  discount?: number;
  note?: string | null;
  campaignId?: number | null;
  createdAt?: Date;
}

/** Resolve an incoming line item to a catalogue product (by id, SKU or name), creating it if unknown. */
async function resolveProduct(item: NewOrderItem) {
  if (item.productId) {
    const [p] = await db.select().from(t.products).where(eq(t.products.id, item.productId));
    if (p) return p;
  }
  if (item.sku) {
    const [v] = await db.select().from(t.variants).where(eq(t.variants.sku, item.sku));
    if (v) {
      const [p] = await db.select().from(t.products).where(eq(t.products.id, v.productId));
      if (p) return { ...p, _variantId: v.id };
    }
    const [p] = await db.select().from(t.products).where(eq(t.products.sku, item.sku));
    if (p) return p;
  }
  const name = (item.name ?? "").trim();
  if (name) {
    const [p] = await db.select().from(t.products).where(sql`lower(${t.products.name}) = lower(${name})`);
    if (p) return p;
  }
  const [created] = await db
    .insert(t.products)
    .values({ name: name || item.sku || "Imported product", sku: item.sku ?? null, price: item.unitPrice ?? 0, cost: 0 })
    .returning();
  return created!;
}

async function resolveVariant(productId: number, item: NewOrderItem, hinted?: number) {
  if (item.variantId) return item.variantId;
  if (hinted) return hinted;
  const vs = await db.select().from(t.variants).where(eq(t.variants.productId, productId));
  if (item.variantName) {
    const match = vs.find((v) => v.name.toLowerCase() === item.variantName!.toLowerCase());
    if (match) return match.id;
  }
  return vs[0]?.id ?? null;
}

/**
 * Create an order from any source (store webhook, manual entry, campaign reply, API),
 * then run the automation pipeline: smart assignment → confirmation (team or WhatsApp/AI).
 */
export async function createOrder(input: NewOrderInput, opts: { actorId?: number; skipAutomation?: boolean } = {}) {
  if (input.externalId && input.storeId) {
    const [dup] = await db
      .select()
      .from(t.orders)
      .where(and(eq(t.orders.storeId, input.storeId), eq(t.orders.externalId, input.externalId)));
    if (dup) return { order: dup, duplicate: true as const };
  }
  if (!input.items.length) throw new Error("Order has no items");

  const customer = await upsertCustomer(input.customer);
  const lines = [];
  for (const item of input.items) {
    const product = await resolveProduct(item);
    const variantId = await resolveVariant(product.id, item, (product as { _variantId?: number })._variantId);
    lines.push({
      productId: product.id,
      variantId,
      quantity: Math.max(1, Math.round(item.quantity || 1)),
      unitPrice: Math.round(item.unitPrice ?? product.price),
      unitCost: product.cost,
    });
  }
  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const discount = Math.round(input.discount ?? 0);
  const shippingPrice = Math.round(input.shippingPrice ?? 0);
  const upsell = lines.reduce((s, l) => s + l.quantity, 0) > 1;

  const reference = await nextReference();
  const [order] = await db
    .insert(t.orders)
    .values({
      reference,
      storeId: input.storeId ?? null,
      source: input.source,
      externalId: input.externalId ?? null,
      customerId: customer.id,
      status: "NEW",
      subtotal,
      discount,
      shippingPrice,
      total: subtotal - discount + shippingPrice,
      upsell,
      city: input.customer.city ?? customer.city,
      address: input.customer.address ?? customer.address,
      note: input.note ?? null,
      campaignId: input.campaignId ?? null,
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
      updatedAt: new Date(),
    })
    .returning();
  await db.insert(t.orderItems).values(lines.map((l) => ({ ...l, orderId: order!.id })));
  await logEvent(order!.id, "CREATED", `Order received from ${input.source}`, opts.actorId);

  if (!opts.skipAutomation) await runPipeline(order!.id);
  const [fresh] = await db.select().from(t.orders).where(eq(t.orders.id, order!.id));
  return { order: fresh!, duplicate: false as const };
}

/** Assignment + confirmation kick-off for a NEW order. */
export async function runPipeline(orderId: number) {
  const settings = await getSettings();
  if (settings.assignment.autoAssign) await assignOrder(orderId);
  await startConfirmation(orderId);
}

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  NEW: ["ASSIGNED", "AWAITING_REPLY", "CONFIRMED", "CANCELLED", "NO_ANSWER", "POSTPONED"],
  ASSIGNED: ["AWAITING_REPLY", "CONFIRMED", "CANCELLED", "NO_ANSWER", "POSTPONED"],
  AWAITING_REPLY: ["CONFIRMED", "CANCELLED", "NO_ANSWER", "POSTPONED", "ASSIGNED"],
  NO_ANSWER: ["CONFIRMED", "CANCELLED", "POSTPONED", "ASSIGNED", "AWAITING_REPLY", "NO_ANSWER"],
  POSTPONED: ["CONFIRMED", "CANCELLED", "NO_ANSWER", "ASSIGNED", "AWAITING_REPLY"],
  CONFIRMED: ["SHIPPED", "CANCELLED", "ASSIGNED"],
  CANCELLED: ["ASSIGNED", "CONFIRMED"],
  SHIPPED: ["IN_TRANSIT", "DELIVERED", "RETURNED"],
  IN_TRANSIT: ["DELIVERED", "RETURNED"],
  DELIVERED: ["RETURNED"],
  RETURNED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus) {
  return from === to || TRANSITIONS[from].includes(to);
}

export interface StatusChangeOpts {
  actorId?: number | null;
  via?: "CALL" | "WHATSAPP" | "AI";
  note?: string;
  postponedUntil?: Date | null;
  force?: boolean;
}

export async function changeStatus(orderId: number, to: OrderStatus, opts: StatusChangeOpts = {}) {
  const [order] = await db.select().from(t.orders).where(eq(t.orders.id, orderId));
  if (!order) throw new Error("Order not found");
  if (!opts.force && !canTransition(order.status, to)) {
    throw new Error(`Cannot move order ${order.reference} from ${order.status} to ${to}`);
  }
  const now = new Date();
  const patch: Partial<typeof t.orders.$inferInsert> = { status: to, updatedAt: now };
  switch (to) {
    case "CONFIRMED":
      patch.confirmedAt = now;
      patch.confirmedVia = opts.via ?? "CALL";
      patch.confirmedById = opts.via === "CALL" || !opts.via ? (opts.actorId ?? order.assignedToId) : order.assignedToId;
      break;
    case "CANCELLED":
      patch.cancelledAt = now;
      break;
    case "POSTPONED":
      patch.postponedUntil = opts.postponedUntil ?? new Date(now.getTime() + 24 * 3600_000);
      break;
    case "NO_ANSWER":
      patch.attempts = order.attempts + 1;
      patch.lastContactAt = now;
      break;
    case "SHIPPED":
      patch.shippedAt = now;
      break;
    case "DELIVERED":
      patch.deliveredAt = now;
      break;
    case "RETURNED":
      patch.returnedAt = now;
      break;
  }
  await db.update(t.orders).set(patch).where(eq(t.orders.id, orderId));

  // Stock: units leave the warehouse when shipped, and come back on return.
  if (to === "SHIPPED" && order.status !== "SHIPPED") await moveStock(orderId, "OUT");
  if (to === "RETURNED" && order.status !== "RETURNED") await moveStock(orderId, "RETURN");

  const label = to.replace("_", " ").toLowerCase();
  await logEvent(orderId, `STATUS_${to}`, `Status → ${label}${opts.via ? ` (via ${opts.via})` : ""}${opts.note ? ` — ${opts.note}` : ""}`, opts.actorId);

  if (to === "CONFIRMED") {
    const settings = await getSettings();
    if (settings.shipping.autoShipOnConfirm && settings.shipping.defaultCarrierId) {
      const { shipOrder } = await import("./carriers");
      await shipOrder(orderId, settings.shipping.defaultCarrierId, opts.actorId).catch((e) =>
        logEvent(orderId, "SHIP_ERROR", `Auto-ship failed: ${(e as Error).message}`),
      );
    }
  }
}

async function moveStock(orderId: number, type: "OUT" | "RETURN") {
  const items = await db.select().from(t.orderItems).where(eq(t.orderItems.orderId, orderId));
  for (const it of items) {
    if (!it.variantId) continue;
    const delta = type === "OUT" ? -it.quantity : it.quantity;
    await db.update(t.variants).set({ stock: sql`${t.variants.stock} + ${delta}` }).where(eq(t.variants.id, it.variantId));
    await db.insert(t.stockMovements).values({ variantId: it.variantId, type, quantity: it.quantity, orderId });
  }
}

/** Apply a retention offer (percentage discount and/or free shipping) and recompute totals. */
export async function applyOffer(orderId: number, discountPct: number, freeShipping: boolean, actorId?: number | null) {
  const [order] = await db.select().from(t.orders).where(eq(t.orders.id, orderId));
  if (!order) throw new Error("Order not found");
  const discount = Math.round((order.subtotal * Math.max(0, discountPct)) / 100);
  const shippingPrice = freeShipping ? 0 : order.shippingPrice;
  await db
    .update(t.orders)
    .set({ discount, shippingPrice, total: order.subtotal - discount + shippingPrice, updatedAt: new Date() })
    .where(eq(t.orders.id, orderId));
  await logEvent(orderId, "OFFER", `Offer applied: -${discountPct}%${freeShipping ? " + free delivery" : ""}`, actorId);
}

export async function updateOrderDetails(
  orderId: number,
  patch: { city?: string; address?: string; note?: string },
  actorId?: number | null,
) {
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined && v !== ""));
  if (!Object.keys(clean).length) return;
  await db.update(t.orders).set({ ...clean, updatedAt: new Date() }).where(eq(t.orders.id, orderId));
  await logEvent(orderId, "UPDATED", `Details updated: ${Object.keys(clean).join(", ")}`, actorId);
}

export async function getOrderFull(orderId: number) {
  const [order] = await db.select().from(t.orders).where(eq(t.orders.id, orderId));
  if (!order) return null;
  const [customer] = await db.select().from(t.customers).where(eq(t.customers.id, order.customerId));
  const items = await db
    .select({
      id: t.orderItems.id,
      quantity: t.orderItems.quantity,
      unitPrice: t.orderItems.unitPrice,
      unitCost: t.orderItems.unitCost,
      productId: t.products.id,
      productName: t.products.name,
      emoji: t.products.emoji,
      variantName: t.variants.name,
      aiNotes: t.products.aiNotes,
      upsellNote: t.products.upsellNote,
    })
    .from(t.orderItems)
    .innerJoin(t.products, eq(t.products.id, t.orderItems.productId))
    .leftJoin(t.variants, eq(t.variants.id, t.orderItems.variantId))
    .where(eq(t.orderItems.orderId, orderId));
  const events = await db.select().from(t.orderEvents).where(eq(t.orderEvents.orderId, orderId)).orderBy(desc(t.orderEvents.id));
  const msgs = await db.select().from(t.messages).where(eq(t.messages.customerId, order.customerId)).orderBy(t.messages.id);
  const [agent] = order.assignedToId ? await db.select().from(t.users).where(eq(t.users.id, order.assignedToId)) : [];
  const [carrier] = order.carrierId ? await db.select().from(t.carriers).where(eq(t.carriers.id, order.carrierId)) : [];
  const [store] = order.storeId ? await db.select().from(t.stores).where(eq(t.stores.id, order.storeId)) : [];
  const history = await db
    .select({ id: t.orders.id, reference: t.orders.reference, status: t.orders.status, total: t.orders.total, createdAt: t.orders.createdAt })
    .from(t.orders)
    .where(eq(t.orders.customerId, order.customerId))
    .orderBy(desc(t.orders.id));
  return { order, customer: customer!, items, events, messages: msgs, agent, carrier, store, history };
}

export async function bulkAssign(orderIds: number[], userId: number, actorId?: number) {
  if (!orderIds.length) return;
  await db.update(t.orders).set({ assignedToId: userId, updatedAt: new Date() }).where(inArray(t.orders.id, orderIds));
  for (const id of orderIds) {
    const [o] = await db.select({ status: t.orders.status }).from(t.orders).where(eq(t.orders.id, id));
    if (o?.status === "NEW") await db.update(t.orders).set({ status: "ASSIGNED" }).where(eq(t.orders.id, id));
    await logEvent(id, "ASSIGNED", `Manually assigned`, actorId);
  }
}
