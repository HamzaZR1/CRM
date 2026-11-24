import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { ArrowLeft, MapPin, Phone, Store, Truck } from "lucide-react";
import { db, t } from "@/lib/db";
import { isManager, requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { getOrderFull } from "@/lib/services/orders";
import { whatsappLive } from "@/lib/services/whatsapp";
import { Avatar, Badge, Card, StatusBadge } from "@/components/ui";
import { Conversation } from "@/components/conversation";
import { fmtDate, money } from "@/lib/utils";
import { OrderActions, DetailsEditor } from "./order-client";

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const full = await getOrderFull(Number(id));
  if (!full) notFound();
  const { order, customer, items, events, messages, agent, carrier, store, history } = full;
  if (!isManager(user) && order.assignedToId !== user.id) notFound();
  const settings = await getSettings();
  const cur = settings.company.currency;
  const carriers = await db.select({ id: t.carriers.id, name: t.carriers.name }).from(t.carriers).where(eq(t.carriers.connected, true));
  const agents = await db.select({ id: t.users.id, name: t.users.name }).from(t.users).where(and(eq(t.users.role, "AGENT"), eq(t.users.active, true)));
  const { created } = await searchParams;
  const delivered = history.filter((h) => h.status === "DELIVERED").length;
  const returned = history.filter((h) => h.status === "RETURNED").length;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Link href="/app/orders" className="btn-ghost px-2"><ArrowLeft className="h-4 w-4 rtl-flip" /></Link>
        <h1 className="text-2xl font-bold">{order.reference}</h1>
        <StatusBadge status={order.status} />
        {order.confirmedVia && <Badge tone="blue">Confirmed via {order.confirmedVia}</Badge>}
        {customer.blacklisted && <Badge tone="red">Blacklisted customer</Badge>}
        <span className="ms-auto text-sm text-slate-500">Created {fmtDate(order.createdAt)} · {order.source}</span>
      </div>
      {created && <div className="mb-4 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">Order {created} created and sent through the pipeline.</div>}

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <OrderActions
            orderId={order.id}
            status={order.status}
            manager={isManager(user)}
            carriers={carriers}
            agents={agents}
            assignedToId={order.assignedToId}
            customerId={customer.id}
            blacklisted={customer.blacklisted}
          />

          <div className="grid gap-4 md:grid-cols-2">
            <Card title="Customer">
              <div className="space-y-2 text-sm">
                <div className="text-base font-semibold">{customer.name}</div>
                <div className="flex items-center gap-2 text-slate-600"><Phone className="h-4 w-4" /> <a href={`tel:+${customer.phone}`} className="hover:underline">+{customer.phone}</a></div>
                <div className="flex items-start gap-2 text-slate-600"><MapPin className="mt-0.5 h-4 w-4" /> <span>{order.address ?? "—"}<br /><b>{order.city ?? "—"}</b></span></div>
                <div className="flex gap-2 pt-1">
                  <Badge tone="slate">{history.length} orders</Badge>
                  <Badge tone="green">{delivered} delivered</Badge>
                  {returned > 0 && <Badge tone="red">{returned} returned</Badge>}
                </div>
              </div>
              <DetailsEditor orderId={order.id} city={order.city ?? ""} address={order.address ?? ""} note={order.note ?? ""} />
            </Card>
            <Card title="Fulfilment">
              <div className="space-y-2.5 text-sm">
                <div className="flex items-center justify-between"><span className="text-slate-500">Store</span><span className="flex items-center gap-1.5 font-medium"><Store className="h-4 w-4" />{store?.name ?? "Manual"}</span></div>
                <div className="flex items-center justify-between"><span className="text-slate-500">Agent</span>{agent ? <span className="flex items-center gap-1.5 font-medium"><Avatar name={agent.name} color={agent.color} size={22} />{agent.name}</span> : <span>—</span>}</div>
                <div className="flex items-center justify-between"><span className="text-slate-500">Carrier</span><span className="flex items-center gap-1.5 font-medium"><Truck className="h-4 w-4" />{carrier?.name ?? "—"}</span></div>
                <div className="flex items-center justify-between"><span className="text-slate-500">Tracking</span><span className="font-mono text-xs">{order.trackingNumber ?? "—"}</span></div>
                <div className="flex items-center justify-between"><span className="text-slate-500">Call attempts</span><span>{order.attempts}</span></div>
                <div className="flex items-center justify-between"><span className="text-slate-500">WhatsApp follow-ups</span><span>{order.followUps}</span></div>
                {order.postponedUntil && order.status === "POSTPONED" && <div className="flex items-center justify-between"><span className="text-slate-500">Call back</span><span>{fmtDate(order.postponedUntil)}</span></div>}
                {order.note && <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">{order.note}</div>}
              </div>
            </Card>
          </div>

          <Card title="Items" bodyClass="p-0">
            <table className="table-base">
              <thead><tr><th>Product</th><th>Variant</th><th>Qty</th><th>Unit price</th><th className="text-end">Line total</th></tr></thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id}>
                    <td><Link href={`/app/products/${i.productId}`} className="font-medium hover:text-brand-700">{i.emoji} {i.productName}</Link></td>
                    <td>{i.variantName ?? "—"}</td>
                    <td>{i.quantity}</td>
                    <td>{money(i.unitPrice, cur)}</td>
                    <td className="text-end font-semibold">{money(i.unitPrice * i.quantity, cur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="space-y-1 border-t border-slate-100 px-5 py-3 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>{money(order.subtotal, cur)}</span></div>
              {order.discount > 0 && <div className="flex justify-between text-emerald-700"><span>Discount</span><span>−{money(order.discount, cur)}</span></div>}
              <div className="flex justify-between"><span className="text-slate-500">Delivery charged</span><span>{order.shippingPrice ? money(order.shippingPrice, cur) : "Free"}</span></div>
              <div className="flex justify-between text-base font-bold"><span>To collect (COD)</span><span>{money(order.total, cur)}</span></div>
              {isManager(user) && order.deliveryCost > 0 && <div className="flex justify-between text-xs text-slate-500"><span>Carrier cost (yours)</span><span>{money(order.deliveryCost, cur)}</span></div>}
            </div>
          </Card>

          <Card title="Timeline">
            <ol className="relative space-y-4 border-s border-slate-200 ps-5">
              {events.map((e) => (
                <li key={e.id} className="relative">
                  <span className="absolute -start-[25px] top-1 h-2.5 w-2.5 rounded-full bg-brand-500 ring-4 ring-white" />
                  <div className="text-sm">{e.message}</div>
                  <div className="text-xs text-slate-400">{fmtDate(e.createdAt)} · {e.type.toLowerCase().replace(/_/g, " ")}</div>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="xl:sticky xl:top-20 xl:h-[calc(100vh-6rem)]">
          <Conversation
            messages={messages.map((m) => ({ ...m, createdAt: m.createdAt.getTime() }))}
            phone={customer.phone}
            orderId={order.id}
            storeName={store?.name ?? settings.company.name}
            live={whatsappLive()}
          />
        </div>
      </div>
    </>
  );
}
