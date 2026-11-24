import { and, desc, eq, inArray, isNotNull, lte } from "drizzle-orm";
import { db, t } from "../db";
import type { Customer } from "../db/schema";
import { getSettings } from "../settings";
import { fillTemplate, normalizePhone, PENDING_CONFIRMATION } from "../utils";
import { decide } from "./ai-agent";
import { applyOffer, changeStatus, getOrderFull, logEvent, updateOrderDetails } from "./orders";
import { sendButtons, sendText, transcribeVoiceNote, type InboundMessage } from "./whatsapp";

export const CONFIRM_BUTTONS = [
  { id: "confirm", title: "✅ أكد الطلب" },
  { id: "postpone", title: "📅 أجل الطلب" },
  { id: "cancel", title: "❌ لغي الطلب" },
];

/** Send the WhatsApp confirmation request (automation mode) or leave the order in the team's call queue. */
export async function startConfirmation(orderId: number, opts: { force?: boolean; actorId?: number } = {}) {
  const settings = await getSettings();
  if (settings.confirmation.mode !== "AUTOMATION" && !opts.force) return;
  const full = await getOrderFull(orderId);
  if (!full || !PENDING_CONFIRMATION.includes(full.order.status)) return;
  const { order, customer, items, store } = full;
  const vars = {
    name: customer.name.split(" ")[0] ?? customer.name,
    store: store?.name ?? settings.company.name,
    city: order.city ?? customer.city ?? "",
    products: items.map((i) => `${i.quantity > 1 ? `${i.quantity}× ` : ""}${i.productName}${i.variantName ? ` (${i.variantName})` : ""}`).join("، "),
    total: order.total,
    currency: settings.company.currency,
    reference: order.reference,
  };
  const body = fillTemplate(settings.confirmation.template, vars);
  await sendButtons(customer, body, CONFIRM_BUTTONS, {
    orderId,
    author: "AUTOMATION",
    userId: opts.actorId ?? null,
    templateParams: [vars.name, vars.store, vars.city, vars.products, `${vars.total} ${vars.currency}`],
  });
  await db.update(t.orders).set({ status: "AWAITING_REPLY", lastContactAt: new Date(), updatedAt: new Date() }).where(eq(t.orders.id, orderId));
  await logEvent(orderId, "WHATSAPP_SENT", "WhatsApp confirmation request sent", opts.actorId);
}

/** The order a customer's message most likely refers to: their latest order still being confirmed. */
async function openOrderFor(customerId: number) {
  const [order] = await db
    .select()
    .from(t.orders)
    .where(and(eq(t.orders.customerId, customerId), inArray(t.orders.status, PENDING_CONFIRMATION)))
    .orderBy(desc(t.orders.id))
    .limit(1);
  return order ?? null;
}

/** Entry point for every inbound WhatsApp message (real webhook or Inbox simulator). */
export async function handleInbound(msg: InboundMessage) {
  const phone = normalizePhone(msg.phone);
  let [customer] = await db.select().from(t.customers).where(eq(t.customers.phone, phone));
  if (!customer) {
    [customer] = await db.insert(t.customers).values({ name: msg.name ?? "WhatsApp contact", phone }).returning();
  }
  const order = await openOrderFor(customer!.id);

  let text = msg.text ?? msg.buttonTitle ?? "";
  let kind: "TEXT" | "AUDIO" = "TEXT";
  const meta: Record<string, unknown> = {};
  if (msg.voiceTranscript) {
    kind = "AUDIO";
    meta.transcript = msg.voiceTranscript;
    text = msg.voiceTranscript;
  } else if (msg.audioMediaId) {
    kind = "AUDIO";
    const transcript = await transcribeVoiceNote(msg.audioMediaId).catch(() => null);
    meta.audioMediaId = msg.audioMediaId;
    if (transcript) meta.transcript = transcript;
    text = transcript ?? "";
  }
  if (msg.buttonId) meta.buttonId = msg.buttonId;

  await db.insert(t.messages).values({
    customerId: customer!.id,
    orderId: order?.id ?? null,
    direction: "IN",
    kind,
    body: kind === "AUDIO" ? (text ? `🎤 ${text}` : "🎤 Voice note") : text,
    meta,
    author: "CUSTOMER",
    providerId: msg.providerId ?? null,
  });
  if (msg.buttonId === "campaign_stop" || /^(stop|توقف|arrêt)$/i.test(text.trim())) {
    await db.update(t.customers).set({ optOut: true }).where(eq(t.customers.id, customer!.id));
    await sendText(customer!, "تم. ما غاديش نبقاو نصيفطو ليك العروض 🙏", { author: "AUTOMATION" });
    return { handled: "opt_out" };
  }
  if (msg.buttonId === "campaign_order") {
    const { campaignReplyToOrder } = await import("./campaigns");
    const created = await campaignReplyToOrder(customer!.id);
    if (created) return { handled: "campaign_order", orderId: created.id };
  }
  if (!order) return { handled: "no_open_order" };
  await db.update(t.orders).set({ lastContactAt: new Date() }).where(eq(t.orders.id, order.id));

  // Quick-reply buttons are unambiguous, except "cancel" which goes through the AI to try to save the order.
  if (msg.buttonId === "confirm") {
    await changeStatus(order.id, "CONFIRMED", { via: "WHATSAPP", note: "Customer pressed Confirm" });
    await sendText(customer!, "✅ تم تأكيد الطلب ديالك! شكرا على الثقة، غادي يوصلك قريب إن شاء الله 🚚", { orderId: order.id, author: "AUTOMATION" });
    return { handled: "confirmed" };
  }
  if (msg.buttonId === "postpone") {
    await changeStatus(order.id, "POSTPONED", { via: "WHATSAPP", postponedUntil: new Date(Date.now() + 24 * 3600_000), note: "Customer pressed Postpone" });
    await sendText(customer!, "ماشي مشكل 👍 غادي نتواصلو معاك غدا إن شاء الله. إلا بغيتي وقت آخر كتبو لينا.", { orderId: order.id, author: "AUTOMATION" });
    return { handled: "postponed" };
  }

  const settings = await getSettings();
  if (!settings.ai.enabled) {
    if (msg.buttonId === "cancel") {
      await changeStatus(order.id, "CANCELLED", { via: "WHATSAPP", note: "Customer pressed Cancel" });
      return { handled: "cancelled" };
    }
    // No AI: hand the conversation to the assigned agent.
    await changeStatus(order.id, "ASSIGNED", { note: "Customer replied — needs an agent" }).catch(() => undefined);
    return { handled: "handoff" };
  }
  return runAiTurn(order.id, customer!, msg.buttonId === "cancel" ? "بغيت نلغي الطلب (pressed Cancel)" : text || "(empty message)");
}

