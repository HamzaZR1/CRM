import { and, eq } from "drizzle-orm";
import { db, t } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { aiConfigured } from "@/lib/services/ai-agent";
import { whatsappLive } from "@/lib/services/whatsapp";
import { PageHeader } from "@/components/ui";
import { AssignmentPanel, ConfirmationPanel, AiPanel } from "./automation-client";

export const metadata = { title: "Automation & AI" };

export default async function AutomationPage() {
  await requireUser(["ADMIN", "MANAGER"]);
  const settings = await getSettings();
  const agents = await db.select().from(t.users).where(and(eq(t.users.role, "AGENT"), eq(t.users.active, true)));
  const products = await db.select({ id: t.products.id, name: t.products.name, emoji: t.products.emoji }).from(t.products).where(eq(t.products.active, true));
  const links = await db.select().from(t.agentProducts);

  return (
    <>
      <PageHeader title="Automation & AI" subtitle="Decide who confirms each order — your team, or WhatsApp + an AI agent that works 24/7." />
      <div className="space-y-4">
        <AssignmentPanel
          settings={settings.assignment}
          agents={agents.map((a) => ({ id: a.id, name: a.name, color: a.color, weight: a.assignmentWeight, products: links.filter((l) => l.userId === a.id).map((l) => l.productId) }))}
          products={products}
        />
        <ConfirmationPanel settings={settings.confirmation} live={whatsappLive()} storeName={settings.company.name} currency={settings.company.currency} />
        <AiPanel settings={settings.ai} claude={aiConfigured()} />
      </div>
    </>
  );
}
