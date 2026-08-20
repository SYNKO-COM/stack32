"use client";

import { Menu } from "lucide-react";

import { UserMenu } from "@/components/builder/user-menu";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/use-translation";
import { useUiStore } from "@/store/ui-store";

export function WorkspaceChrome({ title, subtitle }: { title: string; subtitle?: string }) {
  const { t } = useTranslation("common");
  const setMobileSidebarOpen = useUiStore((s) => s.setMobileSidebarOpen);

  return (
    <header className="flex items-center justify-between gap-3 px-4 py-3 md:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          className="lg:hidden"
          aria-label={t("a11y.toggleSidebar")}
          onClick={() => setMobileSidebarOpen(true)}
        >
          <Menu aria-hidden="true" />
        </Button>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-tight">{title}</h1>
          {subtitle ? (
            <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
