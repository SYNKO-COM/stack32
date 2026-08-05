"use client";

import { MoreHorizontal, Plus, Settings } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { AgentIcon } from "@/components/builder/agent-icon";
import { CreatingAgentOverlay } from "@/components/shared/brand-loader";
import { Logo, LogoMark } from "@/components/shared/logo";
import { StatusBadge } from "@/components/shared/status-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  useAgents,
  useCreateAgent,
  useDeleteAgent,
  useDuplicateAgent,
  useRenameAgent,
} from "@/hooks/use-agents";
import { useCurrentUser } from "@/hooks/use-auth";
import { useSubscription } from "@/hooks/use-billing";
import { useTranslation } from "@/hooks/use-translation";
import type { Agent } from "@/lib/domain/types";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/store/ui-store";

const CREATE_MIN_MS = 900;
const CREATE_MAX_MS = 2200;

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
  const renameAgent = useRenameAgent();
  const duplicateAgent = useDuplicateAgent();
  const deleteAgent = useDeleteAgent();

  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [name, setName] = useState(agent.name);

  const displayName = agent.name || t("builder:sidebar.untitledAgent");

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
          <span className="block truncate text-sm text-foreground/90">{displayName}</span>
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
              void duplicateAgent.mutateAsync(agent.id).then((copy) => {
                router.push(`/agents/${copy.id}/build`);
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
  const { data: agents } = useAgents();
  const { data: user } = useCurrentUser();
  const { data: subscription } = useSubscription();
  const createAgent = useCreateAgent();
  const openDialog = useUiStore((s) => s.openDialog);
  const creatingLockRef = useRef(false);
  const pendingAgentIdRef = useRef<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Clear the overlay once the new agent route is actually open.
  useEffect(() => {
    if (!creating || !pendingAgentIdRef.current) return;
    if (params.agentId === pendingAgentIdRef.current) {
      setCreating(false);
      creatingLockRef.current = false;
      pendingAgentIdRef.current = null;
    }
  }, [params.agentId, creating]);

  // Safety: never leave the overlay stuck longer than ~2s.
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
    if (creatingLockRef.current || createAgent.isPending || creating) return;
    creatingLockRef.current = true;
    setCreating(true);
    try {
      const [agent] = await Promise.all([
        createAgent.mutateAsync(undefined),
        sleep(CREATE_MIN_MS),
      ]);
      pendingAgentIdRef.current = agent.id;
      onNavigate();
      router.push(`/agents/${agent.id}/build`);
    } catch {
      creatingLockRef.current = false;
      pendingAgentIdRef.current = null;
      setCreating(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 px-4 pt-5 pb-3">
        <Logo href="/agents" />
        <Button
          className="w-full justify-start gap-2 rounded-2xl"
          variant="secondary"
          onClick={() => void handleNewAgent()}
          disabled={creating || createAgent.isPending}
          aria-busy={creating}
        >
          {creating ? (
            <LogoMark className="size-4 animate-pulse" />
          ) : (
            <Plus className="size-4" aria-hidden="true" />
          )}
          {creating ? t("builder:sidebar.creatingAgent") : t("builder:sidebar.newAgent")}
        </Button>
      </div>

      <p className="px-6 pt-2 pb-1.5 font-mono text-[11px] tracking-[0.18em] text-muted-foreground/70 uppercase">
        {t("builder:sidebar.agentsTitle")}
      </p>

      <ScrollArea className="min-h-0 flex-1 px-3">
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
          ) : (
            <p className="px-3 py-6 text-sm text-muted-foreground">
              {t("builder:sidebar.empty")}
            </p>
          )}
        </div>
      </ScrollArea>

      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2.5 rounded-2xl px-2 py-2">
          <Avatar className="size-8">
            <AvatarFallback className="bg-brand/30 text-xs">
              {(user?.name ?? user?.email ?? "?").slice(0, 1).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm">{user?.name ?? user?.email}</span>
            <span className="block text-xs text-muted-foreground">
              {t("builder:sidebar.planLabel")} · {subscription?.planName ?? t("common:plan.free")}
            </span>
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("common:actions.settings")}
            onClick={() => openDialog("settings")}
          >
            <Settings aria-hidden="true" />
          </Button>
        </div>
      </div>

      <CreatingAgentOverlay
        open={creating}
        title={t("builder:sidebar.creatingAgent")}
        hint={t("builder:sidebar.creatingAgentHint")}
      />
    </div>
  );
}
