import Link from "next/link";
import { and, asc, eq, gte, inArray, or, lte, isNull, type SQL } from "drizzle-orm";
import { Phone, MessageCircle } from "lucide-react";
import { db, t } from "@/lib/db";
import { isManager, requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { getOrderFull } from "@/lib/services/orders";
import { confirmationRate } from "@/lib/services/analytics";
import { Avatar, Badge, Card, PageHeader, Stat, StatusBadge } from "@/components/ui";
import { money, pct, timeAgo, CONFIRMED_LIKE } from "@/lib/utils";
import { OrderActions } from "../orders/[id]/order-client";

export const metadata = { title: "Call queue" };

export default async function QueuePage({ searchParams }: { searchParams: Promise<{ agent?: string; focus?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const manager = isManager(user);
  const settings = await getSettings();
  const agentId = manager ? (sp.agent ? Number(sp.agent) : null) : user.id;

  const now = new Date();
  const queueCond = or(
    inArray(t.orders.status, ["NEW", "ASSIGNED", "NO_ANSWER"]),
    and(eq(t.orders.status, "POSTPONED"), or(isNull(t.orders.postponedUntil), lte(t.orders.postponedUntil, now))),
  )!;
  const conds: SQL[] = [queueCond];
  if (agentId) conds.push(eq(t.orders.assignedToId, agentId));
  const queue = await db
    .select({
      id: t.orders.id, reference: t.orders.reference, status: t.orders.status, total: t.orders.total, attempts: t.orders.attempts,
      createdAt: t.orders.createdAt, city: t.orders.city, name: t.customers.name, phone: t.customers.phone, agent: t.users.name, agentColor: t.users.color,
    })
    .from(t.orders)
    .innerJoin(t.customers, eq(t.customers.id, t.orders.customerId))
    .leftJoin(t.users, eq(t.users.id, t.orders.assignedToId))
    .where(and(...conds))
    .orderBy(asc(t.orders.attempts), asc(t.orders.createdAt))
    .limit(100);

  const focusId = sp.focus ? Number(sp.focus) : queue[0]?.id;
  const focus = focusId ? await getOrderFull(focusId) : null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const mineToday = await db
    .select()
    .from(t.orders)
    .where(agentId ? and(eq(t.orders.assignedToId, agentId), gte(t.orders.createdAt, today)) : gte(t.orders.createdAt, today));
  const confirmedToday = mineToday.filter((o) => CONFIRMED_LIKE.includes(o.status)).length;
  const agents = manager ? await db.select().from(t.users).where(eq(t.users.role, "AGENT")) : [];
  const carriers = await db.select({ id: t.carriers.id, name: t.carriers.name }).from(t.carriers).where(eq(t.carriers.connected, true));
  const cur = settings.company.currency;
  const me = agentId ? (await db.select().from(t.users).where(eq(t.users.id, agentId)))[0] : null;

  return (
    <>
      <PageHeader
        title="Call queue"
        subtitle={settings.confirmation.mode === "AUTOMATION" ? "Automation mode: WhatsApp + AI confirm first; orders with no reply or needing a human land here." : "Team mode: your confirmers call every new order."}
        actions={
          manager && (
            <form className="flex gap-2">
              <select name="agent" defaultValue={sp.agent ?? ""} className="input w-auto">
                <option value="">All agents</option>
                {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <button className="btn-secondary">Show</button>
            </form>
          )
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-4">
        <Stat label="To call now" value={queue.length} tone="brand" />
        <Stat label="Orders today" value={mineToday.length} />
        <Stat label="Confirmed today" value={confirmedToday} tone="good" />
        <Stat label="Confirmation rate today" value={pct(confirmationRate(mineToday))} ring={{ value: confirmationRate(mineToday) }} hint={me && me.commissionConfirmed ? `Commission: ${money(confirmedToday * me.commissionConfirmed, cur)} today` : undefined} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <Card title={`Queue (${queue.length})`} bodyClass="p-0 max-h-[70vh] overflow-y-auto">
          {queue.map((q) => (
            <Link key={q.id} href={`/app/queue?focus=${q.id}${sp.agent ? `&agent=${sp.agent}` : ""}`} className={`flex items-center gap-3 border-b border-slate-50 px-4 py-3 hover:bg-slate-50 ${q.id === focusId ? "bg-brand-50" : ""}`}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{q.reference}</span>
                  <StatusBadge status={q.status} />
                </div>
                <div className="truncate text-xs text-slate-500">{q.name} · {q.city} · {money(q.total, cur)}</div>
              </div>
              <div className="text-end text-[11px] text-slate-400">
                <div>{timeAgo(q.createdAt)}</div>
                {q.attempts > 0 && <div className="text-orange-600">{q.attempts} tries</div>}
              </div>
              {manager && q.agent && <Avatar name={q.agent} color={q.agentColor ?? undefined} size={22} />}
            </Link>
          ))}
          {!queue.length && <div className="p-10 text-center text-sm text-slate-500">🎉 Queue is empty.</div>}
        </Card>

        {focus ? (
          <div className="space-y-4">
            <div className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Link href={`/app/orders/${focus.order.id}`} className="text-xl font-bold hover:text-brand-700">{focus.order.reference}</Link>
                    <StatusBadge status={focus.order.status} />
                    {focus.order.followUps > 0 && <Badge tone="amber">{focus.order.followUps} WhatsApp follow-ups, no reply</Badge>}
                  </div>
                  <div className="mt-1 text-lg">{focus.customer.name}</div>
                  <div className="text-sm text-slate-500">{focus.order.address} · <b>{focus.order.city}</b></div>
                </div>
                <div className="flex gap-2">
                  <a href={`tel:+${focus.customer.phone}`} className="btn-primary text-base"><Phone className="h-5 w-5" /> +{focus.customer.phone}</a>
                  <a href={`https://wa.me/${focus.customer.phone}`} target="_blank" className="btn-secondary"><MessageCircle className="h-5 w-5 text-emerald-600" /></a>
                </div>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {focus.items.map((i) => (
                  <div key={i.id} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
                    <span className="text-2xl">{i.emoji}</span>
                    <div className="flex-1">
                      <div className="font-medium">{i.quantity > 1 ? `${i.quantity}× ` : ""}{i.productName}</div>
                      <div className="text-xs text-slate-500">{i.variantName}{i.upsellNote ? ` · Upsell: ${i.upsellNote}` : ""}</div>
                    </div>
                    <div className="font-semibold">{money(i.unitPrice * i.quantity, cur)}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-xl border border-brand-100 bg-brand-50/60 p-4 text-sm leading-relaxed text-slate-700" dir="auto">
                <div className="mb-1 text-xs font-bold uppercase tracking-wide text-brand-700">Call script</div>
                السلام عليكم {focus.customer.name.split(" ")[0]}، معاك {me?.name ?? "فريق"} من {focus.store?.name ?? settings.company.name}. درتي طلب ديال {focus.items.map((i) => i.productName).join(" و ")} بثمن {focus.order.total} درهم، التوصيل لـ {focus.order.city}. واش نأكدو ليك الطلب؟
                {focus.items.some((i) => i.upsellNote) && <> 🎁 عرض: {focus.items.find((i) => i.upsellNote)?.upsellNote}</>}
              </div>
            </div>
            <OrderActions
              orderId={focus.order.id}
              status={focus.order.status}
              manager={manager}
              carriers={carriers}
              agents={agents.map((a) => ({ id: a.id, name: a.name }))}
              assignedToId={focus.order.assignedToId}
              customerId={focus.customer.id}
              blacklisted={focus.customer.blacklisted}
            />
          </div>
        ) : (
          <Card><div className="p-10 text-center text-slate-500">Nothing to call. Orders confirmed by WhatsApp/AI never reach this queue.</div></Card>
        )}
      </div>
    </>
  );
}
