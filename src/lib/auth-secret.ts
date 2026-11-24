/** Shared by the Node auth helpers and the Edge middleware. */
export function authSecret() {
  const s = process.env.AUTH_SECRET;
  if (!s && process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET must be set in production");
  return new TextEncoder().encode(s ?? "zcrm-dev-secret-do-not-use-in-production");
}
