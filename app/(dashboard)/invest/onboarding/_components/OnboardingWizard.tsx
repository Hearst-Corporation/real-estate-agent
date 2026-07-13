"use client";

import { useCallback, useEffect, useState } from "react";
import { Stepper, Banner, eur } from "@/components/invest";
import { UI } from "@/lib/ui-strings";
import { Button } from "@/components/ui/button";
import { Field, Label } from "@/components/ui/fieldset";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Heading, Subheading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";

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

/** Conteneur de carte du wizard (utilities zinc, dark natif). */
const CARD =
  "flex flex-col gap-4 rounded-2xl border border-zinc-950/10 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.03]";
const FORM = "flex flex-col gap-4";
const ACTIONS = "flex items-center justify-end gap-3 pt-2";

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
          <Subheading>{p.title}</Subheading>
          <Text>
            {p.introBefore}
            <strong className="font-semibold text-zinc-950 dark:text-white">{p.introBold}</strong>
            {p.introAfter}
          </Text>

          <div className={FORM}>
            <Field>
              <Label>{p.fullName}</Label>
              <Input
                name="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={p.fullNamePlaceholder}
                autoComplete="name"
              />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <Label>{p.country}</Label>
                <Input
                  name="country"
                  value={country}
                  onChange={(e) => setCountry(e.target.value.toUpperCase().slice(0, 2))}
                  placeholder={p.countryPlaceholder}
                  maxLength={2}
                />
              </Field>
              <Field>
                <Label>{p.investorKind}</Label>
                <Select
                  name="investorKind"
                  value={investorKind}
                  onChange={(e) => setInvestorKind(e.target.value)}
                >
                  <option value="natural_person">{p.naturalPerson}</option>
                  <option value="legal_entity">{p.legalEntity}</option>
                </Select>
              </Field>
            </div>

            <Field>
              <Label>{p.inviteCode}</Label>
              <Input
                name="inviteCode"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder={p.invitePlaceholder}
              />
            </Field>
          </div>

          <div className={ACTIONS}>
            <Button color="indigo" onClick={saveProfile} disabled={busy}>
              {busy ? p.saving : p.continue}
            </Button>
          </div>
        </section>
      ) : null}

      {step === 1 ? (
        <section className={CARD} aria-label={o.aria.assessment}>
          <Subheading>{a.title}</Subheading>
          <Text>{a.intro}</Text>

          <div className="flex flex-col gap-4">
            {KNOWLEDGE_QUESTIONS.map((q, i) => (
              <fieldset className="flex flex-col gap-2 border-0 p-0" key={q.id}>
                <legend className="p-0 text-sm font-semibold leading-normal text-zinc-950 dark:text-white">
                  {i + 1}. {q.prompt}
                </legend>
                <div className="flex flex-wrap gap-2">
                  {answers[q.id] === true ? (
                    <Button
                      color="indigo"
                      aria-pressed
                      onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: true }))}
                    >
                      {q.yes}
                    </Button>
                  ) : (
                    <Button
                      outline
                      aria-pressed={false}
                      onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: true }))}
                    >
                      {q.yes}
                    </Button>
                  )}
                  {answers[q.id] === false ? (
                    <Button
                      color="indigo"
                      aria-pressed
                      onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: false }))}
                    >
                      {q.no}
                    </Button>
                  ) : (
                    <Button
                      outline
                      aria-pressed={false}
                      onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: false }))}
                    >
                      {q.no}
                    </Button>
                  )}
                </div>
              </fieldset>
            ))}
          </div>

          <Heading level={3} className="mt-1 text-xs font-bold uppercase tracking-wide">
            {a.lossCapacity}
          </Heading>
          <div className={FORM}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <Label>{a.annualIncome}</Label>
                <Input
                  name="annualIncome"
                  type="number"
                  min={0}
                  value={annualIncome}
                  onChange={(e) => setAnnualIncome(e.target.value)}
                  placeholder={a.amountPlaceholder}
                />
              </Field>
              <Field>
                <Label>{a.liquidAssets}</Label>
                <Input
                  name="liquidAssets"
                  type="number"
                  min={0}
                  value={liquidAssets}
                  onChange={(e) => setLiquidAssets(e.target.value)}
                  placeholder={a.amountPlaceholder}
                />
              </Field>
            </div>
            <Field>
              <Label>{a.commitments}</Label>
              <Input
                name="commitments"
                type="number"
                min={0}
                value={commitments}
                onChange={(e) => setCommitments(e.target.value)}
                placeholder={a.amountPlaceholder}
              />
            </Field>
          </div>

          <Banner tone={knowledgePassed ? "info" : "warn"}>
            {allAnswered
              ? knowledgePassed
                ? a.bannerPass(knowledgeScore, KNOWLEDGE_QUESTIONS.length)
                : a.bannerFail(knowledgeScore, KNOWLEDGE_QUESTIONS.length)
              : a.bannerPending}
          </Banner>

          <div className={ACTIONS}>
            <Button outline onClick={() => setStep(0)} disabled={busy}>
              {a.back}
            </Button>
            <Button color="indigo" onClick={submitAssessment} disabled={busy || !allAnswered}>
              {busy ? a.calculating : a.validate}
            </Button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className={CARD} aria-label={o.aria.kyc}>
          <Subheading>{k.title}</Subheading>

          {assessmentResult ? (
            <div className="flex flex-col gap-1.5 rounded-xl border border-indigo-400/30 bg-indigo-500/10 p-4">
              <span className="text-[10px] font-bold uppercase tracking-wide text-indigo-500 dark:text-indigo-300">
                {k.capLabel}
              </span>
              <span className="text-2xl font-black leading-tight text-zinc-950 dark:text-white">
                {assessmentResult.capCents == null ? k.capUnlimited : eur(assessmentResult.capCents / 100)}
              </span>
              <Text>
                {k.classification(
                  assessmentResult.classification === "retail" ? k.retail : k.sophisticated,
                )}
              </Text>
            </div>
          ) : null}

          <Text>{k.intro}</Text>

          {kycState === "unavailable" ? (
            <Banner tone="info">{k.unavailable}</Banner>
          ) : kycState === "started" ? (
            <div className="flex flex-col gap-2">
              <Banner tone="success">{k.started}</Banner>
              {kycToken ? <Text>{k.sessionToken}</Text> : null}
            </div>
          ) : (
            <Banner tone="warn">
              {k.statusCurrent(profile?.kycStatus ?? k.statusNotStarted)}
            </Banner>
          )}

          <div className={ACTIONS}>
            <Button outline onClick={() => setStep(1)} disabled={busy}>
              {a.back}
            </Button>
            {kycState === "idle" ? (
              <Button color="indigo" onClick={startKyc} disabled={busy}>
                {busy ? k.starting : k.start}
              </Button>
            ) : (
              <Button color="indigo" onClick={() => setStep(3)} disabled={busy}>
                {k.continueWallet}
              </Button>
            )}
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className={CARD} aria-label={o.aria.wallet}>
          <Subheading>{w.title}</Subheading>
          <Text>
            {w.introBefore}
            <strong className="font-semibold text-zinc-950 dark:text-white">{w.introBold}</strong>
            {w.introAfter}
          </Text>

          <div className={FORM}>
            <Field>
              <Label>{w.addressLabel}</Label>
              <Input
                name="walletAddress"
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                placeholder={w.addressPlaceholder}
                spellCheck={false}
                autoComplete="off"
              />
            </Field>
            {walletAddress && !walletValid ? <Text>{w.formatHint}</Text> : null}
          </div>

          {profile?.walletAddress ? (
            <Banner tone="success">
              {w.savedPrefix}
              <span className="font-mono">{profile.walletAddress}</span>
              {identity?.onchainidAddress ? w.onchainLinked : w.onchainAfterKyc}
            </Banner>
          ) : null}

          <div className={ACTIONS}>
            <Button outline onClick={() => setStep(2)} disabled={busy}>
              {a.back}
            </Button>
            <Button color="indigo" onClick={linkWallet} disabled={busy || !walletValid}>
              {busy ? w.saving : profile?.walletAddress ? w.update : w.save}
            </Button>
          </div>
        </section>
      ) : null}

      {done ? (
        <Banner tone="info">
          {o.doneBefore}
          <strong className="font-semibold text-zinc-950 dark:text-white">{o.doneBold}</strong>
          {o.doneAfter}
        </Banner>
      ) : null}

      <Text>{o.foot}</Text>
    </div>
  );
}
