"use client";

import { UI } from "@/lib/ui-strings";

export function LogoutButton({ variant = "full" }: { variant?: "icon" | "full" }) {
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/auth/login";
  }

  if (variant === "icon") {
    return (
      <button
        type="button"
        className="flex size-10 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100"
        title={UI.logout}
        aria-label={UI.logout}
        onClick={logout}
      >
        ⎋
      </button>
    );
  }

  return (
    <button
      type="button"
      className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/[0.08]"
      onClick={logout}
    >
      {UI.logout}
    </button>
  );
}
