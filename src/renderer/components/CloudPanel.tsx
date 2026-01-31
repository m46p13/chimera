import { useEffect, useState, useCallback } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { TaskDetailView } from "./TaskDetailView";
import {
  cloudTasksAtom,
  cloudTasksLoadingAtom,
  cloudTasksErrorAtom,
  selectedCloudTaskAtom,
  cloudEnvironmentAtom,
  cloudEnvironmentsAtom,
  cloudAuthStatusAtom,
  cloudNewTaskInputAtom,
  cloudCreatingTaskAtom,
  checkCloudAuthAtom,
  fetchCloudTasksAtom,
  selectCloudTaskAtom,
  createCloudTaskAtom,
  fetchCloudEnvironmentsAtom,
} from "../state/atoms/cloud";
import type { CloudEnvironment } from "../main/cloud/types";

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

/**
 * Get status badge class based on task status
 */
function getStatusBadgeClass(status: string): string {
  switch (status) {
    case "pending":
      return "cloud-status-pending";
    case "ready":
      return "cloud-status-ready";
    case "applied":
      return "cloud-status-applied";
    case "error":
      return "cloud-status-error";
    default:
      return "";
  }
}

/**
 * CloudPanel component - Main cloud tasks panel
 */
export function CloudPanel() {
  const [isMounted, setIsMounted] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // Atoms
  const tasks = useAtomValue(cloudTasksAtom);
  const loading = useAtomValue(cloudTasksLoadingAtom);
  const error = useAtomValue(cloudTasksErrorAtom);
  const selectedTask = useAtomValue(selectedCloudTaskAtom);
  const environment = useAtomValue(cloudEnvironmentAtom);
  const environments = useAtomValue(cloudEnvironmentsAtom);
  const authStatus = useAtomValue(cloudAuthStatusAtom);
  const newTaskInput = useAtomValue(cloudNewTaskInputAtom);
  const creatingTask = useAtomValue(cloudCreatingTaskAtom);

  // Setters
  const setEnvironment = useSetAtom(cloudEnvironmentAtom);
  const setNewTaskInput = useSetAtom(cloudNewTaskInputAtom);
  const checkAuth = useSetAtom(checkCloudAuthAtom);
  const fetchTasks = useSetAtom(fetchCloudTasksAtom);
  const selectTask = useSetAtom(selectCloudTaskAtom);
  const createTask = useSetAtom(createCloudTaskAtom);
  const fetchEnvironments = useSetAtom(fetchCloudEnvironmentsAtom);

  // Check auth on mount
  useEffect(() => {
    setIsMounted(true);
    checkAuth();
  }, [checkAuth]);

  // Fetch environments and tasks when authenticated
  useEffect(() => {
    if (authStatus.isAuthenticated && !authStatus.checking) {
      fetchEnvironments();
      fetchTasks();
    }
  }, [authStatus.isAuthenticated, authStatus.checking, fetchTasks, fetchEnvironments, environment]);

  // Auto-refresh tasks every 30 seconds
  useEffect(() => {
    if (!authStatus.isAuthenticated) return;

    const interval = setInterval(() => {
      fetchTasks();
    }, 30000);

    return () => clearInterval(interval);
  }, [authStatus.isAuthenticated, fetchTasks]);

  // Handle new task submission
  const handleSubmitNewTask = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (newTaskInput.trim() && !creatingTask) {
        createTask();
      }
    },
    [newTaskInput, creatingTask, createTask]
  );

  // Handle task selection - show detail view
  const handleSelectTask = useCallback((task: typeof tasks[0]) => {
    selectTask(task);
    setSelectedTaskId(task.id.id);
  }, [selectTask]);

  // Handle back button - return to task list
  const handleBack = useCallback(() => {
    setSelectedTaskId(null);
    selectTask(null);
  }, [selectTask]);

  // Show loading state while checking auth
  if (authStatus.checking) {
    return (
      <div className="cloud-panel">
        <div className="cloud-panel-loading">
          <div className="cloud-spinner" />
          <span>Checking authentication...</span>
        </div>
      </div>
    );
  }

  // Show auth required message
  if (!authStatus.isAuthenticated) {
    return (
      <div className="cloud-panel">
        <div className="cloud-panel-auth-required">
          <div className="cloud-auth-icon">☁️</div>
          <h3>Cloud Tasks</h3>
          <p>Run <code>codex login</code> in your terminal to authenticate with Codex Cloud.</p>
          <button className="ghost" onClick={() => checkAuth()}>
            Check again
          </button>
        </div>
      </div>
    );
  }

  // Show TaskDetailView when a task is selected
  if (selectedTaskId && selectedTask) {
    return (
      <div className="cloud-panel">
        <TaskDetailView onBack={handleBack} />
      </div>
    );
  }

  return (
    <div className="cloud-panel">
      {/* Header */}
      <div className="cloud-panel-header">
        <div className="cloud-header-left">
          <span className="cloud-panel-title">☁️ Cloud Tasks</span>
          <select
            className="cloud-env-select"
            value={environment}
            onChange={(e) => setEnvironment(e.target.value)}
          >
            {environments.length === 0 ? (
              <option value="default">Default Environment</option>
            ) : (
              environments.map((env: CloudEnvironment) => (
                <option key={env.id} value={env.id}>
                  {env.label || env.id}
                  {env.is_pinned ? " 📌" : ""}
                  {env.repo_hints ? ` (${env.repo_hints})` : ""}
                </option>
              ))
            )}
          </select>
        </div>
        <button
          className="ghost icon"
          onClick={() => fetchTasks()}
          disabled={loading}
          title="Refresh"
        >
          ↻
        </button>
      </div>

      {/* New Task Input */}
      <form className="cloud-new-task" onSubmit={handleSubmitNewTask}>
        <input
          type="text"
          className="cloud-new-task-input"
          placeholder="Describe a new task..."
          value={newTaskInput}
          onChange={(e) => setNewTaskInput(e.target.value)}
          disabled={creatingTask}
        />
        <button
          type="submit"
          className="primary"
          disabled={!newTaskInput.trim() || creatingTask}
        >
          {creatingTask ? "Creating..." : "New Task"}
        </button>
      </form>

      {/* Error Message */}
      {error && (
        <div className="cloud-error">
          <span>⚠️ {error}</span>
          <button className="ghost icon" onClick={() => fetchTasks()}>
            Retry
          </button>
        </div>
      )}

      {/* Task List */}
      <div className="cloud-task-list">
        {loading && tasks.length === 0 ? (
          <div className="cloud-loading">
            <div className="cloud-spinner" />
            <span>Loading tasks...</span>
          </div>
        ) : tasks.length === 0 ? (
          <div className="cloud-empty">
            <span className="cloud-empty-icon">📋</span>
            <p>No tasks yet.</p>
            <p className="cloud-empty-hint">Create your first task above.</p>
          </div>
        ) : (
          tasks.map((task) => (
            <button
              key={task.id.id}
              className={`cloud-task-item ${
                selectedTask?.id.id === task.id.id ? "active" : ""
              }`}
              onClick={() => handleSelectTask(task)}
            >
              <div className="cloud-task-header">
                <span className="cloud-task-title">{task.title}</span>
                <span
                  className={`cloud-task-status ${getStatusBadgeClass(
                    task.status
                  )}`}
                >
                  {task.status}
                </span>
              </div>
              <div className="cloud-task-meta">
                <span className="cloud-task-files">
                  {task.summary.files_changed} file
                  {task.summary.files_changed !== 1 ? "s" : ""}
                </span>
                {task.summary.lines_added > 0 && (
                  <span className="cloud-task-adds">
                    +{task.summary.lines_added}
                  </span>
                )}
                {task.summary.lines_removed > 0 && (
                  <span className="cloud-task-removes">
                    -{task.summary.lines_removed}
                  </span>
                )}
                <span className="cloud-task-time">
                  {formatTimeAgo(task.updated_at)}
                </span>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export default CloudPanel;
