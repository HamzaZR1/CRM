import Link from "next/link";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { db, t } from "@/lib/db";
import { isManager, requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { whatsappLive } from "@/lib/services/whatsapp";
import { Conversation } from "@/components/conversation";
import { Badge, PageHeader, StatusBadge } from "@/components/ui";
import { timeAgo } from "@/lib/utils";

export const metadata = { title: "WhatsApp inbox" };

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const user = await requireUser();
  const settings = await getSettings();
  const { c } = await searchParams;

  // Latest message per customer.
  const latest = await db
    .select({ customerId: t.messages.customerId, lastId: sql<number>`max(${t.messages.id})` })
    .from(t.messages)
    .where(sql`${t.messages.kind} != 'SYSTEM'`)
    .groupBy(t.messages.customerId)
    .orderBy(desc(sql`max(${t.messages.id})`))
    .limit(80);
  const lastIds = latest.map((l) => Number(l.lastId));
  const lastMsgs = lastIds.length ? await db.select().from(t.messages).where(inArray(t.messages.id, lastIds)) : [];
  const custIds = latest.map((l) => l.customerId);
  const customers = custIds.length ? await db.select().from(t.customers).where(inArray(t.customers.id, custIds)) : [];
  const orders = custIds.length
    ? await db.select({ id: t.orders.id, customerId: t.orders.customerId, status: t.orders.status, reference: t.orders.reference, assignedToId: t.orders.assignedToId }).from(t.orders).where(inArray(t.orders.customerId, custIds)).orderBy(desc(t.orders.id))
    : [];
  const latestOrder = new Map<number, (typeof orders)[number]>();
  for (const o of orders) if (!latestOrder.has(o.customerId)) latestOrder.set(o.customerId, o);

  let threads = latest.map((l) => ({
    customer: customers.find((x) => x.id === l.customerId)!,
    msg: lastMsgs.find((m) => m.id === Number(l.lastId))!,
    order: latestOrder.get(l.customerId),
  }));
  if (!isManager(user)) threads = threads.filter((th) => th.order?.assignedToId === user.id);

  const activeId = c ? Number(c) : threads[0]?.customer.id;
  const active = threads.find((th) => th.customer.id === activeId);
  const messages = activeId ? await db.select().from(t.messages).where(eq(t.messages.customerId, activeId)).orderBy(t.messages.id) : [];

  return (
    <>
      <PageHeader title="WhatsApp inbox" subtitle={`${whatsappLive() ? "Connected to WhatsApp Cloud API" : "Simulator mode — connect WhatsApp in Settings to go live"} · AI agent ${settings.ai.enabled ? "on" : "off"}`} />
      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <div className="card max-h-[78vh] overflow-y-auto">
          {threads.map((th) => (
            <Link key={th.customer.id} href={`/app/inbox?c=${th.customer.id}`} className={`block border-b border-slate-50 px-4 py-3 hover:bg-slate-50 ${th.customer.id === activeId ? "bg-brand-50" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-semibold">{th.customer.name}</span>
                <span className="text-[11px] text-slate-400">{timeAgo(th.msg.createdAt)}</span>
              </div>
              <div className="mt-0.5 flex items-center gap-1.5">
                {th.msg.direction === "IN" ? <Badge tone="green">Customer</Badge> : th.msg.author === "AI" ? <Badge tone="blue">AI</Badge> : <Badge tone="slate">{th.msg.author.toLowerCase()}</Badge>}
                <span className="truncate text-xs text-slate-500" dir="auto">{th.msg.body.split("\n")[0]}</span>
              </div>
              {th.order && <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">{th.order.reference} <StatusBadge status={th.order.status} className="py-0 text-[10px]" /></div>}
            </Link>
          ))}
          {!threads.length && <div className="p-8 text-center text-sm text-slate-500">No conversations yet. Set confirmation to Automation mode and import an order.</div>}
        </div>
        <div className="h-[78vh]">
          {active ? (
            <div className="grid h-full gap-4 xl:grid-cols-[1fr_260px]">
              <Conversation
                messages={messages.map((m) => ({ ...m, createdAt: m.createdAt.getTime() }))}
                phone={active.customer.phone}
                orderId={active.order?.id}
                storeName={settings.company.name}
                live={whatsappLive()}
              />
              <div className="card hidden space-y-3 p-4 text-sm xl:block">
                <div className="text-base font-semibold">{active.customer.name}</div>
                <div className="text-slate-500">+{active.customer.phone}</div>
                <div className="text-slate-500">{active.customer.city}</div>
                {active.order && (
                  <Link href={`/app/orders/${active.order.id}`} className="block rounded-xl bg-slate-50 p-3 hover:bg-slate-100">
                    <div className="text-xs text-slate-500">Current order</div>
                    <div className="font-semibold">{active.order.reference}</div>
                    <StatusBadge status={active.order.status} />
                  </Link>
                )}
                {active.customer.optOut && <Badge tone="red">Opted out of marketing</Badge>}
              </div>
            </div>
          ) : (
            <div className="card grid h-full place-items-center text-slate-500">Select a conversation</div>
          )}
        </div>
      </div>
    </>
  );
}
