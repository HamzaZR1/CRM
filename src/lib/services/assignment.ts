import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db, t } from "../db";
import { getSettings } from "../settings";
import { logEvent } from "./orders";

type Candidate = { id: number; name: string; weight: number };

/**
 * Weighted fair distribution: each agent should receive a share of today's orders proportional
 * to their weight (e.g. Hamza 20% / Youssef 30% / Sara 50%). We pick the agent who is furthest
 * below their target share, so the split converges exactly even with bursts of orders.
 */
async function pickFair(candidates: Candidate[]) {
  if (!candidates.length) return null;
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const counts = await db
    .select({ id: t.orders.assignedToId, n: sql<number>`count(*)` })
    .from(t.orders)
    .where(and(gte(t.orders.createdAt, since), inArray(t.orders.assignedToId, candidates.map((c) => c.id))))
    .groupBy(t.orders.assignedToId);
  const byId = new Map(counts.map((c) => [c.id, Number(c.n)]));
  const total = candidates.reduce((s, c) => s + (byId.get(c.id) ?? 0), 0) + 1;
  const totalWeight = candidates.reduce((s, c) => s + c.weight, 0);
  let best: Candidate | null = null;
  let bestDeficit = -Infinity;
  for (const c of candidates) {
    const target = (c.weight / totalWeight) * total;
    const deficit = target - (byId.get(c.id) ?? 0);
    if (deficit > bestDeficit || (deficit === bestDeficit && best && c.id < best.id)) {
      best = c;
      bestDeficit = deficit;
    }
  }
  return best;
}

async function activeAgents(): Promise<Candidate[]> {
  const rows = await db
    .select({ id: t.users.id, name: t.users.name, weight: t.users.assignmentWeight })
    .from(t.users)
    .where(and(eq(t.users.active, true), eq(t.users.role, "AGENT")));
  return rows.filter((r) => r.weight > 0);
}

export async function chooseAgentForOrder(orderId: number): Promise<Candidate | null> {
  const settings = await getSettings();
  const agents = await activeAgents();
  if (settings.assignment.mode === "MANUAL" || !agents.length) return null;

  if (settings.assignment.mode === "PRODUCT") {
    const items = await db.select({ productId: t.orderItems.productId }).from(t.orderItems).where(eq(t.orderItems.orderId, orderId));
    const productIds = [...new Set(items.map((i) => i.productId))];
    if (productIds.length) {
      const links = await db.select().from(t.agentProducts).where(inArray(t.agentProducts.productId, productIds));
      const ids = new Set(links.map((l) => l.userId));
      const specialists = agents.filter((a) => ids.has(a.id));
      if (specialists.length) return pickFair(specialists);
    }
  }
  return pickFair(agents);
}

export async function assignOrder(orderId: number) {
  const [order] = await db.select().from(t.orders).where(eq(t.orders.id, orderId));
  if (!order || order.assignedToId) return order?.assignedToId ?? null;
  const agent = await chooseAgentForOrder(orderId);
  if (!agent) return null;
  await db
    .update(t.orders)
    .set({ assignedToId: agent.id, status: order.status === "NEW" ? "ASSIGNED" : order.status, updatedAt: new Date() })
    .where(eq(t.orders.id, orderId));
  const settings = await getSettings();
  await logEvent(orderId, "ASSIGNED", `Auto-assigned to ${agent.name} (${settings.assignment.mode.toLowerCase()} mode)`);
  return agent.id;
}
