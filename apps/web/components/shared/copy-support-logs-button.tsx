"use client";

import { Check, Copy, Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/use-translation";
import { cn } from "@/lib/utils";

export function CopySupportLogsButton({
  onCopy,
  className,
}: {
  onCopy: () => Promise<string>;
  className?: string;
}) {
  const { t } = useTranslation("common");
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState(false);

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={pending}
      className={cn(
        "h-7 gap-1.5 rounded-lg border-amber-500/30 bg-background/60 text-xs",
        className,
      )}
      onClick={async () => {
        setPending(true);
        try {
          const text = await onCopy();
          await navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        } finally {
          setPending(false);
        }
      }}
    >
      {pending ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
      ) : copied ? (
        <Check className="size-3.5 text-emerald-600" aria-hidden="true" />
      ) : (
        <Copy className="size-3.5" aria-hidden="true" />
      )}
      {copied ? t("support.copied") : t("support.copyLogs")}
    </Button>
  );
}
