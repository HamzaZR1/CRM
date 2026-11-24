"use client";

import { useState } from "react";
import { Ban, CalendarClock, Check, MessageCircle, PhoneOff, Tag, Truck, X } from "lucide-react";
import type { OrderStatus } from "@/lib/db/schema";
import { useAction } from "@/components/client";
import {
  applyOfferAction, assignOrdersAction, blacklistCustomerAction, sendWhatsAppConfirmationAction, setOrderStatusAction, shipOrdersAction, updateOrderAction,
} from "../../actions";

const PENDING: OrderStatus[] = ["NEW", "ASSIGNED", "AWAITING_REPLY", "NO_ANSWER", "POSTPONED"];

export function OrderActions(props: {
  orderId: number; status: OrderStatus; manager: boolean; carriers: { id: number; name: string }[]; agents: { id: number; name: string }[];
  assignedToId: number | null; customerId: number; blacklisted: boolean;
}) {
  const { orderId, status, manager } = props;
  const { pending, run } = useAction();
  const [hours, setHours] = useState(24);
  const [offer, setOffer] = useState(10);
  const pendingConfirm = PENDING.includes(status);

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center gap-2">
        {pendingConfirm && (
          <>
            <button disabled={pending} className="btn-success" onClick={() => run(() => setOrderStatusAction(orderId, "CONFIRMED"))}><Check className="h-4 w-4" /> Confirm</button>
            <button disabled={pending} className="btn-secondary" onClick={() => run(() => setOrderStatusAction(orderId, "NO_ANSWER"))}><PhoneOff className="h-4 w-4" /> No answer</button>
            <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white ps-2">
              <CalendarClock className="h-4 w-4 text-slate-400" />
              <select value={hours} onChange={(e) => setHours(Number(e.target.value))} className="bg-transparent py-2 text-sm outline-none">
                {[2, 4, 24, 48, 72].map((h) => <option key={h} value={h}>{h < 24 ? `${h}h` : `${h / 24}d`}</option>)}
              </select>
              <button disabled={pending} className="btn-ghost" onClick={() => run(() => setOrderStatusAction(orderId, "POSTPONED", { postponeHours: hours }))}>Postpone</button>
            </div>
            <button disabled={pending} className="btn-secondary text-rose-600" onClick={() => run(() => setOrderStatusAction(orderId, "CANCELLED"))}><X className="h-4 w-4" /> Cancel</button>
            <button disabled={pending} className="btn-secondary" onClick={() => run(() => sendWhatsAppConfirmationAction(orderId))}><MessageCircle className="h-4 w-4 text-emerald-600" /> Send WhatsApp</button>
            <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white ps-2">
              <Tag className="h-4 w-4 text-slate-400" />
              <input type="number" min={0} max={50} value={offer} onChange={(e) => setOffer(Number(e.target.value))} className="w-12 bg-transparent py-2 text-sm outline-none" />%
              <button disabled={pending} className="btn-ghost" onClick={() => run(() => applyOfferAction(orderId, offer, true))}>Offer + free delivery</button>
            </div>
          </>
        )}
        {status === "CONFIRMED" && manager && (
          <select disabled={pending} className="input w-auto" defaultValue="" onChange={(e) => { if (e.target.value) run(() => shipOrdersAction([orderId], Number(e.target.value))); }}>
            <option value="">🚚 Send to carrier…</option>
            {props.carriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        {status === "CONFIRMED" && <button disabled={pending} className="btn-secondary text-rose-600" onClick={() => run(() => setOrderStatusAction(orderId, "CANCELLED"))}><X className="h-4 w-4" /> Cancel</button>}
        {(status === "SHIPPED" || status === "IN_TRANSIT") && manager && (
          <>
            <button disabled={pending} className="btn-success" onClick={() => run(() => setOrderStatusAction(orderId, "DELIVERED"))}><Truck className="h-4 w-4" /> Mark delivered</button>
            <button disabled={pending} className="btn-secondary text-rose-600" onClick={() => run(() => setOrderStatusAction(orderId, "RETURNED"))}>Mark returned</button>
          </>
        )}
        {status === "CANCELLED" && <button disabled={pending} className="btn-secondary" onClick={() => run(() => setOrderStatusAction(orderId, "ASSIGNED"))}>Reopen</button>}

        {manager && (
          <div className="ms-auto flex items-center gap-2">
            <select disabled={pending} className="input w-auto py-1.5 text-xs" value={props.assignedToId ?? ""} onChange={(e) => run(() => assignOrdersAction([orderId], Number(e.target.value)))}>
              <option value="" disabled>Assign…</option>
              {props.agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <button disabled={pending} title={props.blacklisted ? "Remove from blacklist" : "Blacklist this customer"} className="btn-ghost px-2 text-rose-600" onClick={() => run(() => blacklistCustomerAction(props.customerId, !props.blacklisted))}>
              <Ban className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function DetailsEditor({ orderId, city, address, note }: { orderId: number; city: string; address: string; note: string }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ city, address, note });
  const { pending, run } = useAction();
  if (!open) return <button className="mt-3 text-xs font-semibold text-brand-600 hover:underline" onClick={() => setOpen(true)}>Edit address / note</button>;
  return (
    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
      <input className="input" value={v.city} onChange={(e) => setV({ ...v, city: e.target.value })} placeholder="City" />
      <input className="input" value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} placeholder="Address" />
      <input className="input" value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} placeholder="Note for delivery" />
      <div className="flex justify-end gap-2">
        <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
        <button className="btn-primary" disabled={pending} onClick={() => run(() => updateOrderAction(orderId, v), () => setOpen(false))}>Save</button>
      </div>
    </div>
  );
}
