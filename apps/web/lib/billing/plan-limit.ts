/**
 * Paid-plan gates: map server / PostgREST limit errors so the UI can open
 * the upgrade dialog instead of showing a raw failure.
 */

export const PLAN_LIMIT_CODES = [
  "PLAN_AGENT_LIMIT",
  "WORKSPACE_LIMIT_REACHED",
  "PLAN_PUBLISH_REQUIRED",
  "PLAN_LIVE_MESSAGE_LIMIT",
] as const;

export type PlanLimitCode = (typeof PLAN_LIMIT_CODES)[number];

export class PlanLimitError extends Error {
  readonly code: PlanLimitCode;

  constructor(code: PlanLimitCode, message?: string) {
    super(message ?? code);
    this.name = "PlanLimitError";
    this.code = code;
  }
}

function errorBlob(error: unknown): string {
  if (error == null) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) {
    const extra =
      "code" in error && typeof (error as { code?: unknown }).code === "string"
        ? ` ${(error as { code: string }).code}`
        : "";
    return `${error.name} ${error.message}${extra}`;
  }
  if (typeof error === "object") {
    const rec = error as Record<string, unknown>;
    return [rec.message, rec.code, rec.details, rec.hint]
      .filter((v) => typeof v === "string")
      .join(" ");
  }
  return String(error);
}

/** Normalize PostgREST / server messages to a stable plan-limit code. */
export function planLimitCodeFromUnknown(error: unknown): PlanLimitCode | null {
  if (error instanceof PlanLimitError) return error.code;
  if (error && typeof error === "object" && "code" in error) {
    const code = String((error as { code?: string }).code ?? "");
    if ((PLAN_LIMIT_CODES as readonly string[]).includes(code)) {
      return code as PlanLimitCode;
    }
  }
  const blob = errorBlob(error);
  if (/plan_agent_limit|PLAN_AGENT_LIMIT/i.test(blob)) return "PLAN_AGENT_LIMIT";
  if (/WORKSPACE_LIMIT_REACHED/i.test(blob)) return "WORKSPACE_LIMIT_REACHED";
  if (/PLAN_PUBLISH_REQUIRED/i.test(blob)) return "PLAN_PUBLISH_REQUIRED";
  if (/PLAN_LIVE_MESSAGE_LIMIT|live message limit/i.test(blob)) return "PLAN_LIVE_MESSAGE_LIMIT";
  return null;
}

export function isPlanLimitError(error: unknown): boolean {
  return planLimitCodeFromUnknown(error) !== null;
}

/** Throw PlanLimitError when the underlying error is a plan gate; otherwise rethrow. */
export function throwMappedPlanLimit(error: unknown): never {
  const code = planLimitCodeFromUnknown(error);
  if (code) throw new PlanLimitError(code);
  throw error;
}
