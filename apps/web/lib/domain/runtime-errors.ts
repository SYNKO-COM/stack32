export type RuntimeErrorCode =
  | "CONNECTION_REQUIRED"
  | "AUTH_EXPIRED"
  | "MODEL_INVALID_KEY"
  | "TOOL_EXECUTION_FAILED"
  | "APPROVAL_REQUIRED"
  | "UNKNOWN";

export interface NormalizedRuntimeError {
  code: RuntimeErrorCode;
  title: string;
  message: string;
  fixAction?: "connect" | "reconnect" | "configure_model" | "retry" | "approve";
}

const ERROR_MAP: Record<string, Omit<NormalizedRuntimeError, "code">> = {
  CONNECTION_REQUIRED: {
    title: "Connection required",
    message: "Link your account so this action can run.",
    fixAction: "connect",
  },
  AUTH_EXPIRED: {
    title: "Session expired",
    message: "Your connection expired — reconnect to continue.",
    fixAction: "reconnect",
  },
  MODEL_INVALID_KEY: {
    title: "Invalid model key",
    message: "Check your API key in Model settings.",
    fixAction: "configure_model",
  },
  LLM_CONFIGURATION_REQUIRED: {
    title: "Model not configured",
    message: "Add your LLM credentials to run this agent.",
    fixAction: "configure_model",
  },
  TOOL_EXECUTION_FAILED: {
    title: "Action failed",
    message: "The tool returned an error. Try again or check your connection.",
    fixAction: "retry",
  },
  TOOL_FAILED: {
    title: "Action failed",
    message: "The tool returned an error. Try again or check your connection.",
    fixAction: "retry",
  },
  APPROVAL_REQUIRED: {
    title: "Approval needed",
    message: "Approve this action in chat to continue.",
    fixAction: "approve",
  },
};

export function normalizeRuntimeError(raw: string | undefined | null): NormalizedRuntimeError {
  const key = (raw || "UNKNOWN").toUpperCase();
  const mapped = ERROR_MAP[key];
  if (mapped) {
    return {
      code: key === "TOOL_FAILED" ? "TOOL_EXECUTION_FAILED" : (key as RuntimeErrorCode),
      ...mapped,
    };
  }
  return {
    code: "UNKNOWN",
    title: "Something went wrong",
    message: raw || "An unexpected error occurred.",
    fixAction: "retry",
  };
}
