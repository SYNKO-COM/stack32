/** Client-safe Agent Service error code → i18n key mapping. */

export class AgentServiceError extends Error {
  readonly code: string;
  readonly status: number;
  /** Setting names the service named as missing, when it named any. */
  readonly fields: string[];

  constructor(code: string, message: string, status: number, fields: string[] = []) {
    super(message);
    this.name = "AgentServiceError";
    this.code = code;
    this.status = status;
    this.fields = fields;
  }
}

export function agentServiceErrorKey(error: unknown): string {
  if (error instanceof AgentServiceError) {
    const map: Record<string, string> = {
      not_found: "errors:agentNotFound.subtitle",
      BUILDER_INPUT_REJECTED: "errors:builder.inputRejected",
      BUILDER_INTERRUPTED: "errors:builder.interrupted",
      USERNAME_REQUIRED: "errors:publish.usernameRequired",
      PLAN_PUBLISH_REQUIRED: "errors:publish.planRequired",
      PLAN_AGENT_LIMIT: "errors:plan.agentLimit",
      PLAN_LIVE_MESSAGE_LIMIT: "errors:plan.liveMessageLimit",
      WORKSPACE_LIMIT_REACHED: "errors:plan.workspaceLimit",
      AGENT_SPEC_INVALID: "errors:publish.specInvalid",
      DEPLOYMENT_VALIDATION_FAILED: "errors:publish.validationFailed",
      DEFINITION_READINESS_FAILED: "errors:publish.validationFailed",
      DEPLOYMENT_FAILED: "errors:publish.validationFailed",
      SMOKE_FAILED: "errors:publish.testFailed",
      SMOKE_RUNNER_UNAVAILABLE: "errors:publish.validationFailed",
      SECURITY_SCAN_FAILED: "errors:publish.validationFailed",
      ACTIVATION_FAILED: "errors:publish.validationFailed",
      RATE_LIMIT_EXCEEDED: "errors:rateLimit",
      BUDGET_EXCEEDED: "errors:budgetExceeded",
      TEST_FAILED: "errors:publish.testFailed",
      PUBLISH_FAILED: "errors:publish.validationFailed",
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
