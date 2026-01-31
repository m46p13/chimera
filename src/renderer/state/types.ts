// Types for Jotai state management

export type GitInfo = {
  branch?: string | null;
  sha?: string | null;
  originUrl?: string | null;
};

export type ThreadSummary = {
  id: string;
  preview: string;
  createdAt: number;
  updatedAt: number;
  modelProvider: string;
  cwd?: string | null;
  gitInfo?: GitInfo | null;
};

export type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  streaming?: boolean;
};

export type ItemRecord = {
  item: any;
  threadId: string;
  turnId: string;
};

export type ApprovalRequest = {
  id: number;
  kind: "command" | "file";
  threadId: string;
  turnId: string;
  itemId: string;
  command?: string;
  cwd?: string;
  reason?: string;
  risk?: string;
  parsedCmd?: any;
};

export type ActivityItem = {
  id: string;
  itemId?: string;
  label?: string;
  title?: string;
  detail?: string;
  meta?: string[];
  kind?:
    | "thread"
    | "turn"
    | "command"
    | "file"
    | "approval"
    | "system"
    | "error"
    | "metrics"
    | "thinking"
    | "tool"
    | "plan"
    | "token";
  status?: "running" | "completed" | "error";
  time: string;
  command?: string;
  actions?: string[];
  cwd?: string;
  durationMs?: number;
  exitCode?: number;
  steps?: Array<{ label: string; status?: string }>;
  tokenUsage?: {
    inputTokens?: number;
    outputTokens?: number;
    reasoningOutputTokens?: number;
    totalTokens?: number;
  };
};

export type ThreadDetailState = {
  messages: Message[];
  activity: ActivityItem[];
  itemsById: Record<string, ItemRecord>;
  itemSequence: Array<{ id: string; threadId: string }>;
  commandOutputById: Record<string, string>;
  fileChangeOutputById: Record<string, string>;
  turnDiff: string;
  pendingApprovals: ApprovalRequest[];
  activeTurnId: string | null;
  statusHeader: string;
  reasoningBuffer: string;
};

export type ApprovalPresetId = "read-only" | "agent" | "full-access";

export type ThreadSettings = {
  modelId?: string;
  effort?: string | null;
  approvalPresetId?: ApprovalPresetId;
};

export type ModelOption = {
  id: string;
  model?: string;
  displayName?: string;
  description?: string;
  supportedReasoningEfforts?: Array<{
    reasoningEffort: string;
    description?: string;
  }>;
  defaultReasoningEffort?: string | null;
  isDefault?: boolean;
};

export type CodexStatus = {
  state: "starting" | "ready" | "error" | "stopped";
  message?: string;
};

export const getEmptyThreadDetailState = (): ThreadDetailState => ({
  messages: [],
  activity: [],
  itemsById: {},
  itemSequence: [],
  commandOutputById: {},
  fileChangeOutputById: {},
  turnDiff: "",
  pendingApprovals: [],
  activeTurnId: null,
  statusHeader: "Working",
  reasoningBuffer: "",
});
