import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { deliveryBy, loadDataset, overview, rangeFromParam, sourceBreakdown, teamPerformance } from "@/lib/services/analytics";
import { Avatar, Bar, Card, PageHeader, RangeTabs, Stat } from "@/components/ui";
import { cn, pct } from "@/lib/utils";

export const metadata = { title: "Reports" };

const DIMS = [["city", "Cities"], ["carrier", "Carriers"], ["product", "Products"]] as const;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ range?: string; dim?: string }> }) {
  await requireUser(["ADMIN", "MANAGER"]);
  const sp = await searchParams;
  const range = rangeFromParam(sp.range);
  const dim = (DIMS.find(([k]) => k === sp.dim)?.[0] ?? "city") as "city" | "carrier" | "product";
  const ds = await loadDataset(range);
  const ov = overview(ds);
  const rows = deliveryBy(ds, dim);
  const team = teamPerformance(ds);
  const sources = sourceBreakdown(ds);

  return (
    <>
      <PageHeader title="Reports" subtitle="Find where you lose parcels — by city, carrier and product." actions={<RangeTabs current={range.key} base="/app/reports" extra={`&dim=${dim}`} />} />
      <div className="mb-4 grid gap-4 sm:grid-cols-4">
        <Stat label="Delivery rate" value={pct(ov.deliveryRate)} ring={{ value: ov.deliveryRate, color: "#16a34a" }} />
        <Stat label="Return rate" value={pct(1 - ov.deliveryRate)} tone="bad" />
        <Stat label="Confirmation rate" value={pct(ov.confirmationRate)} ring={{ value: ov.confirmationRate }} />
        <Stat label="Cancelled" value={ov.cancelled} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <Card
          title="Delivery rate"
          action={
            <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs">
              {DIMS.map(([k, label]) => (
                <Link key={k} href={`/app/reports?range=${range.key}&dim=${k}`} className={cn("rounded-lg px-3 py-1 font-semibold", dim === k ? "bg-white shadow-sm" : "text-slate-500")}>{label}</Link>
              ))}
            </div>
          }
        >
          <div className="space-y-4">
            {rows.map((r) => (
              <div key={r.key} className="flex items-center gap-4 text-sm">
                {r.color && <span className="h-6 w-6 shrink-0 rounded-md" style={{ background: r.color }} />}
                <span className="w-32 truncate font-medium">{r.key}</span>
                <Bar value={r.rate} className="h-2.5" />
                <span className="w-28 text-end text-xs text-slate-500">{r.delivered}/{r.delivered + r.returned} final</span>
                <span className="w-12 text-end font-bold">{pct(r.rate)}</span>
              </div>
            ))}
            {!rows.length && <div className="text-sm text-slate-500">No shipped orders in this period.</div>}
          </div>
        </Card>
        <div className="space-y-4">
          <Card title="Confirmation by agent">
            <div className="space-y-3">
              {team.map((a) => (
                <div key={a.id} className="flex items-center gap-3 text-sm">
                  <Avatar name={a.name} color={a.color} size={26} />
                  <span className="w-20 truncate font-medium">{a.name}</span>
                  <Bar value={a.confirmationRate} />
                  <span className="w-10 text-end font-semibold">{pct(a.confirmationRate)}</span>
                  <span className="w-20 text-end text-xs text-slate-500">upsell {pct(a.upsellRate)}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card title="Orders by source">
            <div className="space-y-2.5">
              {sources.map((s) => (
                <div key={s.source} className="flex items-center gap-3 text-sm">
                  <span className="w-24 capitalize">{s.source}</span>
                  <Bar value={ds.orders.length ? s.value / ds.orders.length : 0} color="#3370fa" />
                  <span className="w-12 text-end font-semibold">{s.value}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
