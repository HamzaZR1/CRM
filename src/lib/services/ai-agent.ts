import Anthropic from "@anthropic-ai/sdk";
import type { AppSettings } from "../settings";

/**
 * The AI agent reads the conversation with a customer about one COD order and decides what to do.
 * It never acts directly: it returns a structured decision that the confirmation service validates
 * against the merchant's policy (max discount, free-shipping permission) before applying it.
 */
export const AI_INTENTS = ["confirm", "cancel", "postpone", "question", "update_details", "hesitant", "human", "unclear"] as const;
export type AiIntent = (typeof AI_INTENTS)[number];

export interface AiDecision {
  intent: AiIntent;
  reply: string;
  discountPct: number;
  freeShipping: boolean;
  postponeHours: number;
  newCity: string;
  newAddress: string;
  summary: string;
  engine: "claude" | "rules";
}

export interface AiContext {
  storeName: string;
  currency: string;
  customerName: string;
  city: string | null;
  address: string | null;
  items: { name: string; variant: string | null; quantity: number; unitPrice: number; notes: string | null; upsell: string | null }[];
  total: number;
  shippingPrice: number;
  offerAlreadyMade: boolean;
  transcript: { from: "customer" | "store"; text: string }[];
  latest: string;
}

const DECISION_SCHEMA = {
  type: "object",
  properties: {
    intent: { type: "string", enum: [...AI_INTENTS] },
    reply: { type: "string", description: "The WhatsApp message to send to the customer." },
    discountPct: { type: "integer", description: "Discount percent to grant (0 if none)." },
    freeShipping: { type: "boolean" },
    postponeHours: { type: "integer", description: "Hours to wait before contacting again when intent is postpone (0 otherwise)." },
    newCity: { type: "string", description: "Corrected city if the customer gave one, else empty." },
    newAddress: { type: "string", description: "Corrected address if the customer gave one, else empty." },
    summary: { type: "string", description: "One short line for the merchant's order timeline, in English." },
  },
  required: ["intent", "reply", "discountPct", "freeShipping", "postponeHours", "newCity", "newAddress", "summary"],
  additionalProperties: false,
} as const;

const LANG: Record<AppSettings["ai"]["language"], string> = {
  darija: "Moroccan Darija written in Arabic script (the way Moroccans text on WhatsApp)",
  arabic: "Modern Standard Arabic",
  french: "French",
  english: "English",
};

function systemPrompt(ai: AppSettings["ai"]) {
  return `You are the order-confirmation assistant of an e-commerce store that sells with cash on delivery (COD) in Morocco. You talk to customers on WhatsApp right after they place an order. Your job is to get a clear decision on the order: confirm it, postpone it, or cancel it, and to answer the customer's questions about the product, price, and delivery along the way.

Write replies in ${LANG[ai.language]}, unless the customer clearly writes in another language, in which case answer in theirs. Tone: ${ai.tone}. Keep each reply to one to three short lines, like a real WhatsApp message.

How to decide the intent:
- confirm: the customer clearly agrees to receive the order. Thank them and say the order is confirmed and on its way.
- cancel: the customer clearly refuses, even after any offer you are allowed to make.
- postpone: the customer asks to be contacted later or to deliver on a later date. Set postponeHours.
- update_details: the customer corrects their city or address (fill newCity/newAddress) without yet confirming. If they correct details and confirm in the same message, use confirm and still fill the fields.
- question: the customer asks something (price, size, quality, delivery time, payment). Answer from the order facts and product notes only; never invent specifications. End by asking if you can confirm the order.
- hesitant: the customer hesitates or wants to cancel because of price or delivery cost. ${
    ai.maxDiscountPct > 0 || ai.allowFreeShipping
      ? `You may make one retention offer: ${[ai.maxDiscountPct > 0 ? `a discount of up to ${ai.maxDiscountPct}%` : null, ai.allowFreeShipping ? "free delivery" : null].filter(Boolean).join(" and/or ")}. Put what you offer in discountPct / freeShipping and mention the new total. Only offer once; if an offer was already made, do not increase it.`
      : "You may not offer discounts or free delivery; reassure them about quality and cash-on-delivery instead."
  }
- human: the customer asks for a person, complains, or the request is outside your scope (returns, exchanges, wholesale).
- unclear: you cannot tell what they mean; ask a short clarifying question.

Never promise anything the store did not authorise. Never ask for card details or online payment: payment is cash on delivery. Prices are in the store currency.${ai.extraInstructions ? `\n\nStore-specific instructions:\n${ai.extraInstructions}` : ""}`;
}

