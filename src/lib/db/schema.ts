import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Money is stored as integer amounts in the store currency (MAD by default).
const id = () => integer("id").primaryKey({ autoIncrement: true });
const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`);
const ts = (name: string) => integer(name, { mode: "timestamp_ms" });

export const ROLES = ["ADMIN", "MANAGER", "AGENT"] as const;
export type Role = (typeof ROLES)[number];

export const ORDER_STATUSES = [
  "NEW", // just imported
  "ASSIGNED", // waiting for confirmation (agent or automation)
  "AWAITING_REPLY", // WhatsApp sent, waiting for customer
  "NO_ANSWER", // no reply / did not pick up
  "POSTPONED", // customer asked to be called later
  "CONFIRMED", // ready to ship
  "CANCELLED",
  "SHIPPED", // handed to carrier
  "IN_TRANSIT",
  "DELIVERED",
  "RETURNED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PLATFORMS = ["youcan", "shopify", "woocommerce", "manual", "api", "campaign"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const users = sqliteTable("users", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").$type<Role>().notNull().default("AGENT"),
  phone: text("phone"),
  color: text("color").notNull().default("#2563eb"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  /** Share of incoming orders in "percentage" assignment mode (relative weight). */
  assignmentWeight: integer("assignment_weight").notNull().default(1),
  /** Commission paid per confirmed order. */
  commissionConfirmed: integer("commission_confirmed").notNull().default(0),
  /** Commission paid per delivered order. */
  commissionDelivered: integer("commission_delivered").notNull().default(0),
  createdAt: createdAt(),
});

export const stores = sqliteTable("stores", {
  id: id(),
  name: text("name").notNull(),
  platform: text("platform").$type<Platform>().notNull(),
  domain: text("domain"),
  /** Public key used in the webhook URL. */
  webhookKey: text("webhook_key").notNull().unique(),
  /** Shared secret used to verify webhook signatures (Shopify / WooCommerce HMAC). */
  webhookSecret: text("webhook_secret"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
});

export const products = sqliteTable("products", {
  id: id(),
  name: text("name").notNull(),
  sku: text("sku"),
  price: integer("price").notNull(),
  cost: integer("cost").notNull().default(0),
  emoji: text("emoji").notNull().default("📦"),
  imageUrl: text("image_url"),
  /** Optional upsell offered by the AI agent / agents (e.g. "2 for 549"). */
  upsellNote: text("upsell_note"),
  /** Free-text knowledge the AI agent may use to answer questions about this product. */
  aiNotes: text("ai_notes"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
});

export const variants = sqliteTable(
  "variants",
  {
    id: id(),
    productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sku: text("sku"),
    color: text("color"),
    /** Units physically available in the warehouse (not yet shipped). */
    stock: integer("stock").notNull().default(0),
    lowStockThreshold: integer("low_stock_threshold").notNull().default(10),
  },
  (t) => [index("variants_product_idx").on(t.productId)],
);

/** Product-based assignment: which agents handle which products. */
export const agentProducts = sqliteTable(
  "agent_products",
  {
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.productId] })],
);

export const customers = sqliteTable("customers", {
  id: id(),
  name: text("name").notNull(),
  phone: text("phone").notNull().unique(),
  city: text("city"),
  address: text("address"),
  optOut: integer("opt_out", { mode: "boolean" }).notNull().default(false),
  blacklisted: integer("blacklisted", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
});

export const carriers = sqliteTable("carriers", {
  id: id(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  color: text("color").notNull().default("#0ea5e9"),
  /** "simulator" or "http" (generic REST adapter). */
  adapter: text("adapter").notNull().default("simulator"),
  apiUrl: text("api_url"),
  apiKey: text("api_key"),
  /** Default delivery fee charged by the carrier (cost for the merchant). */
  deliveryFee: integer("delivery_fee").notNull().default(35),
  returnFee: integer("return_fee").notNull().default(10),
  connected: integer("connected", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
});

export const campaigns = sqliteTable("campaigns", {
  id: id(),
  name: text("name").notNull(),
  message: text("message").notNull(),
  productId: integer("product_id").references(() => products.id, { onDelete: "set null" }),
  discountPct: integer("discount_pct").notNull().default(0),
  /** JSON segment definition: { status?: "DELIVERED"|"ANY", city?: string, boughtProductId?: number, inactiveDays?: number } */
  segment: text("segment", { mode: "json" }).$type<CampaignSegment>().notNull(),
  status: text("status").$type<"DRAFT" | "SENT">().notNull().default("DRAFT"),
  recipients: integer("recipients").notNull().default(0),
  sentAt: ts("sent_at"),
  createdAt: createdAt(),
});
export type CampaignSegment = {
  status?: "DELIVERED" | "ANY";
  city?: string;
  boughtProductId?: number;
  inactiveDays?: number;
};

export const orders = sqliteTable(
  "orders",
  {
    id: id(),
    reference: text("reference").notNull().unique(),
    storeId: integer("store_id").references(() => stores.id, { onDelete: "set null" }),
    source: text("source").$type<Platform>().notNull().default("manual"),
    externalId: text("external_id"),
    customerId: integer("customer_id").notNull().references(() => customers.id),
    status: text("status").$type<OrderStatus>().notNull().default("NEW"),
    assignedToId: integer("assigned_to_id").references(() => users.id, { onDelete: "set null" }),
    /** Who/what confirmed: CALL (team), WHATSAPP (button), AI (AI agent). */
    confirmedVia: text("confirmed_via").$type<"CALL" | "WHATSAPP" | "AI">(),
    confirmedById: integer("confirmed_by_id").references(() => users.id, { onDelete: "set null" }),
    subtotal: integer("subtotal").notNull().default(0),
    discount: integer("discount").notNull().default(0),
    /** Shipping charged to the customer (0 = free delivery). */
    shippingPrice: integer("shipping_price").notNull().default(0),
    total: integer("total").notNull().default(0),
    /** Delivery cost paid by the merchant to the carrier. */
    deliveryCost: integer("delivery_cost").notNull().default(0),
    upsell: integer("upsell", { mode: "boolean" }).notNull().default(false),
    city: text("city"),
    address: text("address"),
    note: text("note"),
    carrierId: integer("carrier_id").references(() => carriers.id, { onDelete: "set null" }),
    trackingNumber: text("tracking_number"),
    campaignId: integer("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    attempts: integer("attempts").notNull().default(0),
    followUps: integer("follow_ups").notNull().default(0),
    lastContactAt: ts("last_contact_at"),
    postponedUntil: ts("postponed_until"),
    confirmedAt: ts("confirmed_at"),
    shippedAt: ts("shipped_at"),
    deliveredAt: ts("delivered_at"),
    returnedAt: ts("returned_at"),
    cancelledAt: ts("cancelled_at"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at"),
  },
  (t) => [
    index("orders_status_idx").on(t.status),
    index("orders_assigned_idx").on(t.assignedToId),
    index("orders_created_idx").on(t.createdAt),
    index("orders_customer_idx").on(t.customerId),
    uniqueIndex("orders_store_external_idx").on(t.storeId, t.externalId),
  ],
);

export const orderItems = sqliteTable(
  "order_items",
  {
    id: id(),
    orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
    productId: integer("product_id").notNull().references(() => products.id),
    variantId: integer("variant_id").references(() => variants.id, { onDelete: "set null" }),
    quantity: integer("quantity").notNull().default(1),
    unitPrice: integer("unit_price").notNull(),
    unitCost: integer("unit_cost").notNull().default(0),
  },
  (t) => [index("order_items_order_idx").on(t.orderId), index("order_items_product_idx").on(t.productId)],
);

export const orderEvents = sqliteTable(
  "order_events",
  {
    id: id(),
    orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    message: text("message").notNull(),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("order_events_order_idx").on(t.orderId)],
);

export const messages = sqliteTable(
  "messages",
  {
    id: id(),
    customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
    orderId: integer("order_id").references(() => orders.id, { onDelete: "set null" }),
    direction: text("direction").$type<"IN" | "OUT">().notNull(),
    kind: text("kind").$type<"TEXT" | "BUTTONS" | "AUDIO" | "IMAGE" | "SYSTEM">().notNull().default("TEXT"),
    body: text("body").notNull(),
    /** Buttons offered, button pressed, audio transcript, provider ids... */
    meta: text("meta", { mode: "json" }).$type<Record<string, unknown>>(),
    author: text("author").$type<"CUSTOMER" | "AI" | "AUTOMATION" | "AGENT" | "CAMPAIGN">().notNull(),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    providerId: text("provider_id"),
    status: text("status").$type<"QUEUED" | "SENT" | "DELIVERED" | "READ" | "FAILED" | "SIMULATED">(),
    createdAt: createdAt(),
  },
  (t) => [index("messages_customer_idx").on(t.customerId), index("messages_order_idx").on(t.orderId)],
);

export const adSpend = sqliteTable(
  "ad_spend",
  {
    id: id(),
    productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    date: text("date").notNull(), // YYYY-MM-DD
    platform: text("platform").notNull().default("facebook"),
    amount: integer("amount").notNull(),
    leads: integer("leads").notNull().default(0),
  },
  (t) => [index("ad_spend_product_idx").on(t.productId, t.date)],
);

export const stockMovements = sqliteTable(
  "stock_movements",
  {
    id: id(),
    variantId: integer("variant_id").notNull().references(() => variants.id, { onDelete: "cascade" }),
    type: text("type").$type<"IN" | "OUT" | "RETURN" | "ADJUST">().notNull(),
    quantity: integer("quantity").notNull(),
    orderId: integer("order_id").references(() => orders.id, { onDelete: "set null" }),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("stock_movements_variant_idx").on(t.variantId)],
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
});

export const cities = sqliteTable("cities", {
  id: id(),
  name: text("name").notNull().unique(),
  shippingPrice: integer("shipping_price").notNull().default(0),
});

// Convenience row types
export type User = typeof users.$inferSelect;
export type Store = typeof stores.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Variant = typeof variants.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Carrier = typeof carriers.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type Message = typeof messages.$inferSelect;

