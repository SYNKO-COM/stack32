"use client";

import { Moon, Sun } from "lucide-react";

import { useTheme } from "@/components/providers/theme-provider";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/use-translation";
import { cn } from "@/lib/utils";

export function ThemeToggle({
  className,
  size = "default",
}: {
  className?: string;
  size?: "default" | "lg";
}) {
  const { t } = useTranslation("common");
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const large = size === "lg";

  return (
    <Button
      type="button"
      variant="ghost"
      size={large ? "icon" : "icon-sm"}
      className={cn(
        "rounded-full text-muted-foreground",
        large && "[&_svg:not([class*='size-'])]:size-5",
        className,
      )}
      onClick={toggleTheme}
      aria-label={isDark ? t("a11y.switchToLight") : t("a11y.switchToDark")}
      title={isDark ? t("a11y.switchToLight") : t("a11y.switchToDark")}
    >
      {isDark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </Button>
  );
}
