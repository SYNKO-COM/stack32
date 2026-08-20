import { buildPageMetadata } from "@/lib/seo";

export const metadata = buildPageMetadata({
  title: "Legal",
  description:
    "Legal documents for Stack32 — terms of use, privacy, cookies, sales and refund policies. Stack32 is a Synko product operated by Zeldia.",
  path: "/legal",
});

export default function LegalIndexLayout({ children }: { children: React.ReactNode }) {
  return children;
}
