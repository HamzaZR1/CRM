import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { commissionsFor, loadDataset, overview, productStats, rangeFromParam, teamPerformance, timeseries } from "@/lib/services/analytics";
import { Avatar, Card, PageHeader, RangeTabs } from "@/components/ui";
import { RevenueBars } from "@/components/charts";
import { money, pct } from "@/lib/utils";

export const metadata = { title: "Net profit" };

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  await requireUser(["ADMIN", "MANAGER"]);
  const range = rangeFromParam((await searchParams).range);
  const [ds, settings] = await Promise.all([loadDataset(range), getSettings()]);
  const ov = overview(ds);
  const cur = settings.company.currency;
  const rows = [
    { label: "Revenue (delivered orders)", value: ov.revenue, color: "#3370fa" },
    { label: "Product cost", value: -ov.productCost, color: "#f87171" },
    { label: "Advertising", value: -ov.ads, color: "#f87171" },
    { label: "Team commissions", value: -ov.commissions, color: "#f87171" },
    { label: "Delivery & returns", value: -ov.delivery, color: "#f87171" },
  ];
  const max = Math.max(ov.revenue, 1);
  const team = teamPerformance(ds);
  const { total: commissions } = commissionsFor(ds);
  const products = productStats(ds);

  return (
    <>
      <PageHeader title="Net profit" subtitle="What actually stays in your pocket, after every cost." actions={<RangeTabs current={range.key} base="/app/finance" />} />
      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <section className="card p-6">
          <div className="text-sm font-semibold text-slate-500">Net profit</div>
          <div className={`mt-1 text-5xl font-extrabold tracking-tight ${ov.net >= 0 ? "text-slate-900" : "text-rose-600"}`}>
            {Math.round(ov.net).toLocaleString("fr-FR")} <span className="text-2xl font-bold text-slate-500">{cur}</span>
          </div>
          <div className="mt-1 text-sm text-slate-500">Margin {pct(ov.revenue ? ov.net / ov.revenue : 0)} of delivered revenue</div>
          <div className="mt-6 space-y-5">
            {rows.map((r) => (
              <div key={r.label}>
                <div className="mb-1.5 flex justify-between text-sm">
                  <span className="font-medium text-slate-700">{r.label}</span>
                  <span className={`font-bold ${r.value < 0 ? "text-rose-600" : ""}`}>{r.value < 0 ? "− " : ""}{money(Math.abs(r.value), cur)}</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full" style={{ width: `${(Math.abs(r.value) / max) * 100}%`, background: r.color }} />
                </div>
              </div>
            ))}
          </div>
        </section>
        <div className="space-y-4">
          <Card title="Delivered revenue per day"><RevenueBars data={timeseries(ds, range)} /></Card>
          <Card title={`Commissions · ${money(commissions, cur)}`} bodyClass="p-0">
            <table className="table-base">
              <thead><tr><th>Agent</th><th>Confirmed</th><th>Delivered</th><th className="text-end">To pay</th></tr></thead>
              <tbody>
                {team.map((a) => (
                  <tr key={a.id}><td><div className="flex items-center gap-2"><Avatar name={a.name} color={a.color} size={24} />{a.name}</div></td><td>{a.confirmed}</td><td>{a.delivered}</td><td className="text-end font-semibold">{money(a.commission, cur)}</td></tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      </div>
      <Card title="Profit by product" className="mt-4" bodyClass="p-0">
        <table className="table-base">
          <thead><tr><th>Product</th><th>Revenue</th><th>Product cost</th><th>Ads</th><th>Delivery</th><th>Commissions</th><th className="text-end">Net</th></tr></thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td className="font-medium">{p.emoji} {p.name}</td>
                <td>{money(p.revenue, cur)}</td>
                <td className="text-rose-600">−{money(p.cogs, cur)}</td>
                <td className="text-rose-600">−{money(p.ads, cur)}</td>
                <td className="text-rose-600">−{money(p.deliveryCost, cur)}</td>
                <td className="text-rose-600">−{money(p.commissions, cur)}</td>
                <td className={`text-end font-bold ${p.net >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{money(p.net, cur)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
