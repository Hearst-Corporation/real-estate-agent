import { Eyebrow, Title, Sub, KpiGrid, KpiCard, Card } from "@/components/cockpit/primitives";
import { UI } from "@/lib/ui-strings";

export default function DashboardPage() {
  const t = UI.dashboard;
  return (
    <>
      <Eyebrow>{t.eyebrow}</Eyebrow>
      <Title>{t.title}</Title>
      <Sub>{t.sub}</Sub>

      <KpiGrid>
        <KpiCard label={t.kpis.biens} value="0" accent />
        <KpiCard label={t.kpis.leads} value="0" />
        <KpiCard label={t.kpis.visites} value="0" />
        <KpiCard label={t.kpis.mandats} value="0" />
      </KpiGrid>

      <Card title={t.cards.startTitle}>
        Ce projet est scaffoldé par <code>/setup-adrien</code> avec le design system Cockpit, l&apos;auth
        email + mot de passe, l&apos;isolation par tenant et la mémoire Kimi. Remplace ce contenu par les
        écrans métier de l&apos;agent immobilier (biens, leads, visites, mandats).
      </Card>

      <Card title={t.cards.assistantTitle}>
        Le rail droit exécute Kimi K2.6 (streaming, persisté par utilisateur et tenant). Tape « mémorise : … »
        pour enregistrer un fait partagé du tenant, réinjecté au prochain message.
      </Card>
    </>
  );
}
