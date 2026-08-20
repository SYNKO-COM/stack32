import { buildPageMetadata } from "@/lib/seo";

export const metadata = buildPageMetadata({
  title: "Cookie policy",
  description:
    "Cookies and trackers used on Stack32 — necessary, analytics and advertising preferences.",
  path: "/legal/cookies",
});

export default function CookiesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
