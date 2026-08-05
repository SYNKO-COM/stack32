/** Client-safe Agent Service error code → i18n key mapping. */

export class AgentServiceError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "AgentServiceError";
    this.code = code;
    this.status = status;
  }
}

export function agentServiceErrorKey(error: unknown): string {
  if (error instanceof AgentServiceError) {
    const map: Record<string, string> = {
      not_found: "errors:agentNotFound.subtitle",
      BUILDER_INPUT_REJECTED: "errors:builder.inputRejected",
      BUILDER_INTERRUPTED: "errors:builder.interrupted",
      AGENT_SPEC_INVALID: "errors:publish.specInvalid",
      DEPLOYMENT_VALIDATION_FAILED: "errors:publish.validationFailed",
      RATE_LIMIT_EXCEEDED: "errors:rateLimit",
      BUDGET_EXCEEDED: "errors:budgetExceeded",
      TEST_FAILED: "errors:publish.testFailed",
      INVALID_LLM_KEY: "errors:secrets.invalidKey",
      INVALID_PROVIDER: "errors:secrets.invalidProvider",
      GOOGLE_OAUTH_NOT_CONFIGURED: "errors:connections.oauthNotConfigured",
    };
    return map[error.code] ?? "errors:agentService";
  }
  if (error instanceof Error) {
    if (error.message === "identity_requires_agent_service") {
      return "errors:builder.identityUnavailable";
    }
  }
  return "errors:generic";
}
