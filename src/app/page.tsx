import Link from "next/link";
import { Bot, Boxes, CheckCircle2, Globe, LineChart, Megaphone, MessageCircle, Plug, Server, Shuffle, Truck, Wallet, Zap } from "lucide-react";
import { Logo } from "@/components/ui";

const STEPS = [
  { icon: Plug, title: "Automatic order import", ar: "الطلبات كتجي أوتوماتيك", desc: "YouCan, Shopify, WooCommerce or any landing page — every order lands in ZCRM in real time." },
  { icon: Shuffle, title: "Smart distribution", ar: "توزيع ذكي على الفريق", desc: "Assign by percentage (20% / 30% / 50%) or by product, with live confirmation and delivery stats per agent." },
  { icon: MessageCircle, title: "Team or WhatsApp automation", ar: "الفريق ولا الأتمتة", desc: "Confirmers call from a focused queue — or WhatsApp confirms with one tap, 24/7, with automatic follow-ups." },
  { icon: Bot, title: "AI agent that talks like your best confirmer", ar: "AI كيجاوب الزبناء", desc: "Understands Darija and voice notes, answers questions, offers your approved discount or free delivery, and confirms." },
  { icon: Truck, title: "One-click shipping", ar: "صيفط للتوصيل بكليك", desc: "Ozon Express, Sendit, Cathedis, Ameex, Speedaf… statuses sync automatically: in transit, delivered, returned." },
  { icon: Megaphone, title: "WhatsApp campaigns", ar: "حملات للزبناء القدام", desc: "Sell again to your past customers. New orders with an ad budget of 0." },
  { icon: Wallet, title: "Real net profit", ar: "الربح الصافي الحقيقي", desc: "Revenue minus product cost, ads, team commissions and delivery — know what really stays in your pocket." },
  { icon: LineChart, title: "Product intelligence", ar: "تحليل كل منتوج", desc: "Confirmation & delivery rate, CPL, CPD, break-even CPL, upsell, ROI, profit per piece — and a clear Scale / Stop verdict." },
  { icon: Boxes, title: "Stock that updates itself", ar: "ستوك أوتوماتيكي", desc: "Per-variant stock, delivered / in transit / returns, low-stock alerts and stock value." },
  { icon: Zap, title: "Delivery analytics", ar: "نسبة التوصيل", desc: "Delivery rate by city, by carrier and by product — find exactly where you lose parcels." },
];

export default function Landing() {
  return (
    <main className="overflow-hidden">
      <section className="relative bg-gradient-to-b from-brand-600 to-brand-800 pb-28 text-white">
        <div className="dot-grid absolute inset-0 opacity-30" />
        <nav className="relative mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <Logo light />
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-xl px-4 py-2 text-sm font-semibold text-white/90 hover:bg-white/10">Sign in</Link>
            <Link href="/login" className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-brand-700 shadow-lg hover:bg-brand-50">Free trial</Link>
          </div>
        </nav>
        <div className="relative mx-auto max-w-4xl px-5 pt-14 text-center">
          <div className="mx-auto mb-6 w-fit rounded-full bg-white/15 px-4 py-1.5 text-sm font-semibold backdrop-blur" dir="rtl">CRM خاص بيك</div>
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl">The COD CRM you own.</h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-brand-100">Import orders, distribute them to your team, confirm with WhatsApp and AI, ship in one click and see your real net profit — on your own server, under your own domain.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {[[Server, "Own server", "سيرفر مستقل"], [Globe, "Your domain", "الدومين ديالك"], [CheckCircle2, "No monthly subscription", "بلا اشتراك شهري"]].map(([Icon, en, ar]) => {
              const I = Icon as typeof Server;
              return (
                <div key={en as string} className="flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-slate-800 shadow-xl">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white"><I className="h-4 w-4" /></span>
                  <span className="text-sm font-semibold">{en as string}</span>
                  <span className="text-sm text-slate-500" dir="rtl">· {ar as string}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-10 flex justify-center gap-3">
            <Link href="/login" className="rounded-2xl bg-white px-7 py-3.5 text-base font-bold text-brand-700 shadow-2xl hover:bg-brand-50" dir="rtl">خود تجربة مجانية</Link>
            <Link href="#features" className="rounded-2xl px-7 py-3.5 text-base font-semibold text-white ring-1 ring-white/40 hover:bg-white/10">See the 10 steps</Link>
          </div>
        </div>
      </section>

      <section id="features" className="relative mx-auto -mt-16 max-w-6xl px-5">
        <div className="grid gap-4 md:grid-cols-2">
          {STEPS.map((s, i) => (
            <div key={s.title} className="card flex gap-4 p-6">
              <div className="flex flex-col items-center">
                <span className="grid h-11 w-11 place-items-center rounded-full border-2 border-brand-500 text-sm font-bold text-brand-600">{i + 1}</span>
                {i < STEPS.length - 1 && <span className="mt-2 w-0.5 flex-1 bg-brand-100" />}
              </div>
              <div>
                <div className="flex items-center gap-2"><s.icon className="h-5 w-5 text-brand-600" /><h3 className="font-bold">{s.title}</h3></div>
                <div className="mt-0.5 text-sm font-semibold text-brand-600" dir="rtl">{s.ar}</div>
                <p className="mt-2 text-sm text-slate-600">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-5 py-24 text-center">
        <Logo className="justify-center" />
        <h2 className="mt-6 text-3xl font-extrabold tracking-tight" dir="rtl">CRM خاص بيك — بالداتا ديالك · بالدومين ديالك</h2>
        <p className="mt-3 text-slate-600">Your data stays yours. Self-host it, brand it, extend it.</p>
        <Link href="/login" className="btn-primary mt-8 px-8 py-3.5 text-base">Start your free trial</Link>
      </section>
      <footer className="border-t border-slate-200 py-8 text-center text-sm text-slate-500">© {new Date().getFullYear()} ZCRM · COD CRM</footer>
    </main>
  );
}
