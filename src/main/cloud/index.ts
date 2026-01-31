/**
 * Codex Cloud Client
 * TypeScript port of the Rust cloud-tasks-client
 */

// Types
export type {
  TaskId,
  TaskStatus,
  TaskSummary,
  DiffSummary,
  AttemptStatus,
  TurnAttempt,
  ApplyStatus,
  ApplyOutcome,
  CreatedTask,
  TaskText,
  TokenData,
  AuthState,
  CreateTaskRequest,
  InputItem,
  ContentFragment,
  TaskListItem,
  PaginatedTaskList,
  CodeTaskDetailsResponse,
  Turn,
  TurnItem,
  Worklog,
  WorklogMessage,
  TurnError,
  SiblingTurnsResponse,
  CloudClientConfig,
  CloudEnvironment,
} from "./types";

// Re-export the error class (as value, not type)
export { CloudTaskError } from "./types";

// Auth
export type { AuthHeaders } from "./auth";
export { CodexAuthManager, getAuthManager, getAuthHeaders } from "./auth";

// Client
export { CodexCloudClient, listEnvironments } from "./client";

// Default export
export { CodexCloudClient as default } from "./client";
