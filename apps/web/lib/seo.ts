import type { Metadata } from "next";

import { company } from "@/lib/company";
import { SITE_URL } from "@/lib/site";

export const SITE_NAME = "Stack32";

export const DEFAULT_TITLE = "Stack32 — Build your next AI agent";

export const DEFAULT_DESCRIPTION =
  "Describe the agent you need. Stack32 builds the agent, tests it and makes it ready to use.";

/** Default social preview — full wordmark reads clearly in link cards. */
export const DEFAULT_OG_IMAGE = "/brand/logo-black.png";

/**
 * Canonical production origin for absolute SEO URLs.
 * Prefers NEXT_PUBLIC_APP_URL when it is not a localhost placeholder.
 */
export function getCanonicalSiteUrl(): string {
  const fromEnv = (SITE_URL || "").replace(/\/$/, "");
  if (fromEnv && !/localhost|127\.0\.0\.1/i.test(fromEnv)) {
    return fromEnv;
  }
  return company.website.replace(/\/$/, "");
}

export function absoluteUrl(path = "/"): string {
  const base = getCanonicalSiteUrl();
  if (!path || path === "/") return `${base}/`;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalized}`;
}

type PageMetaInput = {
  title: string;
  description: string;
  path: string;
  /** When true, title is used as-is (no "· Stack32" template). */
  absoluteTitle?: boolean;
  noIndex?: boolean;
  image?: string;
};

/** Shared Metadata helper for marketing + public pages. */
export function buildPageMetadata({
  title,
  description,
  path,
  absoluteTitle = false,
  noIndex = false,
  image = DEFAULT_OG_IMAGE,
}: PageMetaInput): Metadata {
  const url = absoluteUrl(path);
  const ogImage = image.startsWith("http") ? image : absoluteUrl(image);

  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: url },
    robots: noIndex
      ? { index: false, follow: false }
      : { index: true, follow: true },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title,
      description,
      url,
      locale: "en_US",
      alternateLocale: ["fr_FR"],
      images: [{ url: ogImage, alt: SITE_NAME }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    legalName: company.legalCompanyName,
    url: getCanonicalSiteUrl(),
    logo: absoluteUrl("/brand/icon.png"),
    email: company.contactEmail,
    sameAs: [],
    parentOrganization: {
      "@type": "Organization",
      name: company.parentBrand,
    },
  };
}

export function softwareApplicationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: getCanonicalSiteUrl(),
    description: DEFAULT_DESCRIPTION,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      description: "Free plan available; paid plans for more agents and credits.",
    },
    publisher: {
      "@type": "Organization",
      name: company.legalCompanyName,
    },
  };
}

export function webSiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: getCanonicalSiteUrl(),
    description: DEFAULT_DESCRIPTION,
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
    },
    inLanguage: ["en", "fr"],
  };
}

export function faqPageJsonLd(items: { question: string; answer: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

export function publicAgentJsonLd(input: {
  name: string;
  description?: string;
  path: string;
  creatorUsername: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: input.name,
    description:
      input.description ||
      `AI agent by @${input.creatorUsername} on Stack32.`,
    url: absoluteUrl(input.path),
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    author: {
      "@type": "Person",
      name: `@${input.creatorUsername}`,
      url: absoluteUrl(`/@${input.creatorUsername}`),
    },
    isPartOf: {
      "@type": "WebSite",
      name: SITE_NAME,
      url: getCanonicalSiteUrl(),
    },
  };
}
