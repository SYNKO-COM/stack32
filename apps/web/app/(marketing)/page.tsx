import { JsonLd } from "@/components/seo/json-ld";
import { Hero } from "@/components/marketing/hero";
import {
  Benefits,
  ExampleAgents,
  FaqPreview,
  FinalCta,
  HowItWorks,
  PricingPreview,
} from "@/components/marketing/sections";
import {
  buildPageMetadata,
  DEFAULT_DESCRIPTION,
  DEFAULT_TITLE,
  faqPageJsonLd,
  organizationJsonLd,
  softwareApplicationJsonLd,
  webSiteJsonLd,
} from "@/lib/seo";
import marketingEn from "@/locales/en/marketing.json";

export const metadata = buildPageMetadata({
  title: DEFAULT_TITLE,
  description: DEFAULT_DESCRIPTION,
  path: "/",
  absoluteTitle: true,
});

const homeFaqItems = marketingEn.faqPreview.items.map((item) => ({
  question: item.question,
  answer: item.answer,
}));

export default function HomePage() {
  return (
    <>
      <JsonLd data={organizationJsonLd()} />
      <JsonLd data={webSiteJsonLd()} />
      <JsonLd data={softwareApplicationJsonLd()} />
      <JsonLd data={faqPageJsonLd(homeFaqItems)} />
      <Hero />
      <HowItWorks />
      <ExampleAgents />
      <Benefits />
      <FaqPreview />
      <PricingPreview />
      <FinalCta />
    </>
  );
}
