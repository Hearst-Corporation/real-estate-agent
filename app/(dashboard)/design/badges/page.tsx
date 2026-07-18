import { UI } from "@/lib/ui-strings";
import { Badge, BADGE_VARIANTS } from "@/components/ui/badge";
import { Text, Strong } from "@/components/ui/text";
import { PageHeader } from "@/components/cockpit/primitives";
import { Icon } from "@/components/cockpit/Icon";

/**
 * Référence interne du design system — variantes de badge Azigo (REA-UX-012).
 * =================================================================
 *
 * Montre les QUATRE variantes autorisées, leurs usages, les usages interdits et
 * des exemples métier. Sert de garde-fou vivant : toute nouvelle surface doit
 * s'y référer plutôt que d'inventer une couleur.
 */
export default function BadgesReferencePage() {
  const t = UI.design;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <PageHeader hero kicker={t.eyebrow} title={t.badgesTitle} meta={t.badgesIntro} />

      {/* Les 4 variantes */}
      <section className="grid grid-cols-1 gap-4 @xl:grid-cols-2">
        {BADGE_VARIANTS.map((variant) => {
          const v = t.variants[variant];
          return (
            <div key={variant} className="surface flex flex-col gap-3 p-5">
              <div className="flex items-center justify-between gap-3">
                <code className="text-sm font-semibold text-zinc-900">{v.name}</code>
                <Badge variant={variant}>{v.sample}</Badge>
              </div>
              <Text className="!text-sm">{v.usage}</Text>
            </div>
          );
        })}
      </section>

      {/* Exemples métier */}
      <section className="surface flex flex-col gap-4 p-5">
        <Strong className="text-base">{t.examplesTitle}</Strong>
        <div className="flex flex-wrap gap-2">
          {t.examples.map((ex, i) => (
            <Badge key={i} variant={ex.variant}>
              {ex.text}
            </Badge>
          ))}
        </div>
      </section>

      {/* Usages interdits */}
      <section className="surface-inset flex flex-col gap-3 rounded-2xl p-5">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="text-zinc-500">
            <Icon name="help" className="size-5" />
          </span>
          <Strong className="text-base">{t.forbiddenTitle}</Strong>
        </div>
        <ul className="flex flex-col gap-2">
          {t.forbidden.map((f, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-zinc-600">
              <span aria-hidden="true" className="mt-0.5 text-zinc-400">
                ✕
              </span>
              {f}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
