import Link from "next/link";
import { and, eq, inArray, sql } from "drizzle-orm";
import { LogOut, Search } from "lucide-react";
import { requireUser, isManager } from "@/lib/auth";
import { db, t } from "@/lib/db";
import { getLang, translator } from "@/lib/i18n";
import { getSettings } from "@/lib/settings";
import { MobileNav, Sidebar, type NavSection } from "@/components/sidebar";
import { Avatar } from "@/components/ui";
import { LangSwitch } from "@/components/lang-switch";
import { Toaster } from "@/components/client";
import { logoutAction } from "@/app/login/actions";
import { aiConfigured } from "@/lib/services/ai-agent";
import { whatsappLive } from "@/lib/services/whatsapp";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const lang = await getLang();
  const tr = translator(lang);
  const settings = await getSettings();
  const manager = isManager(user);

  const queueWhere = manager
    ? inArray(t.orders.status, ["ASSIGNED", "NO_ANSWER", "NEW"])
    : and(eq(t.orders.assignedToId, user.id), inArray(t.orders.status, ["ASSIGNED", "NO_ANSWER", "NEW"]));
  const [{ n: queueCount }] = await db.select({ n: sql<number>`count(*)` }).from(t.orders).where(queueWhere);

  const sections: NavSection[] = manager
    ? [
        { title: tr("sales"), items: [
          { key: "dashboard", label: tr("dashboard"), href: "/app/dashboard" },
          { key: "orders", label: tr("orders"), href: "/app/orders" },
          { key: "queue", label: tr("queue"), href: "/app/queue", badge: Number(queueCount) },
          { key: "inbox", label: tr("inbox"), href: "/app/inbox" },
        ] },
        { title: tr("operations"), items: [
          { key: "products", label: tr("products"), href: "/app/products" },
          { key: "stock", label: tr("stock"), href: "/app/stock" },
          { key: "shipping", label: tr("shipping"), href: "/app/shipping" },
        ] },
        { title: tr("growth"), items: [
          { key: "campaigns", label: tr("campaigns"), href: "/app/campaigns" },
          { key: "finance", label: tr("finance"), href: "/app/finance" },
          { key: "reports", label: tr("reports"), href: "/app/reports" },
        ] },
        { title: tr("admin"), items: [
          { key: "team", label: tr("team"), href: "/app/team" },
          { key: "automation", label: tr("automation"), href: "/app/automation" },
          { key: "integrations", label: tr("integrations"), href: "/app/integrations" },
          { key: "settings", label: tr("settings"), href: "/app/settings" },
        ] },
      ]
    : [
        { title: tr("sales"), items: [
          { key: "queue", label: tr("queue"), href: "/app/queue", badge: Number(queueCount) },
          { key: "orders", label: tr("orders"), href: "/app/orders" },
          { key: "inbox", label: tr("inbox"), href: "/app/inbox" },
        ] },
      ];

  return (
    <div className="min-h-screen">
      <Sidebar sections={sections} company={settings.company.name} />
      <div className="lg:ps-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200/70 bg-white/80 px-4 backdrop-blur lg:px-8">
          <form action="/app/orders" className="relative max-w-md flex-1">
            <Search className="pointer-events-none absolute top-2.5 h-4 w-4 text-slate-400 ltr:left-3 rtl:right-3" />
            <input name="q" placeholder={tr("search")} className="input ltr:pl-9 rtl:pr-9" />
          </form>
          <div className="ms-auto flex items-center gap-2">
            <span className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold md:inline-flex ${aiConfigured() ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${aiConfigured() ? "bg-emerald-500" : "bg-amber-500"}`} />
              AI {aiConfigured() ? "Claude" : "rules"}
            </span>
            <span className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold md:inline-flex ${whatsappLive() ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
              WhatsApp {whatsappLive() ? "live" : "simulator"}
            </span>
            <LangSwitch current={lang} />
            <Link href={manager ? "/app/team" : "/app/queue"} className="flex items-center gap-2 rounded-xl px-2 py-1 hover:bg-slate-100">
              <Avatar name={user.name} color={user.color} size={30} />
              <div className="hidden text-start leading-tight sm:block">
                <div className="text-sm font-semibold">{user.name}</div>
                <div className="text-[11px] uppercase tracking-wide text-slate-400">{user.role}</div>
              </div>
            </Link>
            <form action={logoutAction}>
              <button className="btn-ghost px-2" title={tr("logout")}><LogOut className="h-4 w-4 rtl-flip" /></button>
            </form>
          </div>
        </header>
        <MobileNav sections={sections} />
        <main className="mx-auto max-w-[1400px] px-4 py-6 lg:px-8">{children}</main>
        <Toaster />
      </div>
    </div>
  );
}
