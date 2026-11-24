import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

export default async function AppIndex() {
  const user = await requireUser();
  redirect(user.role === "AGENT" ? "/app/queue" : "/app/dashboard");
}
