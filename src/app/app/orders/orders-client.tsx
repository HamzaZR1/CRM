"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { Bot, MessageCircle, Phone, Plus, Zap } from "lucide-react";
import type { OrderStatus } from "@/lib/db/schema";
import { StatusBadge, Avatar } from "@/components/ui";
import { Modal, useAction, useFormResult } from "@/components/client";
import { money, timeAgo } from "@/lib/utils";
import {
  assignOrdersAction, bulkStatusAction, createManualOrderAction, getVariantsAction, shipOrdersAction, simulateStoreOrderAction,
} from "../actions";

type Row = {
  id: number; reference: string; status: OrderStatus; total: number; city: string | null; source: string; createdAt: number;
  confirmedVia: string | null; trackingNumber: string | null; customerName: string; phone: string; agentName: string | null;
  agentColor: string | null; carrierName: string | null; carrierColor: string | null; items: { qty: number; name: string; emoji: string }[];
};

export function OrdersTable({ rows, manager, currency, agents, carriers }: {
  rows: Row[]; manager: boolean; currency: string; agents: { id: number; name: string }[]; carriers: { id: number; name: string }[];
}) {
  const [sel, setSel] = useState<number[]>([]);
  const { pending, run } = useAction();
  const all = rows.length > 0 && sel.length === rows.length;
  const toggle = (id: number) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const done = () => setSel([]);

  return (
    <div className="card overflow-hidden">
      {manager && sel.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-brand-100 bg-brand-50 px-4 py-2.5 text-sm">
          <span className="font-semibold text-brand-800">{sel.length} selected</span>
          <select disabled={pending} className="input w-auto py-1.5" defaultValue="" onChange={(e) => { if (e.target.value) run(() => assignOrdersAction(sel, Number(e.target.value)), done); e.target.value = ""; }}>
            <option value="">Assign to…</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select disabled={pending} className="input w-auto py-1.5" defaultValue="" onChange={(e) => { if (e.target.value) run(() => shipOrdersAction(sel, Number(e.target.value)), done); e.target.value = ""; }}>
            <option value="">Send to carrier…</option>
            {carriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button disabled={pending} className="btn-success py-1.5" onClick={() => run(() => bulkStatusAction(sel, "CONFIRMED"), done)}>Confirm</button>
          <button disabled={pending} className="btn-secondary py-1.5" onClick={() => run(() => bulkStatusAction(sel, "CANCELLED"), done)}>Cancel</button>
          <button className="btn-ghost py-1.5" onClick={done}>Clear</button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              {manager && <th className="w-8"><input type="checkbox" checked={all} onChange={() => setSel(all ? [] : rows.map((r) => r.id))} /></th>}
              <th>Order</th><th>Customer</th><th>Products</th><th>Total</th><th>Status</th><th>Agent</th><th>Shipping</th><th className="text-end">Age</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={sel.includes(r.id) ? "bg-brand-50/50" : ""}>
                {manager && <td><input type="checkbox" checked={sel.includes(r.id)} onChange={() => toggle(r.id)} /></td>}
                <td>
                  <Link href={`/app/orders/${r.id}`} className="font-semibold text-brand-700 hover:underline">{r.reference}</Link>
                  <div className="text-[11px] uppercase tracking-wide text-slate-400">{r.source}</div>
                </td>
                <td>
                  <div className="font-medium">{r.customerName}</div>
                  <div className="text-xs text-slate-500">{r.city} · +{r.phone}</div>
                </td>
                <td className="max-w-[220px]">
                  {r.items.map((i, k) => (
                    <div key={k} className="truncate text-sm">{i.emoji} {i.qty > 1 && <b>{i.qty}× </b>}{i.name}</div>
                  ))}
                </td>
                <td className="whitespace-nowrap font-semibold">{money(r.total, currency)}</td>
                <td>
                  <div className="flex items-center gap-1.5">
                    <StatusBadge status={r.status} />
                    {r.confirmedVia === "AI" && <span title="Confirmed by AI agent"><Bot className="h-4 w-4 text-brand-600" /></span>}
                    {r.confirmedVia === "WHATSAPP" && <span title="Confirmed via WhatsApp button"><MessageCircle className="h-4 w-4 text-emerald-600" /></span>}
                    {r.confirmedVia === "CALL" && <span title="Confirmed by phone"><Phone className="h-3.5 w-3.5 text-slate-500" /></span>}
                  </div>
                </td>
                <td>{r.agentName ? <div className="flex items-center gap-1.5"><Avatar name={r.agentName} color={r.agentColor ?? undefined} size={22} /><span className="text-sm">{r.agentName}</span></div> : <span className="text-xs text-slate-400">—</span>}</td>
                <td>
                  {r.carrierName ? (
                    <div className="flex items-center gap-1.5 text-sm"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: r.carrierColor ?? "#999" }} />{r.carrierName}</div>
                  ) : <span className="text-xs text-slate-400">—</span>}
                  {r.trackingNumber && <div className="font-mono text-[10px] text-slate-400">{r.trackingNumber}</div>}
                </td>
                <td className="whitespace-nowrap text-end text-xs text-slate-500">{timeAgo(r.createdAt)}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={9} className="py-14 text-center text-sm text-slate-500">No orders found.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function NewOrderButton({ products }: { products: { id: number; name: string; price: number }[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createManualOrderAction, undefined);
  const [productId, setProductId] = useState<number>(products[0]?.id ?? 0);
  const [variants, setVariants] = useState<{ id: number; name: string; stock: number }[]>([]);
  const onResult = useFormResult();
  useEffect(() => onResult(state), [state]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (productId) getVariantsAction(productId).then(setVariants);
  }, [productId]);
  const price = products.find((p) => p.id === productId)?.price ?? 0;
  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New order</button>
      <Modal open={open} onClose={() => setOpen(false)} title="New order" wide>
        <form action={action} className="grid gap-4 sm:grid-cols-2">
          <div><label className="label">Customer name</label><input name="name" required className="input" /></div>
          <div><label className="label">Phone</label><input name="phone" required className="input" placeholder="06XXXXXXXX" /></div>
          <div><label className="label">City</label><input name="city" required className="input" /></div>
          <div><label className="label">Address</label><input name="address" className="input" /></div>
          <div>
            <label className="label">Product</label>
            <select name="productId" className="input" value={productId} onChange={(e) => setProductId(Number(e.target.value))}>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.price}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Variant</label>
            <select name="variantId" className="input">
              {variants.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.stock} in stock)</option>)}
            </select>
          </div>
          <div><label className="label">Quantity</label><input name="quantity" type="number" min={1} defaultValue={1} className="input" /></div>
          <div><label className="label">Unit price</label><input name="unitPrice" type="number" min={0} placeholder={String(price)} className="input" /></div>
          <div><label className="label">Delivery price charged</label><input name="shippingPrice" type="number" min={0} defaultValue={0} className="input" /></div>
          <div><label className="label">Note</label><input name="note" className="input" /></div>
          <p className="text-xs text-slate-500 sm:col-span-2">The order goes through the same pipeline as imported orders: smart assignment, then WhatsApp/AI or team confirmation.</p>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary" disabled={pending}>{pending ? "Creating…" : "Create order"}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function ImportDemoButton({ stores }: { stores: { id: number; name: string; platform: string }[] }) {
  const { pending, run } = useAction();
  if (!stores.length) return null;
  return (
    <div className="flex items-center gap-1">
      <select id="demo-store" className="input w-auto py-2" defaultValue={stores[0]!.id}>
        {stores.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.platform})</option>)}
      </select>
      <button
        className="btn-secondary"
        disabled={pending}
        title="Push a realistic order through the real webhook pipeline"
        onClick={() => run(() => simulateStoreOrderAction(Number((document.getElementById("demo-store") as HTMLSelectElement).value)))}
      >
        <Zap className="h-4 w-4 text-amber-500" /> Simulate import
      </button>
    </div>
  );
}
