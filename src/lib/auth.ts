import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, t } from "./db";
import type { Role, User } from "./db/schema";
import { authSecret } from "./auth-secret";

export const SESSION_COOKIE = "zcrm_session";
const MAX_AGE = 60 * 60 * 24 * 14; // 14 days

const secret = authSecret;

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}

export async function verifyCredentials(email: string, password: string): Promise<User | null> {
  const [user] = await db.select().from(t.users).where(eq(t.users.email, email.trim().toLowerCase()));
  if (!user || !user.active) return null;
  return (await bcrypt.compare(password, user.passwordHash)) ? user : null;
}

export async function createSession(user: User) {
  const token = await new SignJWT({ sub: String(user.id), role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function verifyToken(token: string | undefined) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return { userId: Number(payload.sub), role: payload.role as Role };
  } catch {
    return null;
  }
}

export type SessionUser = Omit<User, "passwordHash">;

export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await verifyToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const [user] = await db.select().from(t.users).where(eq(t.users.id, session.userId));
  if (!user || !user.active) return null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash, ...safe } = user;
  return safe;
}

/** For server components / actions: require a signed-in user (optionally with a role). */
export async function requireUser(roles?: Role[]): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (roles && !roles.includes(user.role)) redirect("/app/dashboard?denied=1");
  return user;
}

export const isManager = (u: Pick<User, "role">) => u.role === "ADMIN" || u.role === "MANAGER";
