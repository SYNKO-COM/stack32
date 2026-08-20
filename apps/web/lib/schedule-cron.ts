/** Cron helpers for Structure schedule (minute hour * * dow). DOW: 0=Sun … 6=Sat. */

export type ScheduleTiming = {
  days: number[]; // cron DOW values, e.g. [1,2,3,4,5] = Mon–Fri
  hour: number; // 0–23
  minute: number; // 0–59
  timezone: string;
};

/** UI order Mon→Sun; values are cron DOW. */
export const WEEKDAY_OPTIONS: Array<{ cronDow: number; key: string }> = [
  { cronDow: 1, key: "mon" },
  { cronDow: 2, key: "tue" },
  { cronDow: 3, key: "wed" },
  { cronDow: 4, key: "thu" },
  { cronDow: 5, key: "fri" },
  { cronDow: 6, key: "sat" },
  { cronDow: 0, key: "sun" },
];

export const DEFAULT_SCHEDULE_TIMING: ScheduleTiming = {
  days: [1, 2, 3, 4, 5],
  hour: 9,
  minute: 0,
  timezone: "UTC",
};

export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** True when cron is a fixed clock time (not every-hour / wildcards on hour). */
export function isScheduleTimingConfigured(cron: string | null | undefined): boolean {
  const parts = String(cron || "")
    .trim()
    .split(/\s+/);
  if (parts.length !== 5) return false;
  const [, hour] = parts;
  if (!hour || hour === "*" || hour.includes("/")) return false;
  return true;
}

export function parseScheduleCron(
  cron: string | null | undefined,
  timezone?: string | null,
): ScheduleTiming {
  const base = {
    ...DEFAULT_SCHEDULE_TIMING,
    timezone: timezone?.trim() || browserTimezone(),
  };
  const parts = String(cron || "")
    .trim()
    .split(/\s+/);
  if (parts.length !== 5) return base;
  const [minRaw, hourRaw, , , dowRaw] = parts;
  const minute = Number.parseInt(minRaw, 10);
  const hour = Number.parseInt(hourRaw, 10);
  if (!Number.isFinite(minute) || minute < 0 || minute > 59) return base;
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return base;

  let days: number[];
  if (!dowRaw || dowRaw === "*") {
    days = [0, 1, 2, 3, 4, 5, 6];
  } else {
    const parsed = new Set<number>();
    for (const part of dowRaw.split(",")) {
      const bit = part.trim();
      if (!bit) continue;
      if (bit.includes("-")) {
        const [a, b] = bit.split("-").map((n) => Number.parseInt(n, 10));
        if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
        const start = Math.min(a, b);
        const end = Math.max(a, b);
        for (let d = start; d <= end; d += 1) {
          parsed.add(d === 7 ? 0 : d);
        }
      } else {
        const n = Number.parseInt(bit, 10);
        if (Number.isFinite(n)) parsed.add(n === 7 ? 0 : n);
      }
    }
    days = [...parsed].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);
    if (days.length === 0) days = base.days;
  }

  return { days, hour, minute, timezone: base.timezone };
}

export function buildScheduleCron(timing: ScheduleTiming): string {
  const minute = Math.min(59, Math.max(0, Math.floor(timing.minute)));
  const hour = Math.min(23, Math.max(0, Math.floor(timing.hour)));
  const unique = [...new Set(timing.days.map((d) => (d === 7 ? 0 : d)).filter((d) => d >= 0 && d <= 6))].sort(
    (a, b) => a - b,
  );
  const days = unique.length > 0 ? unique : DEFAULT_SCHEDULE_TIMING.days;
  const dow = days.length === 7 ? "*" : days.join(",");
  return `${minute} ${hour} * * ${dow}`;
}

export function formatScheduleSummary(timing: ScheduleTiming, dayLabels: Record<string, string>): string {
  const hh = String(timing.hour).padStart(2, "0");
  const mm = String(timing.minute).padStart(2, "0");
  const time = `${hh}:${mm}`;
  if (timing.days.length === 7) {
    return `${dayLabels.every ?? "Every day"} · ${time}`;
  }
  const labels = WEEKDAY_OPTIONS.filter((d) => timing.days.includes(d.cronDow)).map(
    (d) => dayLabels[d.key] ?? d.key,
  );
  return `${labels.join(", ")} · ${time}`;
}
