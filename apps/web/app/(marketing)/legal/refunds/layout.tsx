import { buildPageMetadata } from "@/lib/seo";

export const metadata = buildPageMetadata({
  title: "Refund policy",
  description:
    "Why Stack32 subscriptions are generally non-refundable and which limited exceptions may apply.",
  path: "/legal/refunds",
});

export default function RefundsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
