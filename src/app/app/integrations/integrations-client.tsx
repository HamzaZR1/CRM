"use client";

import { useState } from "react";
import { Copy, Plus, RotateCcw, Trash2, Zap } from "lucide-react";
import type { Platform } from "@/lib/db/schema";
import { Modal, toast, useAction } from "@/components/client";
import { Badge } from "@/components/ui";
import { createStoreAction, deleteStoreAction, simulateStoreOrderAction, updateStoreAction } from "../actions";

const LABEL: Record<string, string> = { youcan: "YouCan", shopify: "Shopify", woocommerce: "WooCommerce", api: "Custom / API" };
const HELP: Record<string, string> = {
  youcan: "YouCan dashboard → Settings → Webhooks → add « order.create » with this URL.",
  shopify: "Shopify admin → Settings → Notifications → Webhooks → « Order creation » (JSON). Paste the webhook signing secret below to verify HMAC.",
  woocommerce: "WordPress → WooCommerce → Settings → Advanced → Webhooks → « Order created », API version v3. Use the same secret below.",
  api: "POST the ZCRM JSON format (see below) from your landing page or automation tool.",
};

export function StoreCard({ store, url, orders, lastOrder, canEdit }: {
  store: { id: number; name: string; platform: Platform; domain: string | null; active: boolean; hasSecret: boolean }; url: string; orders: number; lastOrder: string | null; canEdit: boolean;
}) {
  const { pending, run } = useAction();
  const [secret, setSecret] = useState("");
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><span className="text-lg font-semibold">{store.name}</span><Badge tone="blue">{LABEL[store.platform] ?? store.platform}</Badge>{store.active ? <Badge tone="green">Active</Badge> : <Badge tone="red">Paused</Badge>}</div>
          <div className="text-sm text-slate-500">{store.domain ?? "—"} · {orders} orders{lastOrder ? ` · last ${lastOrder} ago` : ""}</div>
        </div>
        <button className="btn-secondary py-1.5 text-xs" disabled={pending} onClick={() => run(() => simulateStoreOrderAction(store.id))}><Zap className="h-3.5 w-3.5 text-amber-500" /> Test order</button>
      </div>
      <label className="label mt-4">Webhook URL</label>
      <div className="flex gap-2">
        <input readOnly value={url} className="input font-mono text-xs" />
        <button className="btn-secondary px-2.5" onClick={() => { navigator.clipboard.writeText(url); toast(true, "Webhook URL copied"); }}><Copy className="h-4 w-4" /></button>
      </div>
      <p className="mt-2 text-xs text-slate-500">{HELP[store.platform]}</p>
      {canEdit && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          <input type="password" placeholder={store.hasSecret ? "Signing secret saved — replace…" : "Signing secret (optional)"} value={secret} onChange={(e) => setSecret(e.target.value)} className="input max-w-xs py-1.5 text-xs" />
          <button className="btn-secondary py-1.5 text-xs" disabled={pending || !secret} onClick={() => run(() => updateStoreAction(store.id, { secret }), () => setSecret(""))}>Save secret</button>
          <button className="btn-ghost py-1.5 text-xs" disabled={pending} onClick={() => run(() => updateStoreAction(store.id, { active: !store.active }))}>{store.active ? "Pause" : "Activate"}</button>
          <button className="btn-ghost py-1.5 text-xs" disabled={pending} title="Generate a new URL (the old one stops working)" onClick={() => confirm("Rotate the webhook URL? The current URL will stop working.") && run(() => updateStoreAction(store.id, { rotate: true }))}><RotateCcw className="h-3.5 w-3.5" /> Rotate URL</button>
          <button className="btn-ghost ms-auto py-1.5 text-xs text-rose-600" disabled={pending} onClick={() => confirm(`Remove ${store.name}? Existing orders are kept.`) && run(() => deleteStoreAction(store.id))}><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      )}
    </div>
  );
}

export function NewStore() {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ name: "", platform: "youcan" as Platform, domain: "", secret: "" });
  const { pending, run } = useAction();
  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Connect a store</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Connect a store">
        <div className="space-y-3">
          <div><label className="label">Platform</label>
            <div className="grid grid-cols-4 gap-2">
              {(["youcan", "shopify", "woocommerce", "api"] as Platform[]).map((p) => (
                <button key={p} type="button" onClick={() => setV({ ...v, platform: p })} className={`rounded-xl border-2 px-2 py-3 text-xs font-semibold ${v.platform === p ? "border-brand-500 bg-brand-50" : "border-slate-200"}`}>{LABEL[p]}</button>
              ))}
            </div>
          </div>
          <div><label className="label">Store name</label><input className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></div>
          <div><label className="label">Domain</label><input className="input" value={v.domain} onChange={(e) => setV({ ...v, domain: e.target.value })} placeholder="mystore.ma" /></div>
          <div><label className="label">Signing secret (optional)</label><input className="input" value={v.secret} onChange={(e) => setV({ ...v, secret: e.target.value })} /></div>
          <p className="text-xs text-slate-500">{HELP[v.platform]}</p>
          <div className="flex justify-end"><button className="btn-primary" disabled={pending || !v.name} onClick={() => run(() => createStoreAction(v.name, v.platform, v.domain, v.secret), () => setOpen(false))}>Connect</button></div>
        </div>
      </Modal>
    </>
  );
}
