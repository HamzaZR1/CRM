import { eq } from "drizzle-orm";
import { db, t } from "./db";

export type AssignmentMode = "PERCENTAGE" | "PRODUCT" | "MANUAL";
export type ConfirmationMode = "TEAM" | "AUTOMATION";

export interface AppSettings {
  company: { name: string; currency: string; phone: string; logoText: string };
  assignment: { mode: AssignmentMode; autoAssign: boolean };
  confirmation: {
    mode: ConfirmationMode;
    /** Hours without reply before an automatic WhatsApp follow-up is sent. */
    followUpAfterHours: number;
    maxFollowUps: number;
    /** When automation gets no answer, hand the order to the team for a call. */
    fallbackToTeam: boolean;
    template: string;
  };
  ai: {
    enabled: boolean;
    /** Max discount (%) the AI agent may grant to save an order. */
    maxDiscountPct: number;
    allowFreeShipping: boolean;
    language: "darija" | "arabic" | "french" | "english";
    tone: string;
    extraInstructions: string;
  };
  shipping: { autoShipOnConfirm: boolean; defaultCarrierId: number | null };
  stock: { defaultLowStockThreshold: number };
}

export const DEFAULT_SETTINGS: AppSettings = {
  company: { name: "ZCRM Store", currency: "MAD", phone: "", logoText: "ZCRM" },
  assignment: { mode: "PERCENTAGE", autoAssign: true },
  confirmation: {
    mode: "AUTOMATION",
    followUpAfterHours: 2,
    maxFollowUps: 2,
    fallbackToTeam: true,
    template:
      "مرحبا {name} 👋\nشكرا على طلبك من {store}\n📍 المدينة: {city}\n🛍️ المنتوج: {products}\n💰 الثمن: {total} {currency}\nواش نأكدو ليك الطلب؟",
  },
  ai: {
    enabled: true,
    maxDiscountPct: 10,
    allowFreeShipping: true,
    language: "darija",
    tone: "friendly, short, respectful, uses a few emojis",
    extraInstructions: "",
  },
  shipping: { autoShipOnConfirm: false, defaultCarrierId: null },
  stock: { defaultLowStockThreshold: 10 },
};

type Section = keyof AppSettings;

export async function getSettings(): Promise<AppSettings> {
  const rows = await db.select().from(t.settings);
  const out = structuredClone(DEFAULT_SETTINGS) as unknown as Record<string, Record<string, unknown>>;
  for (const row of rows) {
    if (row.key in out && row.value && typeof row.value === "object") {
      out[row.key] = { ...out[row.key], ...(row.value as Record<string, unknown>) };
    }
  }
  return out as unknown as AppSettings;
}

export async function saveSettings<K extends Section>(key: K, value: Partial<AppSettings[K]>) {
  const current = (await getSettings())[key];
  const merged = { ...current, ...value };
  const existing = await db.select().from(t.settings).where(eq(t.settings.key, key));
  if (existing.length) await db.update(t.settings).set({ value: merged }).where(eq(t.settings.key, key));
  else await db.insert(t.settings).values({ key, value: merged });
  return merged;
}
