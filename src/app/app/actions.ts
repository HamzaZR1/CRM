"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, t } from "@/lib/db";
import type { CampaignSegment, OrderStatus, Platform } from "@/lib/db/schema";
import { hashPassword, isManager, requireUser } from "@/lib/auth";
import { saveSettings, type AppSettings } from "@/lib/settings";
import { randomKey } from "@/lib/utils";
import { applyOffer, bulkAssign, changeStatus, createOrder, updateOrderDetails } from "@/lib/services/orders";
import { handleInbound, runAiTurn, startConfirmation } from "@/lib/services/confirmation";
import { shipOrder } from "@/lib/services/carriers";
import { sendText } from "@/lib/services/whatsapp";
import { adjustStock } from "@/lib/services/stock";
import { segmentCustomers, sendCampaign } from "@/lib/services/campaigns";
import { tick } from "@/lib/services/jobs";

export type ActionResult = { ok: boolean; message?: string };
const ok = (message?: string): ActionResult => ({ ok: true, message });
const fail = (e: unknown): ActionResult => ({ ok: false, message: e instanceof Error ? e.message : String(e) });

const manager = () => requireUser(["ADMIN", "MANAGER"]);
const admin = () => requireUser(["ADMIN"]);

/** Agents may only act on orders assigned to them. */
async function assertOrderAccess(orderId: number) {
  const user = await requireUser();
  if (isManager(user)) return user;
  const [o] = await db.select({ a: t.orders.assignedToId }).from(t.orders).where(eq(t.orders.id, orderId));
  if (o?.a !== user.id) throw new Error("This order is not assigned to you");
  return user;
}

// ---------------- Orders ----------------

export async function setOrderStatusAction(orderId: number, status: OrderStatus, opts: { note?: string; postponeHours?: number } = {}): Promise<ActionResult> {
  try {
    const user = await assertOrderAccess(orderId);
    await changeStatus(orderId, status, {
      actorId: user.id,
      via: status === "CONFIRMED" ? "CALL" : undefined,
      note: opts.note,
      postponedUntil: opts.postponeHours ? new Date(Date.now() + opts.postponeHours * 3600_000) : undefined,
    });
    revalidatePath("/app", "layout");
    return ok("Status updated");
  } catch (e) {
    return fail(e);
  }
}

export async function bulkStatusAction(ids: number[], status: OrderStatus): Promise<ActionResult> {
  try {
    const user = await manager();
    let done = 0;
    const errors: string[] = [];
    for (const id of ids) {
      try {
        await changeStatus(id, status, { actorId: user.id, via: status === "CONFIRMED" ? "CALL" : undefined });
        done++;
      } catch (e) {
        errors.push((e as Error).message);
      }
    }
    revalidatePath("/app", "layout");
    return { ok: errors.length === 0, message: `${done} updated${errors.length ? `, ${errors.length} skipped` : ""}` };
  } catch (e) {
    return fail(e);
  }
}

export async function assignOrdersAction(ids: number[], userId: number): Promise<ActionResult> {
  try {
    const user = await manager();
    await bulkAssign(ids, userId, user.id);
    revalidatePath("/app", "layout");
    return ok(`${ids.length} order(s) assigned`);
  } catch (e) {
    return fail(e);
  }
}

export async function shipOrdersAction(ids: number[], carrierId: number): Promise<ActionResult> {
  try {
    const user = await manager();
    let done = 0;
    const errors: string[] = [];
    for (const id of ids) {
      try {
        await shipOrder(id, carrierId, user.id);
        done++;
      } catch (e) {
        errors.push((e as Error).message);
      }
    }
    revalidatePath("/app", "layout");
    return { ok: errors.length === 0, message: `${done} sent to carrier${errors.length ? ` · ${errors[0]}` : ""}` };
  } catch (e) {
    return fail(e);
  }
}

export async function sendWhatsAppConfirmationAction(orderId: number): Promise<ActionResult> {
  try {
    const user = await assertOrderAccess(orderId);
    await startConfirmation(orderId, { force: true, actorId: user.id });
    revalidatePath(`/app/orders/${orderId}`);
    return ok("WhatsApp confirmation sent");
  } catch (e) {
    return fail(e);
  }
}

