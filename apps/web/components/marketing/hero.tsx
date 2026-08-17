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
    <section className="relative flex min-h-[100svh] flex-col items-center justify-center px-4 pt-24 pb-14 sm:px-5 sm:pt-28 sm:pb-20 md:px-6">
      <div className="mx-auto w-full max-w-4xl text-center">
        <motion.h1
          {...fadeUp(0.05)}
          className="text-[2rem] leading-[1.12] font-semibold tracking-tight text-balance sm:text-5xl sm:leading-[1.08] md:text-6xl md:leading-[1.1] lg:text-[4.75rem]"
        >
          {t("hero.titleLine1")}
          <br />
          <span className="text-brand-gradient">{t("hero.titleLine2")}</span>
        </motion.h1>

        <motion.p
          {...fadeUp(0.18)}
          className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:mt-8 sm:text-lg md:mt-10 md:text-xl"
        >
          {t("hero.subtitle")}
        </motion.p>

        <motion.div {...fadeUp(0.32)} className="mt-8 w-full sm:mt-12 md:mt-14">
          <PromptComposer
            size="hero"
            animatedPlaceholders={examples}
            onSubmit={(value) => void startFromPrompt(value)}
            className="mx-auto w-full max-w-2xl text-left sm:max-w-3xl"
          />
        </motion.div>
      </div>
    </section>
  );
}
