import crypto from "node:crypto";
import { db, t } from "../db";
import type { Customer, Message } from "../db/schema";

/**
 * WhatsApp transport.
 * - With WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID set, messages go through the Meta WhatsApp Cloud API.
 * - Otherwise they are stored with status SIMULATED and can be answered from the Inbox simulator,
 *   so the whole confirmation / AI flow can be tested without a WhatsApp Business account.
 */
const GRAPH = "https://graph.facebook.com/v21.0";

export const whatsappLive = () => Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);

type Author = Message["author"];
export interface Button {
  id: string;
  title: string;
}

async function graphSend(payload: Record<string, unknown>) {
  const res = await fetch(`${GRAPH}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
  });
  const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message: string } };
  if (!res.ok) throw new Error(json.error?.message ?? `WhatsApp API error ${res.status}`);
  return json.messages?.[0]?.id ?? null;
}

async function record(
  customer: Customer,
  data: Pick<typeof t.messages.$inferInsert, "kind" | "body" | "meta" | "author" | "orderId" | "userId">,
  send: () => Promise<string | null>,
) {
  let providerId: string | null = null;
  let status: Message["status"] = "SIMULATED";
  let error: string | undefined;
  if (whatsappLive() && !customer.optOut) {
    try {
      providerId = await send();
      status = "SENT";
    } catch (e) {
      status = "FAILED";
      error = (e as Error).message;
    }
  }
  const [msg] = await db
    .insert(t.messages)
    .values({ ...data, customerId: customer.id, direction: "OUT", providerId, status, meta: { ...(data.meta ?? {}), ...(error ? { error } : {}) } })
    .returning();
  return msg!;
}

export async function sendText(
  customer: Customer,
  body: string,
  opts: { orderId?: number | null; author: Author; userId?: number | null },
) {
  return record(customer, { kind: "TEXT", body, author: opts.author, orderId: opts.orderId ?? null, userId: opts.userId ?? null }, () =>
    graphSend({ to: customer.phone, type: "text", text: { body, preview_url: false } }),
  );
}

/**
 * Interactive reply buttons (max 3, 20 chars each). Note: Meta only allows free-form/interactive
 * messages inside the 24h customer-service window; for the very first, business-initiated message
 * set WHATSAPP_CONFIRM_TEMPLATE to an approved template name with quick-reply buttons.
 */
export async function sendButtons(
  customer: Customer,
  body: string,
  buttons: Button[],
  opts: { orderId?: number | null; author: Author; userId?: number | null; templateParams?: string[]; imageUrl?: string | null },
) {
  const template = process.env.WHATSAPP_CONFIRM_TEMPLATE;
  return record(
    customer,
    { kind: "BUTTONS", body, meta: { buttons }, author: opts.author, orderId: opts.orderId ?? null, userId: opts.userId ?? null },
    () =>
      template && opts.templateParams
        ? graphSend({
            to: customer.phone,
            type: "template",
            template: {
              name: template,
              language: { code: process.env.WHATSAPP_TEMPLATE_LANG ?? "ar" },
              components: [{ type: "body", parameters: opts.templateParams.map((text) => ({ type: "text", text })) }],
            },
          })
        : graphSend({
            to: customer.phone,
            type: "interactive",
            interactive: {
              type: "button",
              ...(opts.imageUrl ? { header: { type: "image", image: { link: opts.imageUrl } } } : {}),
              body: { text: body.slice(0, 1024) },
              action: { buttons: buttons.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id, title: b.title.slice(0, 20) } })) },
            },
          }),
  );
}

// ---------- Inbound webhook parsing ----------

export interface InboundMessage {
  phone: string;
  name?: string;
  providerId?: string;
  text?: string;
  buttonId?: string;
  buttonTitle?: string;
  audioMediaId?: string;
  /** Simulator only: a voice note whose transcript is already known. */
  voiceTranscript?: string;
}

type WaWebhook = {
  entry?: {
    changes?: {
      value?: {
        contacts?: { wa_id: string; profile?: { name?: string } }[];
        messages?: {
          id: string;
          from: string;
          type: string;
          text?: { body: string };
          button?: { payload?: string; text?: string };
          interactive?: { button_reply?: { id: string; title: string }; list_reply?: { id: string; title: string } };
          audio?: { id: string };
        }[];
      };
    }[];
  }[];
};

export function parseWebhook(body: WaWebhook): InboundMessage[] {
  const out: InboundMessage[] = [];
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value;
      const names = new Map((v?.contacts ?? []).map((c) => [c.wa_id, c.profile?.name]));
      for (const m of v?.messages ?? []) {
        const base = { phone: m.from, name: names.get(m.from), providerId: m.id };
        if (m.type === "text") out.push({ ...base, text: m.text?.body });
        else if (m.type === "interactive") {
          const r = m.interactive?.button_reply ?? m.interactive?.list_reply;
          out.push({ ...base, buttonId: r?.id, buttonTitle: r?.title });
        } else if (m.type === "button") out.push({ ...base, buttonId: m.button?.payload, buttonTitle: m.button?.text, text: m.button?.text });
        else if (m.type === "audio") out.push({ ...base, audioMediaId: m.audio?.id });
      }
    }
  }
  return out;
}

export function verifySignature(rawBody: string, signature: string | null) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return true; // not configured: accept (dev / simulator)
  if (!signature) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Download a voice note from WhatsApp and transcribe it with the configured STT endpoint. */
export async function transcribeVoiceNote(mediaId: string): Promise<string | null> {
  if (!whatsappLive() || !process.env.ZCRM_STT_URL) return null;
  const auth = { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` };
  const meta = (await (await fetch(`${GRAPH}/${mediaId}`, { headers: auth })).json()) as { url?: string; mime_type?: string };
  if (!meta.url) return null;
  const audio = await (await fetch(meta.url, { headers: auth })).arrayBuffer();
  const form = new FormData();
  form.append("file", new Blob([audio], { type: meta.mime_type ?? "audio/ogg" }), "voice.ogg");
  const res = await fetch(process.env.ZCRM_STT_URL, {
    method: "POST",
    headers: process.env.ZCRM_STT_TOKEN ? { Authorization: `Bearer ${process.env.ZCRM_STT_TOKEN}` } : {},
    body: form,
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { text?: string };
  return json.text?.trim() || null;
}
