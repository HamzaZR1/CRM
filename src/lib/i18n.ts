import { cookies } from "next/headers";

export type Lang = "en" | "fr" | "ar";
export const LANGS: { code: Lang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "ar", label: "العربية" },
];

const dict = {
  dashboard: { en: "Dashboard", fr: "Tableau de bord", ar: "لوحة التحكم" },
  orders: { en: "Orders", fr: "Commandes", ar: "الطلبات" },
  queue: { en: "Call queue", fr: "File d'appels", ar: "قائمة الاتصال" },
  inbox: { en: "WhatsApp inbox", fr: "Boîte WhatsApp", ar: "واتساب" },
  products: { en: "Products", fr: "Produits", ar: "المنتجات" },
  stock: { en: "Stock", fr: "Stock", ar: "المخزون" },
  shipping: { en: "Shipping", fr: "Livraison", ar: "التوصيل" },
  campaigns: { en: "Campaigns", fr: "Campagnes", ar: "الحملات" },
  finance: { en: "Net profit", fr: "Profit net", ar: "الربح الصافي" },
  reports: { en: "Reports", fr: "Rapports", ar: "التقارير" },
  team: { en: "Team", fr: "Équipe", ar: "الفريق" },
  automation: { en: "Automation & AI", fr: "Automatisation & IA", ar: "الأتمتة والذكاء" },
  integrations: { en: "Integrations", fr: "Intégrations", ar: "الربط" },
  settings: { en: "Settings", fr: "Paramètres", ar: "الإعدادات" },
  sales: { en: "Sales", fr: "Ventes", ar: "المبيعات" },
  operations: { en: "Operations", fr: "Opérations", ar: "العمليات" },
  growth: { en: "Growth", fr: "Croissance", ar: "النمو" },
  admin: { en: "Administration", fr: "Administration", ar: "الإدارة" },
  logout: { en: "Sign out", fr: "Déconnexion", ar: "خروج" },
  search: { en: "Search an order, a customer, a phone…", fr: "Rechercher une commande, un client…", ar: "ابحث عن طلب أو زبون…" },
} as const;

export type DictKey = keyof typeof dict;

export async function getLang(): Promise<Lang> {
  const v = (await cookies()).get("zcrm_lang")?.value;
  return v === "fr" || v === "ar" ? v : "en";
}

export function translator(lang: Lang) {
  return (k: DictKey) => dict[k][lang] ?? dict[k].en;
}
