/* Create (or reset) an admin account: npm run admin:create -- you@company.ma "StrongPassword" "Your Name" */
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, t } from "../src/lib/db";
import { DEFAULT_SETTINGS } from "../src/lib/settings";

async function main() {
  const [email, password, name = "Admin"] = process.argv.slice(2);
  if (!email || !password || password.length < 8) throw new Error('Usage: npm run admin:create -- email "password (8+ chars)" "Name"');
  const passwordHash = await bcrypt.hash(password, 10);
  const [existing] = await db.select().from(t.users).where(eq(t.users.email, email.toLowerCase()));
  if (existing) await db.update(t.users).set({ passwordHash, role: "ADMIN", active: true }).where(eq(t.users.id, existing.id));
  else await db.insert(t.users).values({ name, email: email.toLowerCase(), passwordHash, role: "ADMIN", assignmentWeight: 0 });
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) await db.insert(t.settings).values({ key, value }).onConflictDoNothing();
  console.log(`✔ Admin ${email} ${existing ? "updated" : "created"}`);
}
main().then(() => process.exit(0), (e) => { console.error(e.message); process.exit(1); });
