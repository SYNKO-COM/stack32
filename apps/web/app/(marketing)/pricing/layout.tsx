import { buildPageMetadata } from "@/lib/seo";

export const metadata = buildPageMetadata({
  title: "Pricing",
  description:
    "Start free on Stack32, then choose Starter, Pro or Scale. Natural-language AI agents with Builder credits — 20% off annual billing.",
  path: "/pricing",
});

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