export async function agentReplyAction(orderId: number, text: string): Promise<ActionResult> {
  try {
    const user = await assertOrderAccess(orderId);
    if (!text.trim()) return fail("Message is empty");
    const [order] = await db.select().from(t.orders).where(eq(t.orders.id, orderId));
    const [customer] = await db.select().from(t.customers).where(eq(t.customers.id, order!.customerId));
    await sendText(customer!, text.trim(), { orderId, author: "AGENT", userId: user.id });
    revalidatePath("/app", "layout");
    return ok();
  } catch (e) {
    return fail(e);
  }
}

/** Inbox simulator: play the customer's side of the WhatsApp conversation. */
export async function simulateCustomerAction(phone: string, text: string, buttonId?: string, asVoice?: boolean): Promise<ActionResult> {
  try {
    await requireUser();
    const res = await handleInbound(
      asVoice ? { phone, voiceTranscript: text } : { phone, text: buttonId ? undefined : text, buttonId, buttonTitle: buttonId ? text : undefined },
    );
    revalidatePath("/app", "layout");
    return ok(`Handled: ${String(res.handled)}`);
  } catch (e) {
    return fail(e);
  }
}

export async function askAiAction(orderId: number, latest: string): Promise<ActionResult> {
  try {
    await assertOrderAccess(orderId);
    const [order] = await db.select().from(t.orders).where(eq(t.orders.id, orderId));
    const [customer] = await db.select().from(t.customers).where(eq(t.customers.id, order!.customerId));
    const r = await runAiTurn(orderId, customer!, latest);
    revalidatePath("/app", "layout");
    return ok(`AI: ${String(r.handled)}`);
  } catch (e) {
    return fail(e);
  }
}

export async function updateOrderAction(orderId: number, data: { city?: string; address?: string; note?: string }): Promise<ActionResult> {
  try {
    const user = await assertOrderAccess(orderId);
    await updateOrderDetails(orderId, data, user.id);
    revalidatePath(`/app/orders/${orderId}`);
    return ok("Saved");
  } catch (e) {
    return fail(e);
  }
}

export async function applyOfferAction(orderId: number, pct: number, freeShipping: boolean): Promise<ActionResult> {
  try {
    const user = await assertOrderAccess(orderId);
    await applyOffer(orderId, pct, freeShipping, user.id);
    revalidatePath(`/app/orders/${orderId}`);
    return ok("Offer applied");
  } catch (e) {
    return fail(e);
  }
}

const manualOrderSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(9),
  city: z.string().min(2),
  address: z.string().optional(),
  productId: z.coerce.number().int().positive(),
  variantId: z.coerce.number().int().optional(),
  quantity: z.coerce.number().int().min(1).max(20),
  unitPrice: z.coerce.number().int().min(0).optional(),
  shippingPrice: z.coerce.number().int().min(0).default(0),
  note: z.string().optional(),
});

