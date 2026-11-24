import clsx, { type ClassValue } from "clsx";
import type { OrderStatus } from "./db/schema";

export const cn = (...v: ClassValue[]) => clsx(v);

export function money(n: number, currency = "MAD") {
  return `${Math.round(n).toLocaleString("fr-FR").replace(/ /g, " ")} ${currency}`;
}

export function pct(n: number, digits = 0) {
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

export const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function timeAgo(d: Date | number | null | undefined) {
  if (!d) return "—";
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

export function fmtDate(d: Date | number | null | undefined, withTime = true) {
  if (!d) return "—";
  return new Date(d).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

/** Normalise a Moroccan phone number to international format (212XXXXXXXXX). */
export function normalizePhone(raw: string) {
  let p = (raw ?? "").replace(/[^\d+]/g, "");
  if (p.startsWith("+")) p = p.slice(1);
  if (p.startsWith("00")) p = p.slice(2);
  if (p.startsWith("0") && p.length === 10) p = "212" + p.slice(1);
  if (p.length === 9 && /^[5-7]/.test(p)) p = "212" + p;
  return p;
}

export const STATUS_META: Record<OrderStatus, { label: string; tone: string; dot: string }> = {
  NEW: { label: "New", tone: "bg-sky-50 text-sky-700 ring-sky-200", dot: "bg-sky-500" },
  ASSIGNED: { label: "Assigned", tone: "bg-indigo-50 text-indigo-700 ring-indigo-200", dot: "bg-indigo-500" },
  AWAITING_REPLY: { label: "Awaiting reply", tone: "bg-amber-50 text-amber-700 ring-amber-200", dot: "bg-amber-500" },
  NO_ANSWER: { label: "No answer", tone: "bg-orange-50 text-orange-700 ring-orange-200", dot: "bg-orange-500" },
  POSTPONED: { label: "Postponed", tone: "bg-violet-50 text-violet-700 ring-violet-200", dot: "bg-violet-500" },
  CONFIRMED: { label: "Confirmed", tone: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500" },
  CANCELLED: { label: "Cancelled", tone: "bg-rose-50 text-rose-700 ring-rose-200", dot: "bg-rose-500" },
  SHIPPED: { label: "Shipped", tone: "bg-cyan-50 text-cyan-700 ring-cyan-200", dot: "bg-cyan-500" },
  IN_TRANSIT: { label: "In transit", tone: "bg-blue-50 text-blue-700 ring-blue-200", dot: "bg-blue-500" },
  DELIVERED: { label: "Delivered", tone: "bg-green-50 text-green-700 ring-green-200", dot: "bg-green-600" },
  RETURNED: { label: "Returned", tone: "bg-red-50 text-red-700 ring-red-200", dot: "bg-red-500" },
};

export const PENDING_CONFIRMATION: OrderStatus[] = ["NEW", "ASSIGNED", "AWAITING_REPLY", "NO_ANSWER", "POSTPONED"];
export const CONFIRMED_LIKE: OrderStatus[] = ["CONFIRMED", "SHIPPED", "IN_TRANSIT", "DELIVERED", "RETURNED"];
export const SHIPPED_LIKE: OrderStatus[] = ["SHIPPED", "IN_TRANSIT", "DELIVERED", "RETURNED"];

export function fillTemplate(tpl: string, vars: Record<string, string | number>) {
  return tpl.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

export function randomKey(len = 24) {
  const chars = "abcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}
