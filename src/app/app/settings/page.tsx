import { eq } from "drizzle-orm";
import { db, t } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { aiConfigured } from "@/lib/services/ai-agent";
import { whatsappLive } from "@/lib/services/whatsapp";
import { Badge, Card, PageHeader } from "@/components/ui";
import { CompanyForm, ShippingForm } from "./settings-client";

export const metadata = { title: "Settings" };

function EnvRow({ name, ok, hint }: { name: string; ok: boolean; hint: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-50 py-2.5 text-sm">
      <div><code className="font-semibold">{name}</code><div className="text-xs text-slate-500">{hint}</div></div>
      {ok ? <Badge tone="green">Configured</Badge> : <Badge tone="amber">Not set</Badge>}
    </div>
  );
}

export default async function SettingsPage() {
  await requireUser(["ADMIN", "MANAGER"]);
  const settings = await getSettings();
  const carriers = await db.select({ id: t.carriers.id, name: t.carriers.name }).from(t.carriers).where(eq(t.carriers.connected, true));
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";

  return (
    <>
      <PageHeader title="Settings" subtitle="Your server, your domain, your data — no monthly subscription." />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Company"><CompanyForm company={settings.company} stock={settings.stock} /></Card>
        <Card title="Shipping automation"><ShippingForm shipping={settings.shipping} carriers={carriers} /></Card>
        <Card title="Connections (environment variables)" className="xl:col-span-2">
          <EnvRow name="ANTHROPIC_API_KEY" ok={aiConfigured()} hint="Enables the Claude-powered AI confirmation agent. Model: ZCRM_AI_MODEL (default claude-opus-5-5)." />
          <EnvRow name="WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID" ok={whatsappLive()} hint="Meta WhatsApp Cloud API. Without them, the built-in simulator is used." />
          <EnvRow name="WHATSAPP_CONFIRM_TEMPLATE" ok={Boolean(process.env.WHATSAPP_CONFIRM_TEMPLATE)} hint="Approved template (5 body variables + quick replies) for the first, business-initiated confirmation message." />
          <EnvRow name="WHATSAPP_APP_SECRET" ok={Boolean(process.env.WHATSAPP_APP_SECRET)} hint="Verifies X-Hub-Signature-256 on incoming WhatsApp webhooks." />
          <EnvRow name="ZCRM_STT_URL" ok={Boolean(process.env.ZCRM_STT_URL)} hint="Whisper-compatible speech-to-text endpoint for customer voice notes." />
          <EnvRow name="AUTH_SECRET" ok={Boolean(process.env.AUTH_SECRET)} hint="Signs session cookies. Required in production." />
          <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm">
            <div className="font-semibold">WhatsApp webhook</div>
            <div className="mt-1 text-slate-600">Callback URL: <code className="text-brand-700">{appUrl}/api/webhooks/whatsapp</code> · Verify token: <code>WHATSAPP_VERIFY_TOKEN</code> (default <code>zcrm-verify</code>) · Subscribe to <code>messages</code>.</div>
            <div className="mt-3 font-semibold">Scheduler</div>
            <div className="mt-1 text-slate-600">Runs every minute inside the server. On serverless hosting, call <code className="text-brand-700">{appUrl}/api/cron/tick</code> with <code>Authorization: Bearer CRON_SECRET</code>.</div>
          </div>
        </Card>
      </div>
    </>
  );
}
