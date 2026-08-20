import { buildPageMetadata } from "@/lib/seo";

export const metadata = buildPageMetadata({
  title: "Subscription & sales terms",
  description:
    "Conditions applying to Stack32 paid subscriptions, credits activation and billing via Whop.",
  path: "/legal/sales",
});

export default function SalesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
