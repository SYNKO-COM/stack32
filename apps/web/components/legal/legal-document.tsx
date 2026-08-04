"use client";

import { AlertTriangle, ArrowLeft } from "lucide-react";
import Link from "next/link";

import { useTranslation } from "@/hooks/use-translation";
import { company, getIncompleteCompanyFields } from "@/lib/company";

/** Single source for legal drafts' last revision date. */
export const LEGAL_LAST_UPDATED = "2026-08-03";

interface LegalSection {
  title: string;
  body: string;
}

/** Interpolation values shared by every legal document. */
function companyValues() {
  return {
    companyName: company.legalCompanyName,
    parentBrand: company.parentBrand,
    legalForm: company.legalForm,
    shareCapital: company.shareCapital,
    website: company.website,
    contactEmail: company.contactEmail,
    registeredAddress: company.registeredAddress,
    siren: company.siren,
    rcs: company.rcs,
    vatNumber: company.vatNumber,
    publicationDirector: company.publicationDirector,
    hostingProvider: company.hostingProvider,
    hostingAddress: company.hostingAddress,
    interpolation: { escapeValue: false },
  };
}

/**
 * Development-only banner shown on legal pages while mandatory company
 * information is incomplete. Never rendered in the product UI.
 */
export function DevLegalBanner() {
  const { t } = useTranslation("legal");
  const missing = getIncompleteCompanyFields();
  if (missing.length === 0) return null;

  return (
    <div
      role="alert"
      className="mb-8 flex items-start gap-3 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-200"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p>{t("banner.devWarning", { fields: missing.join(", ") })}</p>
    </div>
  );
}

interface LegalDocumentProps {
  /** i18n key prefix inside the legal namespace, e.g. "terms". */
  docKey: "notice" | "terms" | "privacy" | "cookies" | "sales" | "refunds";
  /** Show the table of contents (for longer documents). */
  withToc?: boolean;
}

export function LegalDocument({ docKey, withToc = true }: LegalDocumentProps) {
  const { t, i18n } = useTranslation("legal");
  const values = companyValues();

  const sections = t(`${docKey}.sections`, {
    returnObjects: true,
    ...values,
  }) as LegalSection[];

  const hasIntro = i18n.exists(`legal:${docKey}.intro`);

  const formattedDate = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "long",
  }).format(new Date(LEGAL_LAST_UPDATED));

  return (
    <article className="mx-auto max-w-3xl px-6 pt-36 pb-24">
      <Link
        href="/legal"
        className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t("common.backToLegal")}
      </Link>

      <DevLegalBanner />

      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        {t(`${docKey}.title`)}
      </h1>
      <p className="mt-2 font-mono text-xs text-muted-foreground">
        {t("common.lastUpdated", { date: formattedDate })}
      </p>

      {hasIntro ? (
        <p className="mt-6 text-muted-foreground">{t(`${docKey}.intro`, values)}</p>
      ) : null}

      <p className="mt-4 rounded-xl border border-border bg-foreground/[0.03] px-4 py-3 text-xs text-muted-foreground/80">
        {t("common.draftNotice")}
      </p>

      {withToc && sections.length > 4 ? (
        <nav aria-label={t("common.tableOfContents")} className="glass mt-8 rounded-2xl p-5">
          <h2 className="mb-3 text-sm font-semibold">{t("common.tableOfContents")}</h2>
          <ol className="space-y-1.5 text-sm">
            {sections.map((section, i) => (
              <li key={section.title}>
                <a
                  href={`#section-${i}`}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      ) : null}

      <div className="mt-10 space-y-10">
        {sections.map((section, i) => (
          <section key={section.title} id={`section-${i}`}>
            <h2 className="text-xl font-medium tracking-tight">{section.title}</h2>
            <p className="mt-3 leading-relaxed text-foreground/80">{section.body}</p>
          </section>
        ))}
      </div>
    </article>
  );
}
