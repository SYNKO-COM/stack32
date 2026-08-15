import type { Agent, AgentSpec, AgentVersion } from "@/lib/domain/types";

function baseSpec(overrides: Partial<AgentSpec>): AgentSpec {
  return {
    schemaVersion: "1.0",
    name: "Agent",
    slug: "agent",
    goal: "",
    instructions: "",
    modelProfile: { profile: "standard", temperature: 0.4 },
    tools: [
      { tool: "web_search", enabled: true },
      { tool: "knowledge_search", enabled: true },
      { tool: "calculator", enabled: true },
    ],
    knowledge: { enabled: false, sourceIds: [] },
    memory: { conversationWindow: 12 },
    rules: ["Never invent missing information.", "Clearly identify uncertainty."],
    output: { format: "markdown", allowTables: true },
    starterPrompts: [],
    runtime: { maxSteps: 8, timeoutSeconds: 60, maxToolCalls: 6 },
    ...overrides,
  };
}

interface SeedAgent {
  agent: Agent;
  version: AgentVersion;
}

const T0 = "2026-08-01T10:00:00.000Z";

export const SEED_AGENTS: SeedAgent[] = [
  {
    agent: {
      id: "agent_sales",
      workspaceId: "ws_default",
      name: "Sales agent",
      icon: "briefcase",
      status: "ready",
      draftVersionId: "ver_sales_2",
      createdAt: T0,
      updatedAt: T0,
    },
    version: {
      id: "ver_sales_2",
      agentId: "agent_sales",
      versionNumber: 2,
      testStatus: "passed",
      createdAt: T0,
      spec: baseSpec({
        name: "Sales agent",
        slug: "sales-agent",
        goal: "Research companies, score leads and draft personalized emails.",
        instructions:
          "You are a sales research assistant. For each company, gather public information, evaluate fit against the user's ideal customer profile, produce a lead score from 0 to 100 with a short justification, then draft a concise personalized outreach email.",
        starterPrompts: [
          "Research this company: acme.com",
          "Score this lead and explain why",
          "Draft an outreach email for this prospect",
        ],
      }),
    },
  },
  {
    agent: {
      id: "agent_research",
      workspaceId: "ws_default",
      name: "Research agent",
      icon: "search",
      status: "published",
      draftVersionId: "ver_research_3",
      publishedVersionId: "ver_research_3",
      createdAt: T0,
      updatedAt: T0,
    },
    version: {
      id: "ver_research_3",
      agentId: "agent_research",
      versionNumber: 3,
      testStatus: "passed",
      createdAt: T0,
      spec: baseSpec({
        name: "Research agent",
        slug: "research-agent",
        goal: "Research competitors and summarize meaningful changes over time.",
        instructions:
          "You are a market research assistant. Track competitor websites, pricing pages and announcements. Summarize what changed, why it matters, and cite your sources.",
        starterPrompts: [
          "What changed on our competitors' pricing pages this month?",
          "Summarize recent announcements from these companies",
          "Compare these two products in a table",
        ],
      }),
    },
  },
  {
    agent: {
      id: "agent_support",
      workspaceId: "ws_default",
      name: "Support agent",
      icon: "life-buoy",
      status: "needs_attention",
      draftVersionId: "ver_support_1",
      createdAt: T0,
      updatedAt: T0,
    },
    version: {
      id: "ver_support_1",
      agentId: "agent_support",
      versionNumber: 1,
      testStatus: "failed",
      createdAt: T0,
      spec: baseSpec({
        name: "Support agent",
        slug: "support-agent",
        goal: "Read product documentation and answer customer questions.",
        instructions:
          "You are a customer support assistant. Answer questions using the connected knowledge base only. If the answer is not in the documentation, say so and suggest contacting support.",
        knowledge: { enabled: true, sourceIds: ["src_docs"] },
        starterPrompts: [
          "How do I reset my password?",
          "What plans include priority support?",
          "Summarize the onboarding guide",
        ],
      }),
    },
  },
  {
    agent: {
      id: "agent_content",
      workspaceId: "ws_default",
      name: "Content agent",
      icon: "pen-line",
      status: "draft",
      draftVersionId: "ver_content_1",
      createdAt: T0,
      updatedAt: T0,
    },
    version: {
      id: "ver_content_1",
      agentId: "agent_content",
      versionNumber: 1,
      testStatus: "pending",
      createdAt: T0,
      spec: baseSpec({
        name: "Content agent",
        slug: "content-agent",
        goal: "Turn rough notes into structured, publishable reports.",
        instructions:
          "You are a writing assistant. Transform rough notes into well-structured documents with headings, summaries and action items. Keep the author's voice.",
        starterPrompts: [
          "Turn these meeting notes into a report",
          "Draft a weekly update from these bullet points",
          "Outline a blog post about this topic",
        ],
      }),
    },
  },
];

export function makeSpecForPrompt(name: string, prompt: string): AgentSpec {
  return baseSpec({
    name,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "agent",
    goal: prompt,
    instructions: `You are an AI agent created from this request: "${prompt}". Work step by step, use your tools when helpful, and present results clearly.`,
    starterPrompts: [
      "Give me a quick overview of what you can do",
      "Run your main task on an example",
      "Summarize your latest findings",
    ],
  });
}
