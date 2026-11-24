import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { ArrowLeft, ArrowUpCircle, XCircle } from "lucide-react";
import { db, t } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { deliveryBy, loadDataset, productStats, rangeFromParam } from "@/lib/services/analytics";
import { Badge, Bar, Card, RangeTabs, Ring } from "@/components/ui";
import { money, pct } from "@/lib/utils";
import { AddVariant, AdSpendForm, ProductForm, ProductToggle } from "../product-client";
import { REC } from "../rec";

function Metric({ label, value, hint, ring, color, highlight }: { label: string; value: string; hint: string; ring?: number; color?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${highlight ? "border-brand-200 bg-brand-50/50" : "border-slate-200 bg-white"}`}>
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-1 flex items-center justify-between">
        <div className="text-2xl font-bold">{value}</div>
        {ring !== undefined && <Ring value={ring} size={44} color={color} />}
      </div>
      <div className="mt-1 text-[11px] text-slate-500" dir="auto">{hint}</div>
    </div>
  );
}

export default async function ProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ range?: string }> }) {
  await requireUser(["ADMIN", "MANAGER"]);
  const id = Number((await params).id);
  const range = rangeFromParam((await searchParams).range);
  const [product] = await db.select().from(t.products).where(eq(t.products.id, id));
  if (!product) notFound();
  const [ds, settings, variants, spend] = await Promise.all([
    loadDataset(range),
    getSettings(),
    db.select().from(t.variants).where(eq(t.variants.productId, id)),
    db.select().from(t.adSpend).where(eq(t.adSpend.productId, id)).orderBy(desc(t.adSpend.date)).limit(14),
  ]);
  const s = productStats(ds).find((p) => p.id === id)!;
  const cur = settings.company.currency;
  const filtered = { ...ds, items: ds.items.filter((i) => i.productId === id) };
  filtered.orders = ds.orders.filter((o) => filtered.items.some((i) => i.orderId === o.id));
  const cities = deliveryBy(filtered, "city").slice(0, 6);
  const markerMax = Math.max(s.breakEvenCpl * 1.4, s.cpl * 1.2, 1);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Link href="/app/products" className="btn-ghost px-2"><ArrowLeft className="h-4 w-4 rtl-flip" /></Link>
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-2xl shadow-sm">{product.emoji}</span>
        <div>
          <h1 className="text-2xl font-bold">{product.name}</h1>
          <div className="text-sm text-slate-500">{money(product.price, cur)} · cost {money(product.cost, cur)} · {s.leads} orders in period</div>
        </div>
        <Badge tone={s.net >= 0 ? "green" : "red"}>Profit {s.net >= 0 ? "+" : ""}{money(s.net, cur)}</Badge>
        <div className="ms-auto flex flex-wrap gap-2"><RangeTabs current={range.key} base={`/app/products/${id}`} /><ProductForm product={product} /><ProductToggle id={id} active={product.active} /></div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Confirmation rate" value={pct(s.confirmationRate)} hint="شحال من طلبية تأكدات" ring={s.confirmationRate} />
        <Metric label="Delivery rate" value={pct(s.deliveryRate)} hint="شحال من طلبية توصلات" ring={s.deliveryRate} color="#16a34a" />
        <Metric label="CPL — cost per lead" value={money(s.cpl, cur)} hint="شحال كلفك الليد" />
        <Metric label="CPD — cost per delivered" value={money(s.cpd, cur)} hint="شحال كلفاتك الطلبية لي توصلات" />
        <Metric label="Upsell rate" value={pct(s.upsellRate)} hint="شحال زاد ليك" />
        <Metric label="ROI" value={pct(s.roi)} hint="شحال رجعو ليك الفلوس" highlight />
        <Metric label="Profit / piece" value={money(s.profitPerPiece, cur)} hint="الربح فكل قطعة" highlight />
        <Metric label="Delivered units" value={String(s.units)} hint={`${s.delivered} orders delivered · ${s.returned} returned`} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card title={`Break-even ${"Facebook"} · ${money(s.breakEvenCpl, cur)} / lead`} className="xl:col-span-2">
          <div className="relative mt-6 h-4 rounded-full bg-gradient-to-r from-emerald-200 via-emerald-300 to-rose-300">
            <div className="absolute -top-7 -translate-x-1/2 rounded-md bg-slate-900 px-2 py-0.5 text-[11px] font-bold text-white" style={{ left: `${Math.min(98, (s.cpl / markerMax) * 100)}%` }}>CPL {Math.round(s.cpl)}</div>
            <div className="absolute -top-1 h-6 w-1 -translate-x-1/2 rounded bg-slate-900" style={{ left: `${Math.min(98, (s.cpl / markerMax) * 100)}%` }} />
            <div className="absolute -top-1 h-6 w-0.5 -translate-x-1/2 bg-emerald-800" style={{ left: `${Math.min(98, (s.breakEvenCpl / markerMax) * 100)}%` }} />
            <div className="absolute top-6 -translate-x-1/2 text-[11px] font-semibold text-emerald-800" style={{ left: `${Math.min(98, (s.breakEvenCpl / markerMax) * 100)}%` }}>{Math.round(s.breakEvenCpl)}</div>
          </div>
          <p className="mt-9 text-sm text-slate-600" dir="auto">The highest cost per lead you can pay and still break even (أقصى ثمن تخلص على الليد بلا ما تخسر). It already accounts for confirmation rate, delivery rate, product cost, delivery fees and commissions.</p>
          <div className="mt-4">
            {s.recommendation === "SCALE" && (
              <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <ArrowUpCircle className="h-7 w-7 text-emerald-600" />
                <div className="flex-1"><div className="font-semibold text-emerald-800">Scale this product</div><div className="text-sm text-emerald-700">CPL {Math.round(s.cpl)} is well under break-even {Math.round(s.breakEvenCpl)}. Increase the budget.</div></div>
                <div className="text-lg font-bold text-emerald-700" dir="rtl">زيد فالميزانية</div>
              </div>
            )}
            {s.recommendation === "STOP" && (
              <div className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
                <XCircle className="h-7 w-7 text-rose-600" />
                <div className="flex-1"><div className="font-semibold text-rose-800">Stop or fix this product</div><div className="text-sm text-rose-700">CPL {Math.round(s.cpl)} is above break-even {Math.round(s.breakEvenCpl)} — every lead loses money.</div></div>
                <div className="text-lg font-bold text-rose-700" dir="rtl">وقفها</div>
              </div>
            )}
            {s.recommendation === "OPTIMIZE" && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Profitable but close to break-even: improve creatives, confirmation or delivery rate before scaling.</div>}
            {s.recommendation === "NO_DATA" && <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">{REC.NO_DATA.label} — at least 10 orders needed.</div>}
          </div>
        </Card>
        <Card title="Profit breakdown">
          {[
            ["Delivered revenue", s.revenue, false],
            ["Product cost", -s.cogs, true],
            ["Advertising", -s.ads, true],
            ["Delivery fees", -s.deliveryCost, true],
            ["Team commissions", -s.commissions, true],
          ].map(([label, v, neg]) => (
            <div key={String(label)} className="flex justify-between border-b border-slate-50 py-2 text-sm">
              <span className="text-slate-600">{label}</span>
              <span className={neg ? "text-rose-600" : "font-semibold"}>{money(Number(v), cur)}</span>
            </div>
          ))}
          <div className="flex justify-between pt-3 text-base font-bold"><span>Net profit</span><span className={s.net >= 0 ? "text-emerald-600" : "text-rose-600"}>{money(s.net, cur)}</span></div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card title="Variants & stock">
          <div className="space-y-2">
            {variants.map((v) => (
              <div key={v.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
                <span className="flex items-center gap-2">{v.color && <span className="h-3 w-3 rounded-full" style={{ background: v.color }} />}{v.name}</span>
                <span className={v.stock <= v.lowStockThreshold ? "font-bold text-rose-600" : "font-semibold"}>{v.stock}</span>
              </div>
            ))}
          </div>
          <div className="mt-3"><AddVariant productId={id} /></div>
        </Card>
        <Card title="Ad spend">
          <AdSpendForm productId={id} />
          <div className="mt-3 max-h-48 space-y-1 overflow-y-auto text-sm">
            {spend.map((a) => <div key={a.id} className="flex justify-between text-slate-600"><span>{a.date} · {a.platform}</span><span className="font-medium">{money(a.amount, cur)}</span></div>)}
          </div>
        </Card>
        <Card title="Delivery rate by city">
          <div className="space-y-2.5">
            {cities.map((c) => (
              <div key={c.key} className="flex items-center gap-3 text-sm"><span className="w-24 truncate">{c.key}</span><Bar value={c.rate} /><span className="w-10 text-end text-xs font-semibold">{pct(c.rate)}</span></div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