function renderContext(c: AiContext) {
  const lines = c.items
    .map(
      (i) =>
        `- ${i.quantity} × ${i.name}${i.variant ? ` (${i.variant})` : ""} at ${i.unitPrice} ${c.currency}${i.notes ? `\n  Product notes: ${i.notes}` : ""}${i.upsell ? `\n  Upsell available: ${i.upsell}` : ""}`,
    )
    .join("\n");
  const convo = c.transcript.map((m) => `${m.from === "customer" ? "Customer" : "Store"}: ${m.text}`).join("\n");
  return `<order>
Store: ${c.storeName}
Customer: ${c.customerName}
City: ${c.city ?? "unknown"}
Address: ${c.address ?? "unknown"}
Items:
${lines}
Delivery price charged: ${c.shippingPrice === 0 ? "free" : `${c.shippingPrice} ${c.currency}`}
Total to pay on delivery: ${c.total} ${c.currency}
Retention offer already made in this conversation: ${c.offerAlreadyMade ? "yes" : "no"}
</order>

<conversation>
${convo}
</conversation>

The customer's latest message is:
<latest>${c.latest}</latest>

Decide the intent and write the reply.`;
}

export const aiConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

let _client: Anthropic | null = null;
const client = () => (_client ??= new Anthropic());

async function decideWithClaude(ctx: AiContext, ai: AppSettings["ai"]): Promise<AiDecision | null> {
  try {
    const response = await client().beta.messages.create({
      model: process.env.ZCRM_AI_MODEL ?? "claude-opus-5-5",
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: DECISION_SCHEMA } },
      system: systemPrompt(ai),
      messages: [{ role: "user", content: renderContext(ctx) }],
    });
    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") return null;
    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    const parsed = JSON.parse(text) as Omit<AiDecision, "engine">;
    if (!AI_INTENTS.includes(parsed.intent) || typeof parsed.reply !== "string") return null;
    return { ...parsed, engine: "claude" };
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) console.warn("[ai-agent] rate limited, using rules");
    else if (error instanceof Anthropic.APIError) console.error(`[ai-agent] API error ${error.status}: ${error.message}`);
    else console.error("[ai-agent]", error);
    return null;
  }
}

// ---------- Rule-based fallback (Darija / Arabic / French / English keywords) ----------

const has = (s: string, words: string[]) => words.some((w) => s.includes(w));
const CONFIRM = ["اكد", "أكد", "نأكد", "واخا", "وخا", "اه", "إيه", "ايه", "نعم", "صافي", "مزيان", "confirm", "oui", "ok", "d'accord", "yes", "wakha", "wah", "ah"];
const CANCEL = ["لغي", "الغي", "ألغي", "ماباغيش", "ما بغيتش", "لا", "annul", "cancel", "non", "no ", "bghitch", "lgh"];
const LATER = ["من بعد", "غدا", "غدوة", "اجل", "أجل", "plus tard", "demain", "later", "tomorrow", "mn b3d", "ghda"];
const PRICE = ["غالي", "الثمن", "بشحال", "شحال", "التوصيل", "cher", "prix", "livraison", "price", "expensive", "delivery", "ch7al", "ghali"];
const HUMAN = ["مسؤول", "شخص", "conseiller", "humain", "agent", "human", "person"];

