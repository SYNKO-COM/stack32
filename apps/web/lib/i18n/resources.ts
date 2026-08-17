import enCommon from "@/locales/en/common.json";
import enMarketing from "@/locales/en/marketing.json";
import enAuth from "@/locales/en/auth.json";
import enOnboarding from "@/locales/en/onboarding.json";
import enBuilder from "@/locales/en/builder.json";
import enLive from "@/locales/en/live.json";
import enStructure from "@/locales/en/structure.json";
import enBilling from "@/locales/en/billing.json";
import enLegal from "@/locales/en/legal.json";
import enConsent from "@/locales/en/consent.json";
import enErrors from "@/locales/en/errors.json";
import enMemory from "@/locales/en/memory.json";

import frCommon from "@/locales/fr/common.json";
import frMarketing from "@/locales/fr/marketing.json";
import frAuth from "@/locales/fr/auth.json";
import frOnboarding from "@/locales/fr/onboarding.json";
import frBuilder from "@/locales/fr/builder.json";
import frLive from "@/locales/fr/live.json";
import frStructure from "@/locales/fr/structure.json";
import frBilling from "@/locales/fr/billing.json";
import frLegal from "@/locales/fr/legal.json";
import frConsent from "@/locales/fr/consent.json";
import frErrors from "@/locales/fr/errors.json";
import frMemory from "@/locales/fr/memory.json";

export const NAMESPACES = [
  "common",
  "marketing",
  "auth",
  "onboarding",
  "builder",
  "live",
  "structure",
  "billing",
  "legal",
  "consent",
  "errors",
  "memory",
] as const;

export type Namespace = (typeof NAMESPACES)[number];

export const resources = {
  en: {
    common: enCommon,
    marketing: enMarketing,
    auth: enAuth,
    onboarding: enOnboarding,
    builder: enBuilder,
    live: enLive,
    structure: enStructure,
    billing: enBilling,
    legal: enLegal,
    consent: enConsent,
    errors: enErrors,
    memory: enMemory,
  },
  fr: {
    common: frCommon,
    marketing: frMarketing,
    auth: frAuth,
    onboarding: frOnboarding,
    builder: frBuilder,
    live: frLive,
    structure: frStructure,
    billing: frBilling,
    legal: frLegal,
    consent: frConsent,
    errors: frErrors,
    memory: frMemory,
  },
} as const;
