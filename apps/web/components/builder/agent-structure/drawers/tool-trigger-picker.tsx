"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useMemo } from "react";

import { AppSearchField } from "@/components/builder/app-search-field";
import { DaSelect } from "@/components/ui/da-select";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/hooks/use-translation";
import { searchIntegrationTriggers } from "@/lib/actions/integrations";
import { translateTriggerLabel } from "@/lib/integrations/trigger-labels";

export function ToolTriggerPicker({
  appId,
  appName,
  componentId,
  componentLabel,
  disabled,
  onAppCleared,
  onAppSelect,
  onEventChange,
}: {
  appId: string;
  appName: string;
  componentId: string;
  componentLabel: string;
  disabled?: boolean;
  onAppCleared: () => void;
  onAppSelect: (app: { appId: string; name: string }) => void;
  onEventChange: (componentId: string, label: string) => void;
}) {
  const { t, i18n } = useTranslation(["structure", "builder"]);
  const events = useQuery({
    queryKey: ["pd-triggers", appId],
    queryFn: () => searchIntegrationTriggers("", appId, 80),
    enabled: Boolean(appId),
  });

  const options = useMemo(() => {
    const locale = i18n.language;
    const rows = (events.data?.triggers ?? []).map((row) => {
      const sourceName = row.name || row.triggerId;
      return {
        value: row.triggerId,
        label: translateTriggerLabel(sourceName, locale),
        sourceName,
      };
    });
    if (componentId && !rows.some((row) => row.value === componentId)) {
      const sourceName = componentLabel || componentId;
      rows.unshift({
        value: componentId,
        label: translateTriggerLabel(sourceName, locale),
        sourceName,
      });
    }
    return rows;
  }, [componentId, componentLabel, events.data?.triggers, i18n.language]);

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">{t("structure:panel.toolTriggerApp")}</Label>
        <AppSearchField
          value={appName || appId}
          disabled={disabled}
          placeholder={t("builder:capabilities.toolTriggerSearch")}
          onChange={onAppCleared}
          onSelect={(app) => onAppSelect({ appId: app.appId, name: app.name })}
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">{t("structure:panel.toolTriggerEvent")}</Label>
        {events.isLoading ? (
          <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            {t("builder:capabilities.toolTriggerLoading")}
          </p>
        ) : (
          <DaSelect
            value={componentId}
            disabled={disabled || !appId || options.length === 0}
            placeholder={
              appId
                ? options.length === 0
                  ? t("builder:capabilities.toolTriggerEmpty")
                  : t("builder:capabilities.toolTriggerEventPlaceholder")
                : t("builder:capabilities.toolTriggerPickAppFirst")
            }
            options={options}
            onChange={(value) => {
              onEventChange(
                value,
                options.find((row) => row.value === value)?.sourceName || value,
              );
            }}
          />
        )}
      </div>
    </div>
  );
}
