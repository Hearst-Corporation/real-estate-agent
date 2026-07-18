"use client";

import { useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { BREAKPOINT_COLLAPSE_PX } from "@/lib/ui/constants";

const STORAGE_KEY = "cockpit:rail-right-open";
const CHANGE_EVENT = "cockpit:rail-right-open-change";

function readUserOpenPreference() {
  if (typeof window === "undefined") return true;
  // Un CHOIX EXPLICITE de l'utilisateur prime à toute largeur : sans ça, sur un
  // écran ≤1024 (laptop, tablette paysage) le garde-fou de largeur re-fermait le
  // chat à chaque render → impossible de l'ouvrir. Le garde-fou ne fixe donc plus
  // qu'un DÉFAUT (quand aucun choix n'est stocké), il ne verrouille plus.
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved !== null) return saved === "true";
  // Aucun choix stocké → défaut responsive : replié sous le seuil, ouvert au-dessus.
  return window.innerWidth > BREAKPOINT_COLLAPSE_PX;
}

function subscribeToUserOpenPreference(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener("resize", onStoreChange);
  window.addEventListener(CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener("resize", onStoreChange);
    window.removeEventListener(CHANGE_EVENT, onStoreChange);
  };
}

/**
 * État partagé d'ouverture du chat (RailRight), pour que le CenterPanel
 * puisse réserver l'espace (`pr`) en miroir de l'aside `fixed`, façon
 * bloc Tailwind Plus `application-shells__multi-column`.
 */
export function useRailRight() {
  const pathname = usePathname();
  const onInterview = pathname.startsWith("/estimations/") && pathname !== "/estimations/new";

  const userOpen = useSyncExternalStore(
    subscribeToUserOpenPreference,
    readUserOpenPreference,
    () => true,
  );
  const [override, setOverride] = useState<{ pathname: string; open: boolean } | null>(null);
  // Dérivé en render : identique au SSR (usePathname est hydration-stable) → aucun flash.
  const interviewOverride = override?.pathname === pathname ? override.open : null;
  const open = interviewOverride ?? (onInterview ? false : userOpen);

  function toggle() {
    if (onInterview) {
      // Sur l'entretien : override local, sans polluer le choix global persisté.
      setOverride((current) => ({
        pathname,
        open: current?.pathname === pathname ? !current.open : true,
      }));
      return;
    }
    localStorage.setItem(STORAGE_KEY, String(!userOpen));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }

  return { open, toggle };
}
