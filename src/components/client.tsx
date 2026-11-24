"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import type { ActionResult } from "@/app/app/actions";
import { cn } from "@/lib/utils";

type Toast = { id: number; ok: boolean; message: string };

export function toast(ok: boolean, message: string) {
  window.dispatchEvent(new CustomEvent("zcrm-toast", { detail: { ok, message } }));
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ ok: boolean; message: string }>).detail;
      const id = Date.now() + Math.random();
      setItems((x) => [...x, { id, ...d }]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 4000);
    };
    window.addEventListener("zcrm-toast", on);
    return () => window.removeEventListener("zcrm-toast", on);
  }, []);
  return (
    <div className="fixed bottom-5 z-50 flex flex-col gap-2 ltr:right-5 rtl:left-5">
      {items.map((t) => (
        <div key={t.id} className={cn("card flex max-w-sm items-start gap-2 px-4 py-3 text-sm shadow-lg", t.ok ? "border-emerald-200" : "border-rose-200")}>
          {t.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

export function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult | void>, onDone?: (r: ActionResult | void) => void) =>
    start(async () => {
      const r = await fn();
      if (r && r.message) toast(r.ok, r.message);
      router.refresh();
      onDone?.(r);
    });
  return { pending, run };
}

export function ActionButton({
  action,
  children,
  className = "btn-secondary",
  confirm,
  title,
}: {
  action: () => Promise<ActionResult | void>;
  children: ReactNode;
  className?: string;
  confirm?: string;
  title?: string;
}) {
  const { pending, run } = useAction();
  return (
    <button
      type="button"
      title={title}
      className={className}
      disabled={pending}
      onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
        run(action);
      }}
    >
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className={cn("card max-h-[90vh] w-full overflow-y-auto", wide ? "max-w-3xl" : "max-w-lg")} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="btn-ghost px-2 py-1">✕</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function useFormResult() {
  const router = useRouter();
  return (r: ActionResult | undefined) => {
    if (r?.message) toast(r.ok, r.message);
    if (r?.ok) router.refresh();
  };
}
