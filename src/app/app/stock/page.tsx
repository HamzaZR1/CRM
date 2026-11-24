import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { stockOverview } from "@/lib/services/stock";
import { Badge, PageHeader, Stat } from "@/components/ui";
import { money } from "@/lib/utils";
import { StockRow } from "./stock-client";

export const metadata = { title: "Stock" };

export default async function StockPage() {
  await requireUser(["ADMIN", "MANAGER"]);
  const [data, settings] = await Promise.all([stockOverview(), getSettings()]);
  const cur = settings.company.currency;
  const value = data.reduce((s, p) => s + p.value, 0);
  const alerts = data.reduce((s, p) => s + p.alerts, 0);

  return (
    <>
      <PageHeader title="Stock" subtitle="Units leave stock when a parcel is shipped and come back automatically on return." />
      <div className="mb-4 grid gap-4 sm:grid-cols-4">
        <Stat label="Stock value (cost)" value={money(value, cur)} tone="brand" />
        <Stat label="Units available" value={data.reduce((s, p) => s + p.available, 0)} />
        <Stat label="On the road" value={data.reduce((s, p) => s + p.inTransit, 0)} />
        <Stat label="Low-stock alerts" value={alerts} tone={alerts ? "bad" : "good"} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {data.map((p) => {
          const total = p.delivered + p.inTransit + p.returned + p.available || 1;
          return (
            <section key={p.product.id} className="card p-5">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-2xl">{p.product.emoji}</span>
                <div className="flex-1">
                  <div className="font-semibold">Stock · {p.product.name}</div>
                  <div className="text-xs text-slate-500">{p.variants.length} variant(s){p.reserved ? ` · ${p.reserved} reserved by confirmed orders` : ""}</div>
                </div>
                <div className="text-end">
                  <div className="text-xs text-slate-500">Available</div>
                  <div className="text-3xl font-bold">{p.available}</div>
                </div>
              </div>
              <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-slate-100">
                <div className="bg-emerald-500" style={{ width: `${(p.delivered / total) * 100}%` }} />
                <div className="bg-sky-500" style={{ width: `${(p.inTransit / total) * 100}%` }} />
                <div className="bg-rose-500" style={{ width: `${(p.returned / total) * 100}%` }} />
                <div className="bg-slate-400" style={{ width: `${(p.available / total) * 100}%` }} />
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                <span><span className="me-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />Delivered {p.delivered}</span>
                <span><span className="me-1 inline-block h-2 w-2 rounded-full bg-sky-500" />In transit {p.inTransit}</span>
                <span><span className="me-1 inline-block h-2 w-2 rounded-full bg-rose-500" />Returns {p.returned}</span>
                <span><span className="me-1 inline-block h-2 w-2 rounded-full bg-slate-400" />Available {p.available}</span>
              </div>
              <div className="mt-4 space-y-2">
                {p.variants.map((v) => (
                  <StockRow key={v.id} variant={{ id: v.id, name: v.name, color: v.color, stock: v.stock, threshold: v.lowStockThreshold, low: v.low }} />
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between rounded-xl bg-brand-50 px-4 py-3">
                <span className="text-sm text-slate-600">Stock value</span>
                <span className="text-lg font-bold text-brand-700">{money(p.value, cur)}</span>
              </div>
              {p.alerts > 0 && <div className="mt-2"><Badge tone="red">⚠ {p.alerts} variant(s) under threshold — reorder</Badge></div>}
            </section>
          );
        })}
      </div>
    </>
  );
}