function decideWithRules(ctx: AiContext, ai: AppSettings["ai"]): AiDecision {
  const s = ` ${ctx.latest.toLowerCase()} `;
  const base = { discountPct: 0, freeShipping: false, postponeHours: 0, newCity: "", newAddress: "", engine: "rules" as const };
  const ar = ai.language === "darija" || ai.language === "arabic";
  if (has(s, HUMAN)) return { ...base, intent: "human", reply: ar ? "مرحبا، غادي يتواصل معاك واحد من الفريق ديالنا دابا 🙏" : "Un conseiller va vous contacter rapidement 🙏", summary: "Customer asked for a human" };
  if (has(s, LATER)) return { ...base, intent: "postpone", postponeHours: 24, reply: ar ? "ماشي مشكل 👍 غادي نتواصلو معاك غدا إن شاء الله" : "Pas de souci 👍 on vous recontacte demain.", summary: "Customer asked to be contacted later" };
  if (has(s, PRICE) || (has(s, CANCEL) && !ctx.offerAlreadyMade && (ai.maxDiscountPct > 0 || ai.allowFreeShipping))) {
    if (!ctx.offerAlreadyMade && (ai.maxDiscountPct > 0 || ai.allowFreeShipping)) {
      const pctOff = ai.maxDiscountPct;
      const newTotal = Math.round(ctx.total - ctx.items.reduce((a, i) => a + i.unitPrice * i.quantity, 0) * (pctOff / 100) - (ai.allowFreeShipping ? ctx.shippingPrice : 0));
      return {
        ...base,
        intent: "hesitant",
        discountPct: pctOff,
        freeShipping: ai.allowFreeShipping,
        reply: ar
          ? `🎁 عرض خاص ليك: ${pctOff ? `-${pctOff}%` : ""}${pctOff && ai.allowFreeShipping ? " و" : ""}${ai.allowFreeShipping ? "التوصيل فابور" : ""} — الثمن ولى ${newTotal} ${ctx.currency}. نأكدو ليك الطلب؟`
          : `🎁 Offre spéciale : ${pctOff ? `-${pctOff}%` : ""}${ai.allowFreeShipping ? " + livraison gratuite" : ""} — nouveau total ${newTotal} ${ctx.currency}. On confirme ?`,
        summary: "Retention offer made",
      };
    }
  }
  if (has(s, CANCEL)) return { ...base, intent: "cancel", reply: ar ? "تم إلغاء الطلب ديالك. شكرا 🙏" : "Votre commande a été annulée. Merci 🙏", summary: "Customer cancelled" };
  if (has(s, CONFIRM)) return { ...base, intent: "confirm", reply: ar ? "✅ تم تأكيد الطلب ديالك! غادي يوصلك قريب إن شاء الله 🚚" : "✅ Commande confirmée ! Livraison très bientôt 🚚", summary: "Customer confirmed" };
  return { ...base, intent: "unclear", reply: ar ? "سمح ليا ما فهمتش مزيان 🙏 واش نأكدو ليك الطلب؟ (اه / لا)" : "Désolé, je n'ai pas bien compris 🙏 On confirme la commande ? (oui / non)", summary: "Unclear reply" };
}

export async function decide(ctx: AiContext, ai: AppSettings["ai"]): Promise<AiDecision> {
  const fromClaude = aiConfigured() ? await decideWithClaude(ctx, ai) : null;
  const d = fromClaude ?? decideWithRules(ctx, ai);
  // Enforce merchant policy regardless of what the model proposed.
  d.discountPct = ctx.offerAlreadyMade ? 0 : Math.min(Math.max(0, Math.round(d.discountPct || 0)), ai.maxDiscountPct);
  d.freeShipping = !ctx.offerAlreadyMade && ai.allowFreeShipping && Boolean(d.freeShipping);
  d.postponeHours = Math.min(Math.max(0, Math.round(d.postponeHours || 0)), 24 * 14);
  return d;
}
