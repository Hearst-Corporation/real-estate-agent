"use client";

import { useCallback, useEffect, useState } from "react";
import { Stepper, Banner, eur } from "@/components/invest";
import { UI } from "@/lib/ui-strings";

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

/** Styles partagés du wizard (card / form / boutons — utilities Tailwind). */
const CARD = "flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-lg shadow-black/20 backdrop-blur-sm";
const CARD_TITLE = "text-xs font-semibold uppercase tracking-widest text-slate-500";
const CARD_BODY = "text-sm text-slate-300";
const FORM = "flex flex-col gap-4";
const FIELD = "flex flex-col gap-1.5";
const FIELD_LABEL = "text-sm font-medium text-slate-300";
const INPUT =
  "w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-400/60";
const ACTIONS = "flex items-center justify-end gap-3 pt-2";
const BTN_PRIMARY =
  "inline-flex items-center justify-center rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50";
const BTN_SECONDARY =
  "inline-flex items-center justify-center rounded-lg border border-white/10 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50";

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
    <div className="flex flex-col gap-6">
      <Stepper steps={STEPS} current={step} />

      {error ? <Banner tone="danger">{error}</Banner> : null}

      {step === 0 ? (
        <section className={CARD} aria-label={o.aria.profile}>
          <div className={CARD_TITLE}>{p.title}</div>
          <p className={CARD_BODY}>
            {p.introBefore}
            <b>{p.introBold}</b>
            {p.introAfter}
          </p>

          <div className={FORM}>
            <div className={FIELD}>
              <label className={FIELD_LABEL} htmlFor="onb-name">{p.fullName}</label>
              <input
                id="onb-name"
                className={INPUT}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={p.fullNamePlaceholder}
                autoComplete="name"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className={FIELD}>
                <label className={FIELD_LABEL} htmlFor="onb-country">{p.country}</label>
                <input
                  id="onb-country"
                  className={INPUT}
                  value={country}
                  onChange={(e) => setCountry(e.target.value.toUpperCase().slice(0, 2))}
                  placeholder={p.countryPlaceholder}
                  maxLength={2}
                />
              </div>
              <div className={FIELD}>
                <label className={FIELD_LABEL} htmlFor="onb-kind">{p.investorKind}</label>
                <select
                  id="onb-kind"
                  className={INPUT}
                  value={investorKind}
                  onChange={(e) => setInvestorKind(e.target.value)}
                >
                  <option value="natural_person">{p.naturalPerson}</option>
                  <option value="legal_entity">{p.legalEntity}</option>
                </select>
              </div>
            </div>

            <div className={FIELD}>
              <label className={FIELD_LABEL} htmlFor="onb-invite">{p.inviteCode}</label>
              <input
                id="onb-invite"
                className={INPUT}
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder={p.invitePlaceholder}
              />
            </div>
          </div>

          <div className={ACTIONS}>
            <button className={BTN_PRIMARY} onClick={saveProfile} disabled={busy}>
              {busy ? p.saving : p.continue}
            </button>
          </div>
        </section>
      ) : null}

      {step === 1 ? (
        <section className={CARD} aria-label={o.aria.assessment}>
          <div className={CARD_TITLE}>{a.title}</div>
          <p className={CARD_BODY}>{a.intro}</p>

          <div className="flex flex-col gap-4">
            {KNOWLEDGE_QUESTIONS.map((q, i) => (
              <fieldset className="flex flex-col gap-2 border-0 p-0" key={q.id}>
                <legend className="p-0 text-sm font-semibold leading-normal text-slate-100">
                  {i + 1}. {q.prompt}
                </legend>
                <div className="flex flex-wrap gap-2">
                  <label
                    className={`cursor-pointer rounded-full border px-3 py-1 text-xs ${
                      answers[q.id] === true
                        ? "border-indigo-400/40 bg-indigo-500/10 text-indigo-200"
                        : "border-white/10 bg-white/[0.03] text-slate-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name={q.id}
                      className="sr-only"
                      checked={answers[q.id] === true}
                      onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: true }))}
                    />
                    {q.yes}
                  </label>
                  <label
                    className={`cursor-pointer rounded-full border px-3 py-1 text-xs ${
                      answers[q.id] === false
                        ? "border-indigo-400/40 bg-indigo-500/10 text-indigo-200"
                        : "border-white/10 bg-white/[0.03] text-slate-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name={q.id}
                      className="sr-only"
                      checked={answers[q.id] === false}
                      onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: false }))}
                    />
                    {q.no}
                  </label>
                </div>
              </fieldset>
            ))}
          </div>

          <h3 className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-500">{a.lossCapacity}</h3>
          <div className={FORM}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className={FIELD}>
                <label className={FIELD_LABEL} htmlFor="onb-income">{a.annualIncome}</label>
                <input id="onb-income" className={INPUT} type="number" min={0} value={annualIncome}
                  onChange={(e) => setAnnualIncome(e.target.value)} placeholder={a.amountPlaceholder} />
              </div>
              <div className={FIELD}>
                <label className={FIELD_LABEL} htmlFor="onb-assets">{a.liquidAssets}</label>
                <input id="onb-assets" className={INPUT} type="number" min={0} value={liquidAssets}
                  onChange={(e) => setLiquidAssets(e.target.value)} placeholder={a.amountPlaceholder} />
              </div>
            </div>
            <div className={FIELD}>
              <label className={FIELD_LABEL} htmlFor="onb-commit">{a.commitments}</label>
              <input id="onb-commit" className={INPUT} type="number" min={0} value={commitments}
                onChange={(e) => setCommitments(e.target.value)} placeholder={a.amountPlaceholder} />
            </div>
          </div>

          <Banner tone={knowledgePassed ? "info" : "warn"}>
            {allAnswered
              ? knowledgePassed
                ? a.bannerPass(knowledgeScore, KNOWLEDGE_QUESTIONS.length)
                : a.bannerFail(knowledgeScore, KNOWLEDGE_QUESTIONS.length)
              : a.bannerPending}
          </Banner>

          <div className={ACTIONS}>
            <button className={BTN_SECONDARY} onClick={() => setStep(0)} disabled={busy}>{a.back}</button>
            <button className={BTN_PRIMARY} onClick={submitAssessment} disabled={busy || !allAnswered}>
              {busy ? a.calculating : a.validate}
            </button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className={CARD} aria-label={o.aria.kyc}>
          <div className={CARD_TITLE}>{k.title}</div>

          {assessmentResult ? (
            <div className="flex flex-col gap-1.5 rounded-xl border border-indigo-400/30 bg-indigo-500/10 p-4">
              <span className="text-[10px] font-bold uppercase tracking-wide text-indigo-300">{k.capLabel}</span>
              <span className="text-2xl font-black leading-tight text-white">
                {assessmentResult.capCents == null ? k.capUnlimited : eur(assessmentResult.capCents / 100)}
              </span>
              <span className="text-xs text-slate-400">
                {k.classification(
                  assessmentResult.classification === "retail" ? k.retail : k.sophisticated,
                )}
              </span>
            </div>
          ) : null}

          <p className={CARD_BODY}>{k.intro}</p>

          {kycState === "unavailable" ? (
            <Banner tone="info">{k.unavailable}</Banner>
          ) : kycState === "started" ? (
            <div className="flex flex-col gap-2">
              <Banner tone="success">{k.started}</Banner>
              {kycToken ? <p className="text-xs text-slate-500">{k.sessionToken}</p> : null}
            </div>
          ) : (
            <Banner tone="warn">
              {k.statusCurrent(profile?.kycStatus ?? k.statusNotStarted)}
            </Banner>
          )}

          <div className={ACTIONS}>
            <button className={BTN_SECONDARY} onClick={() => setStep(1)} disabled={busy}>{a.back}</button>
            {kycState === "idle" ? (
              <button className={BTN_PRIMARY} onClick={startKyc} disabled={busy}>
                {busy ? k.starting : k.start}
              </button>
            ) : (
              <button className={BTN_PRIMARY} onClick={() => setStep(3)} disabled={busy}>
                {k.continueWallet}
              </button>
            )}
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className={CARD} aria-label={o.aria.wallet}>
          <div className={CARD_TITLE}>{w.title}</div>
          <p className={CARD_BODY}>
            {w.introBefore}
            <b>{w.introBold}</b>
            {w.introAfter}
          </p>

          <div className={FORM}>
            <div className={FIELD}>
              <label className={FIELD_LABEL} htmlFor="onb-wallet">{w.addressLabel}</label>
              <input
                id="onb-wallet"
                className={INPUT}
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                placeholder={w.addressPlaceholder}
                spellCheck={false}
                autoComplete="off"
              />
            </div>
            {walletAddress && !walletValid ? (
              <p className="text-xs text-slate-500">{w.formatHint}</p>
            ) : null}
          </div>

          {profile?.walletAddress ? (
            <Banner tone="success">
              {w.savedPrefix}
              <span className="font-mono">{profile.walletAddress}</span>
              {identity?.onchainidAddress ? w.onchainLinked : w.onchainAfterKyc}
            </Banner>
          ) : null}

          <div className={ACTIONS}>
            <button className={BTN_SECONDARY} onClick={() => setStep(2)} disabled={busy}>{a.back}</button>
            <button className={BTN_PRIMARY} onClick={linkWallet} disabled={busy || !walletValid}>
              {busy ? w.saving : profile?.walletAddress ? w.update : w.save}
            </button>
          </div>
        </section>
      ) : null}

      {done ? (
        <Banner tone="info">
          {o.doneBefore}
          <b>{o.doneBold}</b>
          {o.doneAfter}
        </Banner>
      ) : null}

      <p className="text-xs text-slate-500">{o.foot}</p>
    </div>
  );
}
