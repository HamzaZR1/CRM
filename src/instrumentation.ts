/**
 * Built-in scheduler: when ZCRM runs as a long-lived Node server (`next start`, Docker, VPS),
 * it ticks every minute. On serverless hosts, call /api/cron/tick from an external cron instead
 * and set ZCRM_DISABLE_SCHEDULER=1.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
