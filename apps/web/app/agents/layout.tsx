"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { RequireAuth } from "@/components/auth/require-auth";
import { BillingDialog } from "@/components/billing/billing-dialog";
import { BuyCreditsDialog } from "@/components/billing/buy-credits-dialog";
import { UpgradeDialog } from "@/components/billing/upgrade-dialog";
import { AgentSidebar } from "@/components/builder/agent-sidebar";
import { SettingsDialog } from "@/components/builder/settings-dialog";
import { AnimatedBackground } from "@/components/shared/animated-background";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useTranslation } from "@/hooks/use-translation";
import { useUiStore } from "@/store/ui-store";

export default function AgentsLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation("builder");
  const mobileSidebarOpen = useUiStore((s) => s.mobileSidebarOpen);
  const setMobileSidebarOpen = useUiStore((s) => s.setMobileSidebarOpen);
  const pathname = usePathname();

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [pathname, setMobileSidebarOpen]);

  return (
    <RequireAuth>
      <div className="relative flex h-dvh min-h-0 overflow-hidden">
        <AnimatedBackground variant="editor" />

        {/* Desktop sidebar — slightly under default 300px */}
        <aside className="glass hidden h-full w-[288px] shrink-0 border-y-0 border-l-0 lg:block">
          <AgentSidebar />
        </aside>

        {/* Mobile drawer */}
        <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
          <SheetContent side="left" className="glass-strong w-[min(19rem,calc(100vw-1rem))] border-border p-0">
            <SheetTitle className="sr-only">{t("sidebar.agentsTitle")}</SheetTitle>
            <AgentSidebar onNavigate={() => setMobileSidebarOpen(false)} />
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 flex-col">{children}</div>

        <SettingsDialog />
        <BillingDialog />
        <UpgradeDialog />
        <BuyCreditsDialog />
      </div>
    </RequireAuth>
  );
}
