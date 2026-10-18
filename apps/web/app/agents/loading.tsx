"use client";
import { BrandLoader } from "@/components/shared/brand-loader";
import { useTranslation } from "@/hooks/use-translation";
export default function Loading() {
  const { t } = useTranslation("common");
  return <div className="flex min-h-[40dvh] flex-1 items-center justify-center"><BrandLoader label={t("loading")} /></div>;
}
