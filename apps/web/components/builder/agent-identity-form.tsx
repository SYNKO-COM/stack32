"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitBuilderIdentity } from "@/lib/actions/builder";
import { agentServiceErrorKey } from "@/lib/ai/agent-service-errors";
import type { BuilderUiComponent } from "@/lib/domain/types";
import { useTranslation } from "@/hooks/use-translation";
import { cn } from "@/lib/utils";

const TONE_OPTIONS = ["professional", "friendly", "concise", "formal"] as const;

interface AgentIdentityFormProps {
  uiComponent: BuilderUiComponent;
  runId: string;
  onSubmitted?: () => void;
}

function fieldDefault(
  fields: BuilderUiComponent["fields"],
  key: string,
): string {
  return fields.find((f) => f.key === key)?.suggested_value ?? "";
}

export function AgentIdentityForm({ uiComponent, runId, onSubmitted }: AgentIdentityFormProps) {
  const { t } = useTranslation(["builder", "errors"]);
  const [name, setName] = useState(() => fieldDefault(uiComponent.fields, "name"));
  const [role, setRole] = useState(() => fieldDefault(uiComponent.fields, "role"));
  const [tone, setTone] = useState(() => fieldDefault(uiComponent.fields, "tone") || "professional");
  const [description, setDescription] = useState(() =>
    fieldDefault(uiComponent.fields, "description"),
  );
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting || completed) return;
    if (!name.trim() || !role.trim()) {
      setErrorKey("errors:form.required");
      return;
    }
    setSubmitting(true);
    setErrorKey(null);
    try {
      await submitBuilderIdentity({
        runId,
        name: name.trim(),
        role: role.trim(),
        tone,
        description: description.trim(),
        requestId: uiComponent.requestId,
      });
      setCompleted(true);
      onSubmitted?.();
    } catch (err) {
      setErrorKey(agentServiceErrorKey(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (completed) {
    return null;
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="mt-3 space-y-3 border-t border-border/60 pt-3">
      <div className="space-y-1.5">
        <Label htmlFor="identity-name">{t("builder:identity.name")}</Label>
        <Input
          id="identity-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          disabled={submitting}
          className="rounded-xl bg-background/40"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="identity-role">{t("builder:identity.role")}</Label>
        <Input
          id="identity-role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          required
          disabled={submitting}
          className="rounded-xl bg-background/40"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="identity-tone">{t("builder:identity.tone")}</Label>
        <select
          id="identity-tone"
          value={tone}
          onChange={(e) => setTone(e.target.value)}
          disabled={submitting}
          className={cn(
            "flex h-9 w-full rounded-xl border border-input bg-background/40 px-3 py-1 text-sm",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          {TONE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {t(`builder:identity.toneOptions.${option}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="identity-description">{t("builder:identity.description")}</Label>
        <Textarea
          id="identity-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={submitting}
          rows={3}
          className="rounded-xl bg-background/40"
        />
      </div>
      {errorKey ? (
        <p className="text-xs text-destructive">{t(errorKey)}</p>
      ) : null}
      <Button type="submit" size="sm" className="rounded-full" disabled={submitting}>
        {submitting ? (
          <>
            <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />
            {t("builder:identity.submitting")}
          </>
        ) : (
          t("builder:identity.continue")
        )}
      </Button>
    </form>
  );
}
