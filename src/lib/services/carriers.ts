import { and, eq, inArray } from "drizzle-orm";
import { db, t } from "../db";
import type { Carrier, OrderStatus } from "../db/schema";
import { changeStatus, getOrderFull, logEvent } from "./orders";

/**
 * Carrier integration layer. Every delivery company is reached through an adapter:
 *  - "simulator": no external calls; parcels progress automatically (great for demos / onboarding).
 *  - "http": a generic REST adapter (POST {apiUrl}/shipments, GET {apiUrl}/shipments/{tracking})
 *    with Bearer auth — map it to your carrier's API or put a small proxy in front of it.
 * Carriers can also push status updates to /api/webhooks/carriers/{code}.
 */

export interface ShipmentRequest {
  reference: string;
  customerName: string;
  phone: string;
  city: string;
  address: string;
  amountToCollect: number;
  items: string;
  note?: string | null;
}

interface Adapter {
  create(carrier: Carrier, req: ShipmentRequest): Promise<{ trackingNumber: string }>;
  status(carrier: Carrier, trackingNumber: string, shippedAt: Date | null, orderId: number): Promise<string | null>;
}

const simulator: Adapter = {
  async create(carrier, req) {
    return { trackingNumber: `SIM-${carrier.code.toUpperCase().slice(0, 3)}-${req.reference.replace(/\D/g, "")}-${Math.floor(Math.random() * 9000 + 1000)}` };
  },
  async status(_carrier, tracking, shippedAt, orderId) {
    // Only parcels created by the simulator move on their own; imported/legacy parcels wait for real updates.
    if (!shippedAt || !tracking.startsWith("SIM-")) return null;
    const minutes = (Date.now() - shippedAt.getTime()) / 60000;
    if (minutes < 2) return "picked_up";
    if (minutes < 6) return "in_transit";
    // ~85% delivered, deterministic per order.
    return (orderId * 2654435761) % 100 < 85 ? "delivered" : "returned";
  },
};

