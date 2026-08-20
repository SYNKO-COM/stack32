import { buildPageMetadata } from "@/lib/seo";

export const metadata = buildPageMetadata({
  title: "Terms of use",
  description:
    "Terms of use for the Stack32 service: accounts, acceptable use, AI-generated content, and governing law.",
  path: "/legal/terms",
});

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
