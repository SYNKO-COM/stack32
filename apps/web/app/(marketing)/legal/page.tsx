"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { DevLegalBanner, LegalDocument } from "@/components/legal/legal-document";
import { useTranslation } from "@/hooks/use-translation";

const LINKS = [
  { href: "/legal/terms", key: "terms" },
  { href: "/legal/privacy", key: "privacy" },
  { href: "/legal/cookies", key: "cookies" },
  { href: "/legal/sales", key: "sales" },
  { href: "/legal/refunds", key: "refunds" },
] as const;

export default function LegalIndexPage() {
  const { t } = useTranslation("legal");

  return (
    <div>
      <div className="mx-auto max-w-3xl px-6 pt-36">
        <DevLegalBanner />
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {t("index.title")}
        </h1>
        <p className="mt-4 text-muted-foreground">{t("index.subtitle")}</p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="glass group flex items-start justify-between gap-3 rounded-2xl p-5 transition-colors hover:bg-foreground/[0.04]"
            >
              <span>
                <span className="block font-medium">{t(`index.links.${link.key}`)}</span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  {t(`index.links.${link.key}Description`)}
                </span>
              </span>
              <ArrowRight
                className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
          ))}
        </div>
      </div>

      {/* Legal notice (mentions légales) rendered inline on the index page. */}
      <LegalDocument docKey="notice" withToc={false} />
    </div>
  );
}