const http: Adapter = {
  async create(carrier, req) {
    if (!carrier.apiUrl) throw new Error(`${carrier.name}: API URL not configured`);
    const res = await fetch(`${carrier.apiUrl.replace(/\/$/, "")}/shipments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(carrier.apiKey ? { Authorization: `Bearer ${carrier.apiKey}` } : {}) },
      body: JSON.stringify(req),
    });
    const json = (await res.json().catch(() => ({}))) as { trackingNumber?: string; tracking_number?: string; tracking?: string; message?: string };
    if (!res.ok) throw new Error(json.message ?? `${carrier.name} API error ${res.status}`);
    const trackingNumber = json.trackingNumber ?? json.tracking_number ?? json.tracking;
    if (!trackingNumber) throw new Error(`${carrier.name}: no tracking number in response`);
    return { trackingNumber };
  },
  async status(carrier, tracking) {
    if (!carrier.apiUrl) return null;
    const res = await fetch(`${carrier.apiUrl.replace(/\/$/, "")}/shipments/${encodeURIComponent(tracking)}`, {
      headers: carrier.apiKey ? { Authorization: `Bearer ${carrier.apiKey}` } : {},
    });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => ({}))) as { status?: string };
    return json.status ?? null;
  },
};

const ADAPTERS: Record<string, Adapter> = { simulator, http };

/** Map any carrier status wording (FR / EN / AR) to a ZCRM order status. */
export function mapCarrierStatus(raw: string | null | undefined): OrderStatus | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (/(retour|return|refus|rejected|مرجوع)/.test(s)) return "RETURNED";
  if (/(livr[ée]|delivered|تم التوصيل|paid|encaiss)/.test(s) && !/non/.test(s)) return "DELIVERED";
  if (/(transit|en cours|distribution|out_for_delivery|exp[ée]di|picked|ramass|shipped|في الطريق)/.test(s)) return "IN_TRANSIT";
  return null;
}

export async function shipOrder(orderId: number, carrierId: number, actorId?: number | null) {
  const full = await getOrderFull(orderId);
  if (!full) throw new Error("Order not found");
  if (full.order.status !== "CONFIRMED") throw new Error(`${full.order.reference} must be confirmed before shipping`);
  const [carrier] = await db.select().from(t.carriers).where(eq(t.carriers.id, carrierId));
  if (!carrier) throw new Error("Carrier not found");
  const adapter = ADAPTERS[carrier.adapter] ?? simulator;
  const { order, customer, items } = full;
  const { trackingNumber } = await adapter.create(carrier, {
    reference: order.reference,
    customerName: customer.name,
    phone: customer.phone,
    city: order.city ?? customer.city ?? "",
    address: order.address ?? customer.address ?? "",
    amountToCollect: order.total,
    items: items.map((i) => `${i.quantity}x ${i.productName}${i.variantName ? ` ${i.variantName}` : ""}`).join(", "),
    note: order.note,
  });
  await db
    .update(t.orders)
    .set({ carrierId, trackingNumber, deliveryCost: carrier.deliveryFee, updatedAt: new Date() })
    .where(eq(t.orders.id, orderId));
  await changeStatus(orderId, "SHIPPED", { actorId, note: `Sent to ${carrier.name} · ${trackingNumber}` });
  return trackingNumber;
}

export async function applyCarrierStatus(orderId: number, raw: string, source: string) {
  const mapped = mapCarrierStatus(raw);
  const [order] = await db.select().from(t.orders).where(eq(t.orders.id, orderId));
  if (!order || !mapped || mapped === order.status) return false;
  if (mapped === "IN_TRANSIT" && order.status !== "SHIPPED") return false;
  if (mapped === "RETURNED") {
    const [carrier] = order.carrierId ? await db.select().from(t.carriers).where(eq(t.carriers.id, order.carrierId)) : [];
    if (carrier) await db.update(t.orders).set({ deliveryCost: order.deliveryCost + carrier.returnFee }).where(eq(t.orders.id, orderId));
  }
  await changeStatus(orderId, mapped, { note: `${source}: ${raw}` });
  return true;
}

/** Poll carriers for every parcel still on the road. */
export async function syncShipments() {
  const open = await db.select().from(t.orders).where(inArray(t.orders.status, ["SHIPPED", "IN_TRANSIT"]));
  const carriers = new Map((await db.select().from(t.carriers)).map((c) => [c.id, c]));
  let updated = 0;
  for (const o of open) {
    const carrier = o.carrierId ? carriers.get(o.carrierId) : undefined;
    if (!carrier || !o.trackingNumber) continue;
    const adapter = ADAPTERS[carrier.adapter] ?? simulator;
    try {
      const raw = await adapter.status(carrier, o.trackingNumber, o.shippedAt, o.id);
      if (raw && (await applyCarrierStatus(o.id, raw, carrier.name))) updated++;
    } catch (e) {
      await logEvent(o.id, "SYNC_ERROR", `${carrier.name} sync failed: ${(e as Error).message}`);
    }
  }
  return { checked: open.length, updated };
}

export async function handleCarrierWebhook(code: string, payload: { tracking?: string; trackingNumber?: string; reference?: string; status?: string }) {
  const [carrier] = await db.select().from(t.carriers).where(eq(t.carriers.code, code));
  if (!carrier) throw new Error("Unknown carrier");
  const tracking = payload.trackingNumber ?? payload.tracking;
  const where = tracking
    ? and(eq(t.orders.carrierId, carrier.id), eq(t.orders.trackingNumber, tracking))
    : payload.reference
      ? eq(t.orders.reference, payload.reference)
      : undefined;
  if (!where || !payload.status) throw new Error("tracking/reference and status are required");
  const [order] = await db.select().from(t.orders).where(where);
  if (!order) throw new Error("Shipment not found");
  return applyCarrierStatus(order.id, payload.status, `${carrier.name} webhook`);
}
