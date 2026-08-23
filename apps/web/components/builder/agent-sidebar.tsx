"use client";

import { Check, ChevronsUpDown, LayoutDashboard, MoreHorizontal, Plus, Sparkles, Store } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { AgentIcon } from "@/components/builder/agent-icon";
import { CreatingAgentOverlay } from "@/components/shared/brand-loader";
import { Logo, LogoMark } from "@/components/shared/logo";
import { SegmentedTabs } from "@/components/shared/segmented-tabs";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  useAgents,
  useCreateAgent,
  useDeleteAgent,
  useDuplicateAgent,
  useRenameAgent,
} from "@/hooks/use-agents";
import { useActiveWorkspace, useCreateWorkspace } from "@/hooks/use-workspaces";
import { useTranslation } from "@/hooks/use-translation";
import type { Agent } from "@/lib/domain/types";
import { isPlanLimitError } from "@/lib/billing/plan-limit";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/store/ui-store";

const CREATE_MIN_MS = 900;
const CREATE_MAX_MS = 2200;
/** Sidebar label cap — long agent names get an ellipsis. */
const AGENT_NAME_MAX_CHARS = 18;

function truncateAgentName(name: string, max = AGENT_NAME_MAX_CHARS): string {
  const trimmed = name.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trimEnd()}…`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function AgentRow({
  agent,
  isActive,
  onNavigate,
}: {
  agent: Agent;
  isActive: boolean;
  onNavigate: () => void;
}) {
  const { t } = useTranslation(["builder", "common"]);
  const router = useRouter();
  const openDialog = useUiStore((s) => s.openDialog);
  const renameAgent = useRenameAgent();
  const duplicateAgent = useDuplicateAgent();
  const deleteAgent = useDeleteAgent();

  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [name, setName] = useState(agent.name);

  const displayName = truncateAgentName(
    agent.name || t("builder:sidebar.untitledAgent"),
  );

  return (
    <div
      className={cn(
        "group relative flex items-center gap-2.5 rounded-2xl px-2.5 py-2 transition-colors",
        isActive ? "glass bg-foreground/[0.05]" : "hover:bg-foreground/[0.04]",
      )}
    >
      <Link
        href={`/agents/${agent.id}/build`}
        onClick={onNavigate}
        className="flex min-w-0 flex-1 items-center gap-2.5"
        aria-current={isActive ? "page" : undefined}
      >
        <AgentIcon icon={agent.icon} />
        <span className="min-w-0 flex-1">
          <span className="block max-w-[11rem] truncate text-sm text-foreground/90" title={agent.name || undefined}>
            {displayName}
          </span>
        </span>
        <StatusBadge status={agent.status} mode="dot" />
      </Link>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
            aria-label={t("common:a11y.agentMenu")}
          >
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="right">
          <DropdownMenuItem
            onSelect={() => {
              setName(agent.name);
              setRenameOpen(true);
            }}
          >
            {t("builder:sidebar.menu.rename")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              void duplicateAgent
                .mutateAsync(agent.id)
                .then((copy) => {
                  router.push(`/agents/${copy.id}/build`);
                })
                .catch((error: unknown) => {
                  if (isPlanLimitError(error)) openDialog("upgrade");
                });
            }}
          >
            {t("builder:sidebar.menu.duplicate")}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
            {t("builder:sidebar.menu.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="glass-strong border-border sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("builder:sidebar.renameTitle")}</DialogTitle>
          </DialogHeader>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("builder:sidebar.renamePlaceholder")}
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameOpen(false)}>
              {t("common:actions.cancel")}
            </Button>
            <Button
              onClick={() => {
                void renameAgent.mutateAsync({ agentId: agent.id, name: name.trim() });
                setRenameOpen(false);
              }}
              disabled={name.trim().length === 0}
            >
              {t("common:actions.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="glass-strong border-border sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("builder:sidebar.deleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("builder:sidebar.deleteBody", { name: displayName })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              {t("common:actions.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                void deleteAgent.mutateAsync(agent.id).then(() => {
                  if (isActive) router.push("/agents");
                });
                setDeleteOpen(false);
              }}
            >
              {t("common:actions.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function AgentSidebar({ onNavigate = () => {} }: { onNavigate?: () => void }) {
  const { t } = useTranslation(["builder", "common"]);
  const router = useRouter();
  const params = useParams<{ agentId?: string }>();
  const pathname = usePathname();
  const workspaceTab =
    pathname.startsWith("/agents/library")
      ? "library"
      : pathname.startsWith("/agents/dashboard")
        ? "dashboard"
        : "create";
  const {
    workspaces,
    activeWorkspace,
    activeWorkspaceId,
    setActiveWorkspaceId,
  } = useActiveWorkspace();
  const { data: agents, isPending: agentsPending } = useAgents(activeWorkspaceId);
  const createAgent = useCreateAgent();
  const createWorkspace = useCreateWorkspace();
  const openDialog = useUiStore((s) => s.openDialog);
  const creatingLockRef = useRef(false);
  const pendingAgentIdRef = useRef<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createWsOpen, setCreateWsOpen] = useState(false);
  const [newWsName, setNewWsName] = useState("");

  useEffect(() => {
    if (!creating || !pendingAgentIdRef.current) return;
    if (params.agentId === pendingAgentIdRef.current) {
      setCreating(false);
      creatingLockRef.current = false;
      pendingAgentIdRef.current = null;
    }
  }, [params.agentId, creating]);

  useEffect(() => {
    if (!creating) return;
    const timeout = window.setTimeout(() => {
      setCreating(false);
      creatingLockRef.current = false;
      pendingAgentIdRef.current = null;
    }, CREATE_MAX_MS);
    return () => window.clearTimeout(timeout);
  }, [creating]);

  const handleNewAgent = async () => {
    if (!activeWorkspaceId || creatingLockRef.current || createAgent.isPending || creating) return;
    creatingLockRef.current = true;
    setCreating(true);
    try {
      const [agent] = await Promise.all([
        createAgent.mutateAsync({ workspaceId: activeWorkspaceId }),
        sleep(CREATE_MIN_MS),
      ]);
      pendingAgentIdRef.current = agent.id;
      onNavigate();
      router.push(`/agents/${agent.id}/build`);
    } catch (error) {
      creatingLockRef.current = false;
      pendingAgentIdRef.current = null;
      setCreating(false);
      if (isPlanLimitError(error)) openDialog("upgrade");
    }
  };

  const handleCreateWorkspace = async () => {
    const name = newWsName.trim();
    if (!name) return;
    try {
      const ws = await createWorkspace.mutateAsync(name);
      setActiveWorkspaceId(ws.id);
      setCreateWsOpen(false);
      setNewWsName("");
      router.push("/agents");
    } catch (error) {
      if (isPlanLimitError(error)) {
        setCreateWsOpen(false);
        openDialog("upgrade");
      }
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col items-center space-y-3 px-3 pt-5 pb-3">
        <div className="w-full">
          <Logo href="/agents" />
        </div>
        <SegmentedTabs
          ariaLabel={t("builder:workspaceNav.label")}
          layoutId="workspace-nav-tab"
          className="mx-auto w-fit max-w-full"
          active={workspaceTab}
          items={[
            {
              id: "create",
              href: params.agentId ? `/agents/${params.agentId}/build` : "/agents",
              label: t("builder:workspaceNav.create"),
              icon: Sparkles,
            },
            {
              id: "library",
              href: "/agents/library",
              label: t("builder:workspaceNav.library"),
              icon: Store,
            },
            {
              id: "dashboard",
              href: "/agents/dashboard",
              label: t("builder:workspaceNav.dashboard"),
              icon: LayoutDashboard,
            },
          ]}
        />
        {workspaceTab === "create" ? (
          <Button
            className="w-full justify-start gap-2 rounded-2xl"
            variant="secondary"
            onClick={() => void handleNewAgent()}
            disabled={!activeWorkspaceId || creating || createAgent.isPending}
            aria-busy={creating}
          >
            {creating ? (
              <LogoMark className="size-4 animate-pulse" />
            ) : (
              <Plus className="size-4" aria-hidden="true" />
            )}
            {creating ? t("builder:sidebar.creatingAgent") : t("builder:sidebar.newAgent")}
          </Button>
        ) : null}
      </div>

      {workspaceTab === "create" ? (
        <>
          <p className="w-full px-4 pt-2 pb-1.5 font-mono text-[11px] tracking-[0.18em] text-muted-foreground/70 uppercase">
            {t("builder:sidebar.agentsTitle")}
          </p>

          <ScrollArea className="min-h-0 w-full flex-1 px-3">
            <div className="space-y-1 pb-4">
              {agents && agents.length > 0 ? (
                agents.map((agent) => (
                  <AgentRow
                    key={agent.id}
                    agent={agent}
                    isActive={agent.id === params.agentId}
                    onNavigate={onNavigate}
                  />
                ))
              ) : agentsPending || !activeWorkspaceId ? (
                // Saying "no agents yet" before the answer arrives told the
                // owner of three agents they had none, for as long as the load
                // took. Claim emptiness only once it is known.
                <div className="space-y-2 px-3 py-4" aria-hidden>
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-9 animate-pulse rounded-xl bg-foreground/[0.06]" />
                  ))}
                </div>
              ) : (
                <p className="px-3 py-6 text-sm text-muted-foreground">
                  {t("builder:sidebar.empty")}
                </p>
              )}
            </div>
          </ScrollArea>
        </>
      ) : (
        <div className="min-h-0 flex-1" />
      )}

      <div className="border-t border-border p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center gap-2.5 rounded-2xl px-2 py-2 text-left transition-colors hover:bg-foreground/[0.04]"
              aria-label={t("builder:workspace.switcherLabel")}
            >
              <span className="flex size-8 items-center justify-center rounded-xl bg-brand/15 text-xs font-semibold text-brand">
                {(activeWorkspace?.name ?? "W").slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {activeWorkspace?.name ?? t("builder:workspace.loading")}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {t("builder:workspace.label")}
                </span>
              </span>
              <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-64">
            {workspaces.map((ws) => (
              <DropdownMenuItem
                key={ws.id}
                className="flex items-center justify-between gap-2"
                onSelect={() => {
                  setActiveWorkspaceId(ws.id);
                  router.push("/agents");
                }}
              >
                <span className="truncate">{ws.name}</span>
                {ws.id === activeWorkspaceId ? (
                  <Check className="size-4 shrink-0 text-brand" aria-hidden="true" />
                ) : null}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                setNewWsName("");
                setCreateWsOpen(true);
              }}
            >
              <Plus className="size-4" aria-hidden="true" />
              {t("builder:workspace.create")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={createWsOpen} onOpenChange={setCreateWsOpen}>
        <DialogContent className="glass-strong border-border sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("builder:workspace.createTitle")}</DialogTitle>
            <DialogDescription>{t("builder:workspace.createBody")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="new-workspace-name">{t("builder:workspace.nameLabel")}</Label>
            <Input
              id="new-workspace-name"
              value={newWsName}
              onChange={(e) => setNewWsName(e.target.value)}
              placeholder={t("builder:workspace.namePlaceholder")}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCreateWorkspace();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateWsOpen(false)}>
              {t("common:actions.cancel")}
            </Button>
            <Button
              onClick={() => void handleCreateWorkspace()}
              disabled={newWsName.trim().length === 0 || createWorkspace.isPending}
            >
              {createWorkspace.isPending
                ? t("builder:workspace.creating")
                : t("builder:workspace.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CreatingAgentOverlay
        open={creating}
        title={t("builder:sidebar.creatingAgent")}
        hint={t("builder:sidebar.creatingAgentHint")}
      />
    </div>
  );
}
