import * as Headless from '@headlessui/react'
import clsx from 'clsx'
import React, { forwardRef } from 'react'
import { TouchTarget } from './button'
import { Link } from './link'

/**
 * Badge Azigo — variantes CENTRALISÉES par POIDS VISUEL (REA-UX-012, lot badges).
 * =================================================================
 *
 * Un badge CLASSIFIE une information compacte. Ce n'est PAS une alerte : la
 * signification vient du TEXTE, de l'ordre et éventuellement d'une icône — jamais
 * d'une couleur criarde. Les seules variantes autorisées décrivent le poids
 * visuel, pas une sémantique colorée (interdit : warning / success / danger /
 * info).
 *
 *   - neutral : métadonnées, volumes, fréquence, typologie (Lin Brut / charbon).
 *   - outline : états secondaires, valeurs non sélectionnées (fond transparent).
 *   - brand   : sélection, étape active, information mise en avant (Pierre Blonde
 *               atténuée). Usage RARE.
 *   - strong  : un seul état réellement structurant par carte (charbon plein).
 *
 * Le rouge n'est PAS une variante de Badge : il reste réservé aux erreurs et
 * actions destructrices, gérées ailleurs (ErrorMessage, Button color="red").
 */

export const BADGE_VARIANTS = ['neutral', 'outline', 'brand', 'strong'] as const
export type BadgeVariant = (typeof BADGE_VARIANTS)[number]

const variants: Record<BadgeVariant, string> = {
  // Métadonnée neutre : fond Lin Brut très clair, texte charbon, filet or discret.
  neutral: 'bg-zinc-950/[0.04] text-zinc-700 ring-1 ring-inset ring-zinc-950/10',
  // Secondaire : transparent, juste un filet chaud — le plus léger.
  outline: 'bg-transparent text-zinc-600 ring-1 ring-inset ring-accent-500/25',
  // Mise en avant : Pierre Blonde atténuée, texte accent profond, filet accent.
  brand: 'bg-accent-500/12 text-accent-900 ring-1 ring-inset ring-accent-500/30',
  // Structurant : charbon plein, texte blanc. Un seul par carte.
  strong: 'bg-zinc-900 text-white ring-1 ring-inset ring-zinc-900',
}

type BadgeProps = { variant?: BadgeVariant }

export function Badge({
  variant = 'neutral',
  className,
  ...props
}: BadgeProps & React.ComponentPropsWithoutRef<'span'>) {
  return (
    <span
      {...props}
      className={clsx(
        className,
        'inline-flex items-center gap-x-1.5 rounded-md px-2 py-0.5 text-sm/5 font-medium sm:text-xs/5 forced-colors:outline',
        variants[variant]
      )}
    />
  )
}

export const BadgeButton = forwardRef(function BadgeButton(
  {
    variant = 'neutral',
    className,
    children,
    ...props
  }: BadgeProps & { className?: string; children: React.ReactNode } & (
      | ({ href?: never } & Omit<Headless.ButtonProps, 'as' | 'className'>)
      | ({ href: string } & Omit<React.ComponentPropsWithoutRef<typeof Link>, 'className'>)
    ),
  ref: React.ForwardedRef<HTMLElement>
) {
  const classes = clsx(
    className,
    'group relative inline-flex rounded-md focus:not-data-focus:outline-hidden data-focus:outline-2 data-focus:outline-offset-2 data-focus:outline-accent-500'
  )

  return typeof props.href === 'string' ? (
    <Link {...props} className={classes} ref={ref as React.ForwardedRef<HTMLAnchorElement>}>
      <TouchTarget>
        <Badge variant={variant}>{children}</Badge>
      </TouchTarget>
    </Link>
  ) : (
    <Headless.Button {...props} className={classes} ref={ref}>
      <TouchTarget>
        <Badge variant={variant}>{children}</Badge>
      </TouchTarget>
    </Headless.Button>
  )
})
