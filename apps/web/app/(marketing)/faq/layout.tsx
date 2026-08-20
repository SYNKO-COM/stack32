import { JsonLd } from "@/components/seo/json-ld";
import { buildPageMetadata, faqPageJsonLd } from "@/lib/seo";
import marketingEn from "@/locales/en/marketing.json";

export const metadata = buildPageMetadata({
  title: "FAQ",
  description:
    "How Stack32 works, what AI agents can do, billing, and what to expect before you build your first agent.",
  path: "/faq",
});

const faqItems = marketingEn.faq.groups.flatMap((group) =>
  group.items.map((item) => ({
    question: item.question,
    answer: item.answer,
  })),
);

export default function FaqLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd data={faqPageJsonLd(faqItems)} />
      {children}
    </>
  );
}