export async function createManualOrderAction(_: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  let ref = "";
  let newId = 0;
  try {
    const user = await requireUser();
    const d = manualOrderSchema.parse(Object.fromEntries(form));
    const { order } = await createOrder(
      {
        source: "manual",
        customer: { name: d.name, phone: d.phone, city: d.city, address: d.address },
        items: [{ productId: d.productId, variantId: d.variantId || null, quantity: d.quantity, unitPrice: d.unitPrice || undefined }],
        shippingPrice: d.shippingPrice,
        note: d.note,
      },
      { actorId: user.id },
    );
    ref = order.reference;
    newId = order.id;
  } catch (e) {
    return fail(e instanceof z.ZodError ? e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ") : e);
  }
  revalidatePath("/app", "layout");
  redirect(`/app/orders/${newId}?created=${ref}`);
}

/** Demo helper: push a realistic order through the real webhook normaliser for a connected store. */
export async function simulateStoreOrderAction(storeId: number): Promise<ActionResult> {
  try {
    await manager();
    const [store] = await db.select().from(t.stores).where(eq(t.stores.id, storeId));
    if (!store) throw new Error("Store not found");
    const products = await db.select().from(t.products).where(eq(t.products.active, true));
    const p = products[Math.floor(Math.random() * products.length)]!;
    const names = ["Salma Benali", "Omar Tazi", "Imane Alaoui", "Khalid Idrissi", "Nadia Berrada", "Mehdi Lahlou"];
    const cities = ["Casablanca", "Rabat", "Marrakech", "Agadir", "Tanger", "Fès"];
    const name = names[Math.floor(Math.random() * names.length)]!;
    const [first, last] = name.split(" ");
    const city = cities[Math.floor(Math.random() * cities.length)]!;
    const phone = `06${Math.floor(10000000 + Math.random() * 89999999)}`;
    const { NORMALIZERS } = await import("@/lib/services/integrations");
    const sample: Record<Platform, Record<string, unknown>> = {
      shopify: { id: Date.now(), shipping_address: { first_name: first, last_name: last, phone, city, address1: "12 Rue Ibn Sina" }, line_items: [{ title: p.name, quantity: 1, price: String(p.price) }], shipping_lines: [] },
      woocommerce: { id: Date.now(), billing: { first_name: first, last_name: last, phone, city, address_1: "12 Rue Ibn Sina" }, shipping: {}, line_items: [{ name: p.name, quantity: 1, price: p.price }], shipping_total: "0" },
      youcan: { id: `yc_${Date.now()}`, customer: { full_name: name, phone, city, address: "12 Rue Ibn Sina" }, variants: [{ quantity: 1, price: p.price, variant: { product: { name: p.name } } }] },
      api: { id: `api_${Date.now()}`, customer: { name, phone, city }, items: [{ name: p.name, quantity: 1, price: p.price }] },
      manual: {}, campaign: {},
    };
    const input = (NORMALIZERS[store.platform] ?? NORMALIZERS.api!)(sample[store.platform] ?? sample.api);
    const { order } = await createOrder({ ...input, storeId: store.id, source: store.platform });
    revalidatePath("/app", "layout");
    return ok(`Imported ${order.reference} → ${order.status.replace("_", " ").toLowerCase()}`);
  } catch (e) {
    return fail(e);
  }
}

// ---------------- Products, stock, ads ----------------

const productSchema = z.object({
  id: z.coerce.number().int().optional(),
  name: z.string().min(2),
  sku: z.string().optional(),
  emoji: z.string().max(8).default("📦"),
  price: z.coerce.number().int().min(0),
  cost: z.coerce.number().int().min(0),
  upsellNote: z.string().optional(),
  aiNotes: z.string().optional(),
  variants: z.string().optional(), // "Or:60, Argent:26"
});

export async function saveProductAction(_: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  try {
    await manager();
    const d = productSchema.parse(Object.fromEntries(form));
    const values = { name: d.name, sku: d.sku || null, emoji: d.emoji || "📦", price: d.price, cost: d.cost, upsellNote: d.upsellNote || null, aiNotes: d.aiNotes || null };
    let productId = d.id;
    if (productId) await db.update(t.products).set(values).where(eq(t.products.id, productId));
    else productId = (await db.insert(t.products).values(values).returning())[0]!.id;
    if (!d.id) {
      const specs = (d.variants || "Standard:0").split(",").map((s) => s.trim()).filter(Boolean);
      await db.insert(t.variants).values(
        specs.map((spec) => {
          const [name, stock] = spec.split(":");
          return { productId: productId!, name: name!.trim() || "Standard", stock: Number(stock) || 0 };
        }),
      );
    }
    revalidatePath("/app/products");
    return ok(d.id ? "Product updated" : "Product created");
  } catch (e) {
    return fail(e);
  }
}

export async function toggleProductAction(id: number, active: boolean): Promise<ActionResult> {
  await manager();
  await db.update(t.products).set({ active }).where(eq(t.products.id, id));
  revalidatePath("/app/products");
  return ok();
}

export async function addVariantAction(productId: number, name: string, stock: number): Promise<ActionResult> {
  try {
    await manager();
    if (!name.trim()) throw new Error("Variant name required");
    await db.insert(t.variants).values({ productId, name: name.trim(), stock: Math.max(0, Math.round(stock || 0)) });
    revalidatePath("/app/stock");
    revalidatePath(`/app/products/${productId}`);
    return ok("Variant added");
  } catch (e) {
    return fail(e);
  }
}

export async function adjustStockAction(variantId: number, quantity: number, type: "IN" | "ADJUST", note?: string): Promise<ActionResult> {
  try {
    await manager();
    await adjustStock(variantId, quantity, type, note);
    revalidatePath("/app/stock");
    return ok("Stock updated");
  } catch (e) {
    return fail(e);
  }
}

export async function setThresholdAction(variantId: number, threshold: number): Promise<ActionResult> {
  await manager();
  await db.update(t.variants).set({ lowStockThreshold: Math.max(0, Math.round(threshold)) }).where(eq(t.variants.id, variantId));
  revalidatePath("/app/stock");
  return ok();
}

export async function addAdSpendAction(productId: number, date: string, amount: number, platform: string): Promise<ActionResult> {
  try {
    await manager();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !(amount > 0)) throw new Error("Valid date and amount required");
    await db.insert(t.adSpend).values({ productId, date, amount: Math.round(amount), platform: platform || "facebook" });
    revalidatePath(`/app/products/${productId}`);
    revalidatePath("/app/finance");
    return ok("Ad spend recorded");
  } catch (e) {
    return fail(e);
  }
}

