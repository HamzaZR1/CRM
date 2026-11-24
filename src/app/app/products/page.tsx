import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { loadDataset, productStats, rangeFromParam } from "@/lib/services/analytics";
import { Badge, PageHeader, RangeTabs } from "@/components/ui";
import { money, pct } from "@/lib/utils";
import { ProductForm } from "./product-client";
import { REC } from "./rec";

export const metadata = { title: "Products" };


export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  await requireUser(["ADMIN", "MANAGER"]);
  const range = rangeFromParam((await searchParams).range);
  const [ds, settings] = await Promise.all([loadDataset(range), getSettings()]);
  const stats = productStats(ds);
  const active = new Map(ds.products.map((p) => [p.id, p.active]));
  const cur = settings.company.currency;

  return (
    <>
      <PageHeader title="Products" subtitle="Real profitability per product: ads, product cost, delivery and team commissions included." actions={<><RangeTabs current={range.key} base="/app/products" /><ProductForm /></>} />
      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Product</th><th>Price / cost</th><th>Orders</th><th>Confirm.</th><th>Delivery</th><th>CPL</th><th>Break-even CPL</th><th>ROI</th><th>Net profit</th><th>Advice</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((p) => (
              <tr key={p.id} className={active.get(p.id) ? "" : "opacity-50"}>
                <td>
                  <Link href={`/app/products/${p.id}?range=${range.key}`} className="flex items-center gap-3 hover:text-brand-700">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-xl">{p.emoji}</span>
                    <span className="font-semibold">{p.name}</span>
                  </Link>
                </td>
                <td className="whitespace-nowrap">{money(p.price, cur)}<div className="text-xs text-slate-500">cost {money(p.cost, cur)}</div></td>
                <td>{p.leads}</td>
                <td>{pct(p.confirmationRate)}</td>
                <td>{pct(p.deliveryRate)}</td>
                <td className="whitespace-nowrap">{money(p.cpl, cur)}</td>
                <td className="whitespace-nowrap">{money(p.breakEvenCpl, cur)}</td>
                <td className={p.roi >= 0 ? "text-emerald-600" : "text-rose-600"}>{pct(p.roi)}</td>
                <td className={`whitespace-nowrap font-semibold ${p.net >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{money(p.net, cur)}</td>
                <td><Badge tone={REC[p.recommendation].tone}>{REC[p.recommendation].label}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
