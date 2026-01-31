/**
 * Codex Cloud HTTP Client
 * Ported from Rust: codex-rs/cloud-tasks-client/src/http.rs
 */

import type {
  TaskId,
  TaskSummary,
  CreatedTask,
  ApplyOutcome,
  TaskText,
  TurnAttempt,
  CloudClientConfig,
  PaginatedTaskList,
  TaskListItem,
  CodeTaskDetailsResponse,
  SiblingTurnsResponse,
  ApplyStatus,
  AttemptStatus,
  CloudEnvironment,
} from "./types";
import { CloudTaskError } from "./types";
import { getAuthManager, type AuthHeaders } from "./auth";
import { execSync } from "child_process";

// Default base URL for ChatGPT/Codex Cloud API
const DEFAULT_BASE_URL = "https://chatgpt.com/backend-api";

export class CodexCloudClient {
  private baseUrl: string;
  private userAgent: string;
  private authManager: ReturnType<typeof getAuthManager>;

  constructor(config?: CloudClientConfig) {
    this.baseUrl = config?.baseUrl ?? DEFAULT_BASE_URL;
    this.userAgent = config?.userAgent ?? "chimera/1.0";
    this.authManager = getAuthManager(this.userAgent);
  }

  /**
   * List available cloud environments
   * GET /wham/environments
   * Ported from Rust: codex-rs/cloud-tasks/src/env_detect.rs
   */
  async listEnvironments(): Promise<CloudEnvironment[]> {
    const url = `${this.baseUrl}/wham/environments`;
    const headers = await this.getHeaders();

    const response = await fetch(url, { headers });

    if (!response.ok) {
      const errorText = await response.text();
      throw new CloudTaskError(
        `list_environments failed: ${response.status} ${errorText}`,
        "http"
      );
    }

    return response.json() as Promise<CloudEnvironment[]>;
  }

  /**
   * Get headers for API requests
   */
  private async getHeaders(): Promise<Record<string, string>> {
    const authHeaders: AuthHeaders = await this.authManager.getAuthHeaders();
    return {
      "Authorization": authHeaders.Authorization,
      "User-Agent": authHeaders["User-Agent"],
      "Content-Type": "application/json",
      ...(authHeaders["ChatGPT-Account-Id"] && {
        "ChatGPT-Account-Id": authHeaders["ChatGPT-Account-Id"],
      }),
    };
  }

  /**
   * List tasks from the cloud API
   * GET /wham/tasks/list?limit=20&task_filter=current&environment_id={env}
   */
  async listTasks(environmentId?: string): Promise<TaskSummary[]> {
    const url = new URL(`${this.baseUrl}/wham/tasks/list`);
    url.searchParams.set("limit", "20");
    url.searchParams.set("task_filter", "current");
    if (environmentId) {
      url.searchParams.set("environment_id", environmentId);
    }

    const headers = await this.getHeaders();
    const response = await fetch(url.toString(), { headers });

    if (!response.ok) {
      const errorText = await response.text();
      throw new CloudTaskError(
        `list_tasks failed: ${response.status} ${errorText}`,
        "http"
      );
    }

    const data = await response.json() as PaginatedTaskList;
    return data.items.map((item) => this.mapTaskListItemToSummary(item));
  }

  /**
   * Create a new task
   * POST /wham/tasks
   */
  async createTask(
    envId: string,
    prompt: string,
    gitRef: string,
    qaMode = false,
    bestOfN = 1
  ): Promise<CreatedTask> {
    const url = `${this.baseUrl}/wham/tasks`;
    const headers = await this.getHeaders();

    const inputItems = [
      {
        type: "message",
        role: "user",
        content: [{ content_type: "text", text: prompt }],
      },
    ];

    const requestBody: Record<string, unknown> = {
      new_task: {
        environment_id: envId,
        branch: gitRef,
        run_environment_in_qa_mode: qaMode,
      },
      input_items: inputItems,
    };

    if (bestOfN > 1) {
      requestBody.metadata = { best_of_n: bestOfN };
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new CloudTaskError(
        `create_task failed: ${response.status} ${errorText}`,
        "http"
      );
    }

    const data = await response.json() as { task?: { id: string }; id?: string };
    const taskId = data.task?.id ?? data.id;
    
    if (!taskId) {
      throw new CloudTaskError(
        "create_task succeeded but no task id found",
        "http"
      );
    }

    return { id: { id: taskId } };
  }

