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
        className="flex size-10 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-950/5 hover:text-zinc-900"
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
      className="w-full rounded-lg border border-zinc-950/10 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-950/5"
      onClick={logout}
    >
      {UI.logout}
    </button>
  );
}
