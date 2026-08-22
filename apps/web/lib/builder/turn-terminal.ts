import type { BuilderMessage } from "@/lib/domain/types";

/** Intermediate builder acks — must not end the turn. */
function isEphemeralBuilderAck(message: BuilderMessage | undefined): boolean {
  if (!message || message.role !== "assistant") return false;
  if (
    message.card === "thinking" ||
    message.card === "build_progress" ||
    message.card === "identity_confirmed" ||
    message.card === "tools_confirmed"
  ) {
    return true;
  }
  if (message.formResolved && !message.uiComponent) return true;
  if (message.uiComponent) return false;
  const content = message.content ?? "";
  if (!content.startsWith("builder:")) return false;
  return (
    content === "builder:capabilities.saved" ||
    content === "builder:capabilities.formClosed" ||
    content === "builder:identity.confirmed" ||
    content.startsWith("builder:identity.confirmed") ||
    content === "builder:identity.formClosed" ||
    content === "builder:secrets.saved" ||
    content === "builder:secrets.formClosed" ||
    content === "builder:providers.saved" ||
    content === "builder:toolReview.saved" ||
    content === "builder:questions.formClosed" ||
    content === "builder:connection.prompt" ||
    content === "builder:connection.required"
  );
}

/** Final assistant reply for a build turn — live activity must stop. */
export function isTerminalAssistantMessage(message: BuilderMessage | undefined): boolean {
  if (!message || message.role !== "assistant") return false;
  if (message.card === "ready") return true;
  if (
    message.card === "thinking" ||
    message.card === "build_progress" ||
    message.card === "identity_confirmed"
  ) {
    return false;
  }
  if (message.uiComponent) return false;
  if (isEphemeralBuilderAck(message)) return false;
  const text = (message.content ?? "").trim();
  if (text.startsWith("builder:")) return false;
  return Boolean(text || (message.actions && message.actions.length > 0));
}

export function sliceCurrentTurnMessages(messages: BuilderMessage[]): BuilderMessage[] {
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "user") {
      lastUserIdx = i;
      break;
    }
  }
  return lastUserIdx >= 0 ? messages.slice(lastUserIdx + 1) : messages;
}

export function turnHasTerminalReply(messages: BuilderMessage[]): boolean {
  return sliceCurrentTurnMessages(messages).some(isTerminalAssistantMessage);
}

export function turnHasInflightWork(messages: BuilderMessage[]): boolean {
  return sliceCurrentTurnMessages(messages).some(
    (m) =>
      m.card === "thinking" ||
      (m.card === "build_progress" &&
        Boolean(m.steps?.some((s) => s.state === "running" || s.state === "pending"))),
  );
}
