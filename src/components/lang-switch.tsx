"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLangAction } from "@/app/login/actions";

export function LangSwitch({ current }: { current: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <select
      aria-label="Language"
      disabled={pending}
      value={current}
      onChange={(e) => start(async () => { await setLangAction(e.target.value); router.refresh(); })}
      className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-600"
    >
      <option value="en">EN</option>
      <option value="fr">FR</option>
      <option value="ar">ع</option>
    </select>
  );
}
