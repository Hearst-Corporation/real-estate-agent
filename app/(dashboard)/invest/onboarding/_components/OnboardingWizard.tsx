"use client";

/**
 * OnboardingWizard — parcours investisseur en 4 étapes (Epic 1.1, écran WF-2/3).
 *
 *   1. Profil investisseur (identité déclarative).
 *   2. Test ECSP : connaissances + capacité de perte → plafond calculé serveur.
 *   3. KYC (lance Sumsub ; si non configuré → état "bientôt disponible", non bloquant).
 *   4. Wallet (saisie d'adresse EVM manuelle + explication ONCHAINID).
 *
 * Client component : interactivité + fetch vers les routes /api/invest/*. Gère les
 * états vide/chargement/erreur/succès. Réutilise les primitives components/invest
 * (Stepper, Banner) et les classes DS --ct-*. Accent gold hérité du layout /invest.
 *
 * Anti-FIA (lint:legal) : l'investisseur prête à une société (créancier), aucun
 * rendement n'est garanti, l'investissement comporte un risque de perte, et les
 * fonds transitent par un séquestre tiers — jamais par la plateforme. Aucune
 * pré-collecte : ce parcours débloque la capacité de souscrire, il ne place rien.
 */

import { useCallback, useEffect, useState } from "react";
import { Stepper, Banner, eur } from "@/components/invest";
import styles from "./onboarding.module.css";

// ─── Types de vue (miroir des réponses API) ──────────────────────────────────

interface ProfileView {
  id: string;
  fullName: string | null;
  country: string;
  investorKind: string;
  investorClass: string;
  appropriatenessTestPassed: boolean;
  annualInvestmentCapCents: number | null;
  kycStatus: string;
  walletAddress: string | null;
}

interface AssessmentResultView {
  classification: "retail" | "sophisticated";
  capCents: number | null;
  isCapped: boolean;
}

interface IdentityStatusView {
  kycStatus: string;
  walletAddress: string | null;
  onchainidAddress: string | null;
  onchainVerified: boolean | null;
}

const STEPS = [
  { label: "Profil" },
  { label: "Test ECSP" },
  { label: "Identité (KYC)" },
  { label: "Wallet" },
];

/** Questions de connaissance ECSP (v1 — 3 items, seuil 2/3). */
const KNOWLEDGE_QUESTIONS = [
  {
    id: "q1",
    prompt:
      "Quelle est la nature de votre titre ? Vous prêtez à une société (créance), ou vous détenez un droit réel sur l'immeuble ?",
    answer: false,
    yes: "Je détiens un droit réel sur l'immeuble",
    no: "Je suis créancier de la société (je lui prête)",
  },
  {
    id: "q2",
    prompt:
      "Le rendement cible affiché est-il un objectif assuré ?",
    answer: false,
    yes: "Oui, le rendement est assuré",
    no: "Non, le rendement n'est pas garanti",
  },
  {
    id: "q3",
    prompt:
      "Votre placement peut-il perdre de la valeur, voire la totalité du capital ?",
    answer: true,
    yes: "Oui, il existe un risque de perte en capital",
    no: "Non, le capital est protégé",
  },
] as const;