  /**
   * Get task details including diff
   * GET /wham/tasks/{id}
   */
  async getTaskDetails(taskId: TaskId): Promise<CodeTaskDetailsResponse> {
    const url = `${this.baseUrl}/wham/tasks/${taskId.id}`;
    const headers = await this.getHeaders();

    const response = await fetch(url, { headers });

    if (!response.ok) {
      const errorText = await response.text();
      throw new CloudTaskError(
        `get_task_details failed: ${response.status} ${errorText}`,
        "http"
      );
    }

    return response.json() as Promise<CodeTaskDetailsResponse>;
  }

  /**
   * Get task diff as unified diff string
   */
  async getTaskDiff(taskId: TaskId): Promise<string | null> {
    const details = await this.getTaskDetails(taskId);
    return this.extractUnifiedDiff(details);
  }

  /**
   * Get task text (prompt and messages)
   */
  async getTaskText(taskId: TaskId): Promise<TaskText> {
    const details = await this.getTaskDetails(taskId);
    return this.extractTaskText(details);
  }

  /**
   * Get sibling attempts for a turn (best-of-N)
   * GET /wham/tasks/{taskId}/turns/{turnId}/sibling_turns
   */
  async listSiblingAttempts(
    taskId: TaskId,
    turnId: string
  ): Promise<TurnAttempt[]> {
    const url = `${this.baseUrl}/wham/tasks/${taskId.id}/turns/${turnId}/sibling_turns`;
    const headers = await this.getHeaders();

    const response = await fetch(url, { headers });

    if (!response.ok) {
      const errorText = await response.text();
      throw new CloudTaskError(
        `list_sibling_turns failed: ${response.status} ${errorText}`,
        "http"
      );
    }

    const data = await response.json() as SiblingTurnsResponse;
    
    const attempts: TurnAttempt[] = data.sibling_turns
      .map((turn) => this.turnAttemptFromMap(turn))
      .filter((a): a is TurnAttempt => a !== null);

    // Sort attempts by placement, then by created_at
    attempts.sort((a, b) => {
      if (a.attempt_placement != null && b.attempt_placement != null) {
        return a.attempt_placement - b.attempt_placement;
      }
      if (a.attempt_placement != null) return -1;
      if (b.attempt_placement != null) return 1;
      
      if (a.created_at && b.created_at) {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      if (a.created_at) return -1;
      if (b.created_at) return 1;
      
      return a.turn_id.localeCompare(b.turn_id);
    });

    return attempts;
  }

  /**
   * Apply task diff to working directory using git apply
   */
  async applyTask(
    taskId: TaskId,
    diffOverride?: string,
    cwd?: string
  ): Promise<ApplyOutcome> {
    const diff = diffOverride ?? await this.getTaskDiff(taskId);

    if (!diff) {
      throw new CloudTaskError("No diff available for task", "msg");
    }

    if (!this.isUnifiedDiff(diff)) {
      return {
        applied: false,
        status: "error" as ApplyStatus,
        message: "Expected unified git diff; backend returned an incompatible format.",
        skipped_paths: [],
        conflict_paths: [],
      };
    }

    return this.applyGitPatch(diff, cwd ?? process.cwd(), false);
  }

  /**
   * Dry-run apply (preflight) to check if patch would apply cleanly
   */
  async applyTaskPreflight(
    taskId: TaskId,
    diffOverride?: string,
    cwd?: string
  ): Promise<ApplyOutcome> {
    const diff = diffOverride ?? await this.getTaskDiff(taskId);

    if (!diff) {
      throw new CloudTaskError("No diff available for task", "msg");
    }

    if (!this.isUnifiedDiff(diff)) {
      return {
        applied: false,
        status: "error" as ApplyStatus,
        message: "Expected unified git diff; backend returned an incompatible format.",
        skipped_paths: [],
        conflict_paths: [],
      };
    }

    return this.applyGitPatch(diff, cwd ?? process.cwd(), true);
  }

  /**
   * Apply a git patch using git apply command
   */
  private applyGitPatch(
    diff: string,
    cwd: string,
    preflight: boolean
  ): ApplyOutcome {
    try {
      // First check if patch applies cleanly
      if (!preflight) {
        try {
          execSync("git apply --check", {
            input: diff,
            cwd,
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
          });
        } catch {
          // Check failed, but we'll still try to apply
        }
      }

      const args = preflight ? ["--check"] : [];
      const result = execSync(`git apply ${args.join(" ")}`.trim(), {
        input: diff,
        cwd,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });

      // Parse applied paths from git apply output (if any)
      // git apply doesn't output much on success, so we infer from the diff
      const appliedPaths = this.extractFilePathsFromDiff(diff);

      const status: ApplyStatus = "success";
      const applied = !preflight;

      return {
        applied,
        status,
        message: preflight
          ? `Preflight passed (applies cleanly)`
          : `Applied task locally (${appliedPaths.length} files)`,
        skipped_paths: [],
        conflict_paths: [],
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      
      // Try to parse git apply error output
      const stderr = (error as { stderr?: string }).stderr ?? "";
      
      // Check for common errors
      const conflictPaths: string[] = [];
      const skippedPaths: string[] = [];

      // Parse error lines for file info
      const lines = stderr.split("\n");
      for (const line of lines) {
        if (line.includes("patch does not apply")) {
          const match = line.match(/^(.*?):/);
          if (match) conflictPaths.push(match[1]);
        }
        if (line.includes("No such file")) {
          const match = line.match(/'([^']+)'/);
          if (match) skippedPaths.push(match[1]);
        }
      }

      const hasConflicts = conflictPaths.length > 0 || stderr.includes("patch does not apply");
      const status: ApplyStatus = hasConflicts ? "partial" : "error";

      return {
        applied: false,
        status,
        message: preflight
          ? `Preflight failed: ${errMsg}`
          : `Apply failed: ${errMsg}`,
        skipped_paths: skippedPaths,
        conflict_paths: conflictPaths,
      };
    }
  }

  // Helper methods

  private mapTaskListItemToSummary(item: TaskListItem): TaskSummary {
    const statusDisplay = item.task_status_display;
    const latestTurn = statusDisplay?.latest_turn_status_display;
    
    let status: TaskSummary["status"] = "pending";
    if (latestTurn?.turn_status === "failed" || latestTurn?.turn_status === "cancelled") {
      status = "error";
    } else if (latestTurn?.turn_status === "completed") {
      status = "ready";
    } else if (statusDisplay?.state === "applied") {
      status = "applied";
    } else if (statusDisplay?.state === "ready") {
      status = "ready";
    } else if (statusDisplay?.state === "error") {
      status = "error";
    }

    const diffStats = latestTurn?.diff_stats;
    const summary = {
      files_changed: diffStats?.files_modified ?? 0,
      lines_added: diffStats?.lines_added ?? 0,
      lines_removed: diffStats?.lines_removed ?? 0,
    };

    const siblingIds = latestTurn?.sibling_turn_ids ?? [];
    const attemptTotal = siblingIds.length > 0 ? siblingIds.length + 1 : undefined;

    return {
      id: { id: item.id },
      title: item.title,
      status,
      updated_at: item.updated_at 
        ? new Date(item.updated_at * 1000).toISOString()
        : new Date().toISOString(),
      environment_id: undefined,
      environment_label: statusDisplay?.environment_label,
      summary,
      is_review: (item.pull_requests?.length ?? 0) > 0,
      attempt_total: attemptTotal,
    };
  }

  private extractUnifiedDiff(details: CodeTaskDetailsResponse): string | null {
    // Try current_diff_task_turn first, then current_assistant_turn
    for (const turn of [details.current_diff_task_turn, details.current_assistant_turn]) {
      if (!turn?.output_items) continue;
      
      for (const item of turn.output_items) {
        // Check for output_diff type
        if (item.type === "output_diff" && item.diff) {
          return item.diff;
        }
        // Check for pr type with output_diff
        if (item.type === "pr" && item.output_diff?.diff) {
          return item.output_diff.diff;
        }
      }
    }
    return null;
  }

  private extractTaskText(details: CodeTaskDetailsResponse): TaskText {
    const assistantTurn = details.current_assistant_turn;
    
    // Extract prompt from user turn
    let prompt: string | undefined;
    if (details.current_user_turn?.input_items) {
      const parts: string[] = [];
      for (const item of details.current_user_turn.input_items) {
        if (item.type === "message" && item.role !== "assistant") {
          if (Array.isArray(item.content)) {
            for (const frag of item.content) {
              if (typeof frag === "string") {
                parts.push(frag);
              } else if (frag.content_type === "text" && frag.text) {
                parts.push(frag.text);
              }
            }
          }
        }
      }
      if (parts.length > 0) {
        prompt = parts.join("\n\n");
      }
    }

    // Extract messages from assistant turn
    const messages: string[] = [];
    if (assistantTurn?.output_items) {
      for (const item of assistantTurn.output_items) {
        if (item.type === "message" && Array.isArray(item.content)) {
          for (const frag of item.content) {
            if (typeof frag === "string") {
              messages.push(frag);
            } else if (frag.content_type === "text" && frag.text) {
              messages.push(frag.text);
            }
          }
        }
      }
    }

    // Extract from worklog if available
    if (assistantTurn?.worklog?.messages) {
      for (const msg of assistantTurn.worklog.messages) {
        if (msg.author?.role === "assistant" && msg.content?.parts) {
          for (const part of msg.content.parts) {
            if (typeof part === "string") {
              messages.push(part);
            } else if (part.content_type === "text" && part.text) {
              messages.push(part.text);
            }
          }
        }
      }
    }

    const attemptStatus = this.parseAttemptStatus(assistantTurn?.turn_status);

    return {
      prompt,
      messages,
      turn_id: assistantTurn?.id,
      sibling_turn_ids: assistantTurn?.sibling_turn_ids ?? [],
      attempt_placement: assistantTurn?.attempt_placement,
      attempt_status: attemptStatus,
    };
  }

  private turnAttemptFromMap(turn: Record<string, unknown>): TurnAttempt | null {
    const turnId = turn.id as string | undefined;
    if (!turnId) return null;

    const attemptPlacement = turn.attempt_placement as number | undefined;
    const createdAt = turn.created_at as number | undefined;
    const turnStatus = turn.turn_status as string | undefined;
    
    // Extract diff from output_items
    let diff: string | undefined;
    const outputItems = turn.output_items as Array<Record<string, unknown>> | undefined;
    if (outputItems) {
      for (const item of outputItems) {
        const itemType = item.type as string;
        if (itemType === "output_diff" && item.diff) {
          diff = item.diff as string;
          break;
        }
        if (itemType === "pr") {
          const outputDiff = item.output_diff as Record<string, unknown> | undefined;
          if (outputDiff?.diff) {
            diff = outputDiff.diff as string;
            break;
          }
        }
      }
    }

    // Extract messages from output_items
    const messages: string[] = [];
    if (outputItems) {
      for (const item of outputItems) {
        if (item.type === "message") {
          const content = item.content as Array<Record<string, unknown>> | undefined;
          if (content) {
            for (const part of content) {
              if (part.content_type === "text" && part.text) {
                messages.push(part.text as string);
              }
            }
          }
        }
      }
    }

    return {
      turn_id: turnId,
      attempt_placement: attemptPlacement,
      created_at: createdAt ? new Date(createdAt * 1000).toISOString() : undefined,
      status: this.parseAttemptStatus(turnStatus),
      diff,
      messages,
    };
  }

  private parseAttemptStatus(status?: string): AttemptStatus {
    switch (status) {
      case "failed": return "failed";
      case "completed": return "completed";
      case "in_progress": return "in_progress";
      case "pending": return "pending";
      case "cancelled": return "cancelled";
      default: return "unknown";
    }
  }

  private isUnifiedDiff(diff: string): boolean {
    const trimmed = diff.trimStart();
    if (trimmed.startsWith("diff --git ")) {
      return true;
    }
    const hasDashHeaders = diff.includes("\n--- ") && diff.includes("\n+++ ");
    const hasHunk = diff.includes("\n@@ ") || diff.startsWith("@@ ");
    return hasDashHeaders && hasHunk;
  }

  private extractFilePathsFromDiff(diff: string): string[] {
    const paths: string[] = [];
    const lines = diff.split("\n");
    for (const line of lines) {
      if (line.startsWith("diff --git ")) {
        const match = line.match(/diff --git a\/(.+?) b\/(.+?)$/);
        if (match) {
          paths.push(match[2]);
        }
      } else if (line.startsWith("+++ b/")) {
        const path = line.slice(6);
        if (path !== "/dev/null" && !paths.includes(path)) {
          paths.push(path);
        }
      }
    }
    return paths;
  }
}

// Standalone function for quick environment listing
export async function listEnvironments(): Promise<CloudEnvironment[]> {
  const client = new CodexCloudClient();
  return client.listEnvironments();
}

export default CodexCloudClient;
