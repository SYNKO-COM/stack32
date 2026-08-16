"use client";

import { useTranslation } from "@/hooks/use-translation";
import { cn } from "@/lib/utils";

type AuthVisualPanelProps = {
  mode: "login" | "signup";
  className?: string;
};

/**
 * Right-pane brand visual: building an AI agent with Stack32 orange DA.
 * Pure CSS — no external assets, works in light/dark.
 */
export function AuthVisualPanel({ mode, className }: AuthVisualPanelProps) {
  const { t } = useTranslation("auth");

  return (
    <div
      className={cn(
        "relative h-full min-h-[280px] overflow-hidden rounded-[22px]",
        className,
      )}
      aria-hidden="true"
    >
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_10%_0%,color-mix(in_srgb,var(--brand-from)_55%,#1a1208)_0%,#140e08_42%,#0c0a09_100%)]" />
      <div className="absolute -left-16 top-10 size-64 rounded-full bg-[color-mix(in_srgb,var(--brand-from)_35%,transparent)] blur-3xl" />
      <div className="absolute -right-10 bottom-8 size-72 rounded-full bg-[color-mix(in_srgb,var(--brand-to)_40%,transparent)] blur-3xl" />
      <div
        className="absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.12) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
        }}
      />

      <div className="relative z-10 flex h-full flex-col justify-between p-8 xl:p-10">
        <p className="max-w-[16rem] font-brand text-2xl leading-tight tracking-tight text-white/95 xl:text-3xl">
          {mode === "signup" ? t("visual.signupHeadline") : t("visual.loginHeadline")}
        </p>

        <div className="relative mx-auto w-full max-w-md flex-1">
          {/* Prompt card */}
          <div className="absolute top-[12%] left-1/2 z-20 w-[min(100%,22rem)] -translate-x-1/2 animate-[auth-float_5.5s_ease-in-out_infinite]">
            <div className="rounded-2xl border border-white/15 bg-white/95 p-3 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.55)]">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1 truncate text-sm text-neutral-800">
                  {t("visual.promptSample")}
                  <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-[var(--brand-to)] align-[-2px]" />
                </div>
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-neutral-950 text-white">
                  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* Agent graph */}
          <div className="absolute inset-x-0 top-[38%] bottom-[8%]">
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 400 260" fill="none">
              <path
                d="M80 60 C140 60, 160 120, 200 130"
                stroke="url(#authEdge)"
                strokeWidth="1.5"
                strokeDasharray="5 6"
                className="animate-[auth-dash_8s_linear_infinite] opacity-70"
              />
              <path
                d="M320 70 C260 70, 240 120, 200 130"
                stroke="url(#authEdge)"
                strokeWidth="1.5"
                strokeDasharray="5 6"
                className="animate-[auth-dash_8s_linear_infinite] opacity-70"
                style={{ animationDelay: "-2s" }}
              />
              <path
                d="M200 130 C200 170, 120 190, 90 210"
                stroke="url(#authEdge)"
                strokeWidth="1.5"
                strokeDasharray="5 6"
                className="animate-[auth-dash_8s_linear_infinite] opacity-60"
                style={{ animationDelay: "-4s" }}
              />
              <path
                d="M200 130 C200 170, 280 190, 310 210"
                stroke="url(#authEdge)"
                strokeWidth="1.5"
                strokeDasharray="5 6"
                className="animate-[auth-dash_8s_linear_infinite] opacity-60"
                style={{ animationDelay: "-1s" }}
              />
              <defs>
                <linearGradient id="authEdge" x1="0" y1="0" x2="400" y2="260">
                  <stop stopColor="var(--brand-from)" stopOpacity="0.9" />
                  <stop offset="1" stopColor="var(--brand-to)" stopOpacity="0.9" />
                </linearGradient>
              </defs>
            </svg>

            <Node
              className="left-[8%] top-[8%] animate-[auth-float_6s_ease-in-out_infinite]"
              label={t("visual.nodes.intent")}
              delay="0s"
            />
            <Node
              className="right-[6%] top-[12%] animate-[auth-float_7s_ease-in-out_infinite]"
              label={t("visual.nodes.tools")}
              delay="-1.5s"
            />
            <Node
              className="left-1/2 top-[42%] z-10 -translate-x-1/2 animate-[auth-pulse_3.2s_ease-in-out_infinite]"
              label={t("visual.nodes.agent")}
              accent
              delay="0s"
            />
            <Node
              className="left-[10%] bottom-[6%] animate-[auth-float_6.5s_ease-in-out_infinite]"
              label={t("visual.nodes.test")}
              delay="-2.2s"
            />
            <Node
              className="right-[8%] bottom-[4%] animate-[auth-float_5.8s_ease-in-out_infinite]"
              label={t("visual.nodes.publish")}
              delay="-0.8s"
            />
          </div>
        </div>

        <p className="text-sm text-white/65">{t("visual.caption")}</p>
      </div>
    </div>
  );
}

function Node({
  className,
  label,
  accent,
  delay,
}: {
  className?: string;
  label: string;
  accent?: boolean;
  delay?: string;
}) {
  return (
    <div
      className={cn("absolute", className)}
      style={{ animationDelay: delay }}
    >
      <div
        className={cn(
          "rounded-xl border px-3 py-2 text-xs font-medium shadow-lg backdrop-blur-md",
          accent
            ? "border-white/25 bg-brand-gradient text-white shadow-[0_12px_40px_-12px_rgba(250,114,11,0.75)]"
            : "border-white/15 bg-white/10 text-white/90",
        )}
      >
        {label}
      </div>
    </div>
  );
}
