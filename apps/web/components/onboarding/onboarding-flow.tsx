"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  Briefcase,
  Code2,
  Ellipsis,
  GraduationCap,
  Handshake,
  IdCard,
  Megaphone,
  Rocket,
  Sparkles,
  Users,
  Clock,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ComponentType } from "react";

import {
  ChatgptLogo,
  GoogleLogo,
  InstagramLogo,
  LinkedinLogo,
  RedditLogo,
  TiktokLogo,
  XLogo,
  YoutubeLogo,
} from "@/components/onboarding/discovery-icons";
import { BrandLoader } from "@/components/shared/brand-loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthForm } from "@/components/auth/auth-form";
import { AgentPreview } from "@/components/onboarding/agent-preview";
import { useCompleteOnboarding, useCurrentUser } from "@/hooks/use-auth";
import { useCreateWorkspace } from "@/hooks/use-workspaces";
import { useTranslation } from "@/hooks/use-translation";
import { postOnboardingPath } from "@/lib/auth/post-auth";
import {
  GUEST_ONBOARDING_ID,
  adoptGuestOnboardingDraft,
  readOnboardingDraft,
  writeOnboardingDraft,
} from "@/lib/onboarding-draft";
import { getAuthRepository } from "@/lib/repositories/factory";
import { writeActiveWorkspaceId } from "@/lib/workspace-preference";
import { getPendingPrompt, consumePendingPrompt } from "@/lib/pending-prompt";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const TOTAL_STEPS = 9;
const GOAL_OPTIONS = [
  { id: "time", icon: Clock },
  { id: "clients", icon: Users },
  { id: "sell", icon: Rocket },
  { id: "explore", icon: Sparkles },
];

type OptionIcon = ComponentType<{ className?: string }>;

const DISCOVERY_OPTIONS: readonly { id: string; icon: OptionIcon; brand?: boolean }[] = [
  { id: "googleSearch", icon: GoogleLogo, brand: true },
  { id: "youtube", icon: YoutubeLogo, brand: true },
  { id: "twitter", icon: XLogo, brand: true },
  { id: "linkedin", icon: LinkedinLogo, brand: true },
  { id: "tiktok", icon: TiktokLogo, brand: true },
  { id: "instagram", icon: InstagramLogo, brand: true },
  { id: "reddit", icon: RedditLogo, brand: true },
  { id: "chatgpt", icon: ChatgptLogo, brand: true },
  { id: "friends", icon: Handshake },
  { id: "other", icon: Ellipsis },
];

const ROLE_OPTIONS: readonly { id: string; icon: OptionIcon }[] = [
  { id: "founder", icon: Rocket },
  { id: "freelancer", icon: Briefcase },
  { id: "marketer", icon: Megaphone },
  { id: "developer", icon: Code2 },
  { id: "sales", icon: Handshake },
  { id: "student", icon: GraduationCap },
  { id: "employee", icon: IdCard },
  { id: "other", icon: Ellipsis },
];

const COUNTRY_CODES = ["+33", "+1", "+44", "+49", "+34", "+32", "+41", "+352"] as const;

const USERNAME_FORMAT = /^[a-z][a-z0-9_]{2,29}$/;

function OptionGrid({
  options,
  selected,
  onSelect,
  translate,
}: {
  options: readonly { id: string; icon: OptionIcon; brand?: boolean }[];
  selected: string | null;
  onSelect: (id: string) => void;
  translate: (id: string) => string;
}) {
  return (
    <div role="radiogroup" className="grid gap-2.5 sm:grid-cols-2">
      {options.map(({ id, icon: Icon, brand }) => {
        const isSelected = selected === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onSelect(id)}
            className={cn(
              "glass flex items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm transition-all",
              isSelected
                ? "border-brand/50 bg-brand/10 shadow-glow-sm"
                : "hover:bg-foreground/[0.04]",
            )}
          >
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center",
                brand
                  ? "text-foreground"
                  : isSelected
                    ? "text-brand"
                    : "text-foreground/70",
              )}
            >
              <Icon className="size-5" aria-hidden="true" />
            </span>
            {translate(id)}
          </button>
        );
      })}
    </div>
  );
}

