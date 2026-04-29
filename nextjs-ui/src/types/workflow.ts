// ─── Workflow Builder Types ────────────────────────────────────────────────────

export type WFNodeType =
  | "trigger"
  | "command"
  | "script"
  | "file_write"
  | "variable"
  | "condition"
  | "delay"
  | "note";

// ── Variable definition (schema-time) ─────────────────────────────────────────
export interface WFVariableDef {
  key: string;        // e.g. "app_name"
  label: string;      // e.g. "Application Name"
  default?: string;
  description?: string;
  required?: boolean;
}

// ── Node data payloads per type ────────────────────────────────────────────────

export interface TriggerNodeData {
  label: string;
  description?: string;
}

export interface CommandNodeData {
  label: string;
  command: string;       // supports {{variable}} interpolation
  timeout?: number;      // seconds
  continue_on_error?: boolean;
}

export interface ScriptNodeData {
  label: string;
  script: string;        // multi-line bash script
  timeout?: number;
  continue_on_error?: boolean;
}

export interface FileWriteNodeData {
  label: string;
  remote_path: string;   // e.g. /etc/nginx/sites-available/myapp
  content: string;       // file content, supports {{variable}}
  sudo?: boolean;
}

export interface VariableNodeData {
  label: string;
  key: string;
  value: string;         // can reference other {{vars}}
}

export interface ConditionNodeData {
  label: string;
  condition: string;     // expression evaluated against last output
}

export interface DelayNodeData {
  label: string;
  seconds: number;
}

export interface NoteNodeData {
  label: string;
  text: string;
}

export type WFNodeData =
  | TriggerNodeData
  | CommandNodeData
  | ScriptNodeData
  | FileWriteNodeData
  | VariableNodeData
  | ConditionNodeData
  | DelayNodeData
  | NoteNodeData;

// ── Generic node ───────────────────────────────────────────────────────────────
export interface WFNode {
  id: string;
  type: WFNodeType;
  position: { x: number; y: number };
  data: WFNodeData;
}

// ── Edge ───────────────────────────────────────────────────────────────────────
export interface WFEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  label?: string;
}

// ── Full workflow ──────────────────────────────────────────────────────────────
export interface Workflow {
  id: string;
  name: string;
  description?: string | null;
  nodes: WFNode[];
  edges: WFEdge[];
  variables: WFVariableDef[];
  tags?: string[];
  created_at: string;
  updated_at: string;
}

export interface WorkflowSummary {
  id: string;
  name: string;
  description?: string | null;
  tags?: string[];
  nodeCount: number;
  created_at: string;
  updated_at: string;
}

// ── Execution ──────────────────────────────────────────────────────────────────
export type WFExecutionStatus = "pending" | "running" | "success" | "failed" | "cancelled";

export interface WFNodeLog {
  node_id: string;
  node_label: string;
  status: "pending" | "skipped" | "running" | "success" | "failed";
  started_at: string;
  completed_at?: string;
  output?: string;
  error?: string;
}

export interface WorkflowExecution {
  id: string;
  workflow_id: string;
  profile_id?: string | null;
  status: WFExecutionStatus;
  variables: Record<string, string>;
  logs: WFNodeLog[];
  error?: string | null;
  started_at: string;
  completed_at?: string | null;
}

// ── Template ──────────────────────────────────────────────────────────────────
export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  tags: string[];
  nodes: WFNode[];
  edges: WFEdge[];
  variables: WFVariableDef[];
}