// ---------------- Shipping ----------------

export async function saveCarrierAction(
  id: number,
  data: { connected: boolean; adapter: string; apiUrl?: string; apiKey?: string; deliveryFee: number; returnFee: number },
): Promise<ActionResult> {
  try {
    await admin();
    await db
      .update(t.carriers)
      .set({
        connected: data.connected,
        adapter: data.adapter === "http" ? "http" : "simulator",
        apiUrl: data.apiUrl || null,
        ...(data.apiKey ? { apiKey: data.apiKey } : {}),
        deliveryFee: Math.round(data.deliveryFee),
        returnFee: Math.round(data.returnFee),
      })
      .where(eq(t.carriers.id, id));
    revalidatePath("/app/shipping");
    return ok("Carrier saved");
  } catch (e) {
    return fail(e);
  }
}

export async function addCarrierAction(name: string, color: string): Promise<ActionResult> {
  try {
    await admin();
    const code = name.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "");
    if (!code) throw new Error("Name required");
    await db.insert(t.carriers).values({ name, code, color: color || "#0ea5e9" });
    revalidatePath("/app/shipping");
    return ok("Carrier added");
  } catch (e) {
    return fail(e);
  }
}

export async function runSchedulerAction(): Promise<ActionResult> {
  try {
    await manager();
    const r = await tick();
    revalidatePath("/app", "layout");
    if ("skipped" in r) return ok("Already running");
    return ok(`Synced ${r.shipments.checked} parcels (${r.shipments.updated} updated) · ${r.followUps.followedUp} follow-ups · ${r.followUps.handedOver} handed to team`);
  } catch (e) {
    return fail(e);
  }
}

// ---------------- Campaigns ----------------

export async function previewSegmentAction(segment: CampaignSegment): Promise<{ count: number; sample: string[] }> {
  await manager();
  const list = await segmentCustomers(segment);
  return { count: list.length, sample: list.slice(0, 5).map((c) => `${c.name} · ${c.city ?? ""}`) };
}

export async function createCampaignAction(data: { name: string; message: string; productId?: number; discountPct: number; segment: CampaignSegment; sendNow: boolean }): Promise<ActionResult> {
  try {
    const user = await manager();
    if (data.name.trim().length < 2 || data.message.trim().length < 5) throw new Error("Name and message are required");
    const [c] = await db
      .insert(t.campaigns)
      .values({ name: data.name.trim(), message: data.message.trim(), productId: data.productId || null, discountPct: Math.min(90, Math.max(0, data.discountPct)), segment: data.segment })
      .returning();
    let msg = "Campaign saved as draft";
    if (data.sendNow) msg = `Campaign sent to ${await sendCampaign(c!.id, user.id)} customers`;
    revalidatePath("/app/campaigns");
    return ok(msg);
  } catch (e) {
    return fail(e);
  }
}

export async function sendCampaignAction(id: number): Promise<ActionResult> {
  try {
    const user = await manager();
    const n = await sendCampaign(id, user.id);
    revalidatePath("/app/campaigns");
    return ok(`Sent to ${n} customers`);
  } catch (e) {
    return fail(e);
  }
}

// ---------------- Team ----------------

const userSchema = z.object({
  id: z.coerce.number().int().optional(),
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().optional(),
  role: z.enum(["ADMIN", "MANAGER", "AGENT"]),
  phone: z.string().optional(),
  color: z.string().default("#3370fa"),
  assignmentWeight: z.coerce.number().int().min(0).max(1000).default(1),
  commissionConfirmed: z.coerce.number().int().min(0).default(0),
  commissionDelivered: z.coerce.number().int().min(0).default(0),
});

