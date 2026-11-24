import { tick } from "./lib/services/jobs";

const g = globalThis as unknown as { __zcrmScheduler?: NodeJS.Timeout };

if (process.env.ZCRM_DISABLE_SCHEDULER !== "1" && !g.__zcrmScheduler) {
  g.__zcrmScheduler = setInterval(() => {
    tick().catch((e) => console.error("[scheduler]", e));
  }, 60_000);
}
