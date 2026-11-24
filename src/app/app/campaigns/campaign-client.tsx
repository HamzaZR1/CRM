"use client";

import { useEffect, useState } from "react";
import { Send, Users } from "lucide-react";
import type { CampaignSegment } from "@/lib/db/schema";
import { useAction } from "@/components/client";
import { fillTemplate } from "@/lib/utils";
import { createCampaignAction, previewSegmentAction, sendCampaignAction } from "../actions";

export function CampaignBuilder({ products, cities, currency }: { products: { id: number; name: string; price: number; emoji: string }[]; cities: string[]; currency: string }) {
  const [name, setName] = useState("Nouvelle offre anciens clients");
  const [productId, setProductId] = useState<number>(products[0]?.id ?? 0);
  const [discount, setDiscount] = useState(20);
  const [message, setMessage] = useState("🎁 عرض جديد غير ليك {name}: {product} بـ {price} {currency} (-{discount}%) 🔥");
  const [segment, setSegment] = useState<CampaignSegment>({ status: "DELIVERED" });
  const [preview, setPreview] = useState<{ count: number; sample: string[] } | null>(null);
  const { pending, run } = useAction();

  useEffect(() => {
    const id = setTimeout(() => previewSegmentAction(segment).then(setPreview), 250);
    return () => clearTimeout(id);
  }, [segment]);

  const product = products.find((p) => p.id === productId);
  const rendered = fillTemplate(message, {
    name: "Salma",
    product: product?.name ?? "",
    price: product ? Math.round(product.price * (1 - discount / 100)) : 0,
    discount,
    currency,
  });

  return (
    <div className="card space-y-4 p-5">
      <h2 className="font-semibold">New campaign</h2>
      <div><label className="label">Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="grid grid-cols-[1fr_100px] gap-2">
        <div>
          <label className="label">Product on offer</label>
          <select className="input" value={productId} onChange={(e) => setProductId(Number(e.target.value))}>
            {products.map((p) => <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>)}
          </select>
        </div>
        <div><label className="label">Discount %</label><input type="number" min={0} max={90} className="input" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} /></div>
      </div>
      <div>
        <label className="label">Audience</label>
        <div className="grid grid-cols-2 gap-2">
          <select className="input" value={segment.status ?? "ANY"} onChange={(e) => setSegment({ ...segment, status: e.target.value as "ANY" | "DELIVERED" })}>
            <option value="DELIVERED">Customers with a delivered order</option>
            <option value="ANY">All past customers</option>
          </select>
          <select className="input" value={segment.city ?? ""} onChange={(e) => setSegment({ ...segment, city: e.target.value || undefined })}>
            <option value="">All cities</option>
            {cities.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select className="input" value={segment.boughtProductId ?? ""} onChange={(e) => setSegment({ ...segment, boughtProductId: Number(e.target.value) || undefined })}>
            <option value="">Bought any product</option>
            {products.map((p) => <option key={p.id} value={p.id}>Bought {p.name}</option>)}
          </select>
          <select className="input" value={segment.inactiveDays ?? ""} onChange={(e) => setSegment({ ...segment, inactiveDays: Number(e.target.value) || undefined })}>
            <option value="">Any recency</option>
            <option value="7">No order for 7+ days</option>
            <option value="14">No order for 14+ days</option>
            <option value="30">No order for 30+ days</option>
          </select>
        </div>
        <div className="mt-2 flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">
          <Users className="h-4 w-4" /> <b>{preview?.count ?? "…"}</b> customers{preview?.sample.length ? <span className="truncate text-xs text-brand-600">· {preview.sample.slice(0, 3).join(", ")}</span> : null}
        </div>
        <p className="mt-1 text-[11px] text-slate-500">Opted-out and blacklisted customers are always excluded.</p>
      </div>
      <div>
        <label className="label">Message · variables {"{name} {product} {price} {discount} {currency}"}</label>
        <textarea className="input" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} dir="auto" />
      </div>
      <div className="rounded-2xl bg-[#efe7dd] p-3">
        <div className="ms-auto max-w-[85%] rounded-xl rounded-tr-sm bg-[#dcf8c6] px-3 py-2 text-[13px] shadow-sm" dir="auto">
          {product && <div className="mb-1.5 grid h-20 place-items-center rounded-lg bg-white/70 text-4xl">{product.emoji}</div>}
          {rendered}
          <div className="mt-2 space-y-1 border-t border-black/5 pt-1.5 text-center text-[12px] font-semibold text-sky-700"><div>🛒 بغيت نطلب</div><div>🚫 ما مهتمش</div></div>
        </div>
      </div>
      <p className="text-[11px] text-slate-500">When a customer taps “🛒 بغيت نطلب”, ZCRM creates the order with the campaign price and runs it through confirmation automatically.</p>
      <div className="flex justify-end gap-2">
        <button className="btn-secondary" disabled={pending} onClick={() => run(() => createCampaignAction({ name, message, productId, discountPct: discount, segment, sendNow: false }))}>Save draft</button>
        <button className="btn-primary" disabled={pending || !preview?.count} onClick={() => run(() => createCampaignAction({ name, message, productId, discountPct: discount, segment, sendNow: true }))}>
          <Send className="h-4 w-4 rtl-flip" /> Send to {preview?.count ?? 0}
        </button>
      </div>
    </div>
  );
}

export function SendCampaignButton({ id }: { id: number }) {
  const { pending, run } = useAction();
  return <button className="btn-primary py-1 text-xs" disabled={pending} onClick={() => run(() => sendCampaignAction(id))}>Send</button>;
}
