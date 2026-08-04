"use client";

import { Check } from "lucide-react";

import { LocaleFlag } from "@/components/shared/locale-flag";
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
  type Locale,
} from "@/lib/i18n/locales";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({
  className,
  size = "default",
}: {
  className?: string;
  size?: "default" | "lg";
}) {
  const { t, i18n } = useTranslation("common");
  const current: Locale = isSupportedLocale(i18n.language) ? i18n.language : "en";
  const large = size === "lg";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={large ? "icon" : "icon-sm"}
          className={cn("text-muted-foreground", large && "rounded-full", className)}
          aria-label={t("a11y.languageSelector")}
        >
          <LocaleFlag
            locale={current}
            title={LOCALE_LABELS[current]}
            className={large ? "h-4 w-6" : undefined}
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        {SUPPORTED_LOCALES.map((locale) => (
          <DropdownMenuItem
            key={locale}
            onSelect={() => {
              persistLocale(locale);
              void i18n.changeLanguage(locale);
            }}
            className="flex items-center gap-2.5"
          >
            <LocaleFlag locale={locale} />
            <span className="flex-1">{LOCALE_LABELS[locale]}</span>
            {locale === current ? (
              <Check className="size-4 text-brand" aria-hidden="true" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
