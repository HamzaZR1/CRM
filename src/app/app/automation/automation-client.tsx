"use client";

import { useState } from "react";
import { Bot, Percent, Package, Hand, Users, MessageCircle } from "lucide-react";
import type { AppSettings } from "@/lib/settings";
import { Avatar } from "@/components/ui";
import { useAction } from "@/components/client";
import { cn, fillTemplate } from "@/lib/utils";
import { saveSettingsAction, setAgentProductsAction, setWeightAction } from "../actions";

function Choice({ active, onClick, icon, title, desc }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <button type="button" onClick={onClick} className={cn("flex flex-1 items-start gap-3 rounded-2xl border-2 p-4 text-start transition", active ? "border-brand-500 bg-brand-50/60 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300")}>
      <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", active ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-500")}>{icon}</span>
      <span><span className="block font-semibold">{title}</span><span className="text-sm text-slate-500">{desc}</span></span>
    </button>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className={cn("relative h-7 w-12 rounded-full transition", on ? "bg-emerald-500" : "bg-slate-300")}>
      <span className={cn("absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all", on ? "start-6" : "start-1")} />
    </button>
  );
}

type Agent = { id: number; name: string; color: string; weight: number; products: number[] };

export function AssignmentPanel({ settings, agents, products }: { settings: AppSettings["assignment"]; agents: Agent[]; products: { id: number; name: string; emoji: string }[] }) {
  const { pending, run } = useAction();
  const [weights, setWeights] = useState(Object.fromEntries(agents.map((a) => [a.id, a.weight])));
  const total = Object.values(weights).reduce((s, w) => s + w, 0) || 1;
  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-semibold">1 · Automatic order distribution</h2>
          <p className="text-sm text-slate-500">Every imported order is assigned instantly to a confirmer.</p>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium">Auto-assign <Toggle on={settings.autoAssign} onChange={(v) => run(() => saveSettingsAction("assignment", { autoAssign: v }))} /></label>
      </div>
      <div className="flex flex-col gap-3 md:flex-row">
        <Choice active={settings.mode === "PERCENTAGE"} onClick={() => run(() => saveSettingsAction("assignment", { mode: "PERCENTAGE" }))} icon={<Percent className="h-5 w-5" />} title="By percentage" desc="Each agent gets a fixed share of orders (e.g. 20% / 30% / 50%)." />
        <Choice active={settings.mode === "PRODUCT"} onClick={() => run(() => saveSettingsAction("assignment", { mode: "PRODUCT" }))} icon={<Package className="h-5 w-5" />} title="By product" desc="Specialists handle their products; others fall back to percentage." />
        <Choice active={settings.mode === "MANUAL"} onClick={() => run(() => saveSettingsAction("assignment", { mode: "MANUAL" }))} icon={<Hand className="h-5 w-5" />} title="Manual" desc="A manager dispatches orders by hand." />
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {agents.map((a) => (
          <div key={a.id} className="rounded-2xl border border-slate-200 p-4 text-center">
            <Avatar name={a.name} color={a.color} size={48} />
            <div className="mt-2 font-semibold">{a.name}</div>
            <div className="text-xs text-slate-500">Confirmer</div>
            <div className="my-2 rounded-xl bg-brand-50 py-1.5 text-2xl font-bold text-brand-700">{Math.round(((weights[a.id] ?? 0) / total) * 100)}%</div>
            <input
              type="range" min={0} max={100} value={weights[a.id] ?? 0} disabled={pending}
              onChange={(e) => setWeights({ ...weights, [a.id]: Number(e.target.value) })}
              onMouseUp={() => run(() => setWeightAction(a.id, weights[a.id] ?? 0))}
              onTouchEnd={() => run(() => setWeightAction(a.id, weights[a.id] ?? 0))}
              className="w-full accent-brand-600"
            />
            {settings.mode === "PRODUCT" && (
              <div className="mt-2 flex flex-wrap justify-center gap-1">
                {products.map((p) => {
                  const on = a.products.includes(p.id);
                  return (
                    <button key={p.id} title={p.name} disabled={pending} onClick={() => run(() => setAgentProductsAction(a.id, on ? a.products.filter((x) => x !== p.id) : [...a.products, p.id]))}
                      className={cn("grid h-8 w-8 place-items-center rounded-lg text-lg", on ? "bg-brand-100 ring-2 ring-brand-400" : "bg-slate-50 opacity-50 hover:opacity-100")}>
                      {p.emoji}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export function ConfirmationPanel({ settings, live, storeName, currency }: { settings: AppSettings["confirmation"]; live: boolean; storeName: string; currency: string }) {
  const { pending, run } = useAction();
  const [v, setV] = useState(settings);
  const preview = fillTemplate(v.template, { name: "سلمى", store: storeName, city: "الدار البيضاء", products: "Montre Classic Gold", total: 349, currency, reference: "ZC-1042" });
  return (
    <section className="card p-5">
      <h2 className="font-semibold">2 · Order confirmation</h2>
      <p className="mb-4 text-sm text-slate-500">Choose who confirms: your team by phone, or WhatsApp automation with an AI agent.</p>
      <div className="flex flex-col gap-3 md:flex-row">
        <Choice active={settings.mode === "TEAM"} onClick={() => run(() => saveSettingsAction("confirmation", { mode: "TEAM" }))} icon={<Users className="h-5 w-5" />} title="Team" desc="Your confirmers call customers and confirm orders from the call queue." />
        <Choice active={settings.mode === "AUTOMATION"} onClick={() => run(() => saveSettingsAction("confirmation", { mode: "AUTOMATION" }))} icon={<Bot className="h-5 w-5" />} title="Automation + AI" desc="WhatsApp confirms and the AI agent answers customers 24/7. Unanswered orders go to the team." />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="space-y-3">
          <div>
            <label className="label">WhatsApp confirmation message · {"{name} {store} {city} {products} {total} {currency} {reference}"}</label>
            <textarea rows={7} className="input" dir="auto" value={v.template} onChange={(e) => setV({ ...v, template: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Follow-up after (hours)</label><input type="number" min={1} className="input" value={v.followUpAfterHours} onChange={(e) => setV({ ...v, followUpAfterHours: Number(e.target.value) })} /></div>
            <div><label className="label">Max follow-ups</label><input type="number" min={0} max={5} className="input" value={v.maxFollowUps} onChange={(e) => setV({ ...v, maxFollowUps: Number(e.target.value) })} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.fallbackToTeam} onChange={(e) => setV({ ...v, fallbackToTeam: e.target.checked })} /> Send unanswered orders to the team call queue</label>
          <button className="btn-primary" disabled={pending} onClick={() => run(() => saveSettingsAction("confirmation", { template: v.template, followUpAfterHours: v.followUpAfterHours, maxFollowUps: v.maxFollowUps, fallbackToTeam: v.fallbackToTeam }))}>Save confirmation settings</button>
          {!live && <p className="text-xs text-amber-700">WhatsApp is in simulator mode. Add your WhatsApp Cloud API credentials (see Settings) to send real messages.</p>}
        </div>
        <div className="rounded-3xl border-[6px] border-slate-900 bg-[#efe7dd] p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-slate-600"><MessageCircle className="h-4 w-4 text-emerald-600" /> Preview</div>
          <div className="ms-auto max-w-[85%] rounded-xl rounded-tr-sm bg-[#dcf8c6] px-3 py-2 text-[13px] shadow-sm" dir="auto">
            <div className="mb-1.5 grid h-24 place-items-center rounded-lg bg-white/70 text-5xl">⌚</div>
            <div className="whitespace-pre-wrap">{preview}</div>
            <div className="mt-2 space-y-1 border-t border-black/5 pt-1.5 text-center text-[12px] font-semibold text-sky-700"><div>✅ أكد الطلب</div><div>📅 أجل الطلب</div><div>❌ لغي الطلب</div></div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function AiPanel({ settings, claude }: { settings: AppSettings["ai"]; claude: boolean }) {
  const { pending, run } = useAction();
  const [v, setV] = useState(settings);
  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-semibold">3 · AI agent</h2>
          <p className="text-sm text-slate-500">Answers questions, understands voice notes, saves hesitant orders with your approved offers, and confirms.</p>
        </div>
        <Toggle on={v.enabled} onChange={(on) => { setV({ ...v, enabled: on }); run(() => saveSettingsAction("ai", { enabled: on })); }} />
      </div>
      <div className={cn("mb-4 rounded-xl px-4 py-3 text-sm", claude ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800")}>
        {claude ? "Powered by Claude. Every decision is checked against the limits below before it is applied." : "No ANTHROPIC_API_KEY set: the built-in rule-based agent is used (Darija / Arabic / French keywords). Add a key to enable the Claude-powered agent."}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div><label className="label">Max discount the AI may offer (%)</label><input type="number" min={0} max={50} className="input" value={v.maxDiscountPct} onChange={(e) => setV({ ...v, maxDiscountPct: Number(e.target.value) })} /></div>
        <div>
          <label className="label">Reply language</label>
          <select className="input" value={v.language} onChange={(e) => setV({ ...v, language: e.target.value as typeof v.language })}>
            <option value="darija">Darija (Moroccan)</option><option value="arabic">Arabic</option><option value="french">French</option><option value="english">English</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.allowFreeShipping} onChange={(e) => setV({ ...v, allowFreeShipping: e.target.checked })} /> AI may offer free delivery</label>
        <div><label className="label">Tone</label><input className="input" value={v.tone} onChange={(e) => setV({ ...v, tone: e.target.value })} /></div>
        <div className="md:col-span-2"><label className="label">Extra instructions (policies, delivery times, FAQs)</label><textarea rows={3} className="input" value={v.extraInstructions} onChange={(e) => setV({ ...v, extraInstructions: e.target.value })} placeholder="Delivery takes 24–48h in big cities, 72h elsewhere. Exchanges accepted within 7 days." /></div>
      </div>
      <div className="mt-4 flex justify-end"><button className="btn-primary" disabled={pending} onClick={() => run(() => saveSettingsAction("ai", v))}>Save AI settings</button></div>
    </section>
  );
}
