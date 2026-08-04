"use client";

import { motion, useReducedMotion } from "framer-motion";

import { PromptComposer } from "@/components/shared/prompt-composer";
import { useStartFromPrompt } from "@/hooks/use-start-from-prompt";
import { useTranslation } from "@/hooks/use-translation";

export function Hero() {
  const { t } = useTranslation("marketing");
  const startFromPrompt = useStartFromPrompt();
  const reducedMotion = useReducedMotion();

  const examples = t("hero.promptExamples", { returnObjects: true }) as string[];

  const fadeUp = (delay: number) =>
    reducedMotion
      ? {}
      : {
          initial: { opacity: 0, y: 24 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] as const },
        };

  return (
    <section className="relative flex min-h-[100svh] flex-col items-center justify-center px-4 pt-24 pb-16">
      <div className="mx-auto w-full max-w-3xl text-center">
        <motion.h1
          {...fadeUp(0.05)}
          className="text-5xl font-semibold tracking-tight text-balance sm:text-6xl md:text-7xl"
        >
          {t("hero.titleLine1")}
          <br />
          <span className="text-brand-gradient">{t("hero.titleLine2")}</span>
        </motion.h1>

        <motion.p
          {...fadeUp(0.18)}
          className="mx-auto mt-6 max-w-xl text-base text-muted-foreground sm:text-lg"
        >
          {t("hero.subtitle")}
        </motion.p>

        <motion.div {...fadeUp(0.32)} className="mt-10">
          <PromptComposer
            size="hero"
            animatedPlaceholders={examples}
            onSubmit={(value) => void startFromPrompt(value)}
            className="mx-auto max-w-2xl text-left"
          />
        </motion.div>
      </div>
    </section>
  );
}
