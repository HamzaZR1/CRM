"use client";

import { useState } from "react";
import { useAction } from "@/components/client";
import { adjustStockAction, setThresholdAction } from "../actions";
import { cn } from "@/lib/utils";

export function StockRow({ variant }: { variant: { id: number; name: string; color: string | null; stock: number; threshold: number; low: boolean } }) {
  const [qty, setQty] = useState("");
  const { pending, run } = useAction();
  return (
    <div className={cn("flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2", variant.low ? "border-rose-200 bg-rose-50/60" : "border-slate-100")}>
      {variant.color && <span className="h-5 w-5 rounded-full ring-2 ring-white" style={{ background: variant.color }} />}
      <span className="min-w-20 font-medium">{variant.name}</span>
      {variant.low && <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white">{variant.stock <= 0 ? "Out of stock" : "Low stock"}</span>}
      <span className="ms-auto flex items-center gap-1 text-xs text-slate-500">
        alert ≤
        <input type="number" defaultValue={variant.threshold} className="w-14 rounded-md border border-slate-200 px-1.5 py-0.5" onBlur={(e) => Number(e.target.value) !== variant.threshold && run(() => setThresholdAction(variant.id, Number(e.target.value)))} />
      </span>
      <input type="number" placeholder="± qty" value={qty} onChange={(e) => setQty(e.target.value)} className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-sm" />
      <button disabled={pending || !qty} className="btn-secondary px-2.5 py-1 text-xs" onClick={() => run(() => adjustStockAction(variant.id, Number(qty), Number(qty) > 0 ? "IN" : "ADJUST"), () => setQty(""))}>Apply</button>
      <span className={cn("w-12 text-end text-2xl font-bold", variant.low ? "text-rose-600" : "")}>{variant.stock}</span>
    </div>
  );
}