export function OnboardingFlow() {
  const { t } = useTranslation(["onboarding", "common"]);
  const router = useRouter();
  const searchParams = useSearchParams();
  const reducedMotion = useReducedMotion();
  const { data: user } = useCurrentUser();
  const userId = user?.id ?? GUEST_ONBOARDING_ID;
  const completeOnboarding = useCompleteOnboarding();
  const createWorkspace = useCreateWorkspace();

  const [authMode, setAuthMode] = useState<"signup" | "login">("signup");
  const [previewStartedAt, setPreviewStartedAt] = useState<number | null>(null);
  const [agentName, setAgentName] = useState("");
  const questionRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);
  const [showIntro, setShowIntro] = useState(true);
  const [step, setStep] = useState(1);
  const [finishing, setFinishing] = useState(false);

  const [discoverySource, setDiscoverySource] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [username, setUsername] = useState("");
  const [usernameRemote, setUsernameRemote] = useState<{
    forValue: string;
    status: "available" | "taken" | "reserved" | "invalid" | "idle";
  } | null>(null);
  const [countryCode, setCountryCode] = useState<string>(COUNTRY_CODES[0]);
  const [phone, setPhone] = useState("");
  const [useCase, setUseCase] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [goal, setGoal] = useState("");
  const [audience, setAudience] = useState("");
  const [outcome, setOutcome] = useState("");
  const [finishError, setFinishError] = useState(false);
  const [createdWorkspaceId, setCreatedWorkspaceId] = useState<string | null>(null);

  const normalizedUsername = username.trim().toLowerCase();
  const usernameLocalStatus: "idle" | "invalid" | "reserved" | null = !normalizedUsername
    ? "idle"
    : normalizedUsername.includes("stack32")
      ? "reserved"
      : !USERNAME_FORMAT.test(normalizedUsername)
        ? "invalid"
        : null;
  const usernameStatus =
    usernameLocalStatus ??
    (usernameRemote?.forValue === normalizedUsername
      ? usernameRemote.status
      : "checking");

  if (userId && hydratedFor !== userId) {
    const draft = user ? adoptGuestOnboardingDraft(userId) : readOnboardingDraft(userId);
    setHydratedFor(userId);
    setStep(draft.step);
    setPreviewStartedAt(draft.previewStartedAt);
    setAgentName(draft.agentName);
    setShowIntro(draft.showIntro && !(typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches));
    setDiscoverySource(draft.discoverySource);
    setRole(draft.role);
    setFirstName(draft.firstName);
    setUsername(draft.username);
    setCountryCode(
      COUNTRY_CODES.includes(draft.countryCode as (typeof COUNTRY_CODES)[number])
        ? draft.countryCode
        : COUNTRY_CODES[0],
    );
    setPhone(draft.phone);
    setUseCase(draft.useCase || getPendingPrompt() || "");
    setGoal(draft.goal);
    setAudience(draft.audience);
    setOutcome(draft.outcome);
    setWorkspaceName(draft.workspaceName);
    setReady(true);
  }

  useEffect(() => {
    if (!ready || !userId) return;
    writeOnboardingDraft(userId, {
      version: 2,
      previewStartedAt,
      agentName,
      awaitingPayment: false,
      step,
      goal,
      audience,
      outcome,
      showIntro,
      discoverySource,
      role,
      firstName,
      username,
      countryCode,
      phone,
      useCase,
      workspaceName,
    });
  }, [
    ready,
    previewStartedAt,
    agentName,
    userId,
    step,
    showIntro,
    discoverySource,
    role,
    firstName,
    username,
    countryCode,
    phone,
    useCase,
    workspaceName,
    goal,
    audience,
    outcome,
  ]);

  useEffect(() => {
    if (!ready || !showIntro) return;
    const timeout = setTimeout(() => setShowIntro(false), reducedMotion ? 300 : 2600);
    return () => clearTimeout(timeout);
  }, [ready, showIntro, reducedMotion]);

  useEffect(() => {
    if (usernameLocalStatus !== null) return;
    const normalized = normalizedUsername;
    const handle = window.setTimeout(() => {
      void getAuthRepository()
        .checkUsernameAvailability(normalized)
        .then((result) => {
          if (!result.valid) {
            setUsernameRemote({
              forValue: normalized,
              status: result.reason === "reserved" ? "reserved" : "invalid",
            });
            return;
          }
          setUsernameRemote({
            forValue: normalized,
            status: result.available ? "available" : "taken",
          });
        })
        .catch(() => {
          setUsernameRemote({ forValue: normalized, status: "idle" });
        });
    }, 300);
    return () => window.clearTimeout(handle);
  }, [normalizedUsername, usernameLocalStatus]);

  useEffect(() => {
    if (!ready || showIntro || previewStartedAt !== null) return;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    const timer = window.setTimeout(() => {
      questionRef.current?.querySelector<HTMLHeadingElement>("h1")?.focus({ preventScroll: true });
    }, reducedMotion ? 0 : 180);
    return () => window.clearTimeout(timer);
  }, [step, ready, showIntro, previewStartedAt, reducedMotion]);

  const usernameOk = usernameStatus === "available";
  const canContinue =
    (step === 1 && goal !== "") ||
    (step === 2 && role !== null) ||
    (step === 3 && useCase.trim().length >= 10) ||
    (step === 4 && audience.trim().length > 0) ||
    (step === 5 && outcome.trim().length > 0) ||
    (step === 6 && firstName.trim().length > 0 && usernameOk) ||
    step === 7 ||
    (step === 8 && workspaceName.trim().length > 0) ||
    (step === 9 && useCase.trim().length >= 10 && workspaceName.trim().length > 0 && usernameOk);

  const handleFinish = async () => {
    if (finishing || !canContinue || !user || !agentName.trim()) return;
    setFinishing(true);
    setFinishError(false);
    try {
      await completeOnboarding.mutateAsync({
        discoverySource: discoverySource ?? undefined,
        role: role ?? undefined,
        firstName: firstName.trim(),
        phone: phone.trim() ? `${countryCode} ${phone.trim()}` : undefined,
        primaryUseCase: [useCase.trim(), t("journey.audienceLabel") + ": " + audience.trim(), t("journey.outcomeLabel") + ": " + outcome.trim(), t("journey.goalLabel") + ": " + t(`journey.goals.${goal}`)].join("\n"),
        username: username.trim().toLowerCase(),
      });
      const workspaceId = createdWorkspaceId ?? (await createWorkspace.mutateAsync(workspaceName.trim())).id;
      setCreatedWorkspaceId(workspaceId);
      // Keep the brief as an inert draft until an active paid subscription exists.
      // Merely visiting /agents before payment must not auto-submit a build.
      consumePendingPrompt();
      writeOnboardingDraft(userId, { ...readOnboardingDraft(userId), agentName: agentName.trim(), awaitingPayment: true });
      if (userId) {
        writeActiveWorkspaceId(userId, workspaceId);

      }
      const dest = postOnboardingPath(searchParams.get("next"));
      router.push(dest);
    } catch {
      setFinishError(true);
      setFinishing(false);
    }
  };

  const singleChoiceStep = step === 1 || step === 2 || step === 7;
  const progressNavigation = (
    <div className="sticky top-20 z-30 mb-4 bg-background/95 pt-3 pb-3 backdrop-blur-sm" data-testid="onboarding-navigation">
      <div role="progressbar" aria-label={t("a11y.stepper")} aria-valuemin={1} aria-valuemax={TOTAL_STEPS} aria-valuenow={step} aria-valuetext={t("progress", { current: step, total: TOTAL_STEPS })} className="h-1.5 overflow-hidden rounded-full bg-foreground/10">
        <div className="h-full rounded-full bg-brand transition-[width] duration-200" style={{ width: `${step / TOTAL_STEPS * 100}%` }} />
      </div>
      {step > 1 && <Button type="button" variant="ghost" size="sm" className="mt-1 -ml-2 min-h-10 gap-1 px-2 text-xs" onClick={() => setStep(step - 1)} disabled={finishing}>
        <ArrowLeft className="size-3.5" aria-hidden="true" />{t("common:actions.back")}
      </Button>}
    </div>
  );

  if (!ready) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <BrandLoader label={t("common:loading")} />
      </div>
    );
  }

  if (!user && step >= 6) {
    return <div ref={questionRef} className="mx-auto w-full max-w-xl [&_h1]:outline-none">
      {progressNavigation}
      <div className="mx-auto w-full max-w-md space-y-6">
      <p className="text-sm font-medium text-brand">{t("journey.authCheckpoint")}</p>
      <h1 tabIndex={-1} className="text-2xl font-semibold tracking-tight">{t("journey.authTitle")}</h1>
      <p className="text-muted-foreground">{t("journey.authSubtitle")}</p>
      <AuthForm mode={authMode} onModeChange={setAuthMode} preferredNext={searchParams.get("next")} />
      </div>
    </div>;
  }

  if (previewStartedAt !== null) {
    return <AgentPreview idea={useCase} audience={audience} outcome={outcome}
      startedAt={previewStartedAt} name={agentName} onNameChange={setAgentName}
      busy={finishing} error={finishError} onContinue={() => void handleFinish()}
      onBack={() => setPreviewStartedAt(null)} />;
  }

  if (showIntro) {
    return (
      <div className="hidden min-h-[70vh] flex-col items-center justify-center text-center sm:flex">
        <motion.p
          initial={reducedMotion ? undefined : { opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
          className="font-handwritten text-5xl text-foreground sm:text-6xl"
          style={{ fontFamily: "var(--font-caveat)" }}
        >
          {t("intro.welcome")}
        </motion.p>
        <motion.p
          initial={reducedMotion ? undefined : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.8 }}
          className="mt-4 text-muted-foreground"
        >
          {t("intro.subtitle")}
        </motion.p>
        <Button className="mt-8 h-12 w-full max-w-xs rounded-full text-base" onClick={() => setShowIntro(false)}>{t("common:actions.continue")}</Button>
      </div>
    );
  }

  return (
    <div ref={questionRef} className="mx-auto w-full max-w-xl [&_h1]:outline-none" aria-label={t("a11y.stepper")}>
      {progressNavigation}
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={reducedMotion ? undefined : { opacity: 0, x: 32 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reducedMotion ? undefined : { opacity: 0, x: -32 }}
          transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
        >
          {step === 1 ? (
            <>
              <h1 tabIndex={-1} className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("journey.goalTitle")}</h1>
              <p className="mt-2 mb-6 text-muted-foreground">{t("journey.goalSubtitle")}</p>
              <OptionGrid options={GOAL_OPTIONS} selected={goal} onSelect={(id) => { setGoal(id); setStep(2); }} translate={(id) => t(`journey.goals.${id}`)} />
            </>
          ) : null}
          {step === 3 ? (
            <>
              <h1 tabIndex={-1} className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("journey.ideaTitle")}</h1>
              <p className="mt-2 mb-6 text-muted-foreground">{t("journey.ideaSubtitle")}</p>
              <Label htmlFor="onboarding-idea">{t("journey.ideaLabel")}</Label>
              <Textarea id="onboarding-idea" value={useCase} onChange={(e) => setUseCase(e.target.value)} maxLength={4000} className="mt-2 min-h-40" placeholder={t("journey.ideaPlaceholder")} />
              <Button variant="outline" className="mt-4 min-h-11 rounded-full" onClick={() => {
                const ideas = t("journey.ideas", { returnObjects: true }) as string[];
                const alternatives = ideas.filter((idea) => idea !== useCase);
                setUseCase(alternatives[Math.floor(Math.random() * alternatives.length)] ?? ideas[0]);
              }}><Sparkles className="mr-2 size-4" />{t("journey.suggest")}</Button>
              <p className="mt-3 text-sm text-muted-foreground">{t("journey.ideaHint")}</p>
            </>
          ) : null}
          {step === 4 || step === 5 ? (
            <>
              <h1 tabIndex={-1} className="text-2xl font-semibold tracking-tight sm:text-3xl">{t(step === 4 ? "journey.audienceTitle" : "journey.outcomeTitle")}</h1>
              <p className="mt-2 mb-6 text-muted-foreground">{t(step === 4 ? "journey.audienceSubtitle" : "journey.outcomeSubtitle")}</p>
              <Label htmlFor="onboarding-answer">{t(step === 4 ? "journey.audienceLabel" : "journey.outcomeLabel")}</Label>
              <Textarea id="onboarding-answer" className="mt-2 min-h-32" maxLength={1000} value={step === 4 ? audience : outcome} onChange={(e) => step === 4 ? setAudience(e.target.value) : setOutcome(e.target.value)} placeholder={t(step === 4 ? "journey.audiencePlaceholder" : "journey.outcomePlaceholder")} />
            </>
          ) : null}
          {step === 9 ? (
            <>
              <h1 tabIndex={-1} className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("journey.summaryTitle")}</h1>
              <p className="mt-2 mb-6 text-muted-foreground">{t("journey.summarySubtitle")}</p>
              <dl className="glass space-y-4 rounded-2xl p-5">
                {[["ideaLabel", useCase], ["audienceLabel", audience], ["outcomeLabel", outcome]].map(([key, answer]) => <div key={key}><dt className="text-sm font-medium text-brand">{t(`journey.${key}`)}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">{answer}</dd></div>)}
              </dl>
              <ol className="mt-6 space-y-3 text-sm leading-relaxed">{(t("journey.nextSteps", { returnObjects: true }) as string[]).map((item, index) => <li key={item} className="flex gap-3"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">{index + 1}</span>{item}</li>)}</ol>
              <p className="mt-5 text-xs leading-relaxed text-muted-foreground">{t("journey.disclaimer")}</p>
            </>
          ) : null}
          {step === 7 ? (
            <>
              <h1 tabIndex={-1} className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {t("step1.title")}
              </h1>
              <p className="mt-2 mb-8 text-sm text-muted-foreground">{t("step1.subtitle")}</p>
              <OptionGrid
                options={DISCOVERY_OPTIONS}
                selected={discoverySource}
                onSelect={(id) => { setDiscoverySource(id); setStep(8); }}
                translate={(id) => t(`step1.options.${id}`)}
              />
            </>
          ) : null}

          {step === 2 ? (
            <>
              <h1 tabIndex={-1} className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {t("step2.title")}
              </h1>
              <p className="mt-2 mb-8 text-sm text-muted-foreground">{t("step2.subtitle")}</p>
              <OptionGrid
                options={ROLE_OPTIONS}
                selected={role}
                onSelect={(id) => { setRole(id); setStep(3); }}
                translate={(id) => t(`step2.options.${id}`)}
              />
            </>
          ) : null}

          {step === 6 ? (
            <>
              <h1 tabIndex={-1} className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {t("step3.title")}
              </h1>
              <p className="mt-2 mb-8 text-sm text-muted-foreground">{t("step3.subtitle")}</p>
              <div className="space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="onboarding-firstname">{t("step3.firstName")}</Label>
                  <Input
                    id="onboarding-firstname"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder={t("step3.firstNamePlaceholder")}
                    autoComplete="given-name"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="onboarding-username">{t("step3.username")}</Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
                      @
                    </span>
                    <Input
                      id="onboarding-username"
                      value={username}
                      onChange={(e) =>
                        setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))
                      }
                      placeholder={t("step3.usernamePlaceholder")}
                      className="pl-7"
                      autoComplete="username"
                      spellCheck={false}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground/70">{t("step3.usernameHint")}</p>
                  {usernameStatus === "checking" ? (
                    <p className="text-xs text-muted-foreground">{t("step3.usernameChecking")}</p>
                  ) : null}
                  {usernameStatus === "available" ? (
                    <p className="text-xs text-emerald-600 dark:text-emerald-400">
                      {t("step3.usernameAvailable")}
                    </p>
                  ) : null}
                  {usernameStatus === "taken" ? (
                    <p className="text-xs text-destructive">{t("step3.usernameTaken")}</p>
                  ) : null}
                  {usernameStatus === "reserved" ? (
                    <p className="text-xs text-destructive">{t("step3.usernameReserved")}</p>
                  ) : null}
                  {usernameStatus === "invalid" ? (
                    <p className="text-xs text-destructive">{t("step3.usernameInvalid")}</p>
                  ) : null}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="onboarding-phone">{t("step3.phone")}</Label>
                  <div className="flex gap-2">
                    <select
                      aria-label={t("step3.phone")}
                      value={countryCode}
                      onChange={(e) => setCountryCode(e.target.value)}
                      className="glass h-9 rounded-md bg-transparent px-2 text-sm text-foreground"
                    >
                      {COUNTRY_CODES.map((code) => (
                        <option key={code} value={code} className="bg-zinc-900">
                          {code}
                        </option>
                      ))}
                    </select>
                    <Input
                      id="onboarding-phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder={t("step3.phonePlaceholder")}
                      autoComplete="tel-national"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground/70">{t("step3.phoneHint")}</p>
                </div>

              </div>
            </>
          ) : null}

          {step === 8 ? (
            <>
              <h1 tabIndex={-1} className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {t("step4.title")}
              </h1>
              <p className="mt-2 mb-4 text-sm text-muted-foreground">{t("step4.subtitle")}</p>
              <ul className="mb-8 space-y-2 text-sm text-muted-foreground">
                <li className="flex gap-2">
                  <span className="text-brand">•</span>
                  {t("step4.point1")}
                </li>
                <li className="flex gap-2">
                  <span className="text-brand">•</span>
                  {t("step4.point2")}
                </li>
                <li className="flex gap-2">
                  <span className="text-brand">•</span>
                  {t("step4.point3")}
                </li>
              </ul>
              <div className="space-y-1.5">
                <Label htmlFor="onboarding-workspace">{t("step4.nameLabel")}</Label>
                <Input
                  id="onboarding-workspace"
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  placeholder={t("step4.namePlaceholder")}
                  autoFocus
                />
              </div>
            </>
          ) : null}
        </motion.div>
      </AnimatePresence>

      {finishError ? <p role="alert" className="mt-5 text-sm text-destructive">{t("journey.error")}</p> : null}
      {step === 7 ? <div className="mt-5 flex justify-center"><Button type="button" variant="link" className="min-h-11 text-muted-foreground" onClick={() => setStep(8)}>{t("common:actions.skip")}</Button></div> : null}
      {!singleChoiceStep && <div className="mt-6 flex justify-center" data-testid="onboarding-actions">
        {step < TOTAL_STEPS ? (
          <Button
            className="h-12 w-full max-w-xs rounded-full px-8 text-base"
            disabled={!canContinue}
            onClick={() => setStep(step + 1)}
          >
            {t("common:actions.continue")}
          </Button>
        ) : (
          <Button
            className="h-12 w-full max-w-xs rounded-full px-8 text-base"
            disabled={!canContinue || finishing}
            onClick={() => { setAgentName((name) => name || t("preview.defaultName")); setPreviewStartedAt(Date.now()); }}
          >
            {finishing ? t("completing") : t("journey.finish")}
          </Button>
        )}
      </div>}
    </div>
  );
}
