"use client";

import { useCallback, useEffect, useState } from "react";
import { Stepper, Banner, eur } from "@/components/invest";
import { UI } from "@/lib/ui-strings";
import styles from "./onboarding.module.css";

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

const o = UI.invest.onboarding;
const STEPS = [...o.steps];
const KNOWLEDGE_QUESTIONS = o.questions;

export function OnboardingWizard({ initialProfile }: { initialProfile: ProfileView | null }) {
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<ProfileView | null>(initialProfile);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState(initialProfile?.fullName ?? "");
  const [country, setCountry] = useState(initialProfile?.country ?? "FR");
  const [investorKind, setInvestorKind] = useState(initialProfile?.investorKind ?? "natural_person");

  const [answers, setAnswers] = useState<Record<string, boolean | null>>({ q1: null, q2: null, q3: null });
  const [annualIncome, setAnnualIncome] = useState("");
  const [liquidAssets, setLiquidAssets] = useState("");
  const [commitments, setCommitments] = useState("");
  const [assessmentResult, setAssessmentResult] = useState<AssessmentResultView | null>(null);

  const [kycState, setKycState] = useState<"idle" | "started" | "unavailable">("idle");
  const [kycToken, setKycToken] = useState<string | null>(null);

  const [walletAddress, setWalletAddress] = useState(initialProfile?.walletAddress ?? "");
  const [identity, setIdentity] = useState<IdentityStatusView | null>(null);

  const [inviteCode, setInviteCode] = useState("");

  const knowledgeScore = KNOWLEDGE_QUESTIONS.reduce(
    (s, q) => s + (answers[q.id] === q.answer ? 1 : 0),
    0,
  );
  const knowledgePassed = knowledgeScore >= 2;
  const allAnswered = KNOWLEDGE_QUESTIONS.every((q) => answers[q.id] !== null);

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
      setError(e instanceof Error ? e.message : o.errors.profile);
    } finally {
      setBusy(false);
    }
  }, [fullName, country, investorKind]);

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
      setError(e instanceof Error ? e.message : o.errors.assessment);
    } finally {
      setBusy(false);
    }
  }, [knowledgePassed, knowledgeScore, annualIncome, liquidAssets, commitments]);

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
      setError(e instanceof Error ? e.message : o.errors.kyc);
    } finally {
      setBusy(false);
    }
  }, []);

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
      const st = await fetch("/api/invest/identity/status").then((r) => r.json()).catch(() => null);
      if (st?.status) setIdentity(st.status as IdentityStatusView);
    } catch (e) {
      setError(e instanceof Error ? e.message : o.errors.wallet);
    } finally {
      setBusy(false);
    }
  }, [walletAddress]);

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

  const { profile: p, assessment: a, kyc: k, wallet: w } = o;

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

      {step === 0 ? (
        <section className={`ct-card ${styles.card}`} aria-label={o.aria.profile}>
          <div className="ct-card-title">{p.title}</div>
          <p className={`ct-card-body ${styles.intro}`}>
            {p.introBefore}
            <b>{p.introBold}</b>
            {p.introAfter}
          </p>

          <div className={`ct-form ${styles.form}`}>
            <div className="ct-field">
              <label className="ct-field-label" htmlFor="onb-name">{p.fullName}</label>
              <input
                id="onb-name"
                className="ct-input"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={p.fullNamePlaceholder}
                autoComplete="name"
              />
            </div>

            <div className="inv-grid-2">
              <div className="ct-field">
                <label className="ct-field-label" htmlFor="onb-country">{p.country}</label>
                <input
                  id="onb-country"
                  className="ct-input"
                  value={country}
                  onChange={(e) => setCountry(e.target.value.toUpperCase().slice(0, 2))}
                  placeholder={p.countryPlaceholder}
                  maxLength={2}
                />
              </div>
              <div className="ct-field">
                <label className="ct-field-label" htmlFor="onb-kind">{p.investorKind}</label>
                <select
                  id="onb-kind"
                  className="ct-input"
                  value={investorKind}
                  onChange={(e) => setInvestorKind(e.target.value)}
                >
                  <option value="natural_person">{p.naturalPerson}</option>
                  <option value="legal_entity">{p.legalEntity}</option>
                </select>
              </div>
            </div>

            <div className="ct-field">
              <label className="ct-field-label" htmlFor="onb-invite">{p.inviteCode}</label>
              <input
                id="onb-invite"
                className="ct-input"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder={p.invitePlaceholder}
              />
            </div>
          </div>

          <div className={styles.actions}>
            <button className="inv-btn-reserve" onClick={saveProfile} disabled={busy}>
              {busy ? p.saving : p.continue}
            </button>
          </div>
        </section>
      ) : null}

      {step === 1 ? (
        <section className={`ct-card ${styles.card}`} aria-label={o.aria.assessment}>
          <div className="ct-card-title">{a.title}</div>
          <p className={`ct-card-body ${styles.intro}`}>{a.intro}</p>

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
                      onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: true }))}
                    />
                    {q.yes}
                  </label>
                  <label className={`inv-chip ${styles.opt}${answers[q.id] === false ? " active" : ""}`}>
                    <input
                      type="radio"
                      name={q.id}
                      className="inv-sr-only"
                      checked={answers[q.id] === false}
                      onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: false }))}
                    />
                    {q.no}
                  </label>
                </div>
              </fieldset>
            ))}
          </div>

          <h3 className={styles.subtitle}>{a.lossCapacity}</h3>
          <div className={`ct-form ${styles.form}`}>
            <div className="inv-grid-2">
              <div className="ct-field">
                <label className="ct-field-label" htmlFor="onb-income">{a.annualIncome}</label>
                <input id="onb-income" className="ct-input" type="number" min={0} value={annualIncome}
                  onChange={(e) => setAnnualIncome(e.target.value)} placeholder={a.amountPlaceholder} />
              </div>
              <div className="ct-field">
                <label className="ct-field-label" htmlFor="onb-assets">{a.liquidAssets}</label>
                <input id="onb-assets" className="ct-input" type="number" min={0} value={liquidAssets}
                  onChange={(e) => setLiquidAssets(e.target.value)} placeholder={a.amountPlaceholder} />
              </div>
            </div>
            <div className="ct-field">
              <label className="ct-field-label" htmlFor="onb-commit">{a.commitments}</label>
              <input id="onb-commit" className="ct-input" type="number" min={0} value={commitments}
                onChange={(e) => setCommitments(e.target.value)} placeholder={a.amountPlaceholder} />
            </div>
          </div>

          <div className={styles.block}>
            <Banner tone={knowledgePassed ? "info" : "warn"}>
              {allAnswered
                ? knowledgePassed
                  ? a.bannerPass(knowledgeScore, KNOWLEDGE_QUESTIONS.length)
                  : a.bannerFail(knowledgeScore, KNOWLEDGE_QUESTIONS.length)
                : a.bannerPending}
            </Banner>
          </div>

          <div className={styles.actions}>
            <button className="ct-seg-btn" onClick={() => setStep(0)} disabled={busy}>{a.back}</button>
            <button className="inv-btn-reserve" onClick={submitAssessment} disabled={busy || !allAnswered}>
              {busy ? a.calculating : a.validate}
            </button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className={`ct-card ${styles.card}`} aria-label={o.aria.kyc}>
          <div className="ct-card-title">{k.title}</div>

          {assessmentResult ? (
            <div className={styles.cap}>
              <span className={styles.capLabel}>{k.capLabel}</span>
              <span className={styles.capValue}>
                {assessmentResult.capCents == null ? k.capUnlimited : eur(assessmentResult.capCents / 100)}
              </span>
              <span className={styles.capSub}>
                {k.classification(
                  assessmentResult.classification === "retail" ? k.retail : k.sophisticated,
                )}
              </span>
            </div>
          ) : null}

          <p className={`ct-card-body ${styles.intro}`}>{k.intro}</p>

          {kycState === "unavailable" ? (
            <div className={styles.block}>
              <Banner tone="info">{k.unavailable}</Banner>
            </div>
          ) : kycState === "started" ? (
            <div className={styles.block}>
              <Banner tone="success">{k.started}</Banner>
              {kycToken ? <p className="inv-fineprint">{k.sessionToken}</p> : null}
            </div>
          ) : (
            <div className={styles.block}>
              <Banner tone="warn">
                {k.statusCurrent(profile?.kycStatus ?? k.statusNotStarted)}
              </Banner>
            </div>
          )}

          <div className={styles.actions}>
            <button className="ct-seg-btn" onClick={() => setStep(1)} disabled={busy}>{a.back}</button>
            {kycState === "idle" ? (
              <button className="inv-btn-reserve" onClick={startKyc} disabled={busy}>
                {busy ? k.starting : k.start}
              </button>
            ) : (
              <button className="inv-btn-reserve" onClick={() => setStep(3)} disabled={busy}>
                {k.continueWallet}
              </button>
            )}
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className={`ct-card ${styles.card}`} aria-label={o.aria.wallet}>
          <div className="ct-card-title">{w.title}</div>
          <p className={`ct-card-body ${styles.intro}`}>
            {w.introBefore}
            <b>{w.introBold}</b>
            {w.introAfter}
          </p>

          <div className={`ct-form ${styles.form}`}>
            <div className="ct-field">
              <label className="ct-field-label" htmlFor="onb-wallet">{w.addressLabel}</label>
              <input
                id="onb-wallet"
                className="ct-input"
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                placeholder={w.addressPlaceholder}
                spellCheck={false}
                autoComplete="off"
              />
            </div>
            {walletAddress && !walletValid ? (
              <p className="inv-fineprint">{w.formatHint}</p>
            ) : null}
          </div>

          {profile?.walletAddress ? (
            <div className={styles.block}>
              <Banner tone="success">
                {w.savedPrefix}
                <span className="inv-mono">{profile.walletAddress}</span>
                {identity?.onchainidAddress ? w.onchainLinked : w.onchainAfterKyc}
              </Banner>
            </div>
          ) : null}

          <div className={styles.actions}>
            <button className="ct-seg-btn" onClick={() => setStep(2)} disabled={busy}>{a.back}</button>
            <button className="inv-btn-reserve" onClick={linkWallet} disabled={busy || !walletValid}>
              {busy ? w.saving : profile?.walletAddress ? w.update : w.save}
            </button>
          </div>
        </section>
      ) : null}

      {done ? (
        <div className={styles.block}>
          <Banner tone="info">
            {o.doneBefore}
            <b>{o.doneBold}</b>
            {o.doneAfter}
          </Banner>
        </div>
      ) : null}

      <p className={`inv-fineprint ${styles.foot}`}>{o.foot}</p>
    </div>
  );
}
