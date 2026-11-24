import { eq, inArray, sql } from "drizzle-orm";
import { db, t } from "../db";

/**
 * Stock per variant: available = units in the warehouse (variants.stock).
 * Delivered / in transit / returned quantities are derived from orders, so the bar matches reality.
 */
export async function stockOverview() {
  const products = await db.select().from(t.products);
  const variants = await db.select().from(t.variants);
  const flows = await db
    .select({
      variantId: t.orderItems.variantId,
      status: t.orders.status,
      qty: sql<number>`sum(${t.orderItems.quantity})`,
    })
    .from(t.orderItems)
    .innerJoin(t.orders, eq(t.orders.id, t.orderItems.orderId))
    .where(inArray(t.orders.status, ["SHIPPED", "IN_TRANSIT", "DELIVERED", "RETURNED", "CONFIRMED"]))
    .groupBy(t.orderItems.variantId, t.orders.status);

  const per = new Map<number, { delivered: number; inTransit: number; returned: number; reserved: number }>();
  for (const f of flows) {
    if (!f.variantId) continue;
    const row = per.get(f.variantId) ?? { delivered: 0, inTransit: 0, returned: 0, reserved: 0 };
    const q = Number(f.qty);
    if (f.status === "DELIVERED") row.delivered += q;
    else if (f.status === "RETURNED") row.returned += q;
    else if (f.status === "CONFIRMED") row.reserved += q;
    else row.inTransit += q;
    per.set(f.variantId, row);
  }

  return products.map((p) => {
    const vs = variants
      .filter((v) => v.productId === p.id)
      .map((v) => {
        const f = per.get(v.id) ?? { delivered: 0, inTransit: 0, returned: 0, reserved: 0 };
        return { ...v, ...f, low: v.stock <= v.lowStockThreshold, out: v.stock <= 0 };
      });
    const sum = (k: "stock" | "delivered" | "inTransit" | "returned" | "reserved") => vs.reduce((s, v) => s + v[k], 0);
    return {
      product: p,
      variants: vs,
      available: sum("stock"),
      delivered: sum("delivered"),
      inTransit: sum("inTransit"),
      returned: sum("returned"),
      reserved: sum("reserved"),
      value: sum("stock") * p.cost,
      alerts: vs.filter((v) => v.low).length,
    };
  });
}

export async function adjustStock(variantId: number, quantity: number, type: "IN" | "ADJUST", note?: string) {
  if (!Number.isFinite(quantity) || quantity === 0) throw new Error("Quantity must be a non-zero number");
  if (type === "IN" && quantity < 0) throw new Error("Use an adjustment for negative changes");
  await db.update(t.variants).set({ stock: sql`${t.variants.stock} + ${quantity}` }).where(eq(t.variants.id, variantId));
  await db.insert(t.stockMovements).values({ variantId, type, quantity, note: note ?? null });
}
