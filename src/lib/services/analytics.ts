import { and, gte, lte, inArray } from "drizzle-orm";
import { db, t } from "../db";
import type { Order, OrderStatus } from "../db/schema";
import { CONFIRMED_LIKE, PENDING_CONFIRMATION, ratio, SHIPPED_LIKE } from "../utils";

export type Range = { from: Date; to: Date };

export function rangeFromParam(p?: string | null): Range & { key: string } {
  const to = new Date();
  const from = new Date();
  const key = p ?? "30d";
  if (key === "today") from.setHours(0, 0, 0, 0);
  else if (key === "7d") from.setDate(from.getDate() - 7);
  else if (key === "month") {
    from.setDate(1);
    from.setHours(0, 0, 0, 0);
  } else if (key === "90d") from.setDate(from.getDate() - 90);
  else from.setDate(from.getDate() - 30);
  return { from, to, key };
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Load everything needed for analytics in one pass (fine for tens of thousands of orders). */
export async function loadDataset(range: Range) {
  const orders = await db
    .select()
    .from(t.orders)
    .where(and(gte(t.orders.createdAt, range.from), lte(t.orders.createdAt, range.to)));
  const ids = orders.map((o) => o.id);
  const items = ids.length ? await chunkedItems(ids) : [];
  const [products, users, carriers, spend] = await Promise.all([
    db.select().from(t.products),
    db.select().from(t.users),
    db.select().from(t.carriers),
    db
      .select()
      .from(t.adSpend)
      .where(and(gte(t.adSpend.date, isoDay(range.from)), lte(t.adSpend.date, isoDay(range.to)))),
  ]);
  return { orders, items, products, users, carriers, spend };
}

async function chunkedItems(ids: number[]) {
  const out: (typeof t.orderItems.$inferSelect)[] = [];
  for (let i = 0; i < ids.length; i += 500) {
    out.push(...(await db.select().from(t.orderItems).where(inArray(t.orderItems.orderId, ids.slice(i, i + 500)))));
  }
  return out;
}

type Dataset = Awaited<ReturnType<typeof loadDataset>>;

const is = (o: Order, list: OrderStatus[]) => list.includes(o.status);

/** Confirmation rate = confirmed (incl. later stages) / orders that got a decision. */
export function confirmationRate(orders: Order[]) {
  const decided = orders.filter((o) => !is(o, PENDING_CONFIRMATION));
  return ratio(decided.filter((o) => is(o, CONFIRMED_LIKE)).length, decided.length);
}
/** Delivery rate = delivered / parcels with a final outcome (delivered + returned). */
export function deliveryRate(orders: Order[]) {
  const delivered = orders.filter((o) => o.status === "DELIVERED").length;
  const returned = orders.filter((o) => o.status === "RETURNED").length;
  return ratio(delivered, delivered + returned);
}

export function commissionsFor(ds: Dataset) {
  const byUser = new Map(ds.users.map((u) => [u.id, u]));
  let total = 0;
  const perUser = new Map<number, number>();
  for (const o of ds.orders) {
    const u = o.assignedToId ? byUser.get(o.assignedToId) : undefined;
    if (!u) continue;
    let c = 0;
    if (is(o, CONFIRMED_LIKE)) c += u.commissionConfirmed;
    if (o.status === "DELIVERED") c += u.commissionDelivered;
    total += c;
    perUser.set(u.id, (perUser.get(u.id) ?? 0) + c);
  }
  return { total, perUser };
}

export function profit(ds: Dataset) {
  const delivered = new Set(ds.orders.filter((o) => o.status === "DELIVERED").map((o) => o.id));
  const revenue = ds.orders.filter((o) => delivered.has(o.id)).reduce((s, o) => s + o.total, 0);
  const productCost = ds.items.filter((i) => delivered.has(i.orderId)).reduce((s, i) => s + i.unitCost * i.quantity, 0);
  const ads = ds.spend.reduce((s, a) => s + a.amount, 0);
  const commissions = commissionsFor(ds).total;
  const delivery = ds.orders.filter((o) => is(o, SHIPPED_LIKE)).reduce((s, o) => s + o.deliveryCost, 0);
  return { revenue, productCost, ads, commissions, delivery, net: revenue - productCost - ads - commissions - delivery };
}

export function overview(ds: Dataset) {
  const o = ds.orders;
  const count = (s: OrderStatus[]) => o.filter((x) => is(x, s)).length;
  const p = profit(ds);
  return {
    orders: o.length,
    pending: count(PENDING_CONFIRMATION),
    confirmed: count(CONFIRMED_LIKE),
    cancelled: count(["CANCELLED"]),
    shipped: count(SHIPPED_LIKE),
    inTransit: count(["SHIPPED", "IN_TRANSIT"]),
    delivered: count(["DELIVERED"]),
    returned: count(["RETURNED"]),
    confirmationRate: confirmationRate(o),
    deliveryRate: deliveryRate(o),
    aiConfirmed: o.filter((x) => x.confirmedVia === "AI" || x.confirmedVia === "WHATSAPP").length,
    avgBasket: ratio(o.reduce((s, x) => s + x.total, 0), o.length),
    ...p,
  };
}

export function statusBreakdown(ds: Dataset) {
  const m = new Map<OrderStatus, number>();
  for (const o of ds.orders) m.set(o.status, (m.get(o.status) ?? 0) + 1);
  return [...m.entries()].map(([status, value]) => ({ status, value })).sort((a, b) => b.value - a.value);
}

export function timeseries(ds: Dataset, range: Range) {
  const days = new Map<string, { day: string; orders: number; confirmed: number; delivered: number; revenue: number }>();
  for (let d = new Date(range.from); d <= range.to; d.setDate(d.getDate() + 1)) {
    const k = isoDay(d);
    days.set(k, { day: k.slice(5), orders: 0, confirmed: 0, delivered: 0, revenue: 0 });
  }
  for (const o of ds.orders) {
    const row = days.get(isoDay(o.createdAt));
    if (!row) continue;
    row.orders++;
    if (is(o, CONFIRMED_LIKE)) row.confirmed++;
    if (o.status === "DELIVERED") {
      row.delivered++;
      row.revenue += o.total;
    }
  }
  return [...days.values()];
}

export function teamPerformance(ds: Dataset) {
  const { perUser } = commissionsFor(ds);
  return ds.users
    .filter((u) => u.role === "AGENT")
    .map((u) => {
      const mine = ds.orders.filter((o) => o.assignedToId === u.id);
      return {
        id: u.id,
        name: u.name,
        color: u.color,
        active: u.active,
        weight: u.assignmentWeight,
        orders: mine.length,
        pending: mine.filter((o) => is(o, PENDING_CONFIRMATION)).length,
        confirmed: mine.filter((o) => is(o, CONFIRMED_LIKE)).length,
        delivered: mine.filter((o) => o.status === "DELIVERED").length,
        confirmationRate: confirmationRate(mine),
        deliveryRate: deliveryRate(mine),
        upsellRate: ratio(mine.filter((o) => o.upsell && is(o, CONFIRMED_LIKE)).length, mine.filter((o) => is(o, CONFIRMED_LIKE)).length),
        commission: perUser.get(u.id) ?? 0,
      };
    })
    .sort((a, b) => b.confirmed - a.confirmed);
}

export type Recommendation = "SCALE" | "OPTIMIZE" | "STOP" | "NO_DATA";

export function productStats(ds: Dataset) {
  const byOrder = new Map(ds.orders.map((o) => [o.id, o]));
  const userById = new Map(ds.users.map((u) => [u.id, u]));
  return ds.products
    .map((p) => {
      const lines = ds.items.filter((i) => i.productId === p.id);
      const orderIds = [...new Set(lines.map((l) => l.orderId))];
      const orders = orderIds.map((id) => byOrder.get(id)!).filter(Boolean);
      const delivered = orders.filter((o) => o.status === "DELIVERED");
      const deliveredIds = new Set(delivered.map((o) => o.id));
      const dLines = lines.filter((l) => deliveredIds.has(l.orderId));
      const units = dLines.reduce((s, l) => s + l.quantity, 0);
      // Revenue/costs of multi-product orders are attributed pro-rata to line value.
      const share = (o: Order) => {
        const own = lines.filter((l) => l.orderId === o.id).reduce((s, l) => s + l.unitPrice * l.quantity, 0);
        return o.subtotal > 0 ? own / o.subtotal : 1;
      };
      const revenue = delivered.reduce((s, o) => s + o.total * share(o), 0);
      const cogs = dLines.reduce((s, l) => s + l.unitCost * l.quantity, 0);
      const deliveryCost = orders.filter((o) => is(o, SHIPPED_LIKE)).reduce((s, o) => s + o.deliveryCost * share(o), 0);
      const commissions = orders.reduce((s, o) => {
        const u = o.assignedToId ? userById.get(o.assignedToId) : undefined;
        if (!u) return s;
        return s + ((is(o, CONFIRMED_LIKE) ? u.commissionConfirmed : 0) + (o.status === "DELIVERED" ? u.commissionDelivered : 0)) * share(o);
      }, 0);
      const spendRows = ds.spend.filter((a) => a.productId === p.id);
      const ads = spendRows.reduce((s, a) => s + a.amount, 0);
      const leads = orders.length;
      const profitBeforeAds = revenue - cogs - deliveryCost - commissions;
      const net = profitBeforeAds - ads;
      const cpl = ratio(ads, leads);
      const breakEvenCpl = ratio(profitBeforeAds, leads);
      const confirmed = orders.filter((o) => is(o, CONFIRMED_LIKE));
      let recommendation: Recommendation = "NO_DATA";
      if (leads >= 10 && (ads > 0 || delivered.length > 0)) {
        if (net < 0 || cpl > breakEvenCpl) recommendation = "STOP";
        else if (cpl <= breakEvenCpl * 0.6) recommendation = "SCALE";
        else recommendation = "OPTIMIZE";
      }
      return {
        id: p.id,
        name: p.name,
        emoji: p.emoji,
        price: p.price,
        cost: p.cost,
        leads,
        confirmed: confirmed.length,
        delivered: delivered.length,
        returned: orders.filter((o) => o.status === "RETURNED").length,
        units,
        revenue: Math.round(revenue),
        cogs,
        deliveryCost: Math.round(deliveryCost),
        commissions: Math.round(commissions),
        ads,
        net: Math.round(net),
        confirmationRate: confirmationRate(orders),
        deliveryRate: deliveryRate(orders),
        upsellRate: ratio(confirmed.filter((o) => o.upsell).length, confirmed.length),
        cpl,
        cpd: ratio(ads, delivered.length),
        breakEvenCpl,
        roi: ratio(net, ads + cogs),
        profitPerPiece: ratio(net, units),
        recommendation,
      };
    })
    .sort((a, b) => b.net - a.net);
}

export function deliveryBy(ds: Dataset, dim: "city" | "carrier" | "product") {
  const groups = new Map<string, { key: string; delivered: number; returned: number; total: number; color?: string }>();
  const add = (key: string, o: Order, color?: string) => {
    const g = groups.get(key) ?? { key, delivered: 0, returned: 0, total: 0, color };
    if (is(o, SHIPPED_LIKE)) g.total++;
    if (o.status === "DELIVERED") g.delivered++;
    if (o.status === "RETURNED") g.returned++;
    groups.set(key, g);
  };
  const carriers = new Map(ds.carriers.map((c) => [c.id, c]));
  const products = new Map(ds.products.map((p) => [p.id, p]));
  for (const o of ds.orders) {
    if (!is(o, SHIPPED_LIKE)) continue;
    if (dim === "city") add(o.city ?? "—", o);
    else if (dim === "carrier") {
      const c = o.carrierId ? carriers.get(o.carrierId) : undefined;
      add(c?.name ?? "—", o, c?.color);
    } else {
      const pids = new Set(ds.items.filter((i) => i.orderId === o.id).map((i) => i.productId));
      for (const pid of pids) add(products.get(pid)?.name ?? "—", o);
    }
  }
  return [...groups.values()]
    .map((g) => ({ ...g, rate: ratio(g.delivered, g.delivered + g.returned) }))
    .filter((g) => g.total > 0)
    .sort((a, b) => b.total - a.total);
}

export function sourceBreakdown(ds: Dataset) {
  const m = new Map<string, number>();
  for (const o of ds.orders) m.set(o.source, (m.get(o.source) ?? 0) + 1);
  return [...m.entries()].map(([source, value]) => ({ source, value }));
}
