import { desc, sql } from "drizzle-orm";
import { db, t } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { timeAgo } from "@/lib/utils";
import { NewStore, StoreCard } from "./integrations-client";

export const metadata = { title: "Integrations" };

export default async function IntegrationsPage() {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  const stores = await db.select().from(t.stores).orderBy(desc(t.stores.id));
  const stats = await db
    .select({ storeId: t.orders.storeId, n: sql<number>`count(*)`, last: sql<number>`max(${t.orders.createdAt})` })
    .from(t.orders)
    .groupBy(t.orders.storeId);
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const example = JSON.stringify(
    { id: "LP-10023", customer: { name: "Salma Benali", phone: "0612345678", city: "Casablanca", address: "12 Rue Ibn Sina" }, items: [{ name: "Montre Classic Gold", variant: "Or", quantity: 1, price: 349 }], shippingPrice: 0, note: "Livrer après 18h" },
    null,
    2,
  );

  return (
    <>
      <PageHeader title="Integrations" subtitle="Connect your stores — orders arrive automatically, then get assigned and confirmed." actions={user.role === "ADMIN" && <NewStore />} />
      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        {[
          ["YouCan", "#e11d48", "Webhook « order.create »"],
          ["Shopify", "#16a34a", "Webhook « Order creation »"],
          ["WooCommerce", "#7c3aed", "WordPress · Webhook « Order created »"],
          ["Custom / API", "#1d52ef", "Landing pages, Google Sheets, Make, Zapier"],
        ].map(([name, color, hint]) => (
          <div key={name} className="card flex items-center gap-3 p-4">
            <span className="grid h-10 w-10 place-items-center rounded-xl text-sm font-black text-white" style={{ background: color }}>{name!.slice(0, 2)}</span>
            <div><div className="font-semibold">{name}</div><div className="text-xs text-slate-500">{hint}</div></div>
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {stores.map((s) => {
          const st = stats.find((x) => x.storeId === s.id);
          return (
            <StoreCard
              key={s.id}
              store={{ id: s.id, name: s.name, platform: s.platform, domain: s.domain, active: s.active, hasSecret: Boolean(s.webhookSecret) }}
              url={`${appUrl}/api/webhooks/orders/${s.webhookKey}`}
              orders={Number(st?.n ?? 0)}
              lastOrder={st?.last ? timeAgo(Number(st.last)) : null}
              canEdit={user.role === "ADMIN"}
            />
          );
        })}
      </div>
      <Card title="Custom store / API format" className="mt-6">
        <p className="mb-3 text-sm text-slate-600">For any source (landing page, form, script): create a store with platform “Custom / API”, then <code>POST</code> JSON to its webhook URL. Optional HMAC: header <code>X-ZCRM-Signature: sha256(hex) of the raw body</code> with the store secret.</p>
        <pre className="overflow-x-auto rounded-xl bg-slate-900 p-4 text-xs text-slate-100">{example}</pre>
      </Card>
    </>
  );
}
