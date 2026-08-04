"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Bot,
  Briefcase,
  Code2,
  Ellipsis,
  GraduationCap,
  Handshake,
  Megaphone,
  MessageCircle,
  Rocket,
  Search,
  Users,
  Video,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCompleteOnboarding } from "@/hooks/use-auth";
import { useCreateAgent } from "@/hooks/use-agents";
import { useTranslation } from "@/hooks/use-translation";
import { cn } from "@/lib/utils";

const TOTAL_STEPS = 3;

const DISCOVERY_OPTIONS = [
  { id: "googleSearch", icon: Search },
  { id: "youtube", icon: Video },
  { id: "twitter", icon: MessageCircle },
  { id: "linkedin", icon: Users },
  { id: "tiktok", icon: Video },
  { id: "reddit", icon: MessageCircle },
  { id: "chatgpt", icon: Bot },
  { id: "friends", icon: Handshake },
  { id: "other", icon: Ellipsis },
] as const;

const ROLE_OPTIONS = [
  { id: "founder", icon: Rocket },
  { id: "freelancer", icon: Briefcase },
  { id: "marketer", icon: Megaphone },
  { id: "developer", icon: Code2 },
  { id: "sales", icon: Handshake },
  { id: "student", icon: GraduationCap },
  { id: "other", icon: Ellipsis },
] as const;

const COUNTRY_CODES = ["+33", "+1", "+44", "+49", "+34", "+32", "+41", "+352"] as const;

function OptionGrid({
  options,
  selected,
  onSelect,
  translate,
}: {
  options: readonly { id: string; icon: React.ComponentType<{ className?: string }> }[];
  selected: string | null;
  onSelect: (id: string) => void;
  translate: (id: string) => string;
}) {
  return (
    <div role="radiogroup" className="grid gap-2.5 sm:grid-cols-2">
      {options.map(({ id, icon: Icon }) => {
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
                "flex size-8 shrink-0 items-center justify-center rounded-xl",
                isSelected ? "bg-brand/20 text-brand" : "bg-foreground/5 text-foreground/70",
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
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
  const reducedMotion = useReducedMotion();
  const completeOnboarding = useCompleteOnboarding();
  const createAgent = useCreateAgent();

  const [showIntro, setShowIntro] = useState(true);
  const [step, setStep] = useState(1);
  const [finishing, setFinishing] = useState(false);

  const [discoverySource, setDiscoverySource] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [countryCode, setCountryCode] = useState<string>(COUNTRY_CODES[0]);
  const [phone, setPhone] = useState("");
  const [useCase, setUseCase] = useState("");

  useEffect(() => {
    const timeout = setTimeout(() => setShowIntro(false), reducedMotion ? 300 : 2600);
    return () => clearTimeout(timeout);
  }, [reducedMotion]);

  const canContinue =
    (step === 1 && discoverySource !== null) ||
    (step === 2 && role !== null) ||
    (step === 3 && firstName.trim().length > 0);

  const handleFinish = async () => {
    setFinishing(true);
    await completeOnboarding.mutateAsync({
      discoverySource: discoverySource ?? undefined,
      role: role ?? undefined,
      firstName: firstName.trim(),
      phone: phone.trim() ? `${countryCode} ${phone.trim()}` : undefined,
      primaryUseCase: useCase.trim() || undefined,
    });
    // A fresh agent hosts the pending prompt (consumed by the Build view).
    const agent = await createAgent.mutateAsync(undefined);
    router.push(`/agents/${agent.id}/build`);
  };

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
      <p className="mb-2 font-mono text-xs tracking-[0.2em] text-muted-foreground uppercase">
        {t("progress", { current: step, total: TOTAL_STEPS })}
      </p>

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
            {finishing ? t("completing") : t("step3.finish")}
          </Button>
        )}
      </div>
    </div>
  );
}
