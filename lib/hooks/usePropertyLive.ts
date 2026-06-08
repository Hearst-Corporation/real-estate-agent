"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

export const PROPERTY_CHANNEL = "cockpit:properties";

/** Délai (ms) avant retour du badge "Mis à jour" → "Live". */
const BADGE_RESET_MS = 5000;

/** Émet un signal "properties:changed" sur BroadcastChannel. */
export function emitPropertyChanged(): void {
  if (typeof window === "undefined") return;
  try {
    const ch = new BroadcastChannel(PROPERTY_CHANNEL);
    ch.postMessage({ type: "properties:changed", at: Date.now() });
    ch.close();
  } catch {
    // BroadcastChannel non supporté (SSR, vieux browser) → silencieux
  }
}

export type LiveState = {
  connected: boolean;
  lastEventAt: number | null;
  pendingRefresh: boolean;
  error: string | null;
};

/**
 * Écoute les changements de portefeuille via BroadcastChannel.
 * Déclenche router.refresh() avec debounce 800ms.
 * Expose un état observable pour le badge live.
 */
export function usePropertyLive(): LiveState {
  const router = useRouter();
  const [state, setState] = useState<LiveState>({
    connected: false,
    lastEventAt: null,
    pendingRefresh: false,
    error: null,
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMessage = useCallback(() => {
    setState((s) => ({ ...s, lastEventAt: Date.now(), pendingRefresh: true }));
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (resetRef.current) clearTimeout(resetRef.current);
    debounceRef.current = setTimeout(() => {
      router.refresh();
      setState((s) => ({ ...s, pendingRefresh: false }));
      // Reset badge "Mis à jour" → "Live" pour éviter un état figé.
      resetRef.current = setTimeout(() => {
        setState((s) => ({ ...s, lastEventAt: null }));
      }, BADGE_RESET_MS);
    }, 800);
  }, [router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof BroadcastChannel === "undefined") {
      // Pas de setState synchrone — on schedule via microtask
      Promise.resolve().then(() =>
        setState((s) => ({ ...s, error: "BroadcastChannel non supporté" }))
      );
      return;
    }
    let ch: BroadcastChannel;
    try {
      ch = new BroadcastChannel(PROPERTY_CHANNEL);
      ch.onmessage = (e) => {
        if (e.data?.type === "properties:changed") handleMessage();
      };
      // Pas de setState synchrone — schedule après mount
      Promise.resolve().then(() =>
        setState((s) => ({ ...s, connected: true }))
      );
    } catch {
      Promise.resolve().then(() =>
        setState((s) => ({ ...s, error: "Connexion live impossible" }))
      );
      return;
    }
    return () => {
      ch.close();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (resetRef.current) clearTimeout(resetRef.current);
    };
  }, [handleMessage]);

  return state;
}