export async function saveUserAction(_: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  try {
    await admin();
    const d = userSchema.parse(Object.fromEntries(form));
    const base = {
      name: d.name,
      email: d.email.toLowerCase(),
      role: d.role,
      phone: d.phone || null,
      color: d.color,
      assignmentWeight: d.assignmentWeight,
      commissionConfirmed: d.commissionConfirmed,
      commissionDelivered: d.commissionDelivered,
    };
    if (d.id) {
      await db.update(t.users).set({ ...base, ...(d.password ? { passwordHash: await hashPassword(d.password) } : {}) }).where(eq(t.users.id, d.id));
    } else {
      if (!d.password || d.password.length < 6) throw new Error("Password must be at least 6 characters");
      await db.insert(t.users).values({ ...base, passwordHash: await hashPassword(d.password) });
    }
    revalidatePath("/app/team");
    return ok(d.id ? "Member updated" : "Member added");
  } catch (e) {
    return fail(e instanceof z.ZodError ? e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ") : e);
  }
}

export async function toggleUserAction(id: number, active: boolean): Promise<ActionResult> {
  const me = await admin();
  if (me.id === id) return fail("You cannot deactivate yourself");
  await db.update(t.users).set({ active }).where(eq(t.users.id, id));
  revalidatePath("/app/team");
  return ok();
}

export async function setWeightAction(id: number, weight: number): Promise<ActionResult> {
  await manager();
  await db.update(t.users).set({ assignmentWeight: Math.max(0, Math.round(weight)) }).where(eq(t.users.id, id));
  revalidatePath("/app/automation");
  revalidatePath("/app/team");
  return ok();
}

export async function setAgentProductsAction(userId: number, productIds: number[]): Promise<ActionResult> {
  await manager();
  await db.delete(t.agentProducts).where(eq(t.agentProducts.userId, userId));
  if (productIds.length) await db.insert(t.agentProducts).values(productIds.map((productId) => ({ userId, productId })));
  revalidatePath("/app/automation");
  return ok("Products assigned");
}

// ---------------- Settings & integrations ----------------

export async function saveSettingsAction<K extends keyof AppSettings>(section: K, value: Partial<AppSettings[K]>): Promise<ActionResult> {
  try {
    await manager();
    await saveSettings(section, value);
    revalidatePath("/app", "layout");
    return ok("Settings saved");
  } catch (e) {
    return fail(e);
  }
}

export async function createStoreAction(name: string, platform: Platform, domain: string, secret: string): Promise<ActionResult> {
  try {
    await admin();
    if (name.trim().length < 2) throw new Error("Store name required");
    await db.insert(t.stores).values({ name: name.trim(), platform, domain: domain || null, webhookKey: randomKey(), webhookSecret: secret || null });
    revalidatePath("/app/integrations");
    return ok("Store connected");
  } catch (e) {
    return fail(e);
  }
}

export async function updateStoreAction(id: number, data: { active?: boolean; rotate?: boolean; secret?: string }): Promise<ActionResult> {
  await admin();
  await db
    .update(t.stores)
    .set({
      ...(data.active !== undefined ? { active: data.active } : {}),
      ...(data.rotate ? { webhookKey: randomKey() } : {}),
      ...(data.secret !== undefined ? { webhookSecret: data.secret || null } : {}),
    })
    .where(eq(t.stores.id, id));
  revalidatePath("/app/integrations");
  return ok("Store updated");
}

export async function deleteStoreAction(id: number): Promise<ActionResult> {
  await admin();
  await db.delete(t.stores).where(eq(t.stores.id, id));
  revalidatePath("/app/integrations");
  return ok("Store removed");
}

export async function blacklistCustomerAction(customerId: number, blacklisted: boolean): Promise<ActionResult> {
  await manager();
  await db.update(t.customers).set({ blacklisted }).where(eq(t.customers.id, customerId));
  revalidatePath("/app", "layout");
  return ok(blacklisted ? "Customer blacklisted" : "Customer removed from blacklist");
}

export async function getVariantsAction(productId: number) {
  await requireUser();
  return db.select({ id: t.variants.id, name: t.variants.name, stock: t.variants.stock }).from(t.variants).where(and(eq(t.variants.productId, productId)));
}