export function OnboardingWizard({ initialProfile }: { initialProfile: ProfileView | null }) {
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<ProfileView | null>(initialProfile);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Étape 1 — profil ──
  const [fullName, setFullName] = useState(initialProfile?.fullName ?? "");
  const [country, setCountry] = useState(initialProfile?.country ?? "FR");
  const [investorKind, setInvestorKind] = useState(initialProfile?.investorKind ?? "natural_person");

  // ── Étape 2 — test ECSP ──
  const [answers, setAnswers] = useState<Record<string, boolean | null>>({ q1: null, q2: null, q3: null });
  const [annualIncome, setAnnualIncome] = useState("");
  const [liquidAssets, setLiquidAssets] = useState("");
  const [commitments, setCommitments] = useState("");
  const [assessmentResult, setAssessmentResult] = useState<AssessmentResultView | null>(null);

  // ── Étape 3 — KYC ──
  const [kycState, setKycState] = useState<"idle" | "started" | "unavailable">("idle");
  const [kycToken, setKycToken] = useState<string | null>(null);

  // ── Étape 4 — wallet ──
  const [walletAddress, setWalletAddress] = useState(initialProfile?.walletAddress ?? "");
  const [identity, setIdentity] = useState<IdentityStatusView | null>(null);

  // ── Mode invitation (placeholder — code non requis au pilote) ──
  const [inviteCode, setInviteCode] = useState("");

  const knowledgeScore = KNOWLEDGE_QUESTIONS.reduce(
    (s, q) => s + (answers[q.id] === q.answer ? 1 : 0),
    0,
  );
  const knowledgePassed = knowledgeScore >= 2;
  const allAnswered = KNOWLEDGE_QUESTIONS.every((q) => answers[q.id] !== null);

  // ── Soumission étape 1 (profil) ──
  const saveProfile = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/invest/investor/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: { fullName: fullName.trim() || undefined, country, investorKind } }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "save_failed");
      setProfile(json.profile as ProfileView);
      setStep(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de l'enregistrement du profil.");
    } finally {
      setBusy(false);
    }
  }, [fullName, country, investorKind]);

  // ── Soumission étape 2 (test ECSP) ──
  const submitAssessment = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/invest/investor/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assessment: {
            knowledgePassed,
            knowledgeScore: Math.round((knowledgeScore / KNOWLEDGE_QUESTIONS.length) * 100),
            declaresSophisticated: false,
            annualIncomeEur: Number(annualIncome) || 0,
            liquidAssetsEur: Number(liquidAssets) || 0,
            financialCommitmentsEur: Number(commitments) || 0,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "assessment_failed");
      setProfile(json.profile as ProfileView);
      setAssessmentResult(json.assessment as AssessmentResultView);
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors du test ECSP.");
    } finally {
      setBusy(false);
    }
  }, [knowledgePassed, knowledgeScore, annualIncome, liquidAssets, commitments]);

  // ── Lancement étape 3 (KYC) ──
  const startKyc = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/invest/kyc/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level: "standard" }),
      });
      const json = await res.json();
      if (res.status === 502 || json?.error === "kyc_not_configured") {
        setKycState("unavailable");
        return;
      }
      if (!res.ok) throw new Error(json?.error ?? "kyc_start_failed");
      setKycState("started");
      setKycToken(json.sdkToken ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors du lancement du KYC.");
    } finally {
      setBusy(false);
    }
  }, []);

  // ── Soumission étape 4 (wallet) ──
  const linkWallet = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/invest/wallets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: walletAddress.trim(), walletKind: "self_custody" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "link_failed");
      setProfile(json.profile as ProfileView);
      // Rafraîchit l'état d'identité consolidé.
      const st = await fetch("/api/invest/identity/status").then((r) => r.json()).catch(() => null);
      if (st?.status) setIdentity(st.status as IdentityStatusView);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de l'ajout du wallet.");
    } finally {
      setBusy(false);
    }
  }, [walletAddress]);

  // Charge l'état d'identité quand on arrive à l'étape wallet.
  useEffect(() => {
    if (step === 3 && !identity) {
      fetch("/api/invest/identity/status")
        .then((r) => r.json())
        .then((j) => j?.status && setIdentity(j.status as IdentityStatusView))
        .catch(() => undefined);
    }
  }, [step, identity]);

  const walletValid = /^0x[a-fA-F0-9]{40}$/.test(walletAddress.trim());
  const done = step === 3 && profile?.walletAddress;

  return (
    <div className={styles.wizard}>
      <div className={styles.stepperWrap}>
        <Stepper steps={STEPS} current={step} />
      </div>

      {error ? (
        <div className={styles.block}>
          <Banner tone="danger">{error}</Banner>
        </div>
      ) : null}

      {/* ─── ÉTAPE 1 — PROFIL ─────────────────────────────────────────────── */}
      {step === 0 ? (
        <section className={`ct-card ${styles.card}`} aria-label="Profil investisseur">
          <h2 className="ct-card-title">Votre profil</h2>
          <p className={`ct-card-body ${styles.intro}`}>
            En investissant ici, vous devenez <b>créancier</b> d&apos;une société : vous lui prêtez, vous
            n&apos;êtes pas propriétaire du bien. Ce parcours débloque votre capacité à souscrire, il ne
            place aucun argent.
          </p>

          <div className={`ct-form ${styles.form}`}>
            <div className="ct-field">
              <label className="ct-field-label" htmlFor="onb-name">Nom complet</label>
              <input
                id="onb-name"
                className="ct-input"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Prénom Nom"
                autoComplete="name"
              />
            </div>

            <div className="inv-grid-2">
              <div className="ct-field">
                <label className="ct-field-label" htmlFor="onb-country">Pays de résidence</label>
                <input
                  id="onb-country"
                  className="ct-input"
                  value={country}
                  onChange={(e) => setCountry(e.target.value.toUpperCase().slice(0, 2))}
                  placeholder="FR"
                  maxLength={2}
                />
              </div>
              <div className="ct-field">
                <label className="ct-field-label" htmlFor="onb-kind">Type d&apos;investisseur</label>
                <select
                  id="onb-kind"
                  className="ct-input"
                  value={investorKind}
                  onChange={(e) => setInvestorKind(e.target.value)}
                >
                  <option value="natural_person">Personne physique</option>
                  <option value="legal_entity">Personne morale</option>
                </select>
              </div>
            </div>

            <div className="ct-field">
              <label className="ct-field-label" htmlFor="onb-invite">Code d&apos;invitation (optionnel)</label>
              <input
                id="onb-invite"
                className="ct-input"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="Sur invitation — laissez vide au pilote"
              />
            </div>
          </div>

          <div className={styles.actions}>
            <button className="inv-btn-reserve" onClick={saveProfile} disabled={busy}>
              {busy ? "Enregistrement…" : "Continuer"}
            </button>
          </div>
        </section>
      ) : null}

      {/* ─── ÉTAPE 2 — TEST ECSP ──────────────────────────────────────────── */}
      {step === 1 ? (
        <section className={`ct-card ${styles.card}`} aria-label="Test de connaissances ECSP">
          <h2 className="ct-card-title">Test de connaissances et capacité de perte</h2>
          <p className={`ct-card-body ${styles.intro}`}>
            Réglementation ECSP (UE 2020/1503). Trois questions, puis votre capacité de perte. Le résultat
            fixe votre plafond d&apos;investissement annuel.
          </p>

          <div className={styles.quiz}>
            {KNOWLEDGE_QUESTIONS.map((q, i) => (
              <fieldset className={styles.question} key={q.id}>
                <legend className={styles.prompt}>{i + 1}. {q.prompt}</legend>
                <div className={styles.opts}>
                  <label className={`inv-chip ${styles.opt}${answers[q.id] === true ? " active" : ""}`}>
                    <input
                      type="radio"
                      name={q.id}
                      className="inv-sr-only"
                      checked={answers[q.id] === true}
                      onChange={() => setAnswers((a) => ({ ...a, [q.id]: true }))}
                    />
                    {q.yes}
                  </label>
                  <label className={`inv-chip ${styles.opt}${answers[q.id] === false ? " active" : ""}`}>
                    <input
                      type="radio"
                      name={q.id}
                      className="inv-sr-only"
                      checked={answers[q.id] === false}
                      onChange={() => setAnswers((a) => ({ ...a, [q.id]: false }))}
                    />
                    {q.no}
                  </label>
                </div>
              </fieldset>
            ))}
          </div>

          <h3 className={styles.subtitle}>Capacité de perte (en euros)</h3>
          <div className={`ct-form ${styles.form}`}>
            <div className="inv-grid-2">
              <div className="ct-field">
                <label className="ct-field-label" htmlFor="onb-income">Revenu annuel net</label>
                <input id="onb-income" className="ct-input" type="number" min={0} value={annualIncome}
                  onChange={(e) => setAnnualIncome(e.target.value)} placeholder="0" />
              </div>
              <div className="ct-field">
                <label className="ct-field-label" htmlFor="onb-assets">Actifs liquides</label>
                <input id="onb-assets" className="ct-input" type="number" min={0} value={liquidAssets}
                  onChange={(e) => setLiquidAssets(e.target.value)} placeholder="0" />
              </div>
            </div>
            <div className="ct-field">
              <label className="ct-field-label" htmlFor="onb-commit">Engagements financiers annuels</label>
              <input id="onb-commit" className="ct-input" type="number" min={0} value={commitments}
                onChange={(e) => setCommitments(e.target.value)} placeholder="0" />
            </div>
          </div>

          <div className={styles.block}>
            <Banner tone={knowledgePassed ? "info" : "warn"}>
              {allAnswered
                ? knowledgePassed
                  ? `Connaissances : ${knowledgeScore}/${KNOWLEDGE_QUESTIONS.length}. Vous serez classé non-averti ; votre plafond sera le plus élevé entre 1000 € et 5 % de votre patrimoine net.`
                  : `Connaissances : ${knowledgeScore}/${KNOWLEDGE_QUESTIONS.length}. Reprenez les réponses : tout rendement est non garanti et le capital comporte un risque de perte.`
                : "Répondez aux trois questions, puis renseignez votre capacité de perte."}
            </Banner>
          </div>

          <div className={styles.actions}>
            <button className="ct-seg-btn" onClick={() => setStep(0)} disabled={busy}>Retour</button>
            <button className="inv-btn-reserve" onClick={submitAssessment} disabled={busy || !allAnswered}>
              {busy ? "Calcul…" : "Valider le test"}
            </button>
          </div>
        </section>
      ) : null}

      {/* ─── ÉTAPE 3 — KYC ────────────────────────────────────────────────── */}
      {step === 2 ? (
        <section className={`ct-card ${styles.card}`} aria-label="Vérification d'identité">
          <h2 className="ct-card-title">Vérification d&apos;identité (KYC)</h2>

          {assessmentResult ? (
            <div className={styles.cap}>
              <span className={styles.capLabel}>Plafond d&apos;investissement annuel</span>
              <span className={styles.capValue}>
                {assessmentResult.capCents == null ? "Non plafonné" : eur(assessmentResult.capCents / 100)}
              </span>
              <span className={styles.capSub}>
                Classification : {assessmentResult.classification === "retail" ? "non-averti" : "averti"}
              </span>
            </div>
          ) : null}

          <p className={`ct-card-body ${styles.intro}`}>
            La vérification d&apos;identité (LCB-FT) est obligatoire avant toute souscription. Elle est
            opérée par un prestataire tiers ; aucune pièce n&apos;est stockée chez nous.
          </p>

          {kycState === "unavailable" ? (
            <div className={styles.block}>
              <Banner tone="info">
                La vérification d&apos;identité sera bientôt disponible. Vous pouvez poursuivre votre
                parcours et ajouter votre wallet ; la souscription restera bloquée tant que le KYC
                n&apos;est pas finalisé.
              </Banner>
            </div>
          ) : kycState === "started" ? (
            <div className={styles.block}>
              <Banner tone="success">
                Dossier KYC ouvert. Suivez les étapes du prestataire pour finaliser la vérification.
              </Banner>
              {kycToken ? <p className="inv-fineprint">Jeton de session généré.</p> : null}
            </div>
          ) : (
            <div className={styles.block}>
              <Banner tone="warn">
                Statut KYC actuel : {profile?.kycStatus ?? "non démarré"}.
              </Banner>
            </div>
          )}

          <div className={styles.actions}>
            <button className="ct-seg-btn" onClick={() => setStep(1)} disabled={busy}>Retour</button>
            {kycState === "idle" ? (
              <button className="inv-btn-reserve" onClick={startKyc} disabled={busy}>
                {busy ? "Ouverture…" : "Démarrer la vérification"}
              </button>
            ) : (
              <button className="inv-btn-reserve" onClick={() => setStep(3)} disabled={busy}>
                Continuer vers le wallet
              </button>
            )}
          </div>
        </section>
      ) : null}

      {/* ─── ÉTAPE 4 — WALLET ─────────────────────────────────────────────── */}
      {step === 3 ? (
        <section className={`ct-card ${styles.card}`} aria-label="Adresse wallet">
          <h2 className="ct-card-title">Votre wallet</h2>
          <p className={`ct-card-body ${styles.intro}`}>
            Vos titres seront reflétés on-chain (miroir du registre légal) sur votre wallet. Une identité
            <b> ONCHAINID</b> (non transférable) y sera rattachée à l&apos;approbation de votre KYC : elle
            atteste que vous êtes vérifié, sans exposer vos données. Saisissez l&apos;adresse manuellement.
          </p>

          <div className={`ct-form ${styles.form}`}>
            <div className="ct-field">
              <label className="ct-field-label" htmlFor="onb-wallet">Adresse EVM (0x…)</label>
              <input
                id="onb-wallet"
                className="ct-input"
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                placeholder="0x0000000000000000000000000000000000000000"
                spellCheck={false}
                autoComplete="off"
              />
            </div>
            {walletAddress && !walletValid ? (
              <p className="inv-fineprint">Format attendu : 0x suivi de 40 caractères hexadécimaux.</p>
            ) : null}
          </div>

          {profile?.walletAddress ? (
            <div className={styles.block}>
              <Banner tone="success">
                Wallet enregistré : <span className="inv-mono">{profile.walletAddress}</span>
                {identity?.onchainidAddress ? " · ONCHAINID rattaché." : " · ONCHAINID rattaché après approbation KYC."}
              </Banner>
            </div>
          ) : null}

          <div className={styles.actions}>
            <button className="ct-seg-btn" onClick={() => setStep(2)} disabled={busy}>Retour</button>
            <button className="inv-btn-reserve" onClick={linkWallet} disabled={busy || !walletValid}>
              {busy ? "Enregistrement…" : profile?.walletAddress ? "Mettre à jour" : "Enregistrer le wallet"}
            </button>
          </div>
        </section>
      ) : null}

      {/* ─── RÉCAP FINAL ──────────────────────────────────────────────────── */}
      {done ? (
        <div className={styles.block}>
          <Banner tone="info">
            Votre profil est prêt. Vous pourrez souscrire deal par deal une fois votre KYC approuvé. Les
            fonds transiteront toujours par un <b>séquestre</b> tiers, jamais par la plateforme.
          </Banner>
        </div>
      ) : null}

      <p className={`inv-fineprint ${styles.foot}`}>
        Investir comporte un risque de perte en capital et une illiquidité. Tout rendement cible est non
        garanti. Vous prêtez à une société (vous êtes créancier), vous n&apos;achetez pas le bien.
      </p>
    </div>
  );
}
