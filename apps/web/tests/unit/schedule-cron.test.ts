import { describe, expect, it } from "vitest";

import {
  buildScheduleCron,
  isScheduleTimingConfigured,
  parseScheduleCron,
} from "@/lib/schedule-cron";

describe("schedule-cron", () => {
  it("builds weekday morning cron", () => {
    expect(
      buildScheduleCron({
        days: [1, 2, 3, 4, 5],
        hour: 9,
        minute: 0,
        timezone: "Europe/Paris",
      }),
    ).toBe("0 9 * * 1,2,3,4,5");
  });

  it("parses and round-trips", () => {
    const timing = parseScheduleCron("30 14 * * 1,3,5", "Europe/Paris");
    expect(timing.hour).toBe(14);
    expect(timing.minute).toBe(30);
    expect(timing.days).toEqual([1, 3, 5]);
    expect(buildScheduleCron(timing)).toBe("30 14 * * 1,3,5");
  });

  it("treats hourly cron as not configured", () => {
    expect(isScheduleTimingConfigured("0 * * * *")).toBe(false);
    expect(isScheduleTimingConfigured("0 9 * * 1,2,3,4,5")).toBe(true);
  });
});
