/** Format a support bundle (plain text) — no secrets, safe to email. */

export type SupportDiagnosticPayload = {
  reportId: string;
  generatedAt: string;
  account: {
    userId: string;
    email?: string | null;
    username?: string | null;
  };
  billing: {
    planKey: string;
    planStatus: string;
    billingInterval?: string | null;
    creditsMonthly?: number | null;
  };
  context: {
    surface: "builder" | "live";
    pageUrl?: string;
    locale?: string;
    userAgent?: string;
  };
  agent: {
    id: string;
    name?: string | null;
    status?: string | null;
    slug?: string | null;
  };
  request: {
    userPrompt?: string | null;
    threadId?: string | null;
    messageId?: string | null;
  };
  error: {
    key?: string | null;
    summary?: string | null;
    staleTimeout?: boolean;
  };
  run?: {
    id: string;
    type?: string | null;
    status?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    model?: string | null;
    provider?: string | null;
    startedAt?: string | null;
    completedAt?: string | null;
  } | null;
  tools?: string[];
  runEvents?: Array<{ sequence: number; eventType: string; summary: string }>;
};

const SECRET_KEY = /token|secret|password|api[_-]?key|authorization|credential/i;

export function sanitizeForSupport(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[truncated]";
  if (value == null) return value;
  if (typeof value === "string") {
    if (value.length > 4000) return `${value.slice(0, 4000)}…`;
    return value;
  }
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 40).map((v) => sanitizeForSupport(v, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY.test(k)) {
      out[k] = "[redacted]";
      continue;
    }
    out[k] = sanitizeForSupport(v, depth + 1);
  }
  return out;
}

export function formatSupportDiagnosticReport(payload: SupportDiagnosticPayload): string {
  const lines: string[] = [
    "=== Stack32 Support Report ===",
    `Report ID: ${payload.reportId}`,
    `Generated: ${payload.generatedAt}`,
    "",
    "--- Account ---",
    `User ID: ${payload.account.userId}`,
  ];
  if (payload.account.email) lines.push(`Email: ${payload.account.email}`);
  if (payload.account.username) lines.push(`Username: ${payload.account.username}`);

  lines.push(
    "",
    "--- Subscription ---",
    `Plan: ${payload.billing.planKey}`,
    `Status: ${payload.billing.planStatus}`,
  );
  if (payload.billing.billingInterval) {
    lines.push(`Billing interval: ${payload.billing.billingInterval}`);
  }
  if (payload.billing.creditsMonthly != null) {
    lines.push(`Credits / month: ${payload.billing.creditsMonthly}`);
  }

  lines.push(
    "",
    "--- Context ---",
    `Surface: ${payload.context.surface === "builder" ? "Builder" : "Live"}`,
  );
  if (payload.context.pageUrl) lines.push(`Page: ${payload.context.pageUrl}`);
  if (payload.context.locale) lines.push(`Locale: ${payload.context.locale}`);
  if (payload.context.userAgent) lines.push(`Browser: ${payload.context.userAgent}`);

  lines.push(
    "",
    "--- Agent ---",
    `Agent ID: ${payload.agent.id}`,
  );
  if (payload.agent.name) lines.push(`Name: ${payload.agent.name}`);
  if (payload.agent.status) lines.push(`Status: ${payload.agent.status}`);
  if (payload.agent.slug) lines.push(`Slug: ${payload.agent.slug}`);

  lines.push("", "--- User request ---");
  if (payload.request.userPrompt?.trim()) {
    lines.push(payload.request.userPrompt.trim());
  } else {
    lines.push("(not captured)");
  }
  if (payload.request.threadId) lines.push(`Thread ID: ${payload.request.threadId}`);
  if (payload.request.messageId) lines.push(`Message ID: ${payload.request.messageId}`);

  lines.push("", "--- Error ---");
  if (payload.error.key) lines.push(`Key: ${payload.error.key}`);
  if (payload.error.summary) lines.push(`Summary: ${payload.error.summary}`);
  if (payload.error.staleTimeout) lines.push("Cause: no response within 2 minutes (timeout)");

  if (payload.run) {
    lines.push("", "--- Run ---");
    lines.push(`Run ID: ${payload.run.id}`);
    if (payload.run.type) lines.push(`Type: ${payload.run.type}`);
    if (payload.run.status) lines.push(`Status: ${payload.run.status}`);
    if (payload.run.errorCode) lines.push(`Error code: ${payload.run.errorCode}`);
    if (payload.run.errorMessage) lines.push(`Error message: ${payload.run.errorMessage}`);
    if (payload.run.model) lines.push(`Model: ${payload.run.model}`);
    if (payload.run.provider) lines.push(`Provider: ${payload.run.provider}`);
    if (payload.run.startedAt) lines.push(`Started: ${payload.run.startedAt}`);
    if (payload.run.completedAt) lines.push(`Completed: ${payload.run.completedAt}`);
  }

  if (payload.tools?.length) {
    lines.push("", "--- Tools (agent spec) ---");
    for (const tool of payload.tools.slice(0, 40)) {
      lines.push(`- ${tool}`);
    }
  }

  if (payload.runEvents?.length) {
    lines.push("", "--- Activity log ---");
    for (const ev of payload.runEvents.slice(-50)) {
      lines.push(`#${ev.sequence} ${ev.eventType}${ev.summary ? ` — ${ev.summary}` : ""}`);
    }
  }

  lines.push(
    "",
    "--- End of report ---",
    "Paste this entire message when contacting Stack32 support.",
  );
  return lines.join("\n");
}
