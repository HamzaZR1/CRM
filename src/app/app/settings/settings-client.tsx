"use client";

import { useState } from "react";
import type { AppSettings } from "@/lib/settings";
import { useAction } from "@/components/client";
import { saveSettingsAction } from "../actions";

export function CompanyForm({ company, stock }: { company: AppSettings["company"]; stock: AppSettings["stock"] }) {
  const [v, setV] = useState(company);
  const [threshold, setThreshold] = useState(stock.defaultLowStockThreshold);
  const { pending, run } = useAction();
  return (
    <div className="space-y-3">
      <div><label className="label">Company / store name</label><input className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Currency</label><input className="input" value={v.currency} onChange={(e) => setV({ ...v, currency: e.target.value.toUpperCase() })} /></div>
        <div><label className="label">Support phone</label><input className="input" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} /></div>
      </div>
      <div><label className="label">Default low-stock alert threshold</label><input type="number" className="input" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} /></div>
      <button className="btn-primary" disabled={pending} onClick={() => run(async () => { await saveSettingsAction("stock", { defaultLowStockThreshold: threshold }); return saveSettingsAction("company", v); })}>Save</button>
    </div>
  );
}

export function ShippingForm({ shipping, carriers }: { shipping: AppSettings["shipping"]; carriers: { id: number; name: string }[] }) {
  const [v, setV] = useState(shipping);
  const { pending, run } = useAction();
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.autoShipOnConfirm} onChange={(e) => setV({ ...v, autoShipOnConfirm: e.target.checked })} /> Send orders to the carrier automatically as soon as they are confirmed</label>
      <div>
        <label className="label">Default carrier</label>
        <select className="input" value={v.defaultCarrierId ?? ""} onChange={(e) => setV({ ...v, defaultCarrierId: Number(e.target.value) || null })}>
          <option value="">— choose —</option>
          {carriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <button className="btn-primary" disabled={pending} onClick={() => run(() => saveSettingsAction("shipping", v))}>Save</button>
    </div>
  );
}
