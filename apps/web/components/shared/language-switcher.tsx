"use client";

import { Check, Globe } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "@/hooks/use-translation";
import {
  isSupportedLocale,
  LOCALE_LABELS,
  persistLocale,
  SUPPORTED_LOCALES,
} from "@/lib/i18n/locales";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({ className }: { className?: string }) {
  const { t, i18n } = useTranslation("common");
  const current = isSupportedLocale(i18n.language) ? i18n.language : "en";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn("gap-1.5 text-muted-foreground", className)}
          aria-label={t("a11y.languageSelector")}
        >
          <Globe className="size-4" aria-hidden="true" />
          <span className="text-xs font-medium uppercase">{current}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        {SUPPORTED_LOCALES.map((locale) => (
          <DropdownMenuItem
            key={locale}
            onSelect={() => {
              persistLocale(locale);
              void i18n.changeLanguage(locale);
            }}
            className="flex items-center justify-between"
          >
            {LOCALE_LABELS[locale]}
            {locale === current ? <Check className="size-4" aria-hidden="true" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
