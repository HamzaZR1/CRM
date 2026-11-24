import Link from "next/link";
import { and, desc, eq, inArray, like, or, sql, type SQL } from "drizzle-orm";
import { db, t } from "@/lib/db";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/db/schema";
import { isManager, requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/ui";
import { cn, normalizePhone, STATUS_META } from "@/lib/utils";
import { OrdersTable, NewOrderButton, ImportDemoButton } from "./orders-client";

export const metadata = { title: "Orders" };
const PAGE = 50;

type SP = { status?: string; q?: string; agent?: string; source?: string; carrier?: string; page?: string };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const manager = isManager(user);
  const settings = await getSettings();

  const conds: SQL[] = [];
  if (!manager) conds.push(eq(t.orders.assignedToId, user.id));
  if (sp.agent && manager) conds.push(eq(t.orders.assignedToId, Number(sp.agent)));
  if (sp.source) conds.push(eq(t.orders.source, sp.source as never));
  if (sp.carrier) conds.push(eq(t.orders.carrierId, Number(sp.carrier)));
  if (sp.q) {
    const q = `%${sp.q.trim()}%`;
    const phone = normalizePhone(sp.q);
    conds.push(or(like(t.orders.reference, q), like(t.customers.name, q), like(t.customers.phone, `%${phone || sp.q}%`), like(t.orders.city, q), like(t.orders.trackingNumber, q))!);
  }
  const base = conds.length ? and(...conds) : undefined;
  const statusFilter = sp.status && ORDER_STATUSES.includes(sp.status as OrderStatus) ? eq(t.orders.status, sp.status as OrderStatus) : undefined;
  const where = statusFilter ? (base ? and(base, statusFilter) : statusFilter) : base;

  const counts = await db
    .select({ status: t.orders.status, n: sql<number>`count(*)` })
    .from(t.orders)
    .innerJoin(t.customers, eq(t.customers.id, t.orders.customerId))
    .where(base)
    .groupBy(t.orders.status);
  const countBy = new Map(counts.map((c) => [c.status, Number(c.n)]));
  const total = counts.reduce((s, c) => s + Number(c.n), 0);

  const page = Math.max(1, Number(sp.page) || 1);
  const rows = await db
    .select({
      id: t.orders.id,
      reference: t.orders.reference,
      status: t.orders.status,
      total: t.orders.total,
      city: t.orders.city,
      source: t.orders.source,
      createdAt: t.orders.createdAt,
      confirmedVia: t.orders.confirmedVia,
      trackingNumber: t.orders.trackingNumber,
      customerName: t.customers.name,
      phone: t.customers.phone,
      agentName: t.users.name,
      agentColor: t.users.color,
      carrierName: t.carriers.name,
      carrierColor: t.carriers.color,
    })
    .from(t.orders)
    .innerJoin(t.customers, eq(t.customers.id, t.orders.customerId))
    .leftJoin(t.users, eq(t.users.id, t.orders.assignedToId))
    .leftJoin(t.carriers, eq(t.carriers.id, t.orders.carrierId))
    .where(where)
    .orderBy(desc(t.orders.id))
    .limit(PAGE)
    .offset((page - 1) * PAGE);

  const ids = rows.map((r) => r.id);
  const items = ids.length
    ? await db
        .select({ orderId: t.orderItems.orderId, qty: t.orderItems.quantity, name: t.products.name, emoji: t.products.emoji })
        .from(t.orderItems)
        .innerJoin(t.products, eq(t.products.id, t.orderItems.productId))
        .where(inArray(t.orderItems.orderId, ids))
    : [];
  const itemsBy = new Map<number, { qty: number; name: string; emoji: string }[]>();
  for (const it of items) itemsBy.set(it.orderId, [...(itemsBy.get(it.orderId) ?? []), it]);

  const [agents, carriers, products, stores] = await Promise.all([
    db.select({ id: t.users.id, name: t.users.name }).from(t.users).where(and(eq(t.users.role, "AGENT"), eq(t.users.active, true))),
    db.select({ id: t.carriers.id, name: t.carriers.name, connected: t.carriers.connected }).from(t.carriers),
    db.select({ id: t.products.id, name: t.products.name, price: t.products.price }).from(t.products).where(eq(t.products.active, true)),
    db.select({ id: t.stores.id, name: t.stores.name, platform: t.stores.platform }).from(t.stores).where(eq(t.stores.active, true)),
  ]);

  const filteredTotal = sp.status ? (countBy.get(sp.status as OrderStatus) ?? 0) : total;
  const qs = (patch: Partial<SP>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/app/orders?${p.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Orders"
        subtitle={`${total} orders${sp.q ? ` matching “${sp.q}”` : ""}`}
        actions={
          <>
            {manager && <ImportDemoButton stores={stores} />}
            <NewOrderButton products={products} />
          </>
        }
      />

      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
        <Link href={qs({ status: undefined, page: undefined })} className={cn("shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold", !sp.status ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200")}>
          All <span className="opacity-60">{total}</span>
        </Link>
        {ORDER_STATUSES.map((s) => (
          <Link key={s} href={qs({ status: s, page: undefined })} className={cn("shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold", sp.status === s ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200")}>
            {STATUS_META[s].label} <span className="opacity-60">{countBy.get(s) ?? 0}</span>
          </Link>
        ))}
      </div>

      {manager && (
        <form className="mb-4 flex flex-wrap gap-2" action="/app/orders">
          {sp.status && <input type="hidden" name="status" value={sp.status} />}
          <input name="q" defaultValue={sp.q} placeholder="Reference, name, phone, city, tracking…" className="input max-w-xs" />
          <select name="agent" defaultValue={sp.agent ?? ""} className="input w-auto">
            <option value="">All agents</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select name="source" defaultValue={sp.source ?? ""} className="input w-auto">
            <option value="">All sources</option>
            {["youcan", "shopify", "woocommerce", "manual", "api", "campaign"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select name="carrier" defaultValue={sp.carrier ?? ""} className="input w-auto">
            <option value="">All carriers</option>
            {carriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button className="btn-secondary">Filter</button>
          {(sp.q || sp.agent || sp.source || sp.carrier) && <Link href="/app/orders" className="btn-ghost">Reset</Link>}
        </form>
      )}

      <OrdersTable
        manager={manager}
        currency={settings.company.currency}
        rows={rows.map((r) => ({ ...r, createdAt: r.createdAt.getTime(), items: itemsBy.get(r.id) ?? [] }))}
        agents={agents}
        carriers={carriers.filter((c) => c.connected)}
      />

      {filteredTotal > PAGE && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
          <span>Page {page} of {Math.ceil(filteredTotal / PAGE)}</span>
          <div className="flex gap-2">
            {page > 1 && <Link className="btn-secondary" href={qs({ page: String(page - 1) })}>← Previous</Link>}
            {page * PAGE < filteredTotal && <Link className="btn-secondary" href={qs({ page: String(page + 1) })}>Next →</Link>}
          </div>
        </div>
      )}
    </>
  );
}
