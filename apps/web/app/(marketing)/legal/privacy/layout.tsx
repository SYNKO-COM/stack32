import { buildPageMetadata } from "@/lib/seo";

export const metadata = buildPageMetadata({
  title: "Privacy policy",
  description:
    "How Stack32 collects, uses and protects personal data when you create and run AI agents.",
  path: "/legal/privacy",
});

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
