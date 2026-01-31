import { atom } from "jotai";
import type { TaskSummary, TaskText, ApplyOutcome, CloudEnvironment } from "../../main/cloud/types";

// Cloud tasks state
export const cloudTasksAtom = atom<TaskSummary[]>([]);
export const cloudTasksLoadingAtom = atom<boolean>(false);
export const cloudTasksErrorAtom = atom<string | null>(null);

// Currently selected task
export const selectedCloudTaskAtom = atom<TaskSummary | null>(null);
export const selectedTaskDiffAtom = atom<string | null>(null);
export const selectedTaskTextAtom = atom<TaskText | null>(null);

// Environment selection
export const cloudEnvironmentAtom = atom<string>("default");
export const cloudEnvironmentsAtom = atom<CloudEnvironment[]>([]);
export const cloudEnvironmentsLoadingAtom = atom<boolean>(false);
export const cloudEnvironmentsErrorAtom = atom<string | null>(null);

// Auth status
export const cloudAuthStatusAtom = atom<{ isAuthenticated: boolean; checking: boolean }>({
  isAuthenticated: false,
  checking: true,
});

// Applying state
export const cloudApplyingTaskIdAtom = atom<string | null>(null);
export const cloudApplyOutcomeAtom = atom<ApplyOutcome | null>(null);

// New task input
export const cloudNewTaskInputAtom = atom<string>("");
export const cloudCreatingTaskAtom = atom<boolean>(false);

// Action: Check auth status
export const checkCloudAuthAtom = atom(null, async (get, set) => {
  set(cloudAuthStatusAtom, { isAuthenticated: false, checking: true });
  try {
    if (!window.codex?.cloud?.checkAuth) {
      set(cloudAuthStatusAtom, { isAuthenticated: false, checking: false });
      return;
    }
    const result = await window.codex.cloud.checkAuth();
    set(cloudAuthStatusAtom, {
      isAuthenticated: result.success && result.isAuthenticated,
      checking: false,
    });
  } catch (err) {
    set(cloudAuthStatusAtom, { isAuthenticated: false, checking: false });
  }
});

// Internal function to fetch tasks (shared logic)
async function fetchCloudTasks(get: any, set: any) {
  const envId = get(cloudEnvironmentAtom);
  set(cloudTasksLoadingAtom, true);
  set(cloudTasksErrorAtom, null);
  try {
    if (!window.codex?.cloud?.listTasks) {
      throw new Error("Cloud API not available");
    }
    const result = await window.codex.cloud.listTasks(envId === "default" ? undefined : envId);
    if (result.success && result.tasks) {
      set(cloudTasksAtom, result.tasks);
    } else {
      set(cloudTasksErrorAtom, result.error || "Failed to fetch tasks");
    }
  } catch (err) {
    set(cloudTasksErrorAtom, err instanceof Error ? err.message : String(err));
  } finally {
    set(cloudTasksLoadingAtom, false);
  }
}

// Action: Fetch tasks
export const fetchCloudTasksAtom = atom(null, async (get, set) => {
  await fetchCloudTasks(get, set);
});

// Action: Select task and fetch diff
export const selectCloudTaskAtom = atom(null, async (get, set, task: TaskSummary | null) => {
  set(selectedCloudTaskAtom, task);
  set(selectedTaskDiffAtom, null);
  set(selectedTaskTextAtom, null);
  set(cloudApplyOutcomeAtom, null);

  if (!task || !window.codex?.cloud?.getTaskDiff) return;

  try {
    const [diffResult, textResult] = await Promise.all([
      window.codex.cloud.getTaskDiff(task.id.id),
      window.codex.cloud.getTaskText?.(task.id.id),
    ]);

    if (diffResult.success) {
      set(selectedTaskDiffAtom, diffResult.diff || null);
    }
    if (textResult?.success) {
      set(selectedTaskTextAtom, textResult.text || null);
    }
  } catch (err) {
    console.error("Failed to fetch task details:", err);
  }
});

// Action: Create new task
export const createCloudTaskAtom = atom(null, async (get, set) => {
  const prompt = get(cloudNewTaskInputAtom).trim();
  if (!prompt) return;

  const envId = get(cloudEnvironmentAtom);
  set(cloudCreatingTaskAtom, true);

  try {
    if (!window.codex?.cloud?.createTask) {
      throw new Error("Cloud API not available");
    }

    // Get current git ref from active thread or use "main"
    const gitRef = "main"; // TODO: Get from active thread

    const result = await window.codex.cloud.createTask({
      envId: envId === "default" ? "default" : envId,
      prompt,
      gitRef,
    });

    if (result.success && result.task) {
      set(cloudNewTaskInputAtom, "");
      // Refresh tasks list
      await fetchCloudTasks(get, set);
    } else {
      set(cloudTasksErrorAtom, result.error || "Failed to create task");
    }
  } catch (err) {
    set(cloudTasksErrorAtom, err instanceof Error ? err.message : String(err));
  } finally {
    set(cloudCreatingTaskAtom, false);
  }
});

// Action: Apply task
export const applyCloudTaskAtom = atom(null, async (get, set, taskId: string) => {
  set(cloudApplyingTaskIdAtom, taskId);
  set(cloudApplyOutcomeAtom, null);

  try {
    if (!window.codex?.cloud?.applyTask) {
      throw new Error("Cloud API not available");
    }

    const result = await window.codex.cloud.applyTask({ taskId });

    if (result.success && result.outcome) {
      set(cloudApplyOutcomeAtom, result.outcome);
      // Refresh tasks to update status
      await fetchCloudTasks(get, set);
    } else {
      set(cloudTasksErrorAtom, result.error || "Failed to apply task");
    }
  } catch (err) {
    set(cloudTasksErrorAtom, err instanceof Error ? err.message : String(err));
  } finally {
    set(cloudApplyingTaskIdAtom, null);
  }
});

// Action: Fetch environments
export const fetchCloudEnvironmentsAtom = atom(null, async (get, set) => {
  set(cloudEnvironmentsLoadingAtom, true);
  set(cloudEnvironmentsErrorAtom, null);
  try {
    if (!window.codex?.cloud?.listEnvironments) {
      throw new Error("Cloud API not available");
    }
    const result = await window.codex.cloud.listEnvironments();
    if (result.success && result.environments) {
      // Sort: pinned first, then by label, then by id
      const sorted = result.environments.sort((a, b) => {
        // Pinned first
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        // Then by label (case-insensitive)
        const aLabel = (a.label || "").toLowerCase();
        const bLabel = (b.label || "").toLowerCase();
        if (aLabel !== bLabel) return aLabel.localeCompare(bLabel);
        // Then by id
        return a.id.localeCompare(b.id);
      });
      set(cloudEnvironmentsAtom, sorted);
    } else {
      set(cloudEnvironmentsErrorAtom, result.error || "Failed to fetch environments");
    }
  } catch (err) {
    set(cloudEnvironmentsErrorAtom, err instanceof Error ? err.message : String(err));
  } finally {
    set(cloudEnvironmentsLoadingAtom, false);
  }
});
