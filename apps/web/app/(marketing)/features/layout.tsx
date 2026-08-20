import { buildPageMetadata } from "@/lib/seo";

export const metadata = buildPageMetadata({
  title: "Product",
  description:
    "Stack32 turns a plain-language brief into a working AI agent you can chat with, improve and publish — without nodes, code or a canvas.",
  path: "/features",
});

export default function FeaturesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
