import type { ReactNode } from "react";
import type { OrderStatus } from "@/lib/db/schema";
import { cn, initials, STATUS_META } from "@/lib/utils";

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, action, children, className, bodyClass }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={cn("card", className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          {action}
        </div>
      )}
      <div className={cn("p-5", bodyClass)}>{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "default",
  icon,
  ring,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "good" | "bad" | "brand";
  icon?: ReactNode;
  ring?: { value: number; color?: string };
}) {
  return (
    <div className="card flex items-center justify-between gap-3 p-5">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {icon}
          {label}
        </div>
        <div
          className={cn(
            "mt-2 truncate text-2xl font-bold tracking-tight",
            tone === "good" && "text-emerald-600",
            tone === "bad" && "text-rose-600",
            tone === "brand" && "text-brand-700",
          )}
        >
          {value}
        </div>
        {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
      </div>
      {ring && <Ring value={ring.value} color={ring.color} />}
    </div>
  );
}

export function Ring({ value, size = 52, color = "#1d52ef" }: { value: number; size?: number; color?: string }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value || 0));
  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="#e2e8f0" strokeWidth={6} fill="none" />
      <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={6} fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v)} />
    </svg>
  );
}

export function StatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  const m = STATUS_META[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset", m.tone, className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", m.dot)} />
      {m.label}
    </span>
  );
}

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "green" | "red" | "amber" | "blue" | "violet" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    green: "bg-emerald-50 text-emerald-700",
    red: "bg-rose-50 text-rose-700",
    amber: "bg-amber-50 text-amber-700",
    blue: "bg-brand-50 text-brand-700",
    violet: "bg-violet-50 text-violet-700",
  };
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", tones[tone])}>{children}</span>;
}

export function Avatar({ name, color = "#3370fa", size = 32 }: { name: string; color?: string; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ background: color, width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials(name)}
    </span>
  );
}

export function Bar({ value, color, className }: { value: number; color?: string; className?: string }) {
  const v = Math.max(0, Math.min(1, value || 0));
  const auto = v >= 0.75 ? "#16a34a" : v >= 0.6 ? "#3370fa" : "#ef4444";
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-slate-100", className)}>
      <div className="h-full rounded-full transition-all" style={{ width: `${v * 100}%`, background: color ?? auto }} />
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-10 text-center">
      <div className="text-sm font-semibold text-slate-700">{title}</div>
      {children && <div className="mt-1 text-sm text-slate-500">{children}</div>}
    </div>
  );
}

export function RangeTabs({ current, base, extra = "" }: { current: string; base: string; extra?: string }) {
  const opts = [
    ["today", "Today"],
    ["7d", "7 days"],
    ["30d", "30 days"],
    ["month", "This month"],
    ["90d", "90 days"],
  ];
  return (
    <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 text-sm">
      {opts.map(([k, label]) => (
        <a
          key={k}
          href={`${base}?range=${k}${extra}`}
          className={cn("rounded-lg px-3 py-1.5 font-medium", current === k ? "bg-brand-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50")}
        >
          {label}
        </a>
      ))}
    </div>
  );
}

export function Logo({ className, light }: { className?: string; light?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <svg viewBox="0 0 40 40" className="h-9 w-9 shrink-0" aria-hidden>
        <defs>
          <linearGradient id="zg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#5996ff" />
            <stop offset="1" stopColor="#163fdc" />
          </linearGradient>
        </defs>
        <rect width="40" height="40" rx="11" fill="url(#zg)" />
        <path d="M11 12h18l-12.5 15H29v3H11l12.5-15H11z" fill="#fff" />
      </svg>
      <div className="leading-none">
        <div className={cn("text-lg font-extrabold tracking-tight", light ? "text-white" : "text-slate-900")}>
          z<span className={light ? "text-brand-200" : "text-brand-500"}>crm</span>
        </div>
        <div className={cn("text-[10px] font-semibold uppercase tracking-[0.18em]", light ? "text-brand-100" : "text-slate-400")}>COD CRM</div>
      </div>
    </div>
  );
}
