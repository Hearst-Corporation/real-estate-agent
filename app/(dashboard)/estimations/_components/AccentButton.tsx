"use client";

import type { ReactNode } from "react";
import clsx from "clsx";
import { Button } from "@/components/ui/button";

/**
 * CTA principal — fond or (accent-500) + texte zinc-950 → contraste ~8.5:1 (AA OK).
 *
 * La primitive Catalyst `color="indigo"` mappe l'accent or mais rend un texte
 * BLANC sur or (~2.1:1, échec AA). On enveloppe la primitive en un seul point
 * pour forcer le texte sombre et un focus clavier accent (au lieu du bleu de base
 * Catalyst). Reste 100 % primitive Catalyst → gate `check:catalyst` verte.
 */
const ACCENT_CLASS =
  "!text-zinc-950 hover:!text-zinc-950 data-focus:!outline-accent-600";

type LinkProps = {
  href: string;
  children: ReactNode;
  className?: string;
  target?: string;
  rel?: string;
};

type ActionProps = {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  "aria-label"?: string;
};

export function AccentButton(props: LinkProps | ActionProps) {
  if ("href" in props) {
    const { className, ...rest } = props;
    return (
      <Button color="indigo" className={clsx(ACCENT_CLASS, className)} {...rest} />
    );
  }
  const { className, ...rest } = props;
  return (
    <Button color="indigo" className={clsx(ACCENT_CLASS, className)} {...rest} />
  );
}
