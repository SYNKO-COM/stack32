import type { ModuleExecState } from "@/hooks/use-live-execution";

export type ProductNodeKind =
  | "trigger_chat"
  | "trigger_schedule"
  | "agent"
  | "output"
  | "model"
  | "memory"
  | "integration";

export type ConfigurationStatus =
  | "ready"
  | "setup_required"
  | "broken"
  | "disabled"
  | "not_applicable";

export interface IntegrationIconRef {
  kind: "lucide" | "local" | "remote";
  value: string;
}

export interface IntegrationAction {
  toolId: string;
  label: string;
  approvalMode?: string;
}

export interface IntegrationModule {
  appKey: string;
  appName: string;
  provider: string;
  toolIds: string[];
  actions: IntegrationAction[];
  connectionStatus: string;
  configurationStatus: ConfigurationStatus;
  accountLabel?: string;
}

export interface ProductNode {
  id: string;
  kind: ProductNodeKind;
  label: string;
  subtitle?: string;
  agentName?: string;
  icon?: IntegrationIconRef;
  configurationStatus: ConfigurationStatus;
  executionStatus?: ModuleExecState;
  integration?: IntegrationModule;
}

export type EdgeStyle = "solid" | "dashed";
export type EdgeRole = "main" | "attachment";

export interface ProductEdge {
  id: string;
  source: string;
  target: string;
  style: EdgeStyle;
  role: EdgeRole;
  sourceHandle?: string;
  targetHandle?: string;
  configurationStatus?: ConfigurationStatus;
  executionStatus?: ModuleExecState;
}

export interface ProductAgentGraph {
  nodes: ProductNode[];
  edges: ProductEdge[];
}
