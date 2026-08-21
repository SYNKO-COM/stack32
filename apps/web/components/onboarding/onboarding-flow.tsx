"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Briefcase,
  Code2,
  Ellipsis,
  FolderKanban,
  GraduationCap,
  Handshake,
  IdCard,
  Megaphone,
  Rocket,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ComponentType } from "react";

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
import { useCreateAgent } from "@/hooks/use-agents";
import { useCompleteOnboarding, useCurrentUser } from "@/hooks/use-auth";
import { useCreateWorkspace } from "@/hooks/use-workspaces";
import { useTranslation } from "@/hooks/use-translation";
import { isCheckoutNext, postOnboardingPath } from "@/lib/auth/post-auth";
import {
  clearOnboardingDraft,
  readOnboardingDraft,
  writeOnboardingDraft,
} from "@/lib/onboarding-draft";
import { getAuthRepository } from "@/lib/repositories/factory";
import { writeActiveWorkspaceId } from "@/lib/workspace-preference";
import { cn } from "@/lib/utils";

const TOTAL_STEPS = 4;

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
  const userId = user?.id ?? "";
  const completeOnboarding = useCompleteOnboarding();
  const createWorkspace = useCreateWorkspace();
  const createAgent = useCreateAgent();

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
    const draft = readOnboardingDraft(userId);
    setHydratedFor(userId);
    setStep(draft.step);
    setShowIntro(draft.showIntro);
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
    setUseCase(draft.useCase);
    setWorkspaceName(draft.workspaceName);
    setReady(true);
  }

  useEffect(() => {
    if (!ready || !userId) return;
    writeOnboardingDraft(userId, {
      step: step as 1 | 2 | 3 | 4,
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

  const usernameOk = usernameStatus === "available";
  const canContinue =
    (step === 1 && discoverySource !== null) ||
    (step === 2 && role !== null) ||
    (step === 3 && firstName.trim().length > 0 && usernameOk) ||
    (step === 4 && workspaceName.trim().length > 0);

  const handleFinish = async () => {
    setFinishing(true);
    try {
      await completeOnboarding.mutateAsync({
        discoverySource: discoverySource ?? undefined,
        role: role ?? undefined,
        firstName: firstName.trim(),
        phone: phone.trim() ? `${countryCode} ${phone.trim()}` : undefined,
        primaryUseCase: useCase.trim() || undefined,
        username: username.trim().toLowerCase(),
      });
      const workspace = await createWorkspace.mutateAsync(workspaceName.trim());
      if (userId) {
        writeActiveWorkspaceId(userId, workspace.id);
        clearOnboardingDraft(userId);
      }
      const dest = postOnboardingPath(searchParams.get("next"));
      if (isCheckoutNext(dest)) {
        router.push(dest);
        return;
      }
      await createAgent.mutateAsync({ workspaceId: workspace.id });
      router.push(dest);
    } catch {
      setFinishing(false);
    }
  };

  if (!ready) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <BrandLoader label={t("common:loading")} />
      </div>
    );
  }

  if (showIntro) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center text-center">
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
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl" aria-label={t("a11y.stepper")}>
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={reducedMotion ? undefined : { opacity: 0, x: 32 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reducedMotion ? undefined : { opacity: 0, x: -32 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          {step === 1 ? (
            <>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {t("step1.title")}
              </h1>
              <p className="mt-2 mb-8 text-sm text-muted-foreground">{t("step1.subtitle")}</p>
              <OptionGrid
                options={DISCOVERY_OPTIONS}
                selected={discoverySource}
                onSelect={setDiscoverySource}
                translate={(id) => t(`step1.options.${id}`)}
              />
            </>
          ) : null}

          {step === 2 ? (
            <>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {t("step2.title")}
              </h1>
              <p className="mt-2 mb-8 text-sm text-muted-foreground">{t("step2.subtitle")}</p>
              <OptionGrid
                options={ROLE_OPTIONS}
                selected={role}
                onSelect={setRole}
                translate={(id) => t(`step2.options.${id}`)}
              />
            </>
          ) : null}

          {step === 3 ? (
            <>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
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
                <div className="space-y-1.5">
                  <Label htmlFor="onboarding-usecase">{t("step3.useCase")}</Label>
                  <Input
                    id="onboarding-usecase"
                    value={useCase}
                    onChange={(e) => setUseCase(e.target.value)}
                    placeholder={t("step3.useCasePlaceholder")}
                  />
                </div>
              </div>
            </>
          ) : null}

          {step === 4 ? (
            <>
              <div className="mb-6 flex size-12 items-center justify-center rounded-2xl bg-brand/15 text-brand">
                <FolderKanban className="size-6" aria-hidden="true" />
              </div>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
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

      <div className="mt-10 flex items-center justify-between">
        {step > 1 ? (
          <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={finishing}>
            {t("common:actions.back")}
          </Button>
        ) : (
          <span />
        )}
        {step < TOTAL_STEPS ? (
          <Button
            className="rounded-full px-6"
            disabled={!canContinue}
            onClick={() => setStep((s) => s + 1)}
          >
            {t("common:actions.continue")}
          </Button>
        ) : (
          <Button
            className="rounded-full px-6"
            disabled={!canContinue || finishing}
            onClick={() => void handleFinish()}
          >
            {finishing ? t("completing") : t("step4.finish")}
          </Button>
        )}
      </div>
    </div>
  );
}
