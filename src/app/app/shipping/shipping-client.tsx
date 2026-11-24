"use client";

import { useState } from "react";
import { CheckCircle2, Plus, RefreshCw, Settings2 } from "lucide-react";
import { Modal, useAction } from "@/components/client";
import { pct } from "@/lib/utils";
import { addCarrierAction, runSchedulerAction, saveCarrierAction } from "../actions";

type C = { id: number; name: string; code: string; color: string; connected: boolean; adapter: string; apiUrl: string; hasKey: boolean; deliveryFee: number; returnFee: number };

export function CarrierCard({ carrier, stats, webhookUrl, canEdit }: { carrier: C; stats: { parcels: number; rate: number } | null; webhookUrl: string; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ ...carrier, apiKey: "" });
  const { pending, run } = useAction();
  return (
    <div className={`card relative p-4 ${carrier.connected ? "ring-2 ring-emerald-400/40" : ""}`}>
      {carrier.connected && <CheckCircle2 className="absolute end-3 top-3 h-5 w-5 text-emerald-500" />}
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl text-sm font-black text-white" style={{ background: carrier.color }}>{carrier.name.slice(0, 2).toUpperCase()}</span>
        <div>
          <div className="font-semibold">{carrier.name}</div>
          <div className="text-xs text-slate-500">{carrier.connected ? (carrier.adapter === "http" ? "API connected" : "Simulator") : "Not connected"}</div>
        </div>
      </div>
      <div className="mt-3 flex justify-between text-xs text-slate-500">
        <span>Fee {carrier.deliveryFee} · return {carrier.returnFee}</span>
        {stats && <span className="font-semibold text-slate-700">{stats.parcels} parcels · {pct(stats.rate)}</span>}
      </div>
      {canEdit && <button className="btn-secondary mt-3 w-full py-1.5 text-xs" onClick={() => setOpen(true)}><Settings2 className="h-3.5 w-3.5" /> Configure</button>}
      <Modal open={open} onClose={() => setOpen(false)} title={`Configure ${carrier.name}`}>
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={v.connected} onChange={(e) => setV({ ...v, connected: e.target.checked })} /> Connected (available when shipping)</label>
          <div>
            <label className="label">Integration</label>
            <select className="input" value={v.adapter} onChange={(e) => setV({ ...v, adapter: e.target.value })}>
              <option value="simulator">Simulator (statuses progress automatically)</option>
              <option value="http">HTTP API (REST adapter)</option>
            </select>
          </div>
          {v.adapter === "http" && (
            <>
              <div><label className="label">API base URL</label><input className="input" value={v.apiUrl} onChange={(e) => setV({ ...v, apiUrl: e.target.value })} placeholder="https://api.carrier.ma/v1" /></div>
              <div><label className="label">API key {carrier.hasKey && "(saved — leave empty to keep)"}</label><input className="input" type="password" value={v.apiKey} onChange={(e) => setV({ ...v, apiKey: e.target.value })} /></div>
              <p className="text-xs text-slate-500">ZCRM calls <code>POST /shipments</code> and <code>GET /shipments/:tracking</code> with a Bearer token.</p>
            </>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Delivery fee</label><input type="number" className="input" value={v.deliveryFee} onChange={(e) => setV({ ...v, deliveryFee: Number(e.target.value) })} /></div>
            <div><label className="label">Return fee</label><input type="number" className="input" value={v.returnFee} onChange={(e) => setV({ ...v, returnFee: Number(e.target.value) })} /></div>
          </div>
          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            Status webhook for {carrier.name}:<br /><code className="break-all text-brand-700">{webhookUrl}</code>
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary" disabled={pending} onClick={() => run(() => saveCarrierAction(carrier.id, v), () => setOpen(false))}>Save</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export function AddCarrier() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#0ea5e9");
  const { pending, run } = useAction();
  return (
    <>
      <button className="btn-ghost py-1 text-xs" onClick={() => setOpen(true)}><Plus className="h-3.5 w-3.5" /> Add carrier</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add a delivery company">
        <div className="space-y-3">
          <div><label className="label">Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><label className="label">Brand color</label><input type="color" className="h-10 w-20" value={color} onChange={(e) => setColor(e.target.value)} /></div>
          <div className="flex justify-end"><button className="btn-primary" disabled={pending || !name} onClick={() => run(() => addCarrierAction(name, color), () => setOpen(false))}>Add</button></div>
        </div>
      </Modal>
    </>
  );
}

export function SyncButton() {
  const { pending, run } = useAction();
  return (
    <button className="btn-secondary" disabled={pending} onClick={() => run(() => runSchedulerAction())}>
      <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} /> Sync now
    </button>
  );
}
