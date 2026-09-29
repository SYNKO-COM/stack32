"use client";
import { useState } from "react";
import { useTranslation } from "@/hooks/use-translation";
import { updateAgentChromeCapability } from "@/lib/actions/builder";

export function ChromeCapabilityToggle({
  agentId,
  enabled,
  onSaved,
}: {
  agentId: string;
  enabled: boolean;
  onSaved?: () => void;
}) {
  const { t } = useTranslation("builder");
  const [value, setValue] = useState(enabled);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function change(next: boolean) {
    setBusy(true);
    setFailed(false);
    try {
      await updateAgentChromeCapability(agentId, next);
      setValue(next);
      onSaved?.();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2 rounded-2xl border border-border/60 p-4">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={value}
          disabled={busy}
          onChange={(e) => void change(e.target.checked)}
          className="mt-1"
        />
        <span>
          <span className="block text-sm font-medium">
            {t("toolReview.chromeName")}
          </span>
          <span className="block text-xs text-muted-foreground">
            {t("toolReview.chromeDescription")}
          </span>
        </span>
      </label>
      <p className="text-xs text-muted-foreground">
        {t("toolReview.chromePublication")}
      </p>
      {failed && (
        <p role="alert" className="text-xs text-destructive">
          {t("toolReview.chromeSaveError")}
        </p>
      )}
    </div>
  );
}
