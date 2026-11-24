import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Logo } from "@/components/ui";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getCurrentUser()) redirect("/app/dashboard");
  const { next } = await searchParams;
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-4">
      <div className="dot-grid absolute inset-0 opacity-60" />
      <div className="absolute -top-40 left-1/2 h-[480px] w-[900px] -translate-x-1/2 rounded-full bg-brand-500/20 blur-3xl" />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex justify-center"><Logo /></div>
        <div className="card p-6">
          <h1 className="text-lg font-bold">Welcome back</h1>
          <p className="mb-5 mt-1 text-sm text-slate-500">Sign in to your ZCRM workspace.</p>
          <LoginForm next={next} />
        </div>
        <p className="mt-4 text-center text-xs text-slate-500">
          Demo: admin@zcrm.ma / admin123 · agent: sara@zcrm.ma / agent123
        </p>
      </div>
    </main>
  );
}
