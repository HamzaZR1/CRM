import crypto from "node:crypto";
import type { NewOrderInput } from "./orders";
import type { Platform, Store } from "../db/schema";

/**
 * Normalisers turn each e-commerce platform's order webhook into ZCRM's NewOrderInput.
 * They are deliberately tolerant: field names differ between API versions and themes.
 */
type Any = Record<string, unknown>;
const s = (v: unknown) => (v === undefined || v === null ? "" : String(v)).trim();
const n = (v: unknown) => {
  const x = Number(typeof v === "string" ? v.replace(",", ".") : v);
  return Number.isFinite(x) ? x : 0;
};
const obj = (v: unknown): Any => (v && typeof v === "object" ? (v as Any) : {});
const arr = (v: unknown): Any[] => (Array.isArray(v) ? (v as Any[]) : []);
const fullName = (o: Any) => s(o.full_name) || s(o.name) || [s(o.first_name), s(o.last_name)].filter(Boolean).join(" ");

export function normalizeShopify(p: Any): Omit<NewOrderInput, "storeId" | "source"> {
  const ship = obj(p.shipping_address);
  const bill = obj(p.billing_address);
  const cust = obj(p.customer);
  return {
    externalId: s(p.id) || s(p.name),
    customer: {
      name: fullName(ship) || fullName(bill) || fullName(cust) || "Customer",
      phone: s(ship.phone) || s(p.phone) || s(bill.phone) || s(cust.phone),
      city: s(ship.city) || s(bill.city) || null,
      address: [s(ship.address1), s(ship.address2)].filter(Boolean).join(", ") || null,
    },
    items: arr(p.line_items).map((li) => ({
      sku: s(li.sku) || null,
      name: s(li.title) || s(li.name),
      variantName: s(li.variant_title) || null,
      quantity: n(li.quantity) || 1,
      unitPrice: n(li.price),
    })),
    shippingPrice: arr(p.shipping_lines).reduce((acc, l) => acc + n(l.price), 0),
    discount: n(p.total_discounts),
    note: s(p.note) || null,
  };
}

export function normalizeWooCommerce(p: Any): Omit<NewOrderInput, "storeId" | "source"> {
  const ship = obj(p.shipping);
  const bill = obj(p.billing);
  return {
    externalId: s(p.id) || s(p.number),
    customer: {
      name: fullName(ship) || fullName(bill) || "Customer",
      phone: s(bill.phone) || s(ship.phone),
      city: s(ship.city) || s(bill.city) || null,
      address: [s(ship.address_1) || s(bill.address_1), s(ship.address_2) || s(bill.address_2)].filter(Boolean).join(", ") || null,
    },
    items: arr(p.line_items).map((li) => ({
      sku: s(li.sku) || null,
      name: s(li.name),
      variantName: arr(li.meta_data).map((m) => s(m.display_value ?? m.value)).filter(Boolean).join(" / ") || null,
      quantity: n(li.quantity) || 1,
      unitPrice: n(li.price) || n(li.total) / (n(li.quantity) || 1),
    })),
    shippingPrice: n(p.shipping_total),
    discount: n(p.discount_total),
    note: s(p.customer_note) || null,
  };
}

export function normalizeYouCan(p: Any): Omit<NewOrderInput, "storeId" | "source"> {
  const root = obj(p.data).id ? obj(p.data) : p;
  const cust = obj(root.customer);
  const addrList = arr(obj(root.shipping).address ?? cust.address);
  const addr = addrList[0] ?? obj(obj(root.shipping).address ?? root.shipping_address);
  const lines = arr(root.variants).length ? arr(root.variants) : arr(root.items).length ? arr(root.items) : arr(root.products);
  return {
    externalId: s(root.id) || s(root.ref),
    customer: {
      name: fullName(cust) || fullName(addr) || "Customer",
      phone: s(cust.phone) || s(addr.phone) || s(root.phone),
      city: s(addr.city) || s(cust.city) || null,
      address: s(addr.first_line) || s(addr.address) || s(cust.address) || null,
    },
    items: lines.map((li) => {
      const variant = obj(li.variant);
      const product = obj(variant.product ?? li.product);
      return {
        sku: s(variant.sku) || s(li.sku) || null,
        name: s(product.name) || s(li.name) || s(li.title),
        variantName: arr(variant.variations).map(s).join(" / ") || s(variant.name) || null,
        quantity: n(li.quantity) || 1,
        unitPrice: n(li.price) || n(variant.price) || n(product.price),
      };
    }),
    shippingPrice: n(obj(root.shipping).price ?? root.shipping_price),
    discount: n(root.discount),
    note: s(root.notes ?? root.note) || null,
  };
}

/** ZCRM's own format, for custom stores, landing pages, Google Forms bridges, Zapier/Make, etc. */
export function normalizeGeneric(p: Any): Omit<NewOrderInput, "storeId" | "source"> {
  const cust = obj(p.customer);
  return {
    externalId: s(p.id ?? p.externalId) || null,
    customer: {
      name: s(cust.name ?? p.name) || "Customer",
      phone: s(cust.phone ?? p.phone),
      city: s(cust.city ?? p.city) || null,
      address: s(cust.address ?? p.address) || null,
    },
    items: arr(p.items).length
      ? arr(p.items).map((li) => ({
          sku: s(li.sku) || null,
          name: s(li.name ?? li.product),
          variantName: s(li.variant) || null,
          quantity: n(li.quantity) || 1,
          unitPrice: li.price !== undefined ? n(li.price) : undefined,
        }))
      : [{ name: s(p.product), sku: s(p.sku) || null, quantity: n(p.quantity) || 1, unitPrice: p.price !== undefined ? n(p.price) : undefined }],
    shippingPrice: n(p.shippingPrice ?? p.shipping),
    note: s(p.note) || null,
  };
}

export const NORMALIZERS: Record<string, (p: Any) => Omit<NewOrderInput, "storeId" | "source">> = {
  shopify: normalizeShopify,
  woocommerce: normalizeWooCommerce,
  youcan: normalizeYouCan,
  api: normalizeGeneric,
  manual: normalizeGeneric,
};

/** Verify platform signatures when a secret is configured on the store. */
export function verifyStoreSignature(store: Store, rawBody: string, headers: Headers) {
  if (!store.webhookSecret) return true;
  const hmac = (enc: "base64" | "hex") => crypto.createHmac("sha256", store.webhookSecret!).update(rawBody, "utf8").digest(enc);
  const eq = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  const platform = store.platform as Platform;
  if (platform === "shopify") return eq(hmac("base64"), headers.get("x-shopify-hmac-sha256") ?? "");
  if (platform === "woocommerce") return eq(hmac("base64"), headers.get("x-wc-webhook-signature") ?? "");
  const sig = headers.get("x-zcrm-signature") ?? headers.get("x-youcan-signature") ?? "";
  return eq(hmac("hex"), sig.replace(/^sha256=/, ""));
}
