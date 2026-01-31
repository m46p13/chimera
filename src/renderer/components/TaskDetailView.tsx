import { useEffect, useMemo, useState, useCallback } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { DiffView, type FileDiff } from "./DiffView";
import {
  selectedCloudTaskAtom,
  selectedTaskDiffAtom,
  cloudApplyingTaskIdAtom,
  cloudApplyOutcomeAtom,
  fetchCloudTasksAtom,
  applyCloudTaskAtom,
} from "../state/atoms/cloud";
import type { CodeTaskDetailsResponse, WorklogMessage, AttemptStatus } from "../main/cloud/types";

/**
 * Parse a unified diff string into FileDiff objects for the DiffView component.
 */
function parseUnifiedDiff(diffText: string): FileDiff[] {
  if (!diffText || !diffText.trim()) return [];

  const files: FileDiff[] = [];
  const lines = diffText.split("\n");
  let currentFile: FileDiff | null = null;
  let currentHunk: { id: string; header: string; lines: any[]; oldStart: number; oldLines: number; newStart: number; newLines: number } | null = null;
  let hunkCounter = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect file header: --- a/path or --- /dev/null
    if (line.startsWith("--- ")) {
      // Save previous file if exists
      if (currentFile && currentHunk) {
        currentFile.hunks.push(currentHunk);
        files.push(currentFile);
      }

      // Get the old file path
      const oldPath = line.slice(4).replace(/^a\//, "").replace(/\t.*$/, "");

      // Look for +++ line
      const nextLine = lines[i + 1];
      if (nextLine && nextLine.startsWith("+++ ")) {
        const newPath = nextLine.slice(4).replace(/^b\//, "").replace(/\t.*$/, "");
        i++; // Skip the +++ line

        // Determine kind
        let kind: "create" | "modify" | "delete" = "modify";
        if (oldPath === "/dev/null") {
          kind = "create";
        } else if (newPath === "/dev/null") {
          kind = "delete";
        }

        currentFile = {
          path: kind === "create" ? newPath : oldPath,
          kind,
          hunks: [],
        };
        currentHunk = null;
      }
      continue;
    }

    // Detect hunk header: @@ -1,4 +1,5 @@
    if (line.startsWith("@@") && currentFile) {
      // Save previous hunk
      if (currentHunk) {
        currentFile.hunks.push(currentHunk);
      }

      const match = line.match(/@@ -(\d+)(?:(\d+))? \+(\d+)(?:(\d+))? @@/);
      if (match) {
        currentHunk = {
          id: `hunk-${hunkCounter++}`,
          header: line,
          lines: [],
          oldStart: parseInt(match[1], 10),
          oldLines: parseInt(match[2] || "1", 10),
          newStart: parseInt(match[3], 10),
          newLines: parseInt(match[4] || "1", 10),
        };
      }
      continue;
    }

    // Process diff lines within a hunk
    if (currentHunk) {
      if (line.startsWith("-")) {
        currentHunk.lines.push({
          type: "remove",
          content: line.slice(1),
        });
      } else if (line.startsWith("+")) {
        currentHunk.lines.push({
          type: "add",
          content: line.slice(1),
        });
      } else if (line.startsWith(" ")) {
        currentHunk.lines.push({
          type: "context",
          content: line.slice(1),
        });
      } else if (line === "\\ No newline at end of file") {
        continue;
      }
    }
  }

  // Don't forget the last file and hunk
  if (currentFile) {
    if (currentHunk) {
      currentFile.hunks.push(currentHunk);
    }
    files.push(currentFile);
  }

  return files;
}

/**
 * Tool call types extracted from worklog messages
 */
type ToolCallType = "exec" | "read" | "write" | "edit" | "thinking" | "unknown";

interface ToolCall {
  id: string;
  type: ToolCallType;
  status: "started" | "streaming" | "done" | "error";
  args: string;
  details?: string;
  timestamp: number;
}

/**
 * Extract tool calls from worklog messages
 */
function extractToolCalls(details: CodeTaskDetailsResponse | null): ToolCall[] {
  if (!details?.current_assistant_turn?.worklog?.messages) return [];

  const messages = details.current_assistant_turn.worklog.messages;
  const toolCalls: ToolCall[] = [];
  let callCounter = 0;

  for (const msg of messages) {
    if (msg.author?.role !== "assistant") continue;
    
    const parts = msg.content?.parts;
    if (!parts || parts.length === 0) continue;

    // Extract text from parts
    const textParts: string[] = [];
    for (const part of parts) {
      if (typeof part === "string") {
        textParts.push(part);
      } else if (part?.content_type === "text" && part.text) {
        textParts.push(part.text);
      }
    }
    const fullText = textParts.join("\n");

    // Parse tool calls from the text
    // Look for patterns like: "exec("..., "read("..., etc.
    const toolPatterns = [
      { type: "exec" as const, regex: /exec\s*\(\s*["']([^"']+)["']/gi },
      { type: "read" as const, regex: /read\s*\(\s*["']([^"']+)["']/gi },
      { type: "write" as const, regex: /write\s*\(\s*["']([^"']+)["']/gi },
      { type: "edit" as const, regex: /edit\s*\(\s*["']([^"']+)["']/gi },
    ];

    for (const { type, regex } of toolPatterns) {
      let match;
      while ((match = regex.exec(fullText)) !== null) {
        toolCalls.push({
          id: `call-${callCounter++}`,
          type,
          status: "done", // We don't have real-time streaming from API, so mark as done
          args: match[1],
          details: undefined,
          timestamp: callCounter,
        });
      }
    }

    // Also check for thinking/analysis blocks
    if (fullText.includes("I'll help") || fullText.includes("Let me") || fullText.includes("I need to")) {
      // This is likely a planning/thinking message
      const existingThinking = toolCalls.find(tc => tc.type === "thinking" && tc.status === "streaming");
      if (!existingThinking) {
        toolCalls.push({
          id: `call-${callCounter++}`,
          type: "thinking",
          status: "done",
          args: "Planning approach...",
          details: fullText.slice(0, 200) + (fullText.length > 200 ? "..." : ""),
          timestamp: callCounter,
        });
      }
    }
  }

  return toolCalls;
}

/**
 * Get icon for tool type
 */
function getToolIcon(type: ToolCallType): string {
  switch (type) {
    case "exec": return "💻";
    case "read": return "📄";
    case "write": return "✍️";
    case "edit": return "📝";
    case "thinking": return "🤔";
    default: return "🔧";
  }
}

/**
 * Get status badge class based on task status
 */
function getStatusBadgeClass(status: string): string {
  switch (status) {
    case "pending":
    case "in_progress":
      return "cloud-status-pending";
    case "ready":
    case "completed":
      return "cloud-status-ready";
    case "applied":
      return "cloud-status-applied";
    case "error":
    case "failed":
      return "cloud-status-error";
    default:
      return "";
  }
}

/**
 * Format relative time from ISO string
 */
function formatTimeAgo(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

interface TaskDetailViewProps {
  onBack: () => void;
}

/**
 * TaskDetailView component - Full sidebar view for a selected task
 */
export function TaskDetailView({ onBack }: TaskDetailViewProps) {
  const selectedTask = useAtomValue(selectedCloudTaskAtom);
  const selectedDiff = useAtomValue(selectedTaskDiffAtom);
  const applyingTaskId = useAtomValue(cloudApplyingTaskIdAtom);
  const applyOutcome = useAtomValue(cloudApplyOutcomeAtom);
  
  const fetchTasks = useSetAtom(fetchCloudTasksAtom);
  const applyTask = useSetAtom(applyCloudTaskAtom);

  const [taskDetails, setTaskDetails] = useState<CodeTaskDetailsResponse | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [isDiffExpanded, setIsDiffExpanded] = useState(false);

  // Parse diff for display
  const fileDiffs = useMemo(() => {
    if (!selectedDiff) return [];
    return parseUnifiedDiff(selectedDiff);
  }, [selectedDiff]);

  // Extract tool calls from task details
  const toolCalls = useMemo(() => {
    return extractToolCalls(taskDetails);
  }, [taskDetails]);

  // Fetch task details on mount and poll for updates
  useEffect(() => {
    if (!selectedTask) return;

    let isMounted = true;

    async function fetchDetails() {
      if (!window.codex?.cloud?.getTaskDetails || !selectedTask) return;
      
      setDetailsLoading(true);
      try {
        const result = await window.codex.cloud.getTaskDetails(selectedTask.id.id);
        if (isMounted) {
          setTaskDetails(result);
        }
      } catch (err) {
        console.error("Failed to fetch task details:", err);
      } finally {
        if (isMounted) {
          setDetailsLoading(false);
        }
      }
    }

    fetchDetails();

    // Poll for updates if task is pending or in_progress
    const interval = setInterval(() => {
      const status = taskDetails?.current_assistant_turn?.turn_status;
      if (status === "pending" || status === "in_progress") {
        fetchDetails();
      }
    }, 3000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [selectedTask?.id.id]);

  // Handle apply task
  const handleApplyTask = useCallback(() => {
    if (selectedTask && !applyingTaskId) {
      applyTask(selectedTask.id.id);
    }
  }, [selectedTask, applyingTaskId, applyTask]);

  if (!selectedTask) {
    return (
      <div className="task-detail-view task-detail-empty">
        <span>No task selected</span>
      </div>
    );
  }

  const attemptStatus: AttemptStatus = taskDetails?.current_assistant_turn?.turn_status || "unknown";
  const displayStatus = selectedTask.status === "pending" && (attemptStatus === "in_progress" || attemptStatus === "pending") 
    ? "running" 
    : selectedTask.status;

  return (
    <div className="task-detail-view">
      {/* Header with back button */}
      <div className="task-detail-header">
        <button className="task-detail-back" onClick={onBack} title="Back to task list">
          ←
        </button>
        <div className="task-detail-title">
          <h3>{selectedTask.title}</h3>
          <span className={`task-detail-status ${getStatusBadgeClass(displayStatus)}`}>
            {displayStatus}
          </span>
        </div>
      </div>

      {/* Task metadata */}
      <div className="task-detail-meta">
        <span className="task-detail-time">
          Updated {formatTimeAgo(selectedTask.updated_at)}
        </span>
        <span className="task-detail-files">
          {selectedTask.summary.files_changed} file{selectedTask.summary.files_changed !== 1 ? "s" : ""}
        </span>
        {selectedTask.summary.lines_added > 0 && (
          <span className="task-detail-adds">+{selectedTask.summary.lines_added}</span>
        )}
        {selectedTask.summary.lines_removed > 0 && (
          <span className="task-detail-removes">-{selectedTask.summary.lines_removed}</span>
        )}
      </div>

      {/* Live progress section */}
      <div className="task-detail-progress">
        <h4 className="task-detail-section-title">Live Progress</h4>
        
        {detailsLoading && toolCalls.length === 0 ? (
          <div className="task-detail-progress-loading">
            <div className="cloud-spinner" />
            <span>Loading activity...</span>
          </div>
        ) : toolCalls.length === 0 ? (
          <div className="task-detail-progress-empty">
            <span>No activity recorded yet</span>
          </div>
        ) : (
          <div className="task-detail-tool-calls">
            {toolCalls.map((call) => (
              <div 
                key={call.id} 
                className={`tool-call tool-call-${call.type} tool-call-${call.status}`}
              >
                <div className="tool-call-header">
                  <span className="tool-call-icon">{getToolIcon(call.type)}</span>
                  <span className="tool-call-type">{call.type}</span>
                  <span className="tool-call-status">{call.status}</span>
                </div>
                <div className="tool-call-args">{call.args}</div>
                {call.details && (
                  <div className="tool-call-details">{call.details}</div>
                )}
              </div>
            ))}
            
            {/* Show streaming indicator if task is still running */}
            {(attemptStatus === "in_progress" || attemptStatus === "pending") && (
              <div className="tool-call tool-call-streaming">
                <div className="tool-call-header">
                  <span className="tool-call-icon">⚡</span>
                  <span className="tool-call-type">Working...</span>
                  <span className="streaming-indicator">
                    <span className="dot" />
                    <span className="dot" />
                    <span className="dot" />
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Diff preview - collapsible */}
      <div className="task-detail-diff">
        <button 
          className="task-detail-diff-toggle"
          onClick={() => setIsDiffExpanded(!isDiffExpanded)}
        >
          <span className="task-detail-diff-toggle-icon">
            {isDiffExpanded ? "▼" : "▶"}
          </span>
          <span className="task-detail-diff-toggle-text">
            Diff Preview ({fileDiffs.length} file{fileDiffs.length !== 1 ? "s" : ""})
          </span>
        </button>
        
        {isDiffExpanded && (
          <div className="task-detail-diff-content">
            {fileDiffs.length > 0 ? (
              <DiffView files={fileDiffs} mode="unified" />
            ) : selectedDiff === null ? (
              <div className="task-detail-diff-loading">
                <div className="cloud-spinner" />
                <span>Loading diff...</span>
              </div>
            ) : (
              <div className="task-detail-diff-empty">
                <p>No diff available for this task.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Apply section */}
      {selectedTask.status === "ready" && (
        <div className="task-detail-actions">
          <button
            className="primary task-detail-apply-btn"
            onClick={handleApplyTask}
            disabled={applyingTaskId === selectedTask.id.id}
          >
            {applyingTaskId === selectedTask.id.id ? "Applying..." : "Apply Changes"}
          </button>
        </div>
      )}

      {/* Apply Outcome */}
      {applyOutcome && (
        <div
          className={`task-detail-outcome ${
            applyOutcome.status === "success"
              ? "success"
              : applyOutcome.status === "partial"
              ? "partial"
              : "error"
          }`}
        >
          <div className="task-detail-outcome-message">{applyOutcome.message}</div>
          {applyOutcome.skipped_paths.length > 0 && (
            <div className="task-detail-outcome-details">
              <span>Skipped: {applyOutcome.skipped_paths.join(", ")}</span>
            </div>
          )}
          {applyOutcome.conflict_paths.length > 0 && (
            <div className="task-detail-outcome-details">
              <span>Conflicts: {applyOutcome.conflict_paths.join(", ")}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default TaskDetailView;
