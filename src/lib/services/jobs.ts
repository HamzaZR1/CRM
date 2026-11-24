import { runFollowUps } from "./confirmation";
import { syncShipments } from "./carriers";

let running = false;

/** One scheduler tick: WhatsApp follow-ups, postponed orders, carrier status sync. */
export async function tick() {
  if (running) return { skipped: true };
  running = true;
  try {
    const followUps = await runFollowUps();
    const shipments = await syncShipments();
    return { followUps, shipments, at: new Date().toISOString() };
  } finally {
    running = false;
  }
}
