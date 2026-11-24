/* Seeds a demo workspace: team, stores, catalogue, carriers, ~30 days of orders, ad spend, conversations. */
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { db, t } from "../src/lib/db";
import type { OrderStatus } from "../src/lib/db/schema";
import { DEFAULT_SETTINGS } from "../src/lib/settings";
import { randomKey } from "../src/lib/utils";

let seed = 20261124;
const rnd = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
};
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]!;
const weighted = <T,>(a: readonly (readonly [T, number])[]) => {
  const total = a.reduce((s, [, w]) => s + w, 0);
  let r = rnd() * total;
  for (const [v, w] of a) if ((r -= w) <= 0) return v;
  return a[a.length - 1]![0];
};

async function reset() {
  for (const table of [
    "stock_movements", "ad_spend", "messages", "order_events", "order_items", "orders", "campaigns",
    "agent_products", "variants", "products", "customers", "carriers", "stores", "users", "settings", "cities",
  ]) {
    await db.run(sql.raw(`DELETE FROM ${table}`));
  }
  await db.run(sql.raw(`DELETE FROM sqlite_sequence`)).catch(() => undefined);
}

async function main() {
  console.log("Seeding ZCRM demo data…");
  await reset();

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) await db.insert(t.settings).values({ key, value });

  // ---- Team
  const admin = await bcrypt.hash("admin123", 10);
  const agentPw = await bcrypt.hash("agent123", 10);
  await db.insert(t.users).values([
    { name: "Admin ZCRM", email: "admin@zcrm.ma", passwordHash: admin, role: "ADMIN", color: "#1d4ed8", assignmentWeight: 0 },
    { name: "Meriem (Manager)", email: "manager@zcrm.ma", passwordHash: agentPw, role: "MANAGER", color: "#7c3aed", assignmentWeight: 0 },
  ]);
  const agentDefs = [
    { name: "Sara", color: "#ec4899", weight: 30, quality: 1.08 },
    { name: "Youssef", color: "#0ea5e9", weight: 25, quality: 1.02 },
    { name: "Nadia", color: "#8b5cf6", weight: 20, quality: 0.97 },
    { name: "Karim", color: "#f59e0b", weight: 15, quality: 0.9 },
    { name: "Hamza", color: "#ef4444", weight: 10, quality: 0.82 },
  ];
  const agents = await db
    .insert(t.users)
    .values(
      agentDefs.map((a) => ({
        name: a.name,
        email: `${a.name.toLowerCase()}@zcrm.ma`,
        passwordHash: agentPw,
        role: "AGENT" as const,
        color: a.color,
        assignmentWeight: a.weight,
        commissionConfirmed: 5,
        commissionDelivered: 5,
      })),
    )
    .returning();

  // ---- Stores
  const stores = await db
    .insert(t.stores)
    .values([
      { name: "Atlas Store", platform: "youcan", domain: "atlas-store.youcan.shop", webhookKey: randomKey() },
      { name: "Atlas Shopify", platform: "shopify", domain: "atlas.myshopify.com", webhookKey: randomKey() },
      { name: "Atlas Woo", platform: "woocommerce", domain: "atlas-shop.ma", webhookKey: randomKey() },
    ])
    .returning();

  // ---- Catalogue
  const catalogue = [
    { name: "Montre Classic Gold", emoji: "⌚", price: 349, cost: 110, conf: 0.74, deliv: 0.78, ads: 470, upsell: "2 montres = 599 MAD", notes: "Montre homme/femme, bracelet cuir, boîtier acier inoxydable 40mm, étanche 3ATM, garantie 6 mois. Livraison 24-48h, paiement à la livraison.", variants: [["Or", "#d4a017", 60], ["Argent", "#c0c0c0", 26], ["Noir", "#111827", 6]] },
    { name: "Sérum Éclat", emoji: "🧴", price: 299, cost: 60, conf: 0.71, deliv: 0.77, ads: 300, upsell: "2 flacons = 499 MAD", notes: "Sérum vitamine C 30ml pour éclat du teint, convient à tous types de peau. Utiliser matin et soir.", variants: [["30 ml", null, 132]] },
    { name: "Sneakers White", emoji: "👟", price: 399, cost: 140, conf: 0.71, deliv: 0.76, ads: 380, upsell: null, notes: "Baskets blanches unisexes, semelle confortable. Tailles 39 à 44, taille normale.", variants: [["40", null, 18], ["41", null, 22], ["42", null, 25], ["43", null, 14]] },
    { name: "Sac Élégance", emoji: "👜", price: 449, cost: 150, conf: 0.69, deliv: 0.71, ads: 330, upsell: null, notes: "Sac à main femme en simili cuir, 3 compartiments.", variants: [["Noir", "#111827", 40], ["Camel", "#c19a6b", 28]] },
    { name: "Lunettes Sun", emoji: "🕶️", price: 199, cost: 80, conf: 0.58, deliv: 0.52, ads: 520, upsell: null, notes: "Lunettes de soleil polarisées UV400.", variants: [["Noir", "#111827", 74]] },
  ] as const;

  const products = [];
  const variantsByProduct = new Map<number, { id: number }[]>();
  for (const c of catalogue) {
    const [p] = await db
      .insert(t.products)
      .values({ name: c.name, emoji: c.emoji, price: c.price, cost: c.cost, sku: c.name.replace(/\W+/g, "-").toUpperCase(), upsellNote: c.upsell, aiNotes: c.notes })
      .returning();
    const vs = await db
      .insert(t.variants)
      .values(c.variants.map(([name, color, stock]) => ({ productId: p!.id, name, color, stock, sku: `${p!.sku}-${name.replace(/\W+/g, "").toUpperCase()}` })))
      .returning();
    variantsByProduct.set(p!.id, vs);
    products.push({ ...p!, def: c });
  }
  // Product-based assignment example: Sara handles watches, Youssef sneakers.
  await db.insert(t.agentProducts).values([
    { userId: agents[0]!.id, productId: products[0]!.id },
    { userId: agents[1]!.id, productId: products[2]!.id },
  ]);

  // ---- Carriers
  const carrierDefs = [
    ["Ozon Express", "ozon", "#facc15", true, 0.84], ["Sendit", "sendit", "#4f46e5", true, 0.79], ["Cathedis", "cathedis", "#e11d48", true, 0.73],
    ["Ameex", "ameex", "#dc2626", true, 0.66], ["Speedaf", "speedaf", "#f97316", true, 0.62], ["Digylog", "digylog", "#2563eb", false, 0.75],
    ["Vitex", "vitex", "#1e3a8a", false, 0.7], ["O Livraison", "olivraison", "#059669", false, 0.72], ["Oscario", "oscario", "#0284c7", false, 0.7],
  ] as const;
  const carriers = await db
    .insert(t.carriers)
    .values(carrierDefs.map(([name, code, color, connected]) => ({ name, code, color, connected, deliveryFee: 35, returnFee: 10 })))
    .returning();
  const carrierQuality = new Map(carriers.map((c, i) => [c.id, carrierDefs[i]![4]]));
  const activeCarriers = carriers.filter((c) => c.connected);

  // ---- Cities
  const cityDefs = [
    ["Casablanca", 0.82, 30], ["Rabat", 0.78, 14], ["Marrakech", 0.74, 12], ["Tanger", 0.69, 10], ["Fès", 0.61, 9], ["Agadir", 0.67, 7],
    ["Meknès", 0.64, 6], ["Oujda", 0.58, 5], ["Kénitra", 0.7, 4], ["Tétouan", 0.66, 3],
  ] as const;
  await db.insert(t.cities).values(cityDefs.map(([name]) => ({ name, shippingPrice: 0 })));

  // ---- Customers
  const first = ["Salma", "Omar", "Nadia", "Karim", "Imane", "Khalid", "Fatima", "Youssef", "Meryem", "Hicham", "Zineb", "Amine", "Sanae", "Rachid", "Hajar", "Mehdi", "Kawtar", "Anas", "Laila", "Soufiane", "Asmae", "Ayoub", "Ghita", "Ilyas", "Houda", "Reda", "Siham", "Adil", "Chaimae", "Othmane"];
  const last = ["Benali", "El Amrani", "Alaoui", "Bennani", "Tazi", "Idrissi", "Berrada", "Chraibi", "El Fassi", "Lahlou", "Ouazzani", "Kettani", "Sebti", "Naciri", "Belhaj", "Ziani"];
  const streets = ["Bd Zerktouni", "Rue Ibn Sina", "Av. Mohammed V", "Hay Riad", "Rue Allal Ben Abdellah", "Quartier Maarif", "Av. Hassan II", "Rue Moulay Youssef"];
  const customers = [];
  const usedPhones = new Set<string>();
  for (let i = 0; i < 520; i++) {
    let phone = "";
    do phone = `2126${Math.floor(10000000 + rnd() * 89999999)}`;
    while (usedPhones.has(phone));
    usedPhones.add(phone);
    const city = weighted(cityDefs.map((c) => [c, c[2]] as const));
    customers.push({ name: `${pick(first)} ${pick(last)}`, phone, city: city[0], address: `${Math.floor(rnd() * 200) + 1} ${pick(streets)}, ${city[0]}` });
  }
  const customerRows = await db.insert(t.customers).values(customers).returning();
  const cityQuality = new Map(cityDefs.map((c) => [c[0] as string, c[1] as number]));

  // ---- Orders over the last 30 days
  const now = Date.now();
  const DAY = 86400_000;
  let ref = 1001;
  const pickAgent = () => weighted(agents.map((a, i) => [{ a, q: agentDefs[i]!.quality }, a.assignmentWeight] as const));
  type OrderRow = typeof t.orders.$inferInsert;
  const orderRows: OrderRow[] = [];
  const itemRows: { refIdx: number; productId: number; variantId: number; quantity: number; unitPrice: number; unitCost: number }[] = [];
  const eventRows: { refIdx: number; type: string; message: string; at: Date }[] = [];

  const productWeights = [[0, 34], [1, 22], [2, 18], [3, 12], [4, 14]] as const;
  for (let d = 30; d >= 0; d--) {
    const perDay = Math.round(16 + rnd() * 12 + (30 - d) * 0.35);
    for (let k = 0; k < perDay; k++) {
      const createdAt = new Date(now - d * DAY - rnd() * (d === 0 ? 10 * 3600_000 : DAY));
      if (createdAt.getTime() > now) continue;
      const ageDays = (now - createdAt.getTime()) / DAY;
      const pIdx = weighted(productWeights);
      const prod = products[pIdx]!;
      const variants = variantsByProduct.get(prod.id)!;
      const customer = pick(customerRows);
      const { a: agent, q } = pickAgent();
      const qty = rnd() < (prod.def.upsell ? 0.2 : 0.08) ? 2 : 1;
      const unitPrice = qty === 2 && prod.def.upsell ? Math.round(Number(prod.def.upsell.match(/(\d+)\s*MAD/)?.[1] ?? prod.price * 2) / 2) : prod.price;
      const subtotal = unitPrice * qty;
      const source = weighted([["youcan", 55], ["shopify", 25], ["woocommerce", 15], ["manual", 5]] as const);
      const store = source === "youcan" ? stores[0]! : source === "shopify" ? stores[1]! : source === "woocommerce" ? stores[2]! : null;

      let status: OrderStatus;
      const o: OrderRow = {
        reference: `ZC-${ref++}`,
        storeId: store?.id ?? null,
        source,
        externalId: store ? String(100000 + ref) : null,
        customerId: customer.id,
        assignedToId: agent.id,
        subtotal,
        discount: 0,
        shippingPrice: 0,
        total: subtotal,
        upsell: qty > 1,
        city: customer.city,
        address: customer.address,
        createdAt,
        updatedAt: createdAt,
        status: "NEW",
      };
      const at = (h: number) => new Date(Math.min(now, createdAt.getTime() + h * 3600_000));
      const idx = orderRows.length;
      eventRows.push({ refIdx: idx, type: "CREATED", message: `Order received from ${source}`, at: createdAt });
      eventRows.push({ refIdx: idx, type: "ASSIGNED", message: `Auto-assigned to ${agent.name} (percentage mode)`, at: createdAt });

      if (ageDays < 0.12) {
        status = weighted([["ASSIGNED", 3], ["AWAITING_REPLY", 5], ["NEW", 1]] as const);
        if (status === "AWAITING_REPLY") o.lastContactAt = at(0.05);
      } else {
        const pConf = Math.min(0.95, prod.def.conf * q);
        const confirmed = rnd() < pConf;
        if (!confirmed) {
          status = ageDays < 1.5 ? weighted([["NO_ANSWER", 3], ["POSTPONED", 2], ["CANCELLED", 4]] as const) : "CANCELLED";
          if (status === "CANCELLED") o.cancelledAt = at(2);
          if (status === "POSTPONED") o.postponedUntil = new Date(now + rnd() * DAY);
          if (status === "NO_ANSWER") o.attempts = 1 + Math.floor(rnd() * 3);
        } else {
          const via = weighted([["AI", 45], ["WHATSAPP", 25], ["CALL", 30]] as const);
          o.confirmedVia = via;
          o.confirmedById = agent.id;
          o.confirmedAt = at(0.5 + rnd() * 3);
          eventRows.push({ refIdx: idx, type: "STATUS_CONFIRMED", message: `Status → confirmed (via ${via})`, at: o.confirmedAt });
          if (via === "AI" && rnd() < 0.25) {
            o.discount = Math.round(subtotal * 0.1);
            o.total = subtotal - o.discount;
          }
          if (ageDays < 0.6) status = "CONFIRMED";
          else {
            const carrier = weighted(activeCarriers.map((c, i) => [c, [40, 25, 15, 12, 8][i] ?? 5] as const));
            o.carrierId = carrier.id;
            o.trackingNumber = `${carrier.code.toUpperCase().slice(0, 3)}-${ref}-${Math.floor(rnd() * 9000 + 1000)}`;
            o.deliveryCost = carrier.deliveryFee;
            o.shippedAt = at(8 + rnd() * 10);
            eventRows.push({ refIdx: idx, type: "STATUS_SHIPPED", message: `Sent to ${carrier.name} · ${o.trackingNumber}`, at: o.shippedAt });
            if (ageDays < 2.5) status = rnd() < 0.5 ? "SHIPPED" : "IN_TRANSIT";
            else {
              const pDel = prod.def.deliv * 0.4 + (cityQuality.get(customer.city!) ?? 0.7) * 0.3 + (carrierQuality.get(carrier.id) ?? 0.7) * 0.3;
              if (rnd() < Math.min(0.97, pDel * (0.9 + q * 0.1))) {
                status = "DELIVERED";
                o.deliveredAt = at(48 + rnd() * 30);
              } else {
                status = "RETURNED";
                o.returnedAt = at(72 + rnd() * 48);
                o.deliveryCost = carrier.deliveryFee + carrier.returnFee;
              }
              eventRows.push({ refIdx: idx, type: `STATUS_${status}`, message: `Status → ${status.toLowerCase()}`, at: (o.deliveredAt ?? o.returnedAt)! });
            }
          }
        }
      }
      o.status = status;
      orderRows.push(o);
      const variant = pick(variants);
      itemRows.push({ refIdx: idx, productId: prod.id, variantId: variant.id, quantity: qty, unitPrice, unitCost: prod.cost });
    }
  }

  const inserted: { id: number }[] = [];
  for (let i = 0; i < orderRows.length; i += 200) {
    inserted.push(...(await db.insert(t.orders).values(orderRows.slice(i, i + 200)).returning({ id: t.orders.id })));
  }
  const items = itemRows.map(({ refIdx, ...r }) => ({ ...r, orderId: inserted[refIdx]!.id }));
  for (let i = 0; i < items.length; i += 300) await db.insert(t.orderItems).values(items.slice(i, i + 300));
  const events = eventRows.map(({ refIdx, at, ...r }) => ({ ...r, orderId: inserted[refIdx]!.id, createdAt: at }));
  for (let i = 0; i < events.length; i += 300) await db.insert(t.orderEvents).values(events.slice(i, i + 300));

  // ---- Ad spend (Facebook) per product per day
  const spend = [];
  for (let d = 30; d >= 0; d--) {
    const date = new Date(now - d * DAY).toISOString().slice(0, 10);
    for (const p of products) spend.push({ productId: p.id, date, platform: "facebook", amount: Math.round(p.def.ads * (0.75 + rnd() * 0.5)), leads: 0 });
  }
  await db.insert(t.adSpend).values(spend);

  // ---- Demo WhatsApp conversations on recent orders
  const recent = orderRows
    .map((o, i) => ({ o, id: inserted[i]!.id }))
    .filter(({ o }) => o.status === "CONFIRMED" && o.confirmedVia === "AI")
    .slice(-3);
  for (const { o, id } of recent) {
    const c = customerRows.find((x) => x.id === o.customerId)!;
    const item = items.find((i) => i.orderId === id)!;
    const p = products.find((x) => x.id === item.productId)!;
    const t0 = (o.createdAt as Date).getTime();
    const msgs = [
      { direction: "OUT" as const, kind: "BUTTONS" as const, author: "AUTOMATION" as const, body: `مرحبا ${c.name.split(" ")[0]} 👋\nشكرا على طلبك من Atlas Store\n📍 المدينة: ${c.city}\n🛍️ المنتوج: ${p.name}\n💰 الثمن: ${o.subtotal} MAD\nواش نأكدو ليك الطلب؟`, meta: { buttons: [{ id: "confirm", title: "✅ أكد الطلب" }, { id: "postpone", title: "📅 أجل الطلب" }, { id: "cancel", title: "❌ لغي الطلب" }] }, m: 1 },
      { direction: "IN" as const, kind: "AUDIO" as const, author: "CUSTOMER" as const, body: "🎤 شحال الثمن؟ واش كاين التوصيل فابور؟", meta: { transcript: "شحال الثمن؟ واش كاين التوصيل فابور؟" }, m: 9 },
      { direction: "OUT" as const, kind: "TEXT" as const, author: "AI" as const, body: `مرحبا ${c.name.split(" ")[0]} 👋 ${p.name} متوفرة بـ ${o.subtotal} درهم. 🎁 إلا أكدتي دابا عندك -10% والتوصيل فابور 🚚`, meta: {}, m: 10 },
      { direction: "IN" as const, kind: "TEXT" as const, author: "CUSTOMER" as const, body: "صافي، أكد ليا 👍", meta: {}, m: 14 },
      { direction: "OUT" as const, kind: "TEXT" as const, author: "AI" as const, body: "✅ تم تأكيد الطلب ديالك! غادي يوصلك قريب إن شاء الله 🚚", meta: {}, m: 15 },
    ];
    await db.insert(t.messages).values(
      msgs.map(({ m, ...x }) => ({ ...x, customerId: c.id, orderId: id, status: "SIMULATED" as const, createdAt: new Date(t0 + m * 60_000) })),
    );
  }

  // ---- A sent campaign with attributed orders
  const [camp] = await db
    .insert(t.campaigns)
    .values({
      name: "Sérum -20% anciens clients",
      message: "🎁 عرض جديد غير ليك {name}: {product} بـ {price} {currency} (-{discount}%)",
      productId: products[1]!.id,
      discountPct: 20,
      segment: { status: "DELIVERED" },
      status: "SENT",
      recipients: 312,
      sentAt: new Date(now - 6 * DAY),
    })
    .returning();
  const campOrders = orderRows
    .map((o, i) => ({ o, id: inserted[i]!.id }))
    .filter(({ o }) => (o.createdAt as Date).getTime() > now - 6 * DAY && items.find((x) => x.orderId)?.productId)
    .filter((_, i) => i % 9 === 0)
    .slice(0, 38);
  for (const { id } of campOrders) await db.update(t.orders).set({ campaignId: camp!.id, source: "campaign" }).where(sql`${t.orders.id} = ${id}`);

  console.log(`✔ ${orderRows.length} orders, ${customerRows.length} customers, ${products.length} products, ${carriers.length} carriers`);
  console.log("Login: admin@zcrm.ma / admin123  ·  agents: sara@zcrm.ma / agent123");
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
