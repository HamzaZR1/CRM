"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSession, destroySession, verifyCredentials } from "@/lib/auth";

export async function loginAction(_: { error?: string } | undefined, form: FormData) {
  const user = await verifyCredentials(String(form.get("email") ?? ""), String(form.get("password") ?? ""));
  if (!user) return { error: "Invalid email or password" };
  await createSession(user);
  const next = String(form.get("next") ?? "");
  redirect(next.startsWith("/app") ? next : user.role === "AGENT" ? "/app/queue" : "/app/dashboard");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

export async function setLangAction(lang: string) {
  (await cookies()).set("zcrm_lang", ["en", "fr", "ar"].includes(lang) ? lang : "en", { path: "/", maxAge: 60 * 60 * 24 * 365 });
}
