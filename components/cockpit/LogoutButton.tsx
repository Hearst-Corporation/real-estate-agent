"use client";

export function LogoutButton({ variant = "full" }: { variant?: "icon" | "full" }) {
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/auth/login";
  }

  if (variant === "icon") {
    return (
      <button type="button" className="ct-rail-action" title="Se déconnecter" aria-label="Se déconnecter" onClick={logout}>
        ⎋
      </button>
    );
  }

  return (
    <button type="button" className="ct-logout-full" onClick={logout}>
      Se déconnecter
    </button>
  );
}
