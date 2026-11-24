import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { deliveryBy, loadDataset, overview, productStats, rangeFromParam, statusBreakdown, teamPerformance, timeseries } from "@/lib/services/analytics";
import { Avatar, Badge, Bar, Card, PageHeader, RangeTabs, Stat } from "@/components/ui";
import { Donut, OrdersChart } from "@/components/charts";
import { money, pct, STATUS_META } from "@/lib/utils";
import { Bot, ShoppingCart, Truck, Wallet } from "lucide-react";

export const metadata = { title: "Dashboard" };

const STATUS_COLORS: Record<string, string> = {
  NEW: "#0ea5e9", ASSIGNED: "#6366f1", AWAITING_REPLY: "#f59e0b", NO_ANSWER: "#fb923c", POSTPONED: "#8b5cf6", CONFIRMED: "#10b981",
  CANCELLED: "#f43f5e", SHIPPED: "#06b6d4", IN_TRANSIT: "#3b82f6", DELIVERED: "#16a34a", RETURNED: "#ef4444",
};

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  await requireUser(["ADMIN", "MANAGER"]);
  const range = rangeFromParam((await searchParams).range);
  const [ds, settings] = await Promise.all([loadDataset(range), getSettings()]);
  const ov = overview(ds);
  const cur = settings.company.currency;
  const team = teamPerformance(ds);
  const products = productStats(ds).slice(0, 5);
  const cities = deliveryBy(ds, "city").slice(0, 8);
  const carriers = deliveryBy(ds, "carrier").slice(0, 6);
  const status = statusBreakdown(ds);

  return (
    <>
      <PageHeader title="Dashboard" subtitle={`Performance of ${settings.company.name}`} actions={<RangeTabs current={range.key} base="/app/dashboard" />} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Confirmation rate" value={pct(ov.confirmationRate)} hint={`${ov.confirmed} confirmed / ${ov.orders} orders`} ring={{ value: ov.confirmationRate }} />
        <Stat label="Delivery rate" value={pct(ov.deliveryRate)} hint={`${ov.delivered} delivered · ${ov.returned} returned`} ring={{ value: ov.deliveryRate, color: "#16a34a" }} />
        <Stat label="Net profit" icon={<Wallet className="h-3.5 w-3.5" />} value={money(ov.net, cur)} tone={ov.net >= 0 ? "good" : "bad"} hint={<Link className="text-brand-600 hover:underline" href={`/app/finance?range=${range.key}`}>See breakdown →</Link>} />
        <Stat label="Delivered revenue" icon={<ShoppingCart className="h-3.5 w-3.5" />} value={money(ov.revenue, cur)} hint={`Avg basket ${money(ov.avgBasket, cur)}`} />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Orders" value={ov.orders} hint={`${ov.pending} waiting for confirmation`} />
        <Stat label="Confirmed by automation" icon={<Bot className="h-3.5 w-3.5" />} value={ov.aiConfirmed} hint={`${pct(ov.confirmed ? ov.aiConfirmed / ov.confirmed : 0)} of confirmations (WhatsApp + AI)`} tone="brand" />
        <Stat label="On the road" icon={<Truck className="h-3.5 w-3.5" />} value={ov.inTransit} hint="Shipped, not yet delivered" />
        <Stat label="Ad spend" value={money(ov.ads, cur)} hint={`CPL ${money(ov.orders ? ov.ads / ov.orders : 0, cur)} · CPD ${money(ov.delivered ? ov.ads / ov.delivered : 0, cur)}`} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card title="Orders, confirmations & deliveries" className="xl:col-span-2">
          <OrdersChart data={timeseries(ds, range)} />
        </Card>
        <Card title="Orders by status">
          <Donut data={status.map((s) => ({ name: STATUS_META[s.status].label, value: s.value, color: STATUS_COLORS[s.status]! }))} center={String(ov.orders)} sub="orders" />
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            {status.map((s) => (
              <div key={s.status} className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLORS[s.status] }} />
                <span className="flex-1 text-slate-600">{STATUS_META[s.status].label}</span>
                <span className="font-semibold">{s.value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card title="Team performance" action={<Link href="/app/team" className="text-xs font-semibold text-brand-600">Manage team →</Link>} bodyClass="p-0">
          <table className="table-base">
            <thead>
              <tr><th>Agent</th><th>Orders</th><th>Confirmation</th><th>Delivery</th><th className="text-end">Commission</th></tr>
            </thead>
            <tbody>
              {team.map((a, i) => (
                <tr key={a.id} className={i === 0 ? "bg-amber-50/50" : ""}>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={a.name} color={a.color} size={28} />
                      <span className="font-medium">{a.name}</span>
                      {i === 0 && <Badge tone="amber">★ Top</Badge>}
                      {i === team.length - 1 && team.length > 2 && <Badge tone="red">Weak</Badge>}
                    </div>
                  </td>
                  <td className="font-semibold">{a.orders}</td>
                  <td><div className="flex items-center gap-2"><Bar value={a.confirmationRate} className="w-20" /><span className="text-xs font-semibold">{pct(a.confirmationRate)}</span></div></td>
                  <td><div className="flex items-center gap-2"><Bar value={a.deliveryRate} className="w-20" /><span className="text-xs font-semibold">{pct(a.deliveryRate)}</span></div></td>
                  <td className="text-end font-semibold">{money(a.commission, cur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Top products · profitability" action={<Link href="/app/products" className="text-xs font-semibold text-brand-600">All products →</Link>} bodyClass="p-0">
          <table className="table-base">
            <thead>
              <tr><th>Product</th><th>Conf.</th><th>Deliv.</th><th>Profit/piece</th><th className="text-end">Net profit</th></tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className={p.recommendation === "STOP" ? "bg-rose-50/40" : p.recommendation === "SCALE" ? "bg-emerald-50/40" : ""}>
                  <td>
                    <Link href={`/app/products/${p.id}`} className="flex items-center gap-2.5 hover:text-brand-700">
                      <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-lg">{p.emoji}</span>
                      <div>
                        <div className="font-medium">{p.name}</div>
                        <div className="text-[11px] text-slate-500">{p.leads} orders · {p.units} delivered</div>
                      </div>
                      {p.recommendation === "SCALE" && <Badge tone="green">Scale</Badge>}
                      {p.recommendation === "STOP" && <Badge tone="red">Stop</Badge>}
                    </Link>
                  </td>
                  <td>{pct(p.confirmationRate)}</td>
                  <td>{pct(p.deliveryRate)}</td>
                  <td className={p.profitPerPiece >= 0 ? "text-emerald-600" : "text-rose-600"}>{money(p.profitPerPiece, cur)}</td>
                  <td className={`text-end font-semibold ${p.net >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{p.net >= 0 ? "+" : ""}{money(p.net, cur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card title="Deliveries by city" action={<Link href="/app/reports" className="text-xs font-semibold text-brand-600">Reports →</Link>}>
          <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {cities.map((c) => (
              <div key={c.key} className="flex items-center gap-3 text-sm">
                <span className="w-24 truncate font-medium">{c.key}</span>
                <Bar value={c.rate} />
                <span className="w-10 text-end text-xs font-semibold">{pct(c.rate)}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Delivery companies">
          <div className="space-y-3">
            {carriers.map((c) => (
              <div key={c.key} className="flex items-center gap-3 text-sm">
                <span className="h-7 w-7 shrink-0 rounded-lg" style={{ background: c.color }} />
                <span className="w-28 truncate font-medium">{c.key}</span>
                <Bar value={c.rate} />
                <span className="w-24 text-end text-xs text-slate-500">{c.total} parcels</span>
                <span className="w-10 text-end text-xs font-semibold">{pct(c.rate)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
