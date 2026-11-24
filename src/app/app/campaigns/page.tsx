import { eq, sql } from "drizzle-orm";
import { db, t } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { campaignResults } from "@/lib/services/campaigns";
import { Badge, Card, PageHeader, Stat } from "@/components/ui";
import { fmtDate, money, pct } from "@/lib/utils";
import { CampaignBuilder, SendCampaignButton } from "./campaign-client";

export const metadata = { title: "Campaigns" };

export default async function CampaignsPage() {
  await requireUser(["ADMIN", "MANAGER"]);
  const [results, settings, products, cityRows] = await Promise.all([
    campaignResults(),
    getSettings(),
    db.select({ id: t.products.id, name: t.products.name, price: t.products.price, emoji: t.products.emoji }).from(t.products).where(eq(t.products.active, true)),
    db.selectDistinct({ city: t.customers.city }).from(t.customers).where(sql`${t.customers.city} is not null`),
  ]);
  const cur = settings.company.currency;
  const sent = results.filter((r) => r.status === "SENT");

  return (
    <>
      <PageHeader title="WhatsApp campaigns" subtitle="Sell again to customers you already have — orders with a 0 MAD ad budget." />
      <div className="mb-4 grid gap-4 sm:grid-cols-4">
        <Stat label="Campaigns sent" value={sent.length} />
        <Stat label="Messages sent" value={sent.reduce((s, r) => s + r.recipients, 0)} />
        <Stat label="Orders generated" value={sent.reduce((s, r) => s + r.orders, 0)} tone="good" />
        <Stat label="Revenue · Ads budget 0" value={money(sent.reduce((s, r) => s + r.revenue, 0), cur)} tone="brand" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[440px_1fr]">
        <CampaignBuilder products={products} cities={cityRows.map((c) => c.city!).filter(Boolean).sort()} currency={cur} />
        <Card title="History" bodyClass="p-0">
          <table className="table-base">
            <thead><tr><th>Campaign</th><th>Audience</th><th>Orders</th><th>Conversion</th><th>Revenue</th><th></th></tr></thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className="font-semibold">{r.name}</div>
                    <div className="max-w-xs truncate text-xs text-slate-500" dir="auto">{r.message}</div>
                    <div className="text-[11px] text-slate-400">{r.sentAt ? `Sent ${fmtDate(r.sentAt)}` : "Draft"}{r.discountPct ? ` · -${r.discountPct}%` : ""}</div>
                  </td>
                  <td>{r.recipients || "—"}</td>
                  <td className="font-semibold">{r.orders}</td>
                  <td>{r.recipients ? pct(r.conversion, 1) : "—"}</td>
                  <td className="font-semibold text-emerald-600">{money(r.revenue, cur)}</td>
                  <td>{r.status === "DRAFT" ? <SendCampaignButton id={r.id} /> : <Badge tone="green">Sent</Badge>}</td>
                </tr>
              ))}
              {!results.length && <tr><td colSpan={6} className="py-10 text-center text-slate-500">No campaigns yet.</td></tr>}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
