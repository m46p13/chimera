import { useCallback, useEffect, useMemo, useState } from "react";

type AutomationTask = {
  id: { id: string };
  title: string;
  status: string;
  updated_at?: number;
  summary?: {
    files_changed?: number;
    lines_added?: number;
    lines_removed?: number;
  };
};

type SidebarAutomationsProps = {
  onOpenCloudPanel?: () => void;
  variant?: "sidebar" | "page";
};

type TimelineStep = {
  id: string;
  label: string;
  kind: "thinking" | "tool" | "status";
};

const formatTimeAgo = (ts?: number) => {
  if (!ts) return "just now";
  const seconds = Math.max(1, Math.floor(Date.now() / 1000 - ts));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

export function SidebarAutomations({ onOpenCloudPanel, variant = "sidebar" }: SidebarAutomationsProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthed, setIsAuthed] = useState(false);
  const [tasks, setTasks] = useState<AutomationTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [details, setDetails] = useState<any | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffText, setDiffText] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!window.codex?.cloud) {
      setError("Cloud API unavailable.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const auth = await window.codex.cloud.checkAuth();
      if (!auth.success) {
        setError(auth.error || "Failed to check cloud auth.");
        setIsAuthed(false);
        setTasks([]);
        return;
      }

      if (!auth.isAuthenticated) {
        setIsAuthed(false);
        setTasks([]);
        return;
      }

      setIsAuthed(true);
      const list = await window.codex.cloud.listTasks();
      if (!list.success) {
        setError(list.error || "Failed to load cloud tasks.");
        setTasks([]);
        return;
      }

      const nextTasks = (list.tasks || []).slice(0, 12) as AutomationTask[];
      setTasks(nextTasks);
      if (nextTasks.length > 0 && !selectedTaskId) {
        setSelectedTaskId(nextTasks[0].id.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [selectedTaskId]);

  useEffect(() => {
    void fetchData();
    const interval = window.setInterval(() => void fetchData(), 30000);
    return () => window.clearInterval(interval);
  }, [fetchData]);

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id.id === selectedTaskId) ?? null,
    [tasks, selectedTaskId]
  );

  const fetchDetails = useCallback(async (taskId: string) => {
    if (!window.codex?.cloud?.getTaskDetails) return;
    setDetailsLoading(true);
    setDetailsError(null);
    try {
      const result = await window.codex.cloud.getTaskDetails(taskId);
      if (!result.success) {
        setDetailsError(result.error || "Failed to load task details.");
        setDetails(null);
        return;
      }
      setDetails(result.details ?? null);
    } catch (err) {
      setDetailsError(err instanceof Error ? err.message : String(err));
      setDetails(null);
    } finally {
      setDetailsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedTaskId) {
      setDetails(null);
      return;
    }
    void fetchDetails(selectedTaskId);
  }, [selectedTaskId, fetchDetails]);

  useEffect(() => {
    if (!selectedTaskId || !window.codex?.cloud?.getTaskDiff) {
      setDiffText(null);
      return;
    }

    let active = true;
    setDiffLoading(true);
    window.codex.cloud.getTaskDiff(selectedTaskId)
      .then((result) => {
        if (!active) return;
        if (!result.success) {
          setDiffText(null);
          return;
        }
        setDiffText(result.diff ?? null);
      })
      .catch(() => {
        if (active) setDiffText(null);
      })
      .finally(() => {
        if (active) setDiffLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedTaskId]);

  const timeline = useMemo<TimelineStep[]>(() => {
    if (!details?.current_assistant_turn) return [];
    const steps: TimelineStep[] = [];
    const turn = details.current_assistant_turn;
    const turnStatus = String(turn.turn_status || "unknown");
    steps.push({ id: "status", kind: "status", label: `Turn status: ${turnStatus}` });

    const messages = turn?.worklog?.messages;
    if (Array.isArray(messages)) {
      let index = 0;
      for (const msg of messages) {
        if (msg?.author?.role !== "assistant") continue;
        const parts = msg?.content?.parts || [];
        const text = parts
          .map((part: any) => (typeof part === "string" ? part : part?.text || ""))
          .filter(Boolean)
          .join(" ")
          .trim();
        if (!text) continue;

        const lower = text.toLowerCase();
        const kind: TimelineStep["kind"] =
          lower.includes("read(") || lower.includes("write(") || lower.includes("exec(") || lower.includes("edit(")
            ? "tool"
            : "thinking";

        steps.push({
          id: `step-${index++}`,
          kind,
          label: text.length > 220 ? `${text.slice(0, 220)}...` : text,
        });
      }
    }
    return steps.slice(0, 40);
  }, [details]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const task of tasks) {
      const key = (task.status || "unknown").toLowerCase();
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }, [tasks]);

  return (
    <div className={variant === "page" ? "automation-panel automation-panel-page" : "automation-panel"}>
      <div className="automation-header">
        <div>
          <div className="automation-title">Automations</div>
          <div className="automation-subtitle">Live cloud task runs</div>
        </div>
        <button className="ghost" onClick={() => void fetchData()} disabled={loading}>
          Refresh
        </button>
      </div>

      {!isAuthed && !loading && !error ? (
        <div className="automation-empty">
          <p>Sign in to Codex Cloud to run automations and scheduled workflows.</p>
          <button className="primary" onClick={onOpenCloudPanel}>
            Open Cloud Tasks
          </button>
        </div>
      ) : null}

      {error ? <div className="automation-error">{error}</div> : null}

      {isAuthed ? (
        <>
          <div className="automation-stats">
            <span className="automation-stat">Active: {statusCounts.in_progress || 0}</span>
            <span className="automation-stat">Pending: {statusCounts.pending || 0}</span>
            <span className="automation-stat">Ready: {statusCounts.ready || 0}</span>
          </div>

          <div className="automation-list">
            {loading && tasks.length === 0 ? (
              <div className="automation-empty">Loading tasks…</div>
            ) : tasks.length === 0 ? (
              <div className="automation-empty">No cloud tasks yet.</div>
            ) : (
              tasks.map((task) => (
                <button
                  key={task.id.id}
                  className={task.id.id === selectedTaskId ? "automation-item active" : "automation-item"}
                  onClick={() => setSelectedTaskId(task.id.id)}
                  title="Open detailed cloud task panel"
                >
                  <div className="automation-item-title">{task.title || "Untitled task"}</div>
                  <div className="automation-item-meta">
                    <span className={`automation-item-status status-${(task.status || "").toLowerCase()}`}>
                      {task.status}
                    </span>
                    <span>{formatTimeAgo(task.updated_at)}</span>
                    <span>{task.summary?.files_changed ?? 0} files</span>
                  </div>
                </button>
              ))
            )}
          </div>

          {variant === "page" ? (
            <div className="automation-detail">
              {!selectedTask ? (
                <div className="automation-empty">Select a task to inspect details.</div>
              ) : (
                <>
                  <div className="automation-detail-header">
                    <div className="automation-detail-title">{selectedTask.title || "Untitled task"}</div>
                    <button className="ghost" onClick={onOpenCloudPanel}>
                      Open Full Cloud View
                    </button>
                  </div>
                  <div className="automation-detail-meta">
                    <span>Status: {selectedTask.status}</span>
                    <span>Updated: {formatTimeAgo(selectedTask.updated_at)}</span>
                    <span>Files: {selectedTask.summary?.files_changed ?? 0}</span>
                    <span>+{selectedTask.summary?.lines_added ?? 0}</span>
                    <span>-{selectedTask.summary?.lines_removed ?? 0}</span>
                  </div>
                  {detailsError ? <div className="automation-error">{detailsError}</div> : null}
                  {detailsLoading ? (
                    <div className="automation-empty">Loading detail…</div>
                  ) : (
                    <>
                      <div className="automation-timeline">
                        {timeline.length === 0 ? (
                          <div className="automation-empty">No detailed progress yet.</div>
                        ) : (
                          timeline.map((step) => (
                            <div key={step.id} className={`automation-step step-${step.kind}`}>
                              <span className="automation-step-dot" />
                              <span className="automation-step-label">{step.label}</span>
                            </div>
                          ))
                        )}
                      </div>
                      <div className="automation-diff-block">
                        <div className="automation-diff-title">Diff Preview</div>
                        {diffLoading ? (
                          <div className="automation-empty">Loading diff…</div>
                        ) : diffText ? (
                          <pre className="automation-detail-json">{diffText}</pre>
                        ) : (
                          <div className="automation-empty">No diff available.</div>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
