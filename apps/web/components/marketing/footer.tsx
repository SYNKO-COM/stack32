"use client";

import Link from "next/link";

import { Logo } from "@/components/shared/logo";
import { useTranslation } from "@/hooks/use-translation";
import { company } from "@/lib/company";

export function Footer() {
  const { t } = useTranslation("common");
  const year = new Date().getFullYear();

  const productLinks = [
    { href: "/features", label: t("nav.product") },
    { href: "/pricing", label: t("nav.pricing") },
  ];

  const companyLinks = [
    { href: "/faq", label: t("nav.faq") },
    { href: "/contact", label: t("nav.contact") },
  ];

  const legalLinks = [
    { href: "/legal", label: t("footer.legalNotice") },
    { href: "/legal/terms", label: t("footer.terms") },
    { href: "/legal/privacy", label: t("footer.privacy") },
    { href: "/legal/cookies", label: t("footer.cookies") },
    { href: "/legal/sales", label: t("footer.sales") },
    { href: "/legal/refunds", label: t("footer.refunds") },
  ];

  return (
    <footer className="relative border-t border-border py-14">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 md:grid-cols-4">
        <div className="space-y-3">
          <Logo href="/" />
          <p className="max-w-xs text-sm text-muted-foreground">{t("brand.tagline")}</p>
          <p className="text-xs text-muted-foreground/70">{t("brand.byline")}</p>
        </div>

        <nav aria-label={t("footer.product")} className="space-y-2.5">
          <h3 className="text-sm font-semibold text-foreground/90">{t("footer.product")}</h3>
          {productLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="block text-sm text-muted-foreground hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <nav aria-label={t("footer.company")} className="space-y-2.5">
          <h3 className="text-sm font-semibold text-foreground/90">{t("footer.company")}</h3>
          {companyLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="block text-sm text-muted-foreground hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <nav aria-label={t("footer.legalSection")} className="space-y-2.5">
          <h3 className="text-sm font-semibold text-foreground/90">{t("footer.legalSection")}</h3>
          {legalLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="block text-sm text-muted-foreground hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="mx-auto mt-10 max-w-6xl px-6">
        <p className="text-xs text-muted-foreground/60">
          {t("footer.copyright", { year, company: company.legalCompanyName })}
        </p>
      </div>
    </footer>
  );
}
