/* End-to-end smoke test against a running server with seeded data: store webhooks → assignment → WhatsApp → AI agent. Usage: ZCRM_URL=http://localhost:3000 node scripts/e2e-smoke.mjs */
import { createClient } from "@libsql/client";
const db = createClient({ url: process.env.DATABASE_URL ?? "file:data/zcrm.db" });
const q = async (s, a = []) => (await db.execute({ sql: s, args: a })).rows;
const B = process.env.ZCRM_URL ?? "http://localhost:3000";
const post = async (path, body) => { const r = await fetch(B + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); return [r.status, await r.json()]; };
const stores = await q("select id, platform, webhook_key from stores");
const key = (p) => stores.find((s) => s.platform === p).webhook_key;

const shop = await post(`/api/webhooks/orders/${key("shopify")}`, { id: 9001, shipping_address: { first_name: "Test", last_name: "Shopify", phone: "+212 661-000001", city: "Rabat", address1: "1 Av. Fal" }, line_items: [{ title: "Montre Classic Gold", variant_title: "Noir", quantity: 1, price: "349.00" }], shipping_lines: [{ price: "0.00" }], total_discounts: "0" });
console.log("shopify", shop);
console.log("shopify dup", await post(`/api/webhooks/orders/${key("shopify")}`, { id: 9001, shipping_address: { phone: "0661000001" }, line_items: [{ title: "x", quantity: 1, price: "1" }] }));
console.log("woo", await post(`/api/webhooks/orders/${key("woocommerce")}`, { id: 5501, billing: { first_name: "Test", last_name: "Woo", phone: "0662000002", city: "Fès", address_1: "Bd 1" }, shipping: {}, line_items: [{ name: "Sérum Éclat", quantity: 2, price: 249.5 }], shipping_total: "20" }));
console.log("youcan", await post(`/api/webhooks/orders/${key("youcan")}`, { id: "yc-77", customer: { full_name: "Test YouCan", phone: "0663000003", city: "Marrakech" }, variants: [{ quantity: 1, price: 399, variant: { product: { name: "Sneakers White" }, variations: ["42"] } }] }));
console.log("bad key", await post(`/api/webhooks/orders/nope`, {}));

const [o] = await q("select o.id, o.reference, o.status, u.name agent, o.total from orders o left join users u on u.id=o.assigned_to_id where o.external_id='9001'");
console.log("order after import:", o);
console.log("messages:", (await q("select direction, author, kind, substr(body,1,40) b from messages where order_id=?", [o.id])).map((m) => `${m.direction}/${m.author}/${m.kind}: ${m.b.replace(/\n/g, " ")}`));

const wa = (from, msg) => ({ entry: [{ changes: [{ value: { contacts: [{ wa_id: from, profile: { name: "T" } }], messages: [{ id: "wamid." + Math.random(), from, ...msg }] } }] }] });
// Shopify customer taps "Confirm"
console.log("wa button", await post("/api/webhooks/whatsapp", wa("212661000001", { type: "interactive", interactive: { button_reply: { id: "confirm", title: "✅ أكد الطلب" } } })));
console.log("after confirm:", (await q("select status, confirmed_via from orders where id=?", [o.id]))[0]);
// Woo customer hesitates on price -> AI offer, then confirms
const [w] = await q("select id from orders where external_id='5501'");
console.log("wa text1", await post("/api/webhooks/whatsapp", wa("212662000002", { type: "text", text: { body: "غالية شوية، والتوصيل بشحال؟" } })));
console.log("after hesitation:", (await q("select status, discount, shipping_price, total from orders where id=?", [w.id]))[0]);
console.log("wa text2", await post("/api/webhooks/whatsapp", wa("212662000002", { type: "text", text: { body: "صافي أكد ليا" } })));
console.log("after AI confirm:", (await q("select status, confirmed_via, total from orders where id=?", [w.id]))[0]);
console.log("AI msgs:", (await q("select author, substr(body,1,80) b from messages where order_id=? and direction='OUT'", [w.id])).map((m) => `${m.author}: ${m.b}`));
// YouCan customer postpones by text
const [y] = await q("select id from orders where external_id='yc-77'");
await post("/api/webhooks/whatsapp", wa("212663000003", { type: "text", text: { body: "عيط ليا غدا من فضلك" } }));
console.log("youcan after 'call me tomorrow':", (await q("select status, postponed_until from orders where id=?", [y.id]))[0]);
// Webhook verify handshake
const v = await fetch(B + "/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=zcrm-verify&hub.challenge=42");
console.log("verify", v.status, await v.text());
