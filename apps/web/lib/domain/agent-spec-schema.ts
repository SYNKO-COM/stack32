import { z } from "zod";

/** Zod validation for AgentSpec — kept in sync with the Pydantic models in services/agent-service. */
export const toolIdSchema = z.enum([
  "web_search",
  "fetch_url",
  "knowledge_search",
  "calculator",
  "current_datetime",
  "structured_output",
  "http_request",
]);

export const agentSpecSchema = z.object({
  schemaVersion: z.string(),
  name: z.string().min(1).max(120),
  slug: z.string().min(1),
  goal: z.string().min(1),
  instructions: z.string(),
  modelProfile: z.object({
    profile: z.enum(["fast", "standard", "heavy"]),
    temperature: z.number().min(0).max(2),
  }),
  tools: z.array(
    z.object({
      tool: toolIdSchema,
      enabled: z.boolean(),
    }),
  ),
  knowledge: z.object({
    enabled: z.boolean(),
    sourceIds: z.array(z.string()),
  }),
  memory: z.object({
    conversationWindow: z.number().int().min(1).max(50),
  }),
  rules: z.array(z.string()),
  output: z.object({
    format: z.enum(["markdown", "table", "text"]),
    allowTables: z.boolean(),
  }),
  starterPrompts: z.array(z.string()),
  runtime: z.object({
    maxSteps: z.number().int().min(1).max(16),
    timeoutSeconds: z.number().int().min(5).max(300),
    maxToolCalls: z.number().int().min(0).max(20),
  }),
});

export type AgentSpecInput = z.input<typeof agentSpecSchema>;