export async function runAiTurn(orderId: number, customer: Customer, latest: string) {
  const settings = await getSettings();
  const full = await getOrderFull(orderId);
  if (!full) return { handled: "missing" };
  const { order, items, messages: history, store } = full;
  const offerAlreadyMade = full.events.some((e) => e.type === "OFFER");
  const transcript = history.slice(-20, -1).map((m) => ({
    from: m.direction === "IN" ? ("customer" as const) : ("store" as const),
    text: m.body,
  }));

  const decision = await decide(
    {
      storeName: store?.name ?? settings.company.name,
      currency: settings.company.currency,
      customerName: customer.name,
      city: order.city,
      address: order.address,
      items: items.map((i) => ({ name: i.productName, variant: i.variantName, quantity: i.quantity, unitPrice: i.unitPrice, notes: i.aiNotes, upsell: i.upsellNote })),
      total: order.total,
      shippingPrice: order.shippingPrice,
      offerAlreadyMade,
      transcript,
      latest,
    },
    settings.ai,
  );

  if (decision.newCity || decision.newAddress) {
    await updateOrderDetails(orderId, { city: decision.newCity || undefined, address: decision.newAddress || undefined });
  }
  if (decision.discountPct > 0 || decision.freeShipping) {
    await applyOffer(orderId, decision.discountPct, decision.freeShipping);
  }
  switch (decision.intent) {
    case "confirm":
      await changeStatus(orderId, "CONFIRMED", { via: "AI", note: decision.summary });
      break;
    case "cancel":
      await changeStatus(orderId, "CANCELLED", { via: "AI", note: decision.summary });
      break;
    case "postpone":
      await changeStatus(orderId, "POSTPONED", { via: "AI", note: decision.summary, postponedUntil: new Date(Date.now() + (decision.postponeHours || 24) * 3600_000) });
      break;
    case "human":
      await changeStatus(orderId, "ASSIGNED", { note: `AI handed over to team: ${decision.summary}` }).catch(() => undefined);
      break;
    default:
      await logEvent(orderId, "AI", `AI agent (${decision.engine}): ${decision.summary}`);
  }
  await sendText(customer, decision.reply, { orderId, author: "AI" });
  return { handled: decision.intent, decision };
}

/**
 * Periodic job (called by the scheduler every minute):
 *  - follow up on WhatsApp confirmations with no reply after N hours, then hand over to the team;
 *  - wake up postponed orders whose time has come.
 */
export async function runFollowUps() {
  const settings = await getSettings();
  const cutoff = new Date(Date.now() - settings.confirmation.followUpAfterHours * 3600_000);
  const waiting = await db
    .select()
    .from(t.orders)
    .where(and(eq(t.orders.status, "AWAITING_REPLY"), isNotNull(t.orders.lastContactAt), lte(t.orders.lastContactAt, cutoff)));
  let followedUp = 0;
  let handedOver = 0;
  for (const order of waiting) {
    const [customer] = await db.select().from(t.customers).where(eq(t.customers.id, order.customerId));
    if (!customer) continue;
    if (order.followUps < settings.confirmation.maxFollowUps) {
      await sendButtons(customer, `مرحبا ${customer.name.split(" ")[0]} 👋 مازال ما أكدتيش الطلب ديالك ${order.reference}. واش نصيفطوه ليك؟`, CONFIRM_BUTTONS, {
        orderId: order.id,
        author: "AUTOMATION",
      });
      await db.update(t.orders).set({ followUps: order.followUps + 1, lastContactAt: new Date() }).where(eq(t.orders.id, order.id));
      await logEvent(order.id, "FOLLOW_UP", `Automatic WhatsApp follow-up #${order.followUps + 1} (no reply after ${settings.confirmation.followUpAfterHours}h)`);
      followedUp++;
    } else {
      await changeStatus(order.id, "NO_ANSWER", { note: settings.confirmation.fallbackToTeam ? "No WhatsApp reply — moved to team call queue" : "No WhatsApp reply" });
      handedOver++;
    }
  }

  const due = await db
    .select()
    .from(t.orders)
    .where(and(eq(t.orders.status, "POSTPONED"), isNotNull(t.orders.postponedUntil), lte(t.orders.postponedUntil, new Date())));
  for (const order of due) {
    if (settings.confirmation.mode === "AUTOMATION") await startConfirmation(order.id);
    else await changeStatus(order.id, "ASSIGNED", { note: "Postponement ended — back in call queue" });
  }
  return { followedUp, handedOver, woken: due.length };
}
