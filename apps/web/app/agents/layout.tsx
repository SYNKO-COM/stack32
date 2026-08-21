"use client";

import { RequireAuth } from "@/components/auth/require-auth";
import { BillingDialog } from "@/components/billing/billing-dialog";
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

  return (
    <RequireAuth>
      <div className="relative flex h-svh overflow-hidden">
        <AnimatedBackground variant="editor" />

        {/* Desktop sidebar — slightly under default 300px */}
        <aside className="glass hidden h-full w-[288px] shrink-0 border-y-0 border-l-0 lg:block">
          <AgentSidebar />
        </aside>

        {/* Mobile drawer */}
        <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
          <SheetContent side="left" className="glass-strong w-[288px] border-border p-0">
            <SheetTitle className="sr-only">{t("sidebar.agentsTitle")}</SheetTitle>
            <AgentSidebar onNavigate={() => setMobileSidebarOpen(false)} />
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 flex-col">{children}</div>

        <SettingsDialog />
        <BillingDialog />
        <UpgradeDialog />
      </div>
    </RequireAuth>
  );
}
