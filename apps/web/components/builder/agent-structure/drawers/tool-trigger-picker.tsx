"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AppSearchField } from "@/components/builder/app-search-field";
import { DaSelect } from "@/components/ui/da-select";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/hooks/use-translation";
import { lookupIntegrationAppIcons, searchIntegrationTriggers } from "@/lib/actions/integrations";
import { cacheIntegrationIcon, getCachedIntegrationIcon } from "@/lib/integrations/icon-resolver";
import { resolveAppDisplayName } from "@/lib/integrations/app-grouping";

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
  onAppSelect: (app: { appId: string; name: string; imgSrc?: string }) => void;
  onEventChange: (componentId: string, label: string) => void;
}) {
  const { t } = useTranslation(["structure", "builder"]);
  const [iconSrc, setIconSrc] = useState<string | null>(
    () => (appId ? getCachedIntegrationIcon(appId) ?? null : null),
  );

  const events = useQuery({
    queryKey: ["pd-triggers", appId],
    queryFn: () => searchIntegrationTriggers("", appId, 80),
    enabled: Boolean(appId),
  });

  useEffect(() => {
    if (!appId) {
      setIconSrc(null);
      return;
    }
    const cached = getCachedIntegrationIcon(appId);
    if (cached) {
      setIconSrc(cached);
      return;
    }
    let cancelled = false;
    void lookupIntegrationAppIcons([appId]).then((icons) => {
      if (cancelled) return;
      const src = icons[appId];
      if (src) {
        cacheIntegrationIcon(appId, src);
        setIconSrc(src);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [appId]);

  const options = useMemo(() => {
    const rows = (events.data?.triggers ?? []).map((row) => {
      const sourceName = row.name || row.triggerId;
      return {
        value: row.triggerId,
        label: sourceName,
        sourceName,
      };
    });
    if (componentId && !rows.some((row) => row.value === componentId)) {
      const sourceName = componentLabel || componentId;
      rows.unshift({
        value: componentId,
        label: sourceName,
        sourceName,
      });
    }
    return rows;
  }, [componentId, componentLabel, events.data?.triggers]);

  const displayName =
    appName || (appId ? resolveAppDisplayName(appId) : "") || appId;

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">{t("structure:panel.toolTriggerApp")}</Label>
        <AppSearchField
          value={displayName}
          selectedAppId={appId || undefined}
          iconSrc={iconSrc}
          disabled={disabled}
          placeholder={t("builder:capabilities.toolTriggerSearch")}
          onChange={() => {
            onAppCleared();
            setIconSrc(null);
          }}
          onSelect={(app) => {
            if (app.imgSrc) {
              cacheIntegrationIcon(app.appId, app.imgSrc);
              setIconSrc(app.imgSrc);
            }
            onAppSelect({ appId: app.appId, name: app.name, imgSrc: app.imgSrc });
          }}
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
