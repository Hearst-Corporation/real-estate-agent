"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Construit l'URL « propre » d'après le pathname et les search params actuels,
 * en retirant SEULEMENT `param` et en préservant tous les autres.
 *
 * Fonction pure (sans React) → testable unitairement.
 * Retourne `null` si `param` n'est pas présent à "1" (rien à nettoyer).
 */
export function cleanUrlWithoutParam(
  pathname: string,
  search: URLSearchParams,
  param: string,
): string | null {
  if (search.get(param) !== "1") return null;
  const next = new URLSearchParams(search.toString());
  next.delete(param);
  const query = next.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/**
 * Ouvre un drawer/modale au montage quand l'URL porte `?<param>=1`, puis nettoie
 * l'URL (retire SEULEMENT ce param, préserve les autres) pour éviter toute
 * réouverture au refresh ou au retour navigateur.
 *
 * Utilisé par les quick actions « Nouveau bien / client / visite » qui pointent
 * vers `/properties?new=1`, `/leads?new=1`, `/visits?new=1`. Sans ce hook, le
 * param est inerte : on arrive sur la liste sans ouvrir le formulaire.
 *
 * @param param  nom du query param déclencheur (ex. "new") — chaîne vide = no-op
 * @param onOpen callback d'ouverture du drawer (ex. () => setOpen(true)) ; doit
 *               être stable (mémoïsé via useCallback) pour éviter de rejouer l'effet
 */
export function useOpenFromQuery(param: string, onOpen: () => void): void {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!param) return;
    const cleanUrl = cleanUrlWithoutParam(pathname, searchParams, param);
    if (cleanUrl === null) return; // param absent → rien à faire

    onOpen();
    // Retire le param : l'effet se rejoue mais `cleanUrl` sera null → pas de boucle.
    router.replace(cleanUrl, { scroll: false });
  }, [param, searchParams, pathname, router, onOpen]);
}
