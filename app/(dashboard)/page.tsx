import { Eyebrow, Title, Sub, KpiGrid, KpiCard, Card } from "@/components/cockpit/primitives";

export default function DashboardPage() {
  return (
    <>
      <Eyebrow>Cockpit</Eyebrow>
      <Title>Real estate Agent</Title>
      <Sub>Tableau de bord — shell Cockpit, chat Kimi à droite.</Sub>

      <KpiGrid>
        <KpiCard label="Biens suivis" value="0" accent />
        <KpiCard label="Leads actifs" value="0" />
        <KpiCard label="Visites planifiées" value="0" />
        <KpiCard label="Mandats signés" value="0" />
      </KpiGrid>

      <Card title="Démarrer">
        Ce projet est scaffoldé par <code>/setup-adrien</code> avec le design system Cockpit, l&apos;auth
        email + mot de passe, l&apos;isolation par tenant et la mémoire Kimi. Remplace ce contenu par les
        écrans métier de l&apos;agent immobilier (biens, leads, visites, mandats).
      </Card>

      <Card title="Assistant Kimi">
        Le rail droit exécute Kimi K2.6 via Hypercli (streaming, persisté par utilisateur et tenant).
        Tape « mémorise : … » pour enregistrer un fait partagé du tenant, réinjecté au prochain message.
      </Card>
    </>
  );
}
