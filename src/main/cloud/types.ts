/**
 * Codex Cloud API Types
 * Ported from Rust: codex-rs/cloud-tasks-client/src/api.rs
 */

export interface TaskId {
  id: string;
}

export type TaskStatus = "pending" | "ready" | "applied" | "error";

export interface DiffSummary {
  files_changed: number;
  lines_added: number;
  lines_removed: number;
}

export interface TaskSummary {
  id: TaskId;
  title: string;
  status: TaskStatus;
  updated_at: string; // ISO 8601 timestamp
  environment_id?: string;
  environment_label?: string;
  summary: DiffSummary;
  is_review: boolean;
  attempt_total?: number;
}

export type AttemptStatus = "pending" | "in_progress" | "completed" | "failed" | "cancelled" | "unknown";

export interface TurnAttempt {
  turn_id: string;
  attempt_placement?: number;
  created_at?: string; // ISO 8601 timestamp
  status: AttemptStatus;
  diff?: string;
  messages: string[];
}

export type ApplyStatus = "success" | "partial" | "error";

export interface ApplyOutcome {
  applied: boolean;
  status: ApplyStatus;
  message: string;
  skipped_paths: string[];
  conflict_paths: string[];
}

export interface CreatedTask {
  id: TaskId;
}

export interface TaskText {
  prompt?: string;
  messages: string[];
  turn_id?: string;
  sibling_turn_ids: string[];
  attempt_placement?: number;
  attempt_status: AttemptStatus;
}

// Cloud API Error
export class CloudTaskError extends Error {
  constructor(
    message: string,
    public readonly kind: "http" | "io" | "auth" | "msg" = "msg"
  ) {
    super(message);
    this.name = "CloudTaskError";
  }
}

// Auth types
export interface TokenData {
  id_token: string;
  access_token: string;
  refresh_token: string;
  account_id?: string;
}

export interface AuthState {
  tokens: TokenData | null;
  last_refresh?: string;
}

// API Request/Response types
export interface CreateTaskRequest {
  new_task: {
    environment_id: string;
    branch: string;
    run_environment_in_qa_mode: boolean;
  };
  input_items: InputItem[];
  metadata?: {
    best_of_n?: number;
  };
}

export interface InputItem {
  type: "message" | "pre_apply_patch";
  role?: "user" | "assistant";
  content?: ContentFragment[];
  output_diff?: {
    diff: string;
  };
}

export interface ContentFragment {
  content_type: "text";
  text: string;
}

export interface TaskListItem {
  id: string;
  title: string;
  task_status_display?: {
    state?: string;
    latest_turn_status_display?: {
      turn_status?: string;
      diff_stats?: {
        files_modified?: number;
        lines_added?: number;
        lines_removed?: number;
      };
      sibling_turn_ids?: string[];
    };
    environment_label?: string;
  };
  updated_at?: number; // Unix timestamp
  pull_requests?: unknown[];
}

export interface PaginatedTaskList {
  items: TaskListItem[];
}

// Task details response types (from backend)
export interface CodeTaskDetailsResponse {
  current_user_turn?: Turn;
  current_assistant_turn?: Turn;
  current_diff_task_turn?: Turn;
}

export interface Turn {
  id?: string;
  attempt_placement?: number;
  turn_status?: string;
  sibling_turn_ids?: string[];
  input_items?: TurnItem[];
  output_items?: TurnItem[];
  worklog?: Worklog;
  error?: TurnError;
}

export interface TurnItem {
  type: string;
  role?: string;
  content?: ContentFragment[] | string[];
  diff?: string;
  output_diff?: {
    diff?: string;
  };
}

export interface Worklog {
  messages?: WorklogMessage[];
}

export interface WorklogMessage {
  author?: {
    role?: string;
  };
  content?: {
    parts?: (ContentFragment | string)[];
  };
}

export interface TurnError {
  code?: string;
  message?: string;
}

export interface SiblingTurnsResponse {
  sibling_turns: Array<Record<string, unknown>>;
}

// Client configuration
export interface CloudClientConfig {
  baseUrl: string;
  userAgent?: string;
}

// Environment types (from Rust: codex-rs/cloud-tasks/src/env_detect.rs)
export interface CloudEnvironment {
  id: string;
  label?: string;
  is_pinned?: boolean;
  repo_hints?: string;
}
