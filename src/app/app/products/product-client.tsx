"use client";

import { useActionState, useEffect, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import type { Product } from "@/lib/db/schema";
import { Modal, useAction, useFormResult } from "@/components/client";
import { addAdSpendAction, addVariantAction, saveProductAction, toggleProductAction } from "../actions";

export function ProductForm({ product }: { product?: Product }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(saveProductAction, undefined);
  const onResult = useFormResult();
  useEffect(() => {
    onResult(state);
    if (state?.ok) setOpen(false);
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <button className={product ? "btn-secondary" : "btn-primary"} onClick={() => setOpen(true)}>
        {product ? <><Pencil className="h-4 w-4" /> Edit</> : <><Plus className="h-4 w-4" /> New product</>}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={product ? "Edit product" : "New product"} wide>
        <form action={action} className="grid gap-4 sm:grid-cols-2">
          {product && <input type="hidden" name="id" value={product.id} />}
          <div><label className="label">Name</label><input name="name" required defaultValue={product?.name} className="input" /></div>
          <div className="grid grid-cols-[80px_1fr] gap-2">
            <div><label className="label">Emoji</label><input name="emoji" defaultValue={product?.emoji ?? "📦"} className="input text-center" /></div>
            <div><label className="label">SKU</label><input name="sku" defaultValue={product?.sku ?? ""} className="input" /></div>
          </div>
          <div><label className="label">Selling price</label><input name="price" type="number" min={0} required defaultValue={product?.price} className="input" /></div>
          <div><label className="label">Unit cost (purchase)</label><input name="cost" type="number" min={0} required defaultValue={product?.cost ?? 0} className="input" /></div>
          {!product && (
            <div className="sm:col-span-2"><label className="label">Variants & initial stock</label><input name="variants" placeholder="Gold:60, Silver:26, Black:6" className="input" /></div>
          )}
          <div className="sm:col-span-2"><label className="label">Upsell offer (shown to agents & AI)</label><input name="upsellNote" defaultValue={product?.upsellNote ?? ""} placeholder="2 for 599 MAD" className="input" /></div>
          <div className="sm:col-span-2">
            <label className="label">Knowledge for the AI agent</label>
            <textarea name="aiNotes" rows={4} defaultValue={product?.aiNotes ?? ""} placeholder="Materials, sizes, guarantee, delivery time… The AI only answers from these facts." className="input" />
          </div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function ProductToggle({ id, active }: { id: number; active: boolean }) {
  const { pending, run } = useAction();
  return (
    <button disabled={pending} className="btn-secondary" onClick={() => run(() => toggleProductAction(id, !active))}>
      {active ? "Archive" : "Reactivate"}
    </button>
  );
}

export function AdSpendForm({ productId }: { productId: number }) {
  const { pending, run } = useAction();
  const [v, setV] = useState({ date: new Date().toISOString().slice(0, 10), amount: "", platform: "facebook" });
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div><label className="label">Date</label><input type="date" className="input" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} /></div>
      <div><label className="label">Platform</label>
        <select className="input" value={v.platform} onChange={(e) => setV({ ...v, platform: e.target.value })}>
          {["facebook", "tiktok", "google", "snapchat", "influencer"].map((p) => <option key={p}>{p}</option>)}
        </select>
      </div>
      <div><label className="label">Amount</label><input type="number" min={1} className="input w-28" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} /></div>
      <button className="btn-primary" disabled={pending || !v.amount} onClick={() => run(() => addAdSpendAction(productId, v.date, Number(v.amount), v.platform), () => setV({ ...v, amount: "" }))}>Add spend</button>
    </div>
  );
}

export function AddVariant({ productId }: { productId: number }) {
  const { pending, run } = useAction();
  const [name, setName] = useState("");
  const [stock, setStock] = useState("");
  return (
    <div className="flex gap-2">
      <input className="input" placeholder="New variant" value={name} onChange={(e) => setName(e.target.value)} />
      <input className="input w-24" type="number" placeholder="Stock" value={stock} onChange={(e) => setStock(e.target.value)} />
      <button className="btn-secondary" disabled={pending || !name} onClick={() => run(() => addVariantAction(productId, name, Number(stock)), () => { setName(""); setStock(""); })}>Add</button>
    </div>
  );
}
