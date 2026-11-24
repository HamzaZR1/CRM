import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { db, t } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { deliveryBy, loadDataset, rangeFromParam } from "@/lib/services/analytics";
import { Bar, Card, PageHeader, Stat, StatusBadge } from "@/components/ui";
import { pct, timeAgo } from "@/lib/utils";
import { CarrierCard, AddCarrier, SyncButton } from "./shipping-client";

export const metadata = { title: "Shipping" };

export default async function ShippingPage() {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  const carriers = await db.select().from(t.carriers);
  const ds = await loadDataset(rangeFromParam("30d"));
  const perf = new Map(deliveryBy(ds, "carrier").map((c) => [c.key, c]));
  const recent = await db
    .select({ id: t.orders.id, reference: t.orders.reference, status: t.orders.status, tracking: t.orders.trackingNumber, city: t.orders.city, updatedAt: t.orders.updatedAt, name: t.customers.name, carrier: t.carriers.name, color: t.carriers.color })
    .from(t.orders)
    .innerJoin(t.customers, eq(t.customers.id, t.orders.customerId))
    .innerJoin(t.carriers, eq(t.carriers.id, t.orders.carrierId))
    .where(inArray(t.orders.status, ["SHIPPED", "IN_TRANSIT", "DELIVERED", "RETURNED"]))
    .orderBy(desc(t.orders.updatedAt))
    .limit(12);
  const [{ n: toShip }] = [{ n: ds.orders.filter((o) => o.status === "CONFIRMED").length }];
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";

  return (
    <>
      <PageHeader
        title="Shipping"
        subtitle="Send confirmed orders to your delivery companies in one click; statuses sync automatically."
        actions={<><SyncButton /><Link href="/app/orders?status=CONFIRMED" className="btn-primary">Ship {toShip} confirmed orders →</Link></>}
      />
      <div className="mb-4 grid gap-4 sm:grid-cols-4">
        <Stat label="Ready to ship" value={toShip} tone="brand" />
        <Stat label="On the road" value={ds.orders.filter((o) => o.status === "SHIPPED" || o.status === "IN_TRANSIT").length} />
        <Stat label="Delivered (30d)" value={ds.orders.filter((o) => o.status === "DELIVERED").length} tone="good" />
        <Stat label="Returned (30d)" value={ds.orders.filter((o) => o.status === "RETURNED").length} tone="bad" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Delivery companies</h2>
            {user.role === "ADMIN" && <AddCarrier />}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {carriers.map((c) => {
              const p = perf.get(c.name);
              return (
                <CarrierCard
                  key={c.id}
                  carrier={{ id: c.id, name: c.name, code: c.code, color: c.color, connected: c.connected, adapter: c.adapter, apiUrl: c.apiUrl ?? "", hasKey: Boolean(c.apiKey), deliveryFee: c.deliveryFee, returnFee: c.returnFee }}
                  stats={p ? { parcels: p.total, rate: p.rate } : null}
                  webhookUrl={`${appUrl}/api/webhooks/carriers/${c.code}`}
                  canEdit={user.role === "ADMIN"}
                />
              );
            })}
          </div>
        </div>
        <div className="space-y-4">
          <Card title="Delivery statuses" action={<span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">● Auto sync</span>} bodyClass="p-0">
            {recent.map((r) => (
              <Link key={r.id} href={`/app/orders/${r.id}`} className="flex items-center gap-3 border-b border-slate-50 px-4 py-3 hover:bg-slate-50">
                <span className="h-8 w-8 shrink-0 rounded-lg" style={{ background: r.color }} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{r.reference} · {r.name}</div>
                  <div className="truncate text-xs text-slate-500">{r.carrier} · {r.city} · {r.tracking}</div>
                </div>
                <div className="text-end">
                  <StatusBadge status={r.status} />
                  <div className="mt-0.5 text-[10px] text-slate-400">{timeAgo(r.updatedAt)}</div>
                </div>
              </Link>
            ))}
          </Card>
          <Card title="Delivery rate by carrier (30 days)">
            <div className="space-y-2.5">
              {[...perf.values()].map((c) => (
                <div key={c.key} className="flex items-center gap-3 text-sm"><span className="w-28 truncate">{c.key}</span><Bar value={c.rate} /><span className="w-10 text-end text-xs font-semibold">{pct(c.rate)}</span></div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
