"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3, Bot, Boxes, LayoutDashboard, Megaphone, MessageCircle, Package, PhoneCall, Plug, Settings, ShoppingCart, Truck, Users, Wallet,
} from "lucide-react";
import { Logo } from "./ui";
import { cn } from "@/lib/utils";

const ICONS = {
  dashboard: LayoutDashboard, orders: ShoppingCart, queue: PhoneCall, inbox: MessageCircle, products: Package, stock: Boxes,
  shipping: Truck, campaigns: Megaphone, finance: Wallet, reports: BarChart3, team: Users, automation: Bot, integrations: Plug, settings: Settings,
};
export type NavKey = keyof typeof ICONS;
export type NavSection = { title: string; items: { key: NavKey; label: string; href: string; badge?: number }[] };

export function Sidebar({ sections, company }: { sections: NavSection[]; company: string }) {
  const path = usePathname();
  return (
    <aside className="fixed inset-y-0 z-30 hidden w-64 flex-col border-e border-slate-200/70 bg-white lg:flex ltr:left-0 rtl:right-0">
      <div className="flex h-16 items-center px-5">
        <Logo />
      </div>
      <div className="mx-4 mb-2 truncate rounded-xl bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-700">{company}</div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-3">
        {sections.map((s) => (
          <div key={s.title}>
            <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{s.title}</div>
            <div className="space-y-0.5">
              {s.items.map((it) => {
                const Icon = ICONS[it.key];
                const active = path === it.href || path.startsWith(it.href + "/");
                return (
                  <Link
                    key={it.key}
                    href={it.href}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition",
                      active ? "bg-brand-600 text-white shadow-sm shadow-brand-600/25" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 truncate">{it.label}</span>
                    {it.badge ? (
                      <span className={cn("rounded-full px-1.5 text-[11px] font-bold", active ? "bg-white/25 text-white" : "bg-rose-500 text-white")}>{it.badge}</span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}

export function MobileNav({ sections }: { sections: NavSection[] }) {
  const path = usePathname();
  const items = sections.flatMap((s) => s.items);
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2 lg:hidden">
      {items.map((it) => {
        const Icon = ICONS[it.key];
        const active = path.startsWith(it.href);
        return (
          <Link key={it.key} href={it.href} className={cn("flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium", active ? "bg-brand-600 text-white" : "text-slate-600")}>
            <Icon className="h-3.5 w-3.5" /> {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
