"use client";

import { useState } from "react";
import { Bot, Mic, Send, Smartphone, User } from "lucide-react";
import type { Message } from "@/lib/db/schema";
import { cn, fmtDate } from "@/lib/utils";
import { useAction } from "./client";
import { agentReplyAction, simulateCustomerAction } from "@/app/app/actions";

type Msg = Pick<Message, "id" | "direction" | "kind" | "body" | "author" | "status"> & { meta: Record<string, unknown> | null; createdAt: number };

const AUTHOR_LABEL: Record<string, string> = { AI: "AI Agent", AUTOMATION: "Automation", AGENT: "Agent", CAMPAIGN: "Campaign", CUSTOMER: "Customer" };

export function Conversation({
  messages, phone, orderId, storeName, live,
}: { messages: Msg[]; phone: string; orderId?: number; storeName: string; live: boolean }) {
  const [reply, setReply] = useState("");
  const [sim, setSim] = useState("");
  const [voice, setVoice] = useState(false);
  const { pending, run } = useAction();
  const visible = messages.filter((m) => m.kind !== "SYSTEM");
  const lastButtons = [...visible].reverse().find((m) => m.direction === "OUT" && m.kind === "BUTTONS");
  const buttons = (lastButtons?.meta?.buttons as { id: string; title: string }[] | undefined) ?? [];

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[28px] border-[6px] border-slate-900 bg-[#efe7dd] shadow-xl">
      <div className="flex items-center gap-3 bg-[#075e54] px-4 py-3 text-white">
        <div className="grid h-9 w-9 place-items-center rounded-full bg-white/20 text-sm font-bold">{storeName.slice(0, 2).toUpperCase()}</div>
        <div className="flex-1 leading-tight">
          <div className="text-sm font-semibold">{storeName} ✓</div>
          <div className="text-[11px] text-emerald-100">+{phone} · {live ? "WhatsApp Cloud API" : "simulator"}</div>
        </div>
        <Smartphone className="h-4 w-4 opacity-70" />
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-3" style={{ minHeight: 320 }}>
        {visible.length === 0 && <div className="mx-auto mt-10 w-fit rounded-lg bg-white/80 px-3 py-1.5 text-xs text-slate-500">No messages yet</div>}
        {visible.map((m) => {
          const out = m.direction === "OUT";
          const btns = (m.meta?.buttons as { id: string; title: string }[] | undefined) ?? [];
          return (
            <div key={m.id} className={cn("flex", out ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[85%] rounded-xl px-3 py-2 text-[13px] shadow-sm", out ? "rounded-tr-sm bg-[#dcf8c6]" : "rounded-tl-sm bg-white")} dir="auto">
                {out && (
                  <div className={cn("mb-0.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide", m.author === "AI" ? "text-brand-600" : "text-emerald-700")}>
                    {m.author === "AI" ? <Bot className="h-3 w-3" /> : m.author === "AGENT" ? <User className="h-3 w-3" /> : null}
                    {AUTHOR_LABEL[m.author] ?? m.author}
                  </div>
                )}
                {m.kind === "AUDIO" && (
                  <div className="mb-1 flex items-center gap-2 rounded-lg bg-emerald-50 px-2 py-1.5 text-emerald-700">
                    <Mic className="h-4 w-4" />
                    <div className="flex h-4 flex-1 items-center gap-[2px]">
                      {Array.from({ length: 22 }, (_, i) => <span key={i} className="w-[2px] rounded bg-emerald-500" style={{ height: `${30 + ((i * 37) % 70)}%` }} />)}
                    </div>
                  </div>
                )}
                <div className="whitespace-pre-wrap">{m.kind === "AUDIO" ? (m.meta?.transcript ? `“${String(m.meta.transcript)}”` : "Voice note (no transcription configured)") : m.body}</div>
                {m.kind === "AUDIO" && Boolean(m.meta?.transcript) && <div className="mt-0.5 text-[10px] text-slate-400">Audio transcribed</div>}
                {btns.length > 0 && (
                  <div className="mt-2 space-y-1 border-t border-black/5 pt-1.5">
                    {btns.map((b) => <div key={b.id} className="text-center text-[12px] font-semibold text-sky-700">{b.title}</div>)}
                  </div>
                )}
                <div className="mt-0.5 text-end text-[10px] text-slate-400">
                  {fmtDate(m.createdAt)}
                  {out && m.status === "FAILED" && <span className="ms-1 text-rose-500">failed</span>}
                  {out && m.status === "SENT" && <span className="ms-1">✓✓</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {orderId && (
        <div className="flex gap-2 border-t border-black/5 bg-white/70 p-2">
          <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply as agent…" className="input py-1.5" dir="auto" />
          <button disabled={pending || !reply.trim()} className="btn-primary px-3" onClick={() => run(() => agentReplyAction(orderId, reply), () => setReply(""))}>
            <Send className="h-4 w-4 rtl-flip" />
          </button>
        </div>
      )}

      <div className="space-y-2 border-t border-dashed border-amber-300 bg-amber-50 p-2.5">
        <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Customer simulator — test the automation</div>
        {buttons.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {buttons.map((b) => (
              <button key={b.id} disabled={pending} className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-sky-700 ring-1 ring-sky-200 hover:bg-sky-50" onClick={() => run(() => simulateCustomerAction(phone, b.title, b.id))}>
                {b.title}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <button type="button" title="Send as voice note" onClick={() => setVoice(!voice)} className={cn("btn px-2.5", voice ? "bg-emerald-600 text-white" : "bg-white text-slate-500 ring-1 ring-slate-200")}>
            <Mic className="h-4 w-4" />
          </button>
          <input value={sim} onChange={(e) => setSim(e.target.value)} placeholder={voice ? "Voice note transcript…" : "Type what the customer says…"} className="input py-1.5" dir="auto" />
          <button disabled={pending || !sim.trim()} className="btn bg-amber-500 px-3 text-white hover:bg-amber-600" onClick={() => run(() => simulateCustomerAction(phone, sim, undefined, voice), () => setSim(""))}>
            <Send className="h-4 w-4 rtl-flip" />
          </button>
        </div>
        <div className="flex flex-wrap gap-1">
          {["شحال الثمن؟ واش التوصيل فابور؟", "غالية شوية", "صافي أكد ليا", "عيط ليا غدا", "بدل ليا العنوان: 25 زنقة الحرية، الرباط", "لا ما بغيتش"].map((s) => (
            <button key={s} className="rounded-md bg-white/70 px-1.5 py-0.5 text-[11px] text-slate-600 ring-1 ring-amber-200 hover:bg-white" onClick={() => setSim(s)} dir="auto">{s}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
