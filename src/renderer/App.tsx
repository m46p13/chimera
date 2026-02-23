import React, { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";

// Import components
import { SplitLayout } from "./components/SplitLayout";
import { UpdateNotification } from "./components/UpdateNotification";
import { WorkspaceSwitcher } from "./components/WorkspaceSwitcher";

// Import hooks
import { useKeyboardShortcuts, type Command, useDebounce, useThreadCache, useIdleDetection, useRateLimitSync } from "./hooks";

// Import atoms
import {
  threadIdsAtom,
  threadAtomFamily,
  activeThreadIdAtom,
  pinnedThreadIdsAtom,
  archivedThreadIdsAtom,
  threadsArrayAtom,
  activeThreadAtom,
  pinnedThreadsAtom,
  archivedThreadsAtom,
  regularThreadsAtom,
  workspaceReadyAtom,
} from "./state/atoms/threads";
import { threadDetailAtomFamily } from "./state/atoms/threadDetails";
import { inputAtom } from "./state/atoms/drafts";
import {
  codexStatusAtom,
  modelsAtom,
  modelLoadingAtom,
  modelErrorAtom,
  selectedModelIdAtom,
  selectedEffortAtom,
  selectedApprovalPresetIdAtom,
  activeModelAtom,
  effortOptionsAtom,
  approvalPresetsAtom,
  activeApprovalPresetAtom,
  lastUsedModelIdAtom,
  themeAtom,
  type Theme,
} from "./state/atoms/settings";
import {
  sidebarWidthAtom,
  inspectorWidthAtom,
  browserChatWidthAtom,
  activeTabAtom,
  browserModeAtom,
  openMenuAtom,
  historyLoadedAtom,
  stderrLinesAtom,
  MAX_ACTIVITY,
  MAX_STDERR,
} from "./state/atoms/ui";
import {
  splitViewEnabledAtom,
  saveAllFilesAtom,
  openFileAtom,
} from "./state/atoms/editor";

// Import types
import type {
  ThreadSummary,
  Message,
  ActivityItem,
  ApprovalRequest,
  CodexStatus,
  ThreadDetailState,
  TaskBoardCard,
  TaskBoardColumn,
  TaskBoardKind,
} from "./state/types";
import { getEmptyThreadDetailState } from "./state/types";

// Performance measurement polyfill for older browsers
if (typeof performance === 'undefined') {
  (globalThis as any).performance = {
    mark: () => {},
    measure: () => {},
    getEntriesByName: () => [],
    clearMarks: () => {},
    clearMeasures: () => {},
  };
}

// Import database utilities
import {
  dbThreads,
  dbMessages,
  dbSettings,
  toThreadSummary,
  fromThreadSummary,
  type DbThread,
} from "./state/db";

const CommandPalette = lazy(() => import("./components/CommandPalette"));
const DiffPanel = lazy(() => import("./components/DiffPanel"));
const BrowserPanel = lazy(() => import("./components/BrowserPanel"));
const CloudPanel = lazy(() => import("./components/CloudPanel"));
const Settings = lazy(() => import("./components/Settings"));
const MarkdownContent = lazy(() => import("./components/MarkdownContent"));
const SidebarSkills = lazy(async () => {
  const module = await import("./components/SidebarSkills");
  return { default: module.SidebarSkills };
});
const SidebarAutomations = lazy(async () => {
  const module = await import("./components/SidebarAutomations");
  return { default: module.SidebarAutomations };
});
const SidebarTaskBoard = lazy(() => import("./components/SidebarTaskBoard"));
const SidebarSemanticSearch = lazy(() => import("./components/SidebarSemanticSearch"));
const TaskBoard = lazy(() => import("./components/TaskBoard"));
const WelcomeScreen = lazy(async () => {
  const module = await import("./components/WelcomeScreen");
  return { default: module.WelcomeScreen };
});
const TerminalPanel = lazy(async () => {
  const module = await import("./components/Terminal");
  return { default: module.TerminalPanel };
});

// Memory limit constants to prevent unbounded growth
const MAX_ITEMS_BY_ID = 500;        // Max items stored per thread
const MAX_COMMAND_OUTPUT = 50;      // Max command outputs stored
const MAX_OUTPUT_LENGTH = 100000;   // Max characters per output
const CHAT_BOTTOM_THRESHOLD = 48;
const CHAT_VIRTUALIZE_MIN_ITEMS = 120;
const CHAT_VIRTUAL_OVERSCAN_PX = 480;
const TASKBOARD_STORAGE_KEY = "taskboard.cards.v1";

const LazyPanelFallback = ({ label = "Loading..." }: { label?: string }) => (
  <div className="lazy-panel-fallback">{label}</div>
);

const LazyOverlayFallback = ({ label = "Loading..." }: { label?: string }) => (
  <div className="lazy-overlay-fallback">{label}</div>
);

// Utility functions
const formatTime = (value: number) =>
  new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const cloudStatusToColumn = (status?: string): TaskBoardColumn => {
  const value = String(status || "").toLowerCase();
  if (value === "applied" || value === "completed") return "done";
  if (value === "ready") return "review";
  if (value === "in_progress" || value === "running" || value === "pending") return "running";
  if (value === "error" || value === "failed") return "blocked";
  return "backlog";
};

const getProjectName = (thread: ThreadSummary) => {
  if (thread.cwd) {
    const parts = thread.cwd.split("/").filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return thread.preview || "Untitled";
};

const mapThread = (row: any): ThreadSummary => ({
  id: row.id,
  preview: row.preview || "Untitled workspace",
  createdAt: row.createdAt ?? row.created_at ?? 0,
  updatedAt: row.updatedAt ?? row.updated_at ?? 0,
  modelProvider: row.modelProvider ?? row.model_provider ?? "openai",
  cwd: row.cwd ?? null,
  gitInfo: row.gitInfo ?? row.git_info ?? null,
});

const normalizeModel = (raw: any) => {
  const id = raw?.id ?? raw?.model ?? raw?.name ?? "unknown";
  return {
    id,
    model: raw?.model ?? id,
    displayName: raw?.displayName ?? raw?.display_name ?? raw?.label ?? id,
    description: raw?.description,
    supportedReasoningEfforts:
      raw?.supportedReasoningEfforts ?? raw?.supported_reasoning_efforts ?? raw?.reasoningEfforts ?? [],
    defaultReasoningEffort: raw?.defaultReasoningEffort ?? raw?.default_reasoning_effort ?? null,
    isDefault: Boolean(raw?.isDefault ?? raw?.is_default),
  };
};

const sandboxModeToPolicy = (mode: string | undefined) => {
  if (!mode) return undefined;
  if (mode === "readOnly") return { type: "readOnly" };
  if (mode === "dangerFullAccess") return { type: "dangerFullAccess" };
  return { type: "workspaceWrite" };
};

const sandboxModeToThreadParam = (mode: string | undefined) => {
  if (!mode) return undefined;
  if (mode === "readOnly") return "read-only";
  if (mode === "dangerFullAccess") return "danger-full-access";
  return "workspace-write";
};

const sandboxPolicyToMode = (sandbox: any): string | undefined => {
  if (!sandbox) return undefined;
  if (sandbox.type === "readOnly") return "readOnly";
  if (sandbox.type === "dangerFullAccess") return "dangerFullAccess";
  if (sandbox.type === "workspaceWrite") return "workspaceWrite";
  return undefined;
};

const truncate = (value: string, length = 180) =>
  value.length > length ? `${value.slice(0, length)}…` : value;

const formatCommand = (command: any) => {
  if (!command) return "command";
  if (Array.isArray(command)) return command.join(" ");
  return String(command);
};

const formatDuration = (durationMs?: number) => {
  if (durationMs === undefined) return null;
  if (durationMs < 1000) return `${durationMs}ms`;
  const seconds = durationMs / 1000;
  return seconds < 10 ? `${seconds.toFixed(1)}s` : `${Math.round(seconds)}s`;
};

const trimOutputLines = (output: string, limit = 12): { lines: string[]; omitted: number } => {
  const lines = output.split(/\r?\n/).filter((line, idx, arr) => !(line === "" && idx === arr.length - 1));
  if (lines.length <= limit) return { lines, omitted: 0 };
  const omitted = lines.length - limit;
  return { lines: [`... +${omitted} lines`, ...lines.slice(-limit)], omitted };
};

const buildSemanticContextBlock = (
  hits: SemanticSearchHit[],
  pinned: string[]
): string => {
  const lines: string[] = [];

  if (hits.length > 0) {
    lines.push("Retrieved context from your workspace:");
    hits.slice(0, 4).forEach((hit, index) => {
      const snippet = hit.snippet.replace(/\s+/g, " ").trim().slice(0, 320);
      lines.push(
        `${index + 1}. ${hit.path}:${hit.startLine}-${hit.endLine} (${hit.source}, score ${hit.score.toFixed(2)})`
      );
      if (snippet) {
        lines.push(`   ${snippet}`);
      }
    });
  }

  if (pinned.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push("Pinned context notes:");
    pinned.slice(0, 4).forEach((entry, index) => {
      lines.push(`${index + 1}. ${entry}`);
    });
  }

  if (lines.length === 0) return "";

  return [
    "[Chimera Semantic Context]",
    "Use this as supporting context, and verify against real files/tools before finalizing changes.",
    ...lines,
    "[/Chimera Semantic Context]",
  ].join("\\n");
};

const getThreadUpdatedAt = (thread: ThreadSummary) => thread.updatedAt || thread.createdAt || 0;

const getThreadSearchText = (thread: ThreadSummary) => {
  return [getProjectName(thread), thread.preview, thread.cwd, thread.gitInfo?.branch].filter(Boolean).join(" ").toLowerCase();
};

type ChatListItem =
  | { key: string; kind: "empty" }
  | { key: string; kind: "message"; message: Message }
  | { key: string; kind: "approval"; approval: ApprovalRequest }
  | { key: string; kind: "thinking" };

const estimateChatItemHeight = (item: ChatListItem): number => {
  if (item.kind === "empty") return 180;
  if (item.kind === "thinking") return 40;
  if (item.kind === "approval") return 132;
  const chars = item.message.text?.length ?? 0;
  const lines = Math.max(1, Math.ceil(chars / 72));
  const base = item.message.role === "user" ? 36 : 28;
  return Math.min(560, Math.max(56, base + lines * 22));
};

// Extract first **bold** header from reasoning text (like TUI does)
const extractFirstBold = (text: string): string | null => {
  const match = text.match(/\*\*(.+?)\*\*/);
  if (match?.[1]) {
    const trimmed = match[1].trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
};

// Parse command to human-readable action (like TUI)
const parseCommandAction = (cmd: string): string => {
  // Strip shell wrapper
  const inner = cmd.replace(/^\/bin\/[a-z]+\s+-[a-z]+\s+['"]?/i, "").replace(/['"]$/, "");

  // Detect action type
  if (/^ls\b/.test(inner)) return `List ${inner.replace(/^ls\s*/, "") || "."}`;
  if (/^cat\b/.test(inner)) return `Read ${inner.replace(/^cat\s*/, "")}`;
  if (/^head\b|^tail\b|^sed\s+-n/.test(inner)) {
    const file = inner.match(/['"]?([^'"\s]+)['"]?\s*$/)?.[1] || "";
    return `Read ${file}`;
  }
  if (/^rg\b|^grep\b/.test(inner)) {
    const query = inner.match(/['"]([^'"]+)['"]/)?.[1] || inner.split(/\s+/)[1] || "";
    return `Search ${query}`;
  }
  if (/^find\b/.test(inner)) return `Find files`;
  if (/^mkdir\b/.test(inner)) return `Create directory`;
  if (/^rm\b/.test(inner)) return `Delete`;
  if (/^mv\b/.test(inner)) return `Move`;
  if (/^cp\b/.test(inner)) return `Copy`;
  if (/^echo\b.*>/.test(inner) || /^cat\b.*>/.test(inner)) return `Write file`;

  // Default: show abbreviated command
  return inner.length > 50 ? inner.slice(0, 50) + "…" : inner;
};

const summarizeActions = (actions: any): string[] => {
  if (!Array.isArray(actions)) return [];
  return actions
    .map((action) => {
      if (!action || typeof action !== "object") return "";
      const record = action as Record<string, unknown>;
      const type = typeof record.type === "string" ? record.type : "run";
      const lower = type.toLowerCase();
      const verb = lower.includes("list") ? "List" : lower.includes("read") ? "Read" : lower.includes("search") ? "Search" : lower.includes("write") ? "Write" : "Run";
      const target = (typeof record.path === "string" && record.path) || (typeof record.query === "string" && record.query) || (typeof record.command === "string" && record.command) || "";
      return target ? `${verb} ${target}` : verb;
    })
    .filter(Boolean);
};

const findLeadingBoldHeader = (text: string) => {
  const start = text.indexOf("**");
  if (start === -1) return null;
  if (text.slice(0, start).trim().length > 0) return null;
  const end = text.indexOf("**", start + 2);
  if (end === -1) return null;
  const tail = text.slice(end + 2);
  if (!/^\s*(\r?\n|$)/.test(tail)) return null;
  const header = text.slice(start + 2, end).trim();
  if (!header.length) return null;
  return { header, start, end: end + 2 };
};

const stripBoldHeader = (content: string, match: { header: string; start: number; end: number }) => {
  const before = content.slice(0, match.start);
  const after = content.slice(match.end);
  const trimmedBefore = before.trimEnd();
  const trimmedAfter = after.trimStart();
  if (!trimmedBefore) return trimmedAfter;
  if (!trimmedAfter) return trimmedBefore;
  const beforeHasBreak = before.endsWith("\n");
  const afterHasBreak = after.startsWith("\n");
  const separator = beforeHasBreak || afterHasBreak ? "\n" : "\n\n";
  return `${trimmedBefore}${separator}${trimmedAfter}`;
};

type ActivityRenderItem = ActivityItem;

// No grouping - just filter out token items
const filterActivityItems = (items: ActivityItem[]): ActivityRenderItem[] => {
  return items.filter((item) => item.kind !== "token");
};

const summarizeItemEvent = (item: any, phase: "started" | "completed") => {
  if (!item?.type) return null;
  if (item.type === "commandExecution") {
    const cmd = formatCommand(item.command);
    const exitCode = item.exitCode ?? item.exit_code;
    const status = phase === "started" ? "running" : exitCode !== undefined && exitCode !== null && exitCode !== 0 ? "error" : "completed";
    return { kind: "command", itemId: item.id, status, title: "Command", command: cmd, actions: summarizeActions(item.commandActions ?? item.command_actions ?? item.actions), cwd: item.cwd, durationMs: item.durationMs ?? item.duration_ms, exitCode } as const;
  }
  if (item.type === "fileChange") {
    const count = item.changes?.length ?? 0;
    return { kind: "file", itemId: item.id, title: phase === "started" ? "File changes proposed" : "File changes applied", meta: [`${count} file${count === 1 ? "" : "s"}`] } as const;
  }
  if (item.type === "mcpToolCall") {
    const tool = [item.server, item.tool].filter(Boolean).join(" · ");
    return { kind: "tool", itemId: item.id, status: phase === "started" ? "running" : item.status === "error" ? "error" : "completed", title: "Tool call", command: tool || item.tool, detail: item.status ? String(item.status) : undefined } as const;
  }
  if (item.type === "collabAgentToolCall") {
    return { kind: "tool", itemId: item.id, status: phase === "started" ? "running" : "completed", title: "Agent tool", command: String(item.tool || "collab"), detail: item.prompt ? truncate(String(item.prompt)) : undefined } as const;
  }
  if (item.type === "reasoning") {
    const summary = item.summary ?? item.content ?? "";
    return { kind: "thinking", itemId: item.id, status: phase === "started" ? "running" : "completed", title: "Thinking", detail: summary ? String(summary) : undefined } as const;
  }
  // Don't show assistant messages in activity - they're already in chat
  if (item.type === "agentMessage") {
    return null;
  }
  return null;
};

const summarizeNotification = (method: string, params: any) => {
  if (method === "turn/plan/updated") {
    const steps = Array.isArray(params?.plan)
      ? params.plan.map((step: any) => {
          if (!step || typeof step !== "object") return null;
          const label = typeof step.step === "string" ? step.step : "";
          const status = typeof step.status === "string" ? step.status : undefined;
          return label ? { label, status } : null;
        }).filter(Boolean)
      : [];
    return { kind: "plan", title: "Plan update", steps: steps as Array<{ label: string; status?: string }> };
  }
  if (method === "thread/tokenUsage/updated") {
    const usage = params?.tokenUsage ?? params?.token_usage ?? params?.usage;
    const last = usage?.last ?? usage;
    const tokenUsage = last && typeof last === "object"
      ? { inputTokens: (last as any).inputTokens ?? (last as any).input_tokens, outputTokens: (last as any).outputTokens ?? (last as any).output_tokens, reasoningOutputTokens: (last as any).reasoningOutputTokens ?? (last as any).reasoning_output_tokens, totalTokens: (last as any).totalTokens ?? (last as any).total_tokens }
      : undefined;
    const hasUsage = Boolean(tokenUsage && (tokenUsage.inputTokens !== undefined || tokenUsage.outputTokens !== undefined || tokenUsage.reasoningOutputTokens !== undefined || tokenUsage.totalTokens !== undefined));
    if (!hasUsage) return null;
    return { kind: "token", title: "Token usage", tokenUsage };
  }
  return null;
};

const inferApprovalPresetId = (approvalPolicy?: string | null, sandboxMode?: string | null) => {
  const presets = [
    { id: "read-only" as const, approvalPolicy: "on-request", sandboxMode: "readOnly" },
    { id: "agent" as const, approvalPolicy: "on-request", sandboxMode: "workspaceWrite" },
    { id: "full-access" as const, approvalPolicy: "never", sandboxMode: "dangerFullAccess" },
  ];
  const match = presets.find((preset) => preset.approvalPolicy === approvalPolicy && preset.sandboxMode === sandboxMode);
  return match?.id ?? "agent";
};

// Main App Component
export default function App() {
  // Performance: Initialize thread cache for fast switching
  const threadCache = useThreadCache();

  // Performance: Idle detection for reducing background work
  const { isIdle } = useIdleDetection({
    onIdle: () => {
      // When idle, trim the cache to save memory
      threadCache.trim();
    },
  });

  // Performance: Debounced thread selection to prevent rapid switches
  const { call: debouncedSelectThread, cancel: cancelDebouncedSelect } = useDebounce(
    async (threadId: string) => {
      await performSelectThread(threadId);
    },
    { waitMs: 50, leading: false, trailing: true }
  );

  // Sync rate limits from main process
  useRateLimitSync();

  // Theme
  const [theme, setTheme] = useAtom(themeAtom);

  // Split view
  const [splitViewEnabled, setSplitViewEnabled] = useAtom(splitViewEnabledAtom);
  const saveAllFiles = useSetAtom(saveAllFilesAtom);
  const openFileInEditor = useSetAtom(openFileAtom);

  // Apply theme class to html element
  useEffect(() => {
    const html = document.documentElement;
    html.classList.remove("theme-light", "theme-dark");
    html.classList.add(`theme-${theme}`);
  }, [theme]);

  // Atoms
  const [status, setStatus] = useAtom(codexStatusAtom);
  const [threadIds, setThreadIds] = useAtom(threadIdsAtom);
  const threads = useAtomValue(threadsArrayAtom);
  const pinnedThreads = useAtomValue(pinnedThreadsAtom);
  const archivedThreads = useAtomValue(archivedThreadsAtom);
  const regularThreads = useAtomValue(regularThreadsAtom);
  const [activeThreadId, setActiveThreadId] = useAtom(activeThreadIdAtom);
  const activeThread = useAtomValue(activeThreadAtom);
  // workspaceReady is derived from pendingThreadUpdates instead of atoms
  // since atomFamily updates don't propagate properly
  const [pinnedIds, setPinnedIds] = useAtom(pinnedThreadIdsAtom);
  const [archivedIds, setArchivedIds] = useAtom(archivedThreadIdsAtom);
  const [input, setInput] = useAtom(inputAtom);
  const [models, setModels] = useAtom(modelsAtom);
  const [modelLoading, setModelLoading] = useAtom(modelLoadingAtom);
  const [modelError, setModelError] = useAtom(modelErrorAtom);
  const [selectedModelId, setSelectedModelId] = useAtom(selectedModelIdAtom);
  const [selectedEffort, setSelectedEffort] = useAtom(selectedEffortAtom);
  const [approvalPresetId, setApprovalPresetId] = useAtom(selectedApprovalPresetIdAtom);
  const activeModel = useAtomValue(activeModelAtom);
  const effortOptions = useAtomValue(effortOptionsAtom);
  const approvalPresets = useAtomValue(approvalPresetsAtom);
  const activeApprovalPreset = useAtomValue(activeApprovalPresetAtom);
  const [sidebarWidth, setSidebarWidth] = useAtom(sidebarWidthAtom);
  const [inspectorWidth, setInspectorWidth] = useAtom(inspectorWidthAtom);
  const [browserChatWidth, setBrowserChatWidth] = useAtom(browserChatWidthAtom);
  const [activeTab, setActiveTab] = useAtom(activeTabAtom);
  const [browserMode, setBrowserMode] = useAtom(browserModeAtom);
  const [openMenu, setOpenMenu] = useAtom(openMenuAtom);
  const [historyLoaded, setHistoryLoaded] = useAtom(historyLoadedAtom);
  const [stderrLines, setStderrLines] = useAtom(stderrLinesAtom);
  const setLastUsedModelId = useSetAtom(lastUsedModelIdAtom);

  // MCP Browser tools state
  const [mcpTools, setMcpTools] = useState<McpTool[]>([]);
  const [mcpReady, setMcpReady] = useState(false);

  // Note: Sessions are now workspaces - each session is tied to a folder

  // Get/set thread detail for active thread
  const activeDetailAtom = useMemo(
    () => (activeThreadId ? threadDetailAtomFamily(activeThreadId) : null),
    [activeThreadId]
  );
  const [activeDetail, setActiveDetail] = useAtom(
    activeDetailAtom ?? threadDetailAtomFamily("__placeholder__")
  );
  const detail = activeThreadId ? activeDetail : getEmptyThreadDetailState();

  // Destructure detail state
  const messages = detail.messages;
  const activity = detail.activity;
  const itemsById = detail.itemsById;
  const itemSequence = detail.itemSequence;
  const commandOutputById = detail.commandOutputById;
  const fileChangeOutputById = detail.fileChangeOutputById;
  const turnDiff = detail.turnDiff;
  const pendingApprovals = detail.pendingApprovals;
  const activeTurnId = detail.activeTurnId;
  const statusHeader = detail.statusHeader;

  const approvalPolicy = activeApprovalPreset.approvalPolicy;
  const sandboxMode = activeApprovalPreset.sandboxMode;

  // Refs
  const dragState = useRef<{ type: "sidebar" | "inspector" | "browserChat"; startX: number; startWidth: number } | null>(null);
  const composerRef = useRef<HTMLDivElement | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const activityEndRef = useRef<HTMLDivElement>(null);
  const autoResumeRef = useRef(false);
  const forceChatScrollTicksRef = useRef(0);
  const chatScrollRafRef = useRef<number | null>(null);
  const isChatNearBottomRef = useRef(true);
  const threadScrollStateRef = useRef<Map<string, { top: number; nearBottom: boolean }>>(new Map());
  const forceChatRestoreTopRef = useRef<number | null>(null);
  const forceChatRestoreTicksRef = useRef(0);
  const chatItemHeightsRef = useRef<Map<string, number>>(new Map());

  // Scroll state
  const [isChatNearBottom, setIsChatNearBottom] = useState(true);
  const [chatScrollTop, setChatScrollTop] = useState(0);
  const [chatViewportHeight, setChatViewportHeight] = useState(0);
  const [chatMeasureVersion, setChatMeasureVersion] = useState(0);

  // Settings state
  const [showSettings, setShowSettings] = useState(false);
  const [showComposerCloud, setShowComposerCloud] = useState(false);
  const [showTaskBoardPage, setShowTaskBoardPage] = useState(false);
  const [showSkillsInSidebar, setShowSkillsInSidebar] = useState(false);
  const [showAutomationsInSidebar, setShowAutomationsInSidebar] = useState(false);
  const [showSemanticInSidebar, setShowSemanticInSidebar] = useState(false);
  const [useSemanticContext, setUseSemanticContext] = useState(true);
  const [pinnedSemanticContext, setPinnedSemanticContext] = useState<string[]>([]);
  const [lastSemanticContextMeta, setLastSemanticContextMeta] = useState<{
    autoHits: number;
    pinned: number;
  } | null>(null);
  const [threadVisibility, setThreadVisibility] = useState<"relevant" | "all">("relevant");
  const [sidebarSort, setSidebarSort] = useState<"updated" | "created" | "title">("updated");
  const [sidebarGroup, setSidebarGroup] = useState<"recency" | "workspace">("recency");
  const [threadSearch, setThreadSearch] = useState("");
  const [unreadThreadIds, setUnreadThreadIds] = useState<Set<string>>(new Set());
  const [taskBoardCards, setTaskBoardCards] = useState<TaskBoardCard[]>([]);
  const [taskBoardLoaded, setTaskBoardLoaded] = useState(false);
  const [importingCloudTasks, setImportingCloudTasks] = useState(false);

  // Command palette state
  const [showCommandPalette, setShowCommandPalette] = useState(false);

  // Terminal panel state
  const [showTerminal, setShowTerminal] = useState(false);

  // Text input ref for focus
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load persisted sidebar preferences and unread state
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const prefs = await dbSettings.getJson<{
          visibility?: "relevant" | "all";
          sort?: "updated" | "created" | "title";
          group?: "recency" | "workspace";
        }>("sidebar.preferences", {});
        if (cancelled) return;
        if (prefs.visibility) setThreadVisibility(prefs.visibility);
        if (prefs.sort) setSidebarSort(prefs.sort);
        if (prefs.group) setSidebarGroup(prefs.group);
      } catch {
        // ignore
      }

      try {
        const unread = await dbSettings.getJson<string[]>("threads.unread", []);
        if (!cancelled && Array.isArray(unread)) {
          setUnreadThreadIds(new Set(unread));
        }
      } catch {
        // ignore
      }

      try {
        const [semanticSidebar, semanticContextEnabled, semanticPinned] = await Promise.all([
          dbSettings.getJson<boolean>("semantic.sidebar.visible", false),
          dbSettings.getJson<boolean>("semantic.context.enabled", true),
          dbSettings.getJson<string[]>("semantic.context.pinned", []),
        ]);
        if (cancelled) return;
        if (typeof semanticSidebar === "boolean") setShowSemanticInSidebar(semanticSidebar);
        if (typeof semanticContextEnabled === "boolean") setUseSemanticContext(semanticContextEnabled);
        if (Array.isArray(semanticPinned)) {
          setPinnedSemanticContext(semanticPinned.filter((entry) => typeof entry === "string").slice(0, 8));
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load task board cards
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await dbSettings.getJson<TaskBoardCard[]>(TASKBOARD_STORAGE_KEY, []);
        if (cancelled) return;
        if (Array.isArray(stored)) {
          const normalized = stored
            .filter((card) => card && typeof card === "object" && typeof card.id === "string" && typeof card.workspacePath === "string")
            .map((card) => ({
              ...card,
              title: String(card.title || "Untitled task"),
              kind: card.kind === "cloud" ? "cloud" : "local",
              column: ([
                "backlog",
                "ready",
                "running",
                "blocked",
                "review",
                "done",
              ] as TaskBoardColumn[]).includes(card.column as TaskBoardColumn)
                ? (card.column as TaskBoardColumn)
                : "backlog",
              deps: Array.isArray(card.deps) ? card.deps.filter((id) => typeof id === "string") : [],
              createdAt: Number(card.createdAt || Math.floor(Date.now() / 1000)),
              updatedAt: Number(card.updatedAt || Math.floor(Date.now() / 1000)),
            }));
          setTaskBoardCards(normalized);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) {
          setTaskBoardLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist task board cards
  useEffect(() => {
    if (!taskBoardLoaded) return;
    void dbSettings.setJson(TASKBOARD_STORAGE_KEY, taskBoardCards);
  }, [taskBoardCards, taskBoardLoaded]);

  // Persist sidebar preferences
  useEffect(() => {
    void dbSettings.setJson("sidebar.preferences", {
      visibility: threadVisibility,
      sort: sidebarSort,
      group: sidebarGroup,
    });
  }, [threadVisibility, sidebarSort, sidebarGroup]);

  // Persist unread state
  useEffect(() => {
    void dbSettings.setJson("threads.unread", Array.from(unreadThreadIds));
  }, [unreadThreadIds]);

  // Persist semantic settings
  useEffect(() => {
    void dbSettings.setJson("semantic.sidebar.visible", showSemanticInSidebar);
  }, [showSemanticInSidebar]);

  useEffect(() => {
    void dbSettings.setJson("semantic.context.enabled", useSemanticContext);
  }, [useSemanticContext]);

  useEffect(() => {
    void dbSettings.setJson("semantic.context.pinned", pinnedSemanticContext);
  }, [pinnedSemanticContext]);

  // One-time width migration for legacy defaults so shell parity applies immediately.
  useEffect(() => {
    if (sidebarWidth === 260) setSidebarWidth(280);
    if (inspectorWidth === 320) setInspectorWidth(360);
  }, [sidebarWidth, inspectorWidth, setSidebarWidth, setInspectorWidth]);

  // Keep currently focused thread marked as read
  useEffect(() => {
    if (!activeThreadId) return;
    setUnreadThreadIds((prev) => {
      if (!prev.has(activeThreadId)) return prev;
      const next = new Set(prev);
      next.delete(activeThreadId);
      return next;
    });
  }, [activeThreadId]);

  // Helper to update thread atom
  const upsertThread = useCallback((thread: ThreadSummary) => {
    const setThread = (t: ThreadSummary | null) => t;
    // Update thread in atomFamily
    const atom = threadAtomFamily(thread.id);
    // We need to trigger a re-render, so we update threadIds too
    setThreadIds((prev) => {
      if (!prev.includes(thread.id)) {
        return [...prev, thread.id];
      }
      return prev;
    });
    // Set the thread data - this requires accessing the atom directly
    // We'll use a workaround by storing in a ref and using effect
  }, [setThreadIds]);

  // Store pending thread updates
  const pendingThreadUpdates = useRef<Map<string, ThreadSummary>>(new Map());

  // Cleanup closed thread data to prevent memory leaks
  const cleanupThreadData = useCallback((threadId: string) => {
    pendingThreadUpdates.current.delete(threadId);
    // Note: threadAtomFamily and threadDetailAtomFamily cleanup
    // should be handled by a central atom cleanup mechanism
  }, []);

  // Cleanup old thread data periodically to prevent unbounded growth
  useEffect(() => {
    const interval = setInterval(() => {
      // Remove threads that no longer exist in threadIds
      const currentIds = new Set(threadIds);
      for (const id of pendingThreadUpdates.current.keys()) {
        if (!currentIds.has(id)) {
          pendingThreadUpdates.current.delete(id);
        }
      }
    }, 60000); // Clean up every minute
    return () => clearInterval(interval);
  }, [threadIds]);

  // Effect to apply thread updates
  useEffect(() => {
    pendingThreadUpdates.current.forEach((thread, id) => {
      // This is a workaround - we need to find a better way
    });
  }, [threadIds]);

  // Better approach: create a derived setter
  const updateThread = useCallback((thread: ThreadSummary) => {
    setThreadIds((prev) => {
      if (!prev.includes(thread.id)) {
        return [...prev, thread.id];
      }
      return [...prev]; // Force re-render
    });
  }, [setThreadIds]);

  // Helper to update detail state
  const updateDetail = useCallback(
    (updater: (prev: ThreadDetailState) => ThreadDetailState) => {
      if (!activeThreadId) return;
      setActiveDetail(updater);
    },
    [activeThreadId, setActiveDetail]
  );

  // Activity helpers
  const activityTimeline = useMemo(() => {
    const ordered = [...activity].reverse();
    return filterActivityItems(ordered);
  }, [activity]);

  useEffect(() => {
    activityEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [activityTimeline.length]);

  const pushActivityItem = useCallback(
    (item: Omit<ActivityItem, "id" | "time">) => {
      updateDetail((prev) => {
        const next = [
          { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, time: formatTime(Date.now()), ...item },
          ...prev.activity,
        ];
        return { ...prev, activity: next.slice(0, MAX_ACTIVITY) };
      });
    },
    [updateDetail]
  );

  const upsertActivityItem = useCallback(
    (id: string, update: Omit<ActivityItem, "id" | "time">, options?: { appendDetail?: string }) => {
      updateDetail((prev) => {
        const index = prev.activity.findIndex((entry) => entry.id === id);
        if (index === -1) {
          const initialDetail = update.detail ?? options?.appendDetail ?? undefined;
          const next = [{ id, time: formatTime(Date.now()), ...update, detail: initialDetail }, ...prev.activity];
          return { ...prev, activity: next.slice(0, MAX_ACTIVITY) };
        }
        const next = [...prev.activity];
        const appendDetail = options?.appendDetail;
        const mergedDetail = appendDetail ? `${next[index].detail ?? ""}${appendDetail}` : next[index].detail;
        next[index] = { ...next[index], ...update, detail: update.detail ?? mergedDetail };
        // Ensure activity array stays within limits after update
        return { ...prev, activity: next.slice(0, MAX_ACTIVITY) };
      });
    },
    [updateDetail]
  );

  const pushActivity = useCallback(
    (label: string, detail?: string, extras?: Partial<ActivityItem>) => {
      pushActivityItem({ title: label, detail, ...extras });
    },
    [pushActivityItem]
  );

  // Load models
  useEffect(() => {
    if (!window.codex || status.state !== "ready") return;
    let cancelled = false;
    const loadModels = async () => {
      try {
        setModelLoading(true);
        setModelError(null);
        const gathered: any[] = [];
        let cursor: string | null | undefined;
        do {
          const result = (await window.codex.request("model/list", cursor ? { cursor } : {})) as any;
          const items = result?.items ?? result?.data ?? [];
          gathered.push(...items);
          cursor = result?.nextCursor ?? result?.next_cursor;
        } while (cursor);
        if (cancelled) return;
        const normalized = gathered.map(normalizeModel);
        setModels(normalized);
        const defaultModel = normalized.find((model) => model.isDefault) || normalized[0] || null;
        if (!selectedModelId && defaultModel) {
          setSelectedModelId(defaultModel.id);
          setLastUsedModelId(defaultModel.id);
        }
      } catch (err) {
        if (!cancelled) {
          setModelError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) {
          setModelLoading(false);
        }
      }
    };
    loadModels();
    return () => { cancelled = true; };
  }, [status.state, selectedModelId, setModels, setModelLoading, setModelError, setSelectedModelId, setLastUsedModelId]);

  // Load MCP tools
  useEffect(() => {
    if (!window.codex?.mcp) return;
    let cancelled = false;
    const loadMcpTools = async () => {
      try {
        const response = await window.codex.mcp.listTools();
        if (cancelled) return;
        if (response.success && response.tools) {
          setMcpTools(response.tools);
          setMcpReady(true);
          if (process.env.NODE_ENV === "development") {
            console.log("[App] Loaded MCP tools:", response.tools.map((t) => t.name).join(", "));
          }
        } else {
          if (process.env.NODE_ENV === "development") {
            console.warn("[App] Failed to load MCP tools:", response.error);
          }
          setMcpReady(false);
        }
      } catch (err) {
        if (!cancelled) {
          if (process.env.NODE_ENV === "development") {
            console.warn("[App] Error loading MCP tools:", err);
          }
          setMcpReady(false);
        }
      }
    };
    loadMcpTools();
    return () => { cancelled = true; };
  }, [status.state]);

  // Sync effort with model
  useEffect(() => {
    if (effortOptions.length === 0) {
      if (selectedEffort !== "") {
        setSelectedEffort("");
      }
      return;
    }
    const hasSelected = effortOptions.some((option) => option.value === selectedEffort);
    if (!hasSelected) {
      const preferred = activeModel?.defaultReasoningEffort ?? effortOptions[0]?.value ?? "";
      if (preferred !== selectedEffort) {
        setSelectedEffort(preferred);
      }
    }
  }, [activeModel, effortOptions, selectedEffort, setSelectedEffort]);

  // Chat scroll
  const updateChatScrollState = useCallback(() => {
    const container = messagesRef.current;
    if (!container) return;
    const nextTop = container.scrollTop;
    const nextViewport = container.clientHeight;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    const nextNearBottom = distanceFromBottom <= CHAT_BOTTOM_THRESHOLD;
    setChatScrollTop((prev) => (Math.abs(prev - nextTop) > 0.5 ? nextTop : prev));
    setChatViewportHeight((prev) => (prev !== nextViewport ? nextViewport : prev));
    if (nextNearBottom !== isChatNearBottomRef.current) {
      isChatNearBottomRef.current = nextNearBottom;
      setIsChatNearBottom(nextNearBottom);
    }
  }, []);

  useEffect(() => {
    isChatNearBottomRef.current = isChatNearBottom;
  }, [isChatNearBottom]);

  useEffect(() => {
    const container = messagesRef.current;
    if (!container) return;
    updateChatScrollState();
    const handleScroll = () => {
      if (chatScrollRafRef.current !== null) return;
      chatScrollRafRef.current = window.requestAnimationFrame(() => {
        chatScrollRafRef.current = null;
        updateChatScrollState();
        if (activeThreadId) {
          threadScrollStateRef.current.set(activeThreadId, {
            top: container.scrollTop,
            nearBottom: isChatNearBottomRef.current,
          });
        }
      });
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", handleScroll);
      if (chatScrollRafRef.current !== null) {
        window.cancelAnimationFrame(chatScrollRafRef.current);
        chatScrollRafRef.current = null;
      }
    };
  }, [activeThreadId, updateChatScrollState]);

  useEffect(() => {
    const container = messagesRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      setChatViewportHeight((prev) => (prev !== container.clientHeight ? container.clientHeight : prev));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [activeThreadId]);

  useEffect(() => {
    if (!activeThreadId) return;
    const saved = threadScrollStateRef.current.get(activeThreadId);
    if (saved && !saved.nearBottom) {
      forceChatScrollTicksRef.current = 0;
      forceChatRestoreTopRef.current = saved.top;
      forceChatRestoreTicksRef.current = Math.max(forceChatRestoreTicksRef.current, 6);
      isChatNearBottomRef.current = false;
      setIsChatNearBottom(false);
      return;
    }

    // Default behavior for unseen threads or bottom-anchored threads.
    forceChatRestoreTopRef.current = null;
    forceChatRestoreTicksRef.current = 0;
    forceChatScrollTicksRef.current = Math.max(forceChatScrollTicksRef.current, 4);
    isChatNearBottomRef.current = true;
    setIsChatNearBottom(true);
  }, [activeThreadId]);

  useEffect(() => {
    setShowComposerCloud(false);
  }, [activeThreadId]);

  useEffect(() => {
    setLastSemanticContextMeta(null);
  }, [activeThreadId]);

  useEffect(() => {
    if (!activeThreadId) {
      setShowTaskBoardPage(false);
    }
  }, [activeThreadId]);

  useEffect(() => {
    if (activeTab === "browser") {
      setShowComposerCloud(false);
    }
  }, [activeTab]);

  useEffect(() => {
    if (showSettings || showCommandPalette) {
      setShowComposerCloud(false);
    }
  }, [showSettings, showCommandPalette]);

  useEffect(() => {
    if (!showTaskBoardPage) return;
    setShowComposerCloud(false);
    if (activeTab === "browser") {
      setActiveTab("events");
    }
  }, [activeTab, setActiveTab, showTaskBoardPage]);

  useEffect(() => {
    if (!activeThreadId) {
      setShowComposerCloud(false);
      return;
    }
    const thread = pendingThreadUpdates.current.get(activeThreadId);
    if (!thread?.cwd) {
      setShowComposerCloud(false);
    }
  }, [activeThreadId, threadIds]);

  useLayoutEffect(() => {
    const container = messagesRef.current;
    if (!container) return;

    if (forceChatRestoreTicksRef.current > 0 && forceChatRestoreTopRef.current !== null) {
      container.scrollTop = forceChatRestoreTopRef.current;
      forceChatRestoreTicksRef.current -= 1;
      if (forceChatRestoreTicksRef.current === 0) {
        forceChatRestoreTopRef.current = null;
      }
      updateChatScrollState();
      return;
    }

    if (forceChatScrollTicksRef.current > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
      forceChatScrollTicksRef.current -= 1;
      updateChatScrollState();
      return;
    }
    if (!isChatNearBottom) return;
    const behavior = activeTurnId ? "auto" : "smooth";
    messagesEndRef.current?.scrollIntoView({ behavior, block: "end" });
    updateChatScrollState();
  }, [activeThreadId, activeTurnId, isChatNearBottom, messages.length, pendingApprovals.length, updateChatScrollState]);

  // Close menu on outside click
  useEffect(() => {
    const handlePointer = (event: MouseEvent) => {
      if (!composerRef.current) return;
      if (composerRef.current.contains(event.target as Node)) return;
      setOpenMenu(null);
      setShowComposerCloud(false);
    };
    window.addEventListener("pointerdown", handlePointer);
    return () => window.removeEventListener("pointerdown", handlePointer);
  }, [setOpenMenu]);

  // Message helpers
  const addMessageDelta = useCallback(
    (itemId: string, delta: string) => {
      updateDetail((prev) => {
        const next = [...prev.messages];
        const idx = next.findIndex((msg) => msg.id === itemId);
        if (idx >= 0) {
          next[idx] = { ...next[idx], text: `${next[idx].text}${delta}`, streaming: true };
          return { ...prev, messages: next };
        }
        next.push({ id: itemId, role: "assistant", text: delta, streaming: true });
        return { ...prev, messages: next };
      });
    },
    [updateDetail]
  );

  const finalizeAgentMessage = useCallback(
    (itemId: string, text: string) => {
      updateDetail((prev) => {
        const next = [...prev.messages];
        const idx = next.findIndex((msg) => msg.id === itemId);
        if (idx >= 0) {
          next[idx] = { ...next[idx], text, streaming: false };
          return { ...prev, messages: next };
        }
        next.push({ id: itemId, role: "assistant", text, streaming: false });
        return { ...prev, messages: next };
      });

      // Save assistant message to database
      if (activeThreadId) {
        dbMessages.add({
          id: itemId,
          thread_id: activeThreadId,
          role: "assistant",
          content: text,
        }).catch(() => {});
      }
    },
    [updateDetail, activeThreadId]
  );

  // Thread management
  const refreshThreads = useCallback(async () => {
    // Load from local database first
    try {
      const dbThreadsList = await dbThreads.all();
      const dbMapped = dbThreadsList.map(toThreadSummary);
      dbMapped.forEach((thread) => {
        pendingThreadUpdates.current.set(thread.id, thread);
      });
      // Set pinned/archived from db
      const pinned = new Set(dbThreadsList.filter((t) => t.is_pinned).map((t) => t.id));
      const archived = new Set(dbThreadsList.filter((t) => t.is_archived).map((t) => t.id));
      setPinnedIds(pinned);
      setArchivedIds(archived);
      setThreadIds(dbMapped.map((t) => t.id));
    } catch (err) {
      if (process.env.NODE_ENV === "development") {
        // eslint-disable-next-line no-console
        console.error("Failed to load threads from database:", err);
      }
    }

    // Then sync with Codex backend if available
    if (window.codex) {
      try {
        const result = (await window.codex.request("thread/list", {})) as any;
        const rows = (result?.data ?? []) as any[];
        const mapped = rows.map(mapThread);
        // Merge with existing - Codex data takes precedence for active threads
        mapped.forEach((thread) => {
          const existing = pendingThreadUpdates.current.get(thread.id);
          if (existing) {
            // Merge - keep local pinned/archived state
            pendingThreadUpdates.current.set(thread.id, { ...thread, ...existing, ...thread });
          } else {
            pendingThreadUpdates.current.set(thread.id, thread);
            // Save new thread to database
            dbThreads.create(fromThreadSummary(thread)).catch(() => {});
          }
        });
        const allIds = [...new Set([...Array.from(pendingThreadUpdates.current.keys())])];
        setThreadIds(allIds);
      } catch (err) {
        if (process.env.NODE_ENV === "development") {
          // eslint-disable-next-line no-console
          console.error("Failed to sync with Codex backend:", err);
        }
      }
    }
    setHistoryLoaded(true);
  }, [setThreadIds, setHistoryLoaded, setPinnedIds, setArchivedIds]);

  const hydrateFromThread = useCallback((thread: any) => {
    if (!thread?.turns?.length) {
      updateDetail((prev) => ({ ...prev, messages: [] }));
      return;
    }
    const nextMessages: Message[] = [];
    for (const turn of thread.turns as any[]) {
      for (const item of turn.items ?? []) {
        if (item.type === "userMessage") {
          const text = (item.content ?? [])
            .map((chunk: any) => {
              if (chunk.type === "text") return chunk.text;
              if (chunk.type === "image") return "[image]";
              if (chunk.type === "localImage") return "[local image]";
              if (chunk.type === "skill") return `[skill:${chunk.name}]`;
              return "[input]";
            })
            .join(" ");
          nextMessages.push({ id: item.id, role: "user", text });
        }
        if (item.type === "agentMessage") {
          nextMessages.push({ id: item.id, role: "assistant", text: item.text });
        }
      }
    }
    updateDetail((prev) => ({ ...prev, messages: nextMessages }));
  }, [updateDetail]);

  // Performance: Optimized thread switching with caching and lazy loading
  const performSelectThread = useCallback(
    async (threadId: string) => {
      // Performance mark: start thread switch
      performance.mark('thread-switch-start');

      autoResumeRef.current = true;
      
      // Performance: Check cache first for instant switch
      const cachedDetail = threadCache.get(threadId);
      if (cachedDetail) {
        // Use cached data immediately for instant switch
        setActiveDetail(cachedDetail);
        setActiveThreadId(threadId);
        
        // Still update from database in background for freshness
        try {
          const dbMsgs = await dbMessages.get(threadId, 500);
          if (dbMsgs.length > 0) {
            const nextMessages: Message[] = dbMsgs.map((m) => ({
              id: m.id,
              role: m.role,
              text: m.content,
            }));
            setActiveDetail((prev) => ({ ...prev, messages: nextMessages }));
            // Update cache with fresh data
            threadCache.set(threadId, { ...cachedDetail, messages: nextMessages });
          }
        } catch {
          // Cache is fine, continue
        }
      } else {
        // No cache - set active thread first for UI responsiveness
        setActiveThreadId(threadId);
        
        // Load messages from database (fast, with limit for performance)
        try {
          const dbMsgs = await dbMessages.get(threadId, 500);
          const nextMessages: Message[] = dbMsgs.map((m) => ({
            id: m.id,
            role: m.role,
            text: m.content,
          }));
          setActiveDetail((prev) => ({ ...prev, messages: nextMessages }));
        } catch (err) {
          if (process.env.NODE_ENV === "development") {
            // eslint-disable-next-line no-console
            console.error("Failed to load messages from database:", err);
          }
        }
      }

      // Performance mark: UI is ready
      performance.mark('thread-switch-ui-ready');

      // Then try to resume from Codex backend (lazy load, non-blocking)
      if (!window.codex) return;
      try {
        const result = (await window.codex.request("thread/resume", { threadId })) as any;
        if (result?.thread) {
          const hydratedThread = { ...result.thread, cwd: result?.cwd ?? result.thread.cwd };
          const mapped = mapThread(hydratedThread);
          pendingThreadUpdates.current.set(threadId, mapped);
          setThreadIds((prev) => (prev.includes(threadId) ? [...prev] : [...prev, threadId]));

          // Update database with latest thread info
          dbThreads.update(threadId, {
            preview: mapped.preview,
            cwd: mapped.cwd,
            git_branch: mapped.gitInfo?.branch ?? null,
          }).catch(() => {});
        }
        // Hydrate messages from Codex (may have newer data)
        if (result?.thread?.turns) {
          const nextMessages: Message[] = [];
          for (const turn of result.thread.turns as any[]) {
            for (const item of turn.items ?? []) {
              if (item.type === "userMessage") {
                const text = (item.content ?? []).map((chunk: any) => chunk.type === "text" ? chunk.text : "[input]").join(" ");
                nextMessages.push({ id: item.id, role: "user", text });
              }
              if (item.type === "agentMessage") {
                nextMessages.push({ id: item.id, role: "assistant", text: item.text });
              }
            }
          }
          const newDetail = { ...getEmptyThreadDetailState(), messages: nextMessages };
          setActiveDetail(newDetail);
          // Cache the loaded data
          threadCache.set(threadId, newDetail);
        }
        pushActivity("Thread resumed", threadId);
      } catch (err) {
        // If Codex fails, we still have database messages
        pushActivity("Using cached messages", threadId);
      }

      // Performance mark: end thread switch
      performance.mark('thread-switch-end');
      performance.measure('thread-switch', 'thread-switch-start', 'thread-switch-end');
      performance.measure('thread-switch-ui', 'thread-switch-start', 'thread-switch-ui-ready');
      
      if (process.env.NODE_ENV === "development") {
        const measures = performance.getEntriesByName('thread-switch');
        const uiMeasures = performance.getEntriesByName('thread-switch-ui');
        if (measures.length > 0) {
          console.log(`[Perf] Thread switch: ${Math.round(measures[measures.length - 1].duration)}ms (UI: ${Math.round(uiMeasures[uiMeasures.length - 1]?.duration || 0)}ms)`);
        }
        // Clear old entries to prevent memory leak
        performance.clearMarks('thread-switch-start');
        performance.clearMarks('thread-switch-ui-ready');
        performance.clearMarks('thread-switch-end');
      }
    },
    [setActiveThreadId, setThreadIds, setActiveDetail, pushActivity, threadCache]
  );

  // Performance: Wrapper for thread selection that handles caching
  const selectThread = useCallback(
    async (threadId: string) => {
      // Cancel any pending debounced selection
      cancelDebouncedSelect();

      // Persist current thread's scroll state before switching away.
      if (activeThreadId && messagesRef.current) {
        const container = messagesRef.current;
        const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        threadScrollStateRef.current.set(activeThreadId, {
          top: container.scrollTop,
          nearBottom: distanceFromBottom <= CHAT_BOTTOM_THRESHOLD,
        });
      }

      // Active thread is always considered read
      setUnreadThreadIds((prev) => {
        if (!prev.has(threadId)) return prev;
        const next = new Set(prev);
        next.delete(threadId);
        return next;
      });
      
      // If switching from another thread, cache the current state first
      if (activeThreadId && activeThreadId !== threadId) {
        // Save current state to cache (trimmed)
        threadCache.set(activeThreadId, {
          ...activeDetail,
          // Clear heavy data from previous thread to save memory
          commandOutputById: {},
          fileChangeOutputById: {},
          reasoningBuffer: "",
        });
      }
      
      // Use debounced selection for rapid switches
      await debouncedSelectThread(threadId);
    },
    [debouncedSelectThread, cancelDebouncedSelect, activeThreadId, threadCache, activeDetail]
  );

  // Auto-resume on mount
  useEffect(() => {
    if (!activeThreadId || autoResumeRef.current) return;
    if (status.state !== "ready" || !window.codex) return;
    autoResumeRef.current = true;
    selectThread(activeThreadId);
  }, [activeThreadId, selectThread, status.state]);

  const startSessionInFolder = useCallback(async (cwd: string) => {
    if (!window.codex) return;
    try {
      autoResumeRef.current = true;

      // Get the app path for browser-cli.sh
      const appPath = await window.codex.getAppPath?.() ?? ".";
      const cliPath = `${appPath}/browser-cli.sh`;

      // Build developer instructions for browser control via shell commands
      const devInstructions = `You have access to a browser panel that the user can see. Control it using shell commands:

BROWSER COMMANDS (run these via shell):
- ${cliPath} navigate <url>  → Navigate to URL (e.g., navigate https://github.com)
- ${cliPath} url             → Get current page URL
- ${cliPath} title           → Get current page title  
- ${cliPath} click '<selector>' → Click element (CSS selector)
- ${cliPath} type '<selector>' '<text>' → Type into input
- ${cliPath} eval '<js>'     → Run JavaScript on page
- ${cliPath} screenshot      → Take screenshot (base64)

IMPORTANT: When the user asks you to browse, open a website, or interact with web pages, USE THESE COMMANDS. 
The browser panel is visible to the user - they will see navigation happen in real-time.
Do NOT use web_fetch or web_search for navigation requests - use the browser-cli.sh commands instead.`;

      const result = (await window.codex.request("thread/start", {
        cwd,
        model: selectedModelId || undefined,
        approvalPolicy,
        sandbox: sandboxModeToThreadParam(sandboxMode),
        developerInstructions: devInstructions,
      })) as any;
      const threadId = result?.thread?.id as string | undefined;
      if (threadId) {
        setActiveThreadId(threadId);
        // Reset detail state for new thread
        setActiveDetail(getEmptyThreadDetailState());

        let threadToSave: ThreadSummary;
        if (result?.thread) {
          const hydratedThread = { ...result.thread, cwd: cwd || result?.cwd || result.thread.cwd };
          threadToSave = mapThread(hydratedThread);
          pendingThreadUpdates.current.set(threadId, threadToSave);
          setThreadIds((prev) => (prev.includes(threadId) ? [...prev] : [...prev, threadId]));
        } else {
          // Create minimal thread entry
          threadToSave = {
            id: threadId,
            preview: cwd.split("/").pop() || "Workspace",
            createdAt: Date.now() / 1000,
            updatedAt: Date.now() / 1000,
            modelProvider: "openai",
            cwd,
            gitInfo: null,
          };
          pendingThreadUpdates.current.set(threadId, threadToSave);
          setThreadIds((prev) => (prev.includes(threadId) ? [...prev] : [...prev, threadId]));
        }

        // Save to database
        dbThreads.create(fromThreadSummary(threadToSave)).catch(() => {});

        const resolvedModel = result?.model ?? selectedModelId;
        const resolvedEffort = result?.reasoningEffort ?? result?.reasoning_effort ?? selectedEffort;
        const resolvedApproval = result?.approvalPolicy ?? result?.approval_policy ?? approvalPolicy;
        const resolvedSandbox = sandboxPolicyToMode(result?.sandbox) ?? sandboxMode;
        const resolvedPresetId = inferApprovalPresetId(resolvedApproval, resolvedSandbox);

        if (resolvedModel) setSelectedModelId(resolvedModel);
        if (resolvedEffort) setSelectedEffort(resolvedEffort);
        setApprovalPresetId(resolvedPresetId);

        pushActivity("Workspace opened", cwd);
      }
    } catch (err) {
      pushActivity("Failed to open workspace", String(err));
    }
  }, [approvalPolicy, pushActivity, sandboxMode, selectedEffort, selectedModelId, setActiveThreadId, setActiveDetail, setThreadIds, setSelectedModelId, setSelectedEffort, setApprovalPresetId, mcpTools, mcpReady]);

  const createNewSession = useCallback(async () => {
    if (!window.codex?.createNewSession) {
      pushActivity("New session unavailable");
      return;
    }
    const result = await window.codex.createNewSession();
    if (!result?.success || !result?.path) {
      pushActivity("Failed to create new session", result?.error || "Unknown error");
      return;
    }
    await startSessionInFolder(result.path);
  }, [pushActivity, startSessionInFolder]);

  const openWorkspace = useCallback(async () => {
    if (!window.codex?.pickFolder) {
      pushActivity("Folder picker unavailable");
      return;
    }
    const cwd = await window.codex.pickFolder();
    if (!cwd || typeof cwd !== "string") return;
    await startSessionInFolder(cwd);
  }, [pushActivity, startSessionInFolder]);

  const sendTurn = useCallback(async () => {
    if (!window.codex) return;
    const thread = activeThreadId ? pendingThreadUpdates.current.get(activeThreadId) : null;
    if (!activeThreadId || !thread?.cwd) {
      pushActivity("Select a workspace folder first");
      return;
    }
    const trimmed = input.trim();
    if (!trimmed) return;

    const userId = `user-${Date.now()}`;
    updateDetail((prev) => ({
      ...prev,
      messages: [...prev.messages, { id: userId, role: "user" as const, text: trimmed }],
    }));
    setInput("");

    // Save user message to database
    dbMessages.add({
      id: userId,
      thread_id: activeThreadId,
      role: "user",
      content: trimmed,
    }).catch(() => {});

    let inputText = trimmed;
    let autoSemanticHits: SemanticSearchHit[] = [];

    if (useSemanticContext && window.codex.semantic) {
      try {
        const semanticResponse = await window.codex.semantic.search({
          workspacePath: thread.cwd,
          query: trimmed,
          mode: "smart",
          limit: 4,
        });
        if (semanticResponse.success && semanticResponse.result?.hits) {
          autoSemanticHits = semanticResponse.result.hits.slice(0, 4);
        }
      } catch {
        // semantic context is best effort
      }
    }

    const contextBlock = buildSemanticContextBlock(autoSemanticHits, pinnedSemanticContext);
    if (contextBlock) {
      inputText = `${trimmed}\n\n${contextBlock}`;
      setLastSemanticContextMeta({
        autoHits: autoSemanticHits.length,
        pinned: Math.min(4, pinnedSemanticContext.length),
      });
    } else {
      setLastSemanticContextMeta(null);
    }

    try {
      await window.codex.request("turn/start", {
        threadId: activeThreadId,
        input: [{ type: "text", text: inputText }],
        model: selectedModelId || undefined,
        effort: selectedEffort || undefined,
        approvalPolicy,
        sandboxPolicy: sandboxModeToPolicy(sandboxMode),
        cwd: thread.cwd ?? undefined,
      });
    } catch (err) {
      pushActivity("Failed to send turn", String(err));
    }
  }, [
    activeThreadId,
    approvalPolicy,
    input,
    pinnedSemanticContext,
    pushActivity,
    sandboxMode,
    selectedEffort,
    selectedModelId,
    setInput,
    updateDetail,
    useSemanticContext,
  ]);

  const interruptTurn = useCallback(async () => {
    if (!window.codex || !activeThreadId || !activeTurnId) return;
    try {
      await window.codex.request("turn/interrupt", { threadId: activeThreadId, turnId: activeTurnId });
      pushActivity("Turn interrupted", activeTurnId);
    } catch (err) {
      pushActivity("Failed to interrupt", String(err));
    }
  }, [activeThreadId, activeTurnId, pushActivity]);

  const togglePin = useCallback((id: string) => {
    setPinnedIds((prev) => {
      const next = new Set(prev);
      const isPinned = next.has(id);
      if (isPinned) next.delete(id);
      else next.add(id);
      // Save to database
      dbThreads.pin(id, !isPinned).catch(() => {});
      return next;
    });
  }, [setPinnedIds]);

  const toggleArchive = useCallback((id: string) => {
    setArchivedIds((prev) => {
      const next = new Set(prev);
      const isArchived = next.has(id);
      if (isArchived) next.delete(id);
      else next.add(id);
      // Save to database
      dbThreads.archive(id, !isArchived).catch(() => {});
      return next;
    });
  }, [setArchivedIds]);

  const toggleUnread = useCallback((id: string) => {
    setUnreadThreadIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const renameThread = useCallback((id: string) => {
    const thread = pendingThreadUpdates.current.get(id);
    if (!thread) return;
    const currentName = thread.preview || getProjectName(thread);
    const nextName = window.prompt("Rename conversation", currentName);
    if (typeof nextName !== "string") return;
    const trimmed = nextName.trim();
    if (!trimmed || trimmed === currentName) return;

    pendingThreadUpdates.current.set(id, {
      ...thread,
      preview: trimmed,
      updatedAt: Math.floor(Date.now() / 1000),
    });
    setThreadIds((prev) => [...prev]);
    dbThreads.update(id, { preview: trimmed }).catch(() => {});
  }, [setThreadIds]);

  const closeWorkspace = useCallback((id: string) => {
    setThreadIds((prev) => prev.filter((tid) => tid !== id));
    setPinnedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setArchivedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setUnreadThreadIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (activeThreadId === id) {
      setActiveThreadId(null);
      setActiveDetail(getEmptyThreadDetailState());
    }
    // Cleanup thread data to prevent memory leaks
    cleanupThreadData(id);
    // Clear from cache to free memory
    threadCache.clear(id);
    // Delete from database
    dbThreads.delete(id).catch(() => {});
    pushActivity("Workspace closed", id);
  }, [activeThreadId, pushActivity, setThreadIds, setPinnedIds, setArchivedIds, setActiveThreadId, setActiveDetail, cleanupThreadData, threadCache]);

  const respondApproval = useCallback(
    async (approval: ApprovalRequest, decision: "accept" | "decline") => {
      if (!window.codex) return;
      try {
        await window.codex.respond(approval.id, { decision });
        updateDetail((prev) => ({
          ...prev,
          pendingApprovals: prev.pendingApprovals.filter((item) => item.id !== approval.id),
        }));
        pushActivity(decision === "accept" ? "Approval accepted" : "Approval declined", approval.itemId);
      } catch (err) {
        pushActivity("Failed to respond", String(err));
      }
    },
    [pushActivity, updateDetail]
  );

  // Notification handler
  const handleNotification = useCallback(
    (notification: { method: string; params?: any }) => {
      const { method, params } = notification;
      if (!method) return;

      if (method === "item/agentMessage/delta") {
        const itemId = params?.itemId as string | undefined;
        if (itemId) addMessageDelta(itemId, params?.delta ?? "");
        return;
      }

      if (method === "item/completed") {
        const item = params?.item;
        const threadIdForItem = params?.threadId ?? params?.thread_id;
        if (item?.type === "agentMessage") {
          finalizeAgentMessage(item.id, item.text ?? "");
          if (threadIdForItem && threadIdForItem !== activeThreadId) {
            setUnreadThreadIds((prev) => {
              const next = new Set(prev);
              next.add(threadIdForItem);
              return next;
            });
          }
        }
        if (item?.type === "commandExecution" && item?.aggregatedOutput) {
          updateDetail((prev) => {
            const nextCommandOutput = { ...prev.commandOutputById, [item.id]: item.aggregatedOutput };
            // Limit command output storage to prevent memory leaks
            const keys = Object.keys(nextCommandOutput);
            if (keys.length > MAX_COMMAND_OUTPUT) {
              const toDelete = keys.slice(0, keys.length - MAX_COMMAND_OUTPUT);
              toDelete.forEach((k) => delete nextCommandOutput[k]);
            }
            return { ...prev, commandOutputById: nextCommandOutput };
          });
        }
        if (item) {
          updateDetail((prev) => {
            const itemsById = { ...prev.itemsById, [item.id]: { item, threadId: params?.threadId ?? params?.thread_id, turnId: params?.turnId ?? params?.turn_id } };
            const hasEntry = prev.itemSequence.some((e) => e.id === item.id);
            const itemSequence = hasEntry ? prev.itemSequence : [...prev.itemSequence, { id: item.id, threadId: params?.threadId ?? params?.thread_id }];
            // Limit items storage to prevent memory leaks
            const limitedItemSequence = itemSequence.length > MAX_ITEMS_BY_ID
              ? itemSequence.slice(itemSequence.length - MAX_ITEMS_BY_ID)
              : itemSequence;
            const limitedItemsById: Record<string, ItemRecord> = {};
            limitedItemSequence.forEach((entry) => {
              if (itemsById[entry.id]) {
                limitedItemsById[entry.id] = itemsById[entry.id];
              }
            });
            return { ...prev, itemsById: limitedItemsById, itemSequence: limitedItemSequence };
          });
          const summary = summarizeItemEvent(item, "completed");
          if (summary) upsertActivityItem(`item:${item.id}`, summary);
        }
        return;
      }

      if (method === "item/started") {
        const item = params?.item;
        if (item) {
          updateDetail((prev) => {
            const itemsById = { ...prev.itemsById, [item.id]: { item, threadId: params?.threadId ?? params?.thread_id, turnId: params?.turnId ?? params?.turn_id } };
            const hasEntry = prev.itemSequence.some((e) => e.id === item.id);
            const itemSequence = hasEntry ? prev.itemSequence : [...prev.itemSequence, { id: item.id, threadId: params?.threadId ?? params?.thread_id }];
            // Limit items storage to prevent memory leaks
            const limitedItemSequence = itemSequence.length > MAX_ITEMS_BY_ID
              ? itemSequence.slice(itemSequence.length - MAX_ITEMS_BY_ID)
              : itemSequence;
            const limitedItemsById: Record<string, ItemRecord> = {};
            limitedItemSequence.forEach((entry) => {
              if (itemsById[entry.id]) {
                limitedItemsById[entry.id] = itemsById[entry.id];
              }
            });
            return { ...prev, itemsById: limitedItemsById, itemSequence: limitedItemSequence };
          });
          const summary = summarizeItemEvent(item, "started");
          if (summary) upsertActivityItem(`item:${item.id}`, summary);
        }
        return;
      }

      if (method === "item/commandExecution/outputDelta") {
        const itemId = params?.itemId as string | undefined;
        if (itemId) {
          updateDetail((prev) => {
            const currentOutput = prev.commandOutputById[itemId] ?? "";
            const newOutput = `${currentOutput}${params?.delta ?? ""}`;
            // Limit output length to prevent memory leaks
            const limitedOutput = newOutput.length > MAX_OUTPUT_LENGTH
              ? "..." + newOutput.slice(-MAX_OUTPUT_LENGTH)
              : newOutput;
            const nextCommandOutput = { ...prev.commandOutputById, [itemId]: limitedOutput };
            // Limit number of stored command outputs
            const keys = Object.keys(nextCommandOutput);
            if (keys.length > MAX_COMMAND_OUTPUT) {
              const toDelete = keys.slice(0, keys.length - MAX_COMMAND_OUTPUT);
              toDelete.forEach((k) => delete nextCommandOutput[k]);
            }
            return { ...prev, commandOutputById: nextCommandOutput };
          });
          upsertActivityItem(`item:${itemId}`, { kind: "command", itemId, status: "running", title: "Command" });
        }
        return;
      }

      if (method === "item/mcpToolCall/progress") {
        const itemId = params?.itemId as string | undefined;
        const message = params?.message;
        if (itemId && message) {
          upsertActivityItem(`item:${itemId}`, { kind: "tool", title: "Tool call", itemId, status: "running", detail: truncate(String(message), 240) });
        }
        return;
      }

      if (method === "item/reasoning/summaryPartAdded") {
        const itemId = params?.itemId as string | undefined;
        if (itemId !== undefined) {
          upsertActivityItem(`item:${itemId}`, { kind: "thinking", itemId, status: "running", title: "Thinking", detail: "" });
        }
        return;
      }

      if (method === "item/reasoning/summaryTextDelta") {
        const itemId = params?.itemId as string | undefined;
        const delta = params?.delta ?? "";
        if (itemId !== undefined) {
          upsertActivityItem(`item:${itemId}`, { kind: "thinking", itemId, status: "running", title: "Thinking" }, { appendDetail: delta });
          // Accumulate reasoning and extract bold header (like TUI)
          updateDetail((prev) => {
            const newBuffer = prev.reasoningBuffer + delta;
            // Limit reasoning buffer to prevent memory leaks
            const limitedBuffer = newBuffer.length > MAX_OUTPUT_LENGTH
              ? newBuffer.slice(-MAX_OUTPUT_LENGTH)
              : newBuffer;
            const boldHeader = extractFirstBold(limitedBuffer);
            return {
              ...prev,
              reasoningBuffer: limitedBuffer,
              statusHeader: boldHeader || prev.statusHeader,
            };
          });
        }
        return;
      }

      if (method === "item/fileChange/outputDelta") {
        const itemId = params?.itemId as string | undefined;
        if (itemId) {
          updateDetail((prev) => {
            const currentOutput = prev.fileChangeOutputById[itemId] ?? "";
            const newOutput = `${currentOutput}${params?.delta ?? ""}`;
            // Limit output length to prevent memory leaks
            const limitedOutput = newOutput.length > MAX_OUTPUT_LENGTH
              ? "..." + newOutput.slice(-MAX_OUTPUT_LENGTH)
              : newOutput;
            const nextFileChangeOutput = { ...prev.fileChangeOutputById, [itemId]: limitedOutput };
            // Limit number of stored file change outputs
            const keys = Object.keys(nextFileChangeOutput);
            if (keys.length > MAX_COMMAND_OUTPUT) {
              const toDelete = keys.slice(0, keys.length - MAX_COMMAND_OUTPUT);
              toDelete.forEach((k) => delete nextFileChangeOutput[k]);
            }
            return { ...prev, fileChangeOutputById: nextFileChangeOutput };
          });
        }
        return;
      }

      if (method === "turn/diff/updated") {
        if (params?.diff) {
          updateDetail((prev) => ({ ...prev, turnDiff: params.diff as string }));
        }
      }

      if (method === "thread/started") {
        const threadId = params?.thread?.id;
        if (threadId) {
          setActiveThreadId(threadId);
          const existing = pendingThreadUpdates.current.get(threadId);
          const mapped = mapThread(params.thread);
          const merged =
            existing?.cwd && existing.cwd !== mapped.cwd
              ? { ...mapped, cwd: existing.cwd }
              : mapped;
          pendingThreadUpdates.current.set(threadId, merged);
          setThreadIds((prev) => (prev.includes(threadId) ? [...prev] : [...prev, threadId]));
        }
      }

      if (method === "turn/started") {
        const turnId = params?.turn?.id;
        const threadId = params?.threadId ?? params?.thread_id;
        if (threadId && threadId === activeThreadId && turnId) {
          updateDetail((prev) => ({ ...prev, activeTurnId: turnId, statusHeader: "Working", reasoningBuffer: "" }));
        }
      }

      if (method === "turn/completed") {
        const threadId = params?.threadId ?? params?.thread_id;
        if (threadId && threadId === activeThreadId) {
          updateDetail((prev) => ({ ...prev, activeTurnId: null, statusHeader: "Working", reasoningBuffer: "" }));
          setUnreadThreadIds((prev) => {
            if (!prev.has(threadId)) return prev;
            const next = new Set(prev);
            next.delete(threadId);
            return next;
          });
        } else if (threadId) {
          setUnreadThreadIds((prev) => {
            const next = new Set(prev);
            next.add(threadId);
            return next;
          });
        }
        if (historyLoaded) refreshThreads();
      }

      const summary = summarizeNotification(method, params);
      if (summary) {
        pushActivityItem({ title: summary.title, detail: (summary as any).detail, meta: (summary as any).meta, kind: summary.kind as any, label: method.replaceAll("/", " · ") });
      }
    },
    [addMessageDelta, finalizeAgentMessage, historyLoaded, activeThreadId, pushActivityItem, upsertActivityItem, refreshThreads, updateDetail, setActiveThreadId, setThreadIds]
  );

  // Request handler (for approvals)
  const handleRequest = useCallback(
    (request: { id: number; method: string; params?: any }) => {
      if (!request?.method) return;

      if (request.method === "item/commandExecution/requestApproval") {
        const params = request.params ?? {};
        updateDetail((prev) => ({
          ...prev,
          pendingApprovals: [
            ...prev.pendingApprovals,
            { id: request.id, kind: "command" as const, threadId: params.threadId, turnId: params.turnId, itemId: params.itemId, command: params.command, cwd: params.cwd, reason: params.reason, risk: params.risk, parsedCmd: params.parsedCmd },
          ],
        }));
        pushActivityItem({ kind: "approval", title: "Command approval requested", meta: [formatCommand(params.command)].filter(Boolean), detail: params.reason || params.risk });
        return;
      }

      if (request.method === "item/fileChange/requestApproval") {
        const params = request.params ?? {};
        updateDetail((prev) => ({
          ...prev,
          pendingApprovals: [
            ...prev.pendingApprovals,
            { id: request.id, kind: "file" as const, threadId: params.threadId, turnId: params.turnId, itemId: params.itemId, reason: params.reason },
          ],
        }));
        const count = params.changes?.length ?? 0;
        pushActivityItem({ kind: "approval", title: "File change approval requested", meta: [count ? `${count} file${count === 1 ? "" : "s"}` : "files"], detail: params.reason || params.risk });
        return;
      }

      pushActivity("Server request", request.method, { kind: "system" });
    },
    [pushActivity, pushActivityItem, updateDetail]
  );

  // IPC setup
  useEffect(() => {
    if (!window.codex) {
      setStatus({ state: "error", message: "Preload bridge not available." });
      return;
    }

    window.codex.getStatus().then((current) => setStatus(current)).catch(() => setStatus({ state: "error", message: "Unable to read status." }));

    const stopStatus = window.codex.onStatus((next) => setStatus(next));
    const stopNotifications = window.codex.onNotification(handleNotification);
    const stopRequests = window.codex.onRequest(handleRequest);
    const stopStderr = window.codex.onStderr((line) => {
      setStderrLines((prev) => [line, ...prev].slice(0, MAX_STDERR));
    });

    return () => {
      stopStatus();
      stopNotifications();
      stopRequests();
      stopStderr();
    };
  }, [handleNotification, handleRequest, setStatus, setStderrLines]);

  // Drag handlers with RAF for smooth performance
  const rafId = useRef<number | null>(null);
  const pendingWidth = useRef<number | null>(null);
  const pendingType = useRef<"sidebar" | "inspector" | "browserChat" | null>(null);

  useEffect(() => {
    const updateWidth = () => {
      if (pendingWidth.current === null || pendingType.current === null) return;
      const width = pendingWidth.current;
      const type = pendingType.current;
      if (type === "sidebar") {
        setSidebarWidth(width);
      } else if (type === "inspector") {
        setInspectorWidth(width);
      } else if (type === "browserChat") {
        setBrowserChatWidth(width);
      }
      rafId.current = null;
    };

    const handleMove = (event: PointerEvent) => {
      if (!dragState.current) return;
      event.preventDefault();
      const delta = event.clientX - dragState.current.startX;
      let nextWidth: number;
      if (dragState.current.type === "sidebar") {
        nextWidth = Math.min(420, Math.max(200, dragState.current.startWidth + delta));
      } else if (dragState.current.type === "inspector") {
        nextWidth = Math.min(1200, Math.max(240, dragState.current.startWidth - delta));
      } else if (dragState.current.type === "browserChat") {
        nextWidth = Math.min(600, Math.max(280, dragState.current.startWidth + delta));
      } else {
        return;
      }
      pendingWidth.current = nextWidth;
      pendingType.current = dragState.current.type;
      if (rafId.current === null) {
        rafId.current = requestAnimationFrame(updateWidth);
      }
    };

    const handleUp = (event: PointerEvent) => {
      if (!dragState.current) return;
      // Release pointer capture if set
      try {
        (event.target as Element)?.releasePointerCapture?.(event.pointerId);
      } catch {}
      dragState.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
      pendingWidth.current = null;
      pendingType.current = null;
    };

    document.addEventListener("pointermove", handleMove);
    document.addEventListener("pointerup", handleUp);
    return () => {
      document.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerup", handleUp);
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
      }
    };
  }, [setSidebarWidth, setInspectorWidth, setBrowserChatWidth]);

  const handleComposerKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      sendTurn();
    }
  };

  // Derived data
  const activeItems = useMemo(() => {
    if (!activeThreadId) return [];
    return itemSequence.filter((entry) => entry.threadId === activeThreadId).map((entry) => itemsById[entry.id]).filter(Boolean);
  }, [activeThreadId, itemSequence, itemsById]);

  const fileChangeItems = useMemo(() => activeItems.filter((record) => record.item?.type === "fileChange"), [activeItems]);
  const commandItems = useMemo(() => activeItems.filter((record) => record.item?.type === "commandExecution"), [activeItems]);

  const fileChanges = useMemo(() => {
    const changes: Array<{ path: string; kind: string }> = [];
    fileChangeItems.forEach((record) => {
      const list = record.item?.changes ?? [];
      list.forEach((change: any) => {
        if (!change?.path) return;
        changes.push({ path: change.path, kind: change.kind || "update" });
      });
    });
    return changes;
  }, [fileChangeItems]);

  const terminalOutput = useMemo(() => {
    if (commandItems.length === 0) return "No commands yet.";
    return commandItems
      .map((record) => {
        const cmd = record.item?.command || "command";
        const output = commandOutputById[record.item?.id] || record.item?.aggregatedOutput || "";
        const status = record.item?.status || "";
        const exitCode = record.item?.exitCode ?? record.item?.exit_code;
        const header = `$ ${cmd}`;
        const meta = exitCode !== undefined && exitCode !== null ? `exit ${exitCode}` : status;
        return [header, output.trim(), meta ? `(${meta})` : ""].filter(Boolean).join("\n");
      })
      .join("\n\n");
  }, [commandItems, commandOutputById]);

  // Tone helper - memoized to prevent unnecessary re-renders
  const toneForItem = useCallback((item: ActivityItem) => {
    if (item.status === "error") return "error";
    if (item.status === "running") return "warn";
    if (item.status === "completed") return "ok";
    if (item.kind === "approval") return "warn";
    if (item.kind === "file") return "ok";
    if (item.kind === "token") return "info";
    if (item.kind === "plan") return "info";
    if (item.kind === "error") return "error";
    return "muted";
  }, []);

  // Memoized render function for timeline items to prevent unnecessary re-renders
  const renderTimelineItem = useCallback((item: ActivityRenderItem, index: number) => {
    // Thinking blocks - show extracted header with content
    if (item.kind === "thinking") {
      const detail = item.detail ?? "";
      const match = detail ? findLeadingBoldHeader(detail) : null;
      const heading = match?.header ?? item.title ?? "Thinking";
      const content = match ? stripBoldHeader(detail, match) : detail;
      const showHeading = Boolean(heading && heading.toLowerCase() !== "thinking");
      return (
        <div key={item.id || index} className="activity-item" data-kind="thinking">
          <div className="activity-header">
            <span className="activity-dot" data-tone={toneForItem(item)} />
            {showHeading ? <span className="activity-title">{heading}</span> : null}
          </div>
          {content ? <div className="activity-detail activity-thinking">{content}</div> : null}
        </div>
      );
    }

    // Commands - show actions like "Read file.ts" (no output)
    if (item.kind === "command" || item.kind === "tool") {
      const actions = item.actions ?? [];
      // Show actions if available, otherwise parse command
      const displayText = actions.length > 0
        ? actions.join(", ")
        : item.command
          ? parseCommandAction(item.command)
          : "";
      return (
        <div key={item.id || index} className="activity-item" data-kind="command">
          <div className="activity-header">
            <span className="activity-dot" data-tone={toneForItem(item)} />
            <span className="activity-command">{displayText}</span>
          </div>
        </div>
      );
    }

    // Plan updates
    if (item.kind === "plan") {
      const steps = item.steps ?? [];
      return (
        <div key={item.id || index} className="activity-item" data-kind="plan">
          <div className="activity-header">
            <span className="activity-dot" data-tone={toneForItem(item)} />
            <span className="activity-title">{item.title || "Plan update"}</span>
          </div>
          {steps.length > 0 ? (
            <div className="activity-plan">
              {steps.map((step, stepIndex) => (
                <div key={`${item.id}-step-${stepIndex}`} className="activity-plan-step" data-status={step.status}>- {step.label}</div>
              ))}
            </div>
          ) : null}
        </div>
      );
    }

    // Default - simple event
    const metaLine = item.meta?.join(" · ");
    return (
      <div key={item.id || index} className="activity-item" data-kind={item.kind || "system"}>
        <div className="activity-header">
          <span className="activity-dot" data-tone={toneForItem(item)} />
          <span className="activity-title">{item.title || item.label || "Event"}</span>
        </div>
        {metaLine ? <div className="activity-meta">{metaLine}</div> : null}
        {item.detail ? <div className="activity-detail">{item.detail}</div> : null}
      </div>
    );
  }, [toneForItem]);

  // We need to access threads from pendingThreadUpdates since atomFamily updates are tricky
  // Let's use a simpler approach - store threads in a regular atom as an object
  const getThreadById = (id: string): ThreadSummary | null => {
    return pendingThreadUpdates.current.get(id) || null;
  };
  const workspaceReadyForCommands = Boolean(activeThreadId && pendingThreadUpdates.current.get(activeThreadId)?.cwd);

  // Command palette commands
  const commands: Command[] = useMemo(() => [
    {
      id: "command-palette",
      label: "Command Palette",
      shortcut: "Cmd+K",
      category: "General",
      action: () => setShowCommandPalette(true),
    },
    {
      id: "new-workspace",
      label: "New Workspace",
      shortcut: "Cmd+N",
      category: "Workspace",
      action: openWorkspace,
    },
    {
      id: "close-workspace",
      label: "Close Workspace",
      shortcut: "Cmd+W",
      category: "Workspace",
      action: () => activeThreadId && closeWorkspace(activeThreadId),
    },
    {
      id: "save-all",
      label: "Save All",
      category: "File",
      action: () => {
        void saveAllFiles();
      },
    },
    {
      id: "settings",
      label: "Open Settings",
      shortcut: "Cmd+,",
      category: "General",
      action: () => setShowSettings(true),
    },
    {
      id: "focus-input",
      label: "Focus Input",
      shortcut: "Cmd+L",
      category: "General",
      action: () => textareaRef.current?.focus(),
    },
    {
      id: "close-modal",
      label: "Close",
      shortcut: "Escape",
      category: "General",
      action: () => {
        if (showCommandPalette) setShowCommandPalette(false);
        else if (showSettings) setShowSettings(false);
        else if (showTerminal) setShowTerminal(false);
        else if (showComposerCloud) setShowComposerCloud(false);
        else if (activeTab === "browser") setActiveTab("events");
        else if (showTaskBoardPage) setShowTaskBoardPage(false);
      },
    },
    {
      id: "toggle-cloud-surface",
      label: showComposerCloud ? "Hide Cloud Tasks" : "Show Cloud Tasks",
      shortcut: "Cmd+Shift+C",
      category: "View",
      action: () => {
        if (!workspaceReadyForCommands) return;
        setShowTaskBoardPage(false);
        setActiveTab("events");
        setShowComposerCloud((prev) => !prev);
      },
    },
    {
      id: "toggle-browser-panel",
      label: activeTab === "browser" ? "Hide Browser Panel" : "Show Browser Panel",
      shortcut: "Cmd+Shift+B",
      category: "View",
      action: () => {
        setShowComposerCloud(false);
        setActiveTab((prev) => (prev === "browser" ? "events" : "browser"));
      },
    },
    {
      id: "toggle-theme",
      label: "Toggle Theme",
      category: "Appearance",
      action: () => setTheme(theme === "dark" ? "light" : "dark"),
    },
    {
      id: "toggle-terminal",
      label: "Toggle Terminal",
      shortcut: "Cmd+`",
      category: "General",
      action: () => setShowTerminal((prev) => !prev),
    },
    {
      id: "toggle-split-view",
      label: "Toggle Split View",
      shortcut: "Cmd+Shift+E",
      category: "View",
      action: () => setSplitViewEnabled((prev) => !prev),
    },
    {
      id: "toggle-task-board",
      label: showTaskBoardPage ? "Show Chat Workspace" : "Show Task Board",
      shortcut: "Cmd+Shift+T",
      category: "View",
      action: () => {
        if (!workspaceReadyForCommands) return;
        setShowTaskBoardPage((prev) => !prev);
      },
    },
    {
      id: "send-message",
      label: "Send Message",
      shortcut: "Cmd+Enter",
      category: "Chat",
      action: sendTurn,
    },
    ...threadIds.slice(0, 9).map((id, index) => ({
      id: `switch-thread-${index + 1}`,
      label: `Switch to Workspace ${index + 1}`,
      shortcut: `Cmd+${index + 1}`,
      category: "Workspace",
      action: () => selectThread(id),
    })),
  ], [
    activeTab,
    activeThreadId,
    closeWorkspace,
    openWorkspace,
    saveAllFiles,
    selectThread,
    sendTurn,
    setActiveTab,
    setSplitViewEnabled,
    setTheme,
    showCommandPalette,
    showComposerCloud,
    showSettings,
    showTaskBoardPage,
    showTerminal,
    workspaceReadyForCommands,
    theme,
    threadIds,
  ]);

  // Register keyboard shortcuts
  useKeyboardShortcuts(commands, { enabled: !showCommandPalette });

  // Build threads array from pendingThreadUpdates
  const threadsFromUpdates = useMemo(() => {
    return threadIds.map((id) => pendingThreadUpdates.current.get(id)).filter((t): t is ThreadSummary => t !== null);
  }, [threadIds]);

  const pinnedThreadsDisplay = useMemo(() => threadsFromUpdates.filter((t) => pinnedIds.has(t.id)), [threadsFromUpdates, pinnedIds]);
  const archivedThreadsDisplay = useMemo(() => threadsFromUpdates.filter((t) => archivedIds.has(t.id)), [threadsFromUpdates, archivedIds]);
  const regularThreadsDisplay = useMemo(() => threadsFromUpdates.filter((t) => !pinnedIds.has(t.id) && !archivedIds.has(t.id)), [threadsFromUpdates, pinnedIds, archivedIds]);
  const activeThreadDisplay = useMemo(() => activeThreadId ? pendingThreadUpdates.current.get(activeThreadId) || null : null, [activeThreadId, threadIds]);
  const normalizedThreadSearch = threadSearch.trim().toLowerCase();
  const sortThreads = useCallback(
    (threads: ThreadSummary[]) => {
      const sorted = [...threads];
      sorted.sort((a, b) => {
        if (sidebarSort === "title") {
          return getProjectName(a).localeCompare(getProjectName(b));
        }
        if (sidebarSort === "created") {
          return (b.createdAt || 0) - (a.createdAt || 0);
        }
        return getThreadUpdatedAt(b) - getThreadUpdatedAt(a);
      });
      return sorted;
    },
    [sidebarSort]
  );

  const threadMatchesSearch = useCallback(
    (thread: ThreadSummary) => {
      if (!normalizedThreadSearch) return true;
      return getThreadSearchText(thread).includes(normalizedThreadSearch);
    },
    [normalizedThreadSearch]
  );

  const visibleRegularThreads = useMemo(() => {
    let threads = regularThreadsDisplay;

    if (threadVisibility !== "all") {
      const sevenDaysAgo = Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 7;
      const activeBranch = activeThreadDisplay?.gitInfo?.branch;
      threads = threads.filter((thread) => {
        const updatedAt = getThreadUpdatedAt(thread);
        if (updatedAt >= sevenDaysAgo) return true;
        if (activeBranch && thread.gitInfo?.branch === activeBranch) return true;
        return false;
      });
    }

    return sortThreads(threads.filter(threadMatchesSearch));
  }, [threadVisibility, regularThreadsDisplay, activeThreadDisplay?.gitInfo?.branch, threadMatchesSearch, sortThreads]);
  const visiblePinnedThreads = useMemo(
    () => sortThreads(pinnedThreadsDisplay.filter(threadMatchesSearch)),
    [pinnedThreadsDisplay, sortThreads, threadMatchesSearch]
  );
  const visibleArchivedThreads = useMemo(
    () => sortThreads(archivedThreadsDisplay.filter(threadMatchesSearch)),
    [archivedThreadsDisplay, sortThreads, threadMatchesSearch]
  );
  const groupedRegularThreads = useMemo(() => {
    if (sidebarGroup === "workspace") {
      const groups = new Map<string, ThreadSummary[]>();
      for (const thread of visibleRegularThreads) {
        const key = getProjectName(thread);
        const list = groups.get(key) ?? [];
        list.push(thread);
        groups.set(key, list);
      }
      return Array.from(groups.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([label, threads]) => ({ key: `workspace-${label}`, label, threads }));
    }

    const now = Math.floor(Date.now() / 1000);
    const buckets: Array<{ key: string; label: string; minAgeSec: number; maxAgeSec: number }> = [
      { key: "today", label: "Today", minAgeSec: 0, maxAgeSec: 60 * 60 * 24 },
      { key: "yesterday", label: "Yesterday", minAgeSec: 60 * 60 * 24, maxAgeSec: 60 * 60 * 24 * 2 },
      { key: "week", label: "Last 7 Days", minAgeSec: 60 * 60 * 24 * 2, maxAgeSec: 60 * 60 * 24 * 7 },
      { key: "older", label: "Older", minAgeSec: 60 * 60 * 24 * 7, maxAgeSec: Number.POSITIVE_INFINITY },
    ];
    return buckets
      .map((bucket) => ({
        key: bucket.key,
        label: bucket.label,
        threads: visibleRegularThreads.filter((thread) => {
          const age = now - getThreadUpdatedAt(thread);
          return age >= bucket.minAgeSec && age < bucket.maxAgeSec;
        }),
      }))
      .filter((group) => group.threads.length > 0);
  }, [sidebarGroup, visibleRegularThreads]);
  const showRegularGroupLabels = sidebarGroup === "workspace" || groupedRegularThreads.length > 1;
  const workspacePath = activeThreadDisplay?.cwd ?? null;
  const workspaceReadyDisplay = Boolean(activeThreadDisplay?.cwd);
  const showAuxPanel = !showTaskBoardPage && activeTab === "browser";
  const workspaceTaskBoardCards = useMemo(
    () => (workspacePath ? taskBoardCards.filter((card) => card.workspacePath === workspacePath) : []),
    [taskBoardCards, workspacePath]
  );
  const workspaceThreads = useMemo(
    () =>
      workspacePath
        ? threadsFromUpdates.filter((thread) => thread.cwd === workspacePath)
        : [],
    [threadsFromUpdates, workspacePath]
  );

  useEffect(() => {
    if (showTaskBoardPage && !workspaceReadyDisplay) {
      setShowTaskBoardPage(false);
    }
  }, [showTaskBoardPage, workspaceReadyDisplay]);

  const openTaskBoardPage = useCallback(() => {
    if (!workspaceReadyDisplay) return;
    setActiveTab("events");
    setShowComposerCloud(false);
    setShowTaskBoardPage(true);
  }, [setActiveTab, workspaceReadyDisplay]);

  const openCloudFromComposer = useCallback(() => {
    if (!workspaceReadyDisplay) return;
    setShowTaskBoardPage(false);
    setActiveTab("events");
    setShowComposerCloud((prev) => !prev);
  }, [setActiveTab, workspaceReadyDisplay]);

  const openCloudSurface = useCallback(() => {
    if (!workspaceReadyDisplay) return;
    setShowTaskBoardPage(false);
    setActiveTab("events");
    setShowComposerCloud(true);
  }, [setActiveTab, workspaceReadyDisplay]);

  const toggleBrowserPanel = useCallback(() => {
    setShowTaskBoardPage(false);
    setShowComposerCloud(false);
    setActiveTab((prev) => (prev === "browser" ? "events" : "browser"));
  }, [setActiveTab]);

  const closeAuxPanel = useCallback(() => {
    setActiveTab("events");
  }, [setActiveTab]);

  const handleSemanticOpenFile = useCallback((absolutePath: string, relativePath: string, line: number) => {
    if (!workspacePath) return;
    void openFileInEditor({ path: absolutePath, workspaceId: workspacePath });
    pushActivity("Opened semantic result", `${relativePath}:${line}`);
  }, [openFileInEditor, pushActivity, workspacePath]);

  const handlePinSemanticContext = useCallback((entry: string) => {
    const normalized = entry.replace(/\\s+/g, " ").trim();
    if (!normalized) return;
    setPinnedSemanticContext((prev) => {
      const next = [normalized, ...prev.filter((item) => item !== normalized)];
      return next.slice(0, 8);
    });
  }, []);

  const clearPinnedSemanticContext = useCallback(() => {
    setPinnedSemanticContext([]);
  }, []);

  const upsertTaskBoardCard = useCallback((id: string, updater: (card: TaskBoardCard) => TaskBoardCard) => {
    const now = Math.floor(Date.now() / 1000);
    setTaskBoardCards((prev) =>
      prev.map((card) => {
        if (card.id !== id) return card;
        const next = updater(card);
        return { ...next, updatedAt: now };
      })
    );
  }, []);

  const handleCreateTaskBoardCard = useCallback(
    (kind: TaskBoardKind, title: string) => {
      if (!workspacePath) return;
      const now = Math.floor(Date.now() / 1000);
      const id = `tb-${now}-${Math.random().toString(36).slice(2, 8)}`;
      setTaskBoardCards((prev) => [
        ...prev,
        {
          id,
          workspacePath,
          title,
          kind,
          column: kind === "cloud" ? "running" : "backlog",
          deps: [],
          threadId: kind === "local" ? activeThreadId : null,
          cloudTaskId: null,
          createdAt: now,
          updatedAt: now,
        },
      ]);
    },
    [activeThreadId, workspacePath]
  );

  const handleMoveTaskBoardCard = useCallback((id: string, column: TaskBoardColumn) => {
    upsertTaskBoardCard(id, (card) => ({ ...card, column }));
  }, [upsertTaskBoardCard]);

  const handleDeleteTaskBoardCard = useCallback((id: string) => {
    setTaskBoardCards((prev) =>
      prev
        .filter((card) => card.id !== id)
        .map((card) => ({
          ...card,
          deps: card.deps.filter((depId) => depId !== id),
        }))
    );
  }, []);

  const handleSetTaskBoardDeps = useCallback((id: string, deps: string[]) => {
    const depSet = new Set(deps.filter((depId) => depId !== id));
    upsertTaskBoardCard(id, (card) => ({ ...card, deps: Array.from(depSet) }));
  }, [upsertTaskBoardCard]);

  const handleLinkTaskBoardActiveThread = useCallback((id: string) => {
    if (!activeThreadId) return;
    upsertTaskBoardCard(id, (card) => ({ ...card, threadId: activeThreadId }));
  }, [activeThreadId, upsertTaskBoardCard]);

  const handleLinkTaskBoardThread = useCallback((id: string, threadId: string | null) => {
    upsertTaskBoardCard(id, (card) => ({ ...card, threadId }));
  }, [upsertTaskBoardCard]);

  const handleImportCloudTasksToBoard = useCallback(async () => {
    if (!workspacePath || !window.codex?.cloud?.listTasks) return;
    setImportingCloudTasks(true);
    try {
      const result = await window.codex.cloud.listTasks();
      if (!result?.success || !Array.isArray(result.tasks)) {
        pushActivity("Failed to import cloud tasks", result?.error || "Cloud list failed");
        return;
      }
      const now = Math.floor(Date.now() / 1000);
      setTaskBoardCards((prev) => {
        const next = [...prev];
        const indexByCloudId = new Map<string, number>();
        next.forEach((card, idx) => {
          if (card.workspacePath === workspacePath && card.cloudTaskId) {
            indexByCloudId.set(card.cloudTaskId, idx);
          }
        });
        for (const task of result.tasks.slice(0, 40) as any[]) {
          const cloudTaskId = task?.id?.id ? String(task.id.id) : "";
          if (!cloudTaskId) continue;
          const title = String(task?.title || "Cloud task");
          const column = cloudStatusToColumn(task?.status);
          const existingIdx = indexByCloudId.get(cloudTaskId);
          if (existingIdx !== undefined) {
            next[existingIdx] = {
              ...next[existingIdx],
              title,
              kind: "cloud",
              column,
              updatedAt: now,
            };
          } else {
            next.push({
              id: `tb-cloud-${cloudTaskId}`,
              workspacePath,
              title,
              kind: "cloud",
              column,
              deps: [],
              threadId: null,
              cloudTaskId,
              createdAt: now,
              updatedAt: now,
            });
          }
        }
        return next;
      });
      pushActivity("Cloud tasks imported to board", workspacePath);
    } catch (err) {
      pushActivity("Failed to import cloud tasks", String(err));
    } finally {
      setImportingCloudTasks(false);
    }
  }, [pushActivity, workspacePath]);

  const chatItems = useMemo<ChatListItem[]>(() => {
    const prefix = activeThreadId || "thread:none";
    const items: ChatListItem[] = [];
    if (messages.length === 0 && pendingApprovals.length === 0) {
      items.push({ key: `${prefix}:empty`, kind: "empty" });
    } else {
      items.push(...messages.map((message, index) => ({ key: `${prefix}:msg:${message.id}:${index}`, kind: "message" as const, message })));
      items.push(...pendingApprovals.map((approval) => ({ key: `${prefix}:approval:${approval.id}`, kind: "approval" as const, approval })));
    }
    if (activeTurnId) {
      items.push({ key: `${prefix}:thinking:${activeTurnId}`, kind: "thinking" });
    }
    return items;
  }, [activeThreadId, activeTurnId, messages, pendingApprovals]);

  const shouldVirtualizeChat = chatItems.length >= CHAT_VIRTUALIZE_MIN_ITEMS;

  const renderChatItem = useCallback((item: ChatListItem) => {
    if (item.kind === "empty") {
      return (
        <div className="empty-state">
          {workspaceReadyDisplay ? (
            <><h3>Start a session</h3><p>Send a task to begin. Updates stream here.</p></>
          ) : (
            <><h3>Select a folder to start</h3><p>Choose a workspace before starting a chat.</p><button className="primary" onClick={openWorkspace}>Open folder</button></>
          )}
        </div>
      );
    }
    if (item.kind === "message") {
      return <ChatBubble message={item.message} />;
    }
    if (item.kind === "approval") {
      return <ApprovalCard approval={item.approval} onAccept={() => respondApproval(item.approval, "accept")} onDecline={() => respondApproval(item.approval, "decline")} />;
    }
    return (
      <div className="thinking-row">
        <div className="thinking-indicator">
          <div className="pulsing-dot" />
          <span className="shimmer-text">{statusHeader || "Working..."}</span>
        </div>
      </div>
    );
  }, [openWorkspace, respondApproval, statusHeader, workspaceReadyDisplay]);

  const chatVirtualMetrics = useMemo(() => {
    if (!shouldVirtualizeChat) {
      return { totalHeight: 0, rows: [] as Array<{ item: ChatListItem; top: number; height: number }> };
    }
    let y = 0;
    const rows = chatItems.map((item) => {
      const measured = chatItemHeightsRef.current.get(item.key);
      const height = measured ?? estimateChatItemHeight(item);
      const top = y;
      y += height;
      return { item, top, height };
    });
    return { totalHeight: y, rows };
  }, [chatItems, chatMeasureVersion, shouldVirtualizeChat]);

  const visibleChatVirtualRows = useMemo(() => {
    if (!shouldVirtualizeChat) return [];
    const start = Math.max(0, chatScrollTop - CHAT_VIRTUAL_OVERSCAN_PX);
    const end = chatScrollTop + Math.max(0, chatViewportHeight) + CHAT_VIRTUAL_OVERSCAN_PX;
    const rows = chatVirtualMetrics.rows;
    if (rows.length === 0) return [];

    let lo = 0;
    let hi = rows.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (rows[mid].top + rows[mid].height < start) lo = mid + 1;
      else hi = mid;
    }
    const first = lo;

    lo = first;
    hi = rows.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (rows[mid].top <= end) lo = mid + 1;
      else hi = mid;
    }

    return rows.slice(first, lo);
  }, [chatScrollTop, chatViewportHeight, chatVirtualMetrics.rows, shouldVirtualizeChat]);

  useEffect(() => {
    const keySet = new Set(chatItems.map((item) => item.key));
    let changed = false;
    for (const key of chatItemHeightsRef.current.keys()) {
      if (!keySet.has(key)) {
        chatItemHeightsRef.current.delete(key);
        changed = true;
      }
    }
    if (changed) {
      setChatMeasureVersion((prev) => prev + 1);
    }
  }, [chatItems]);

  const handleChatRowMeasure = useCallback((key: string, height: number) => {
    const prev = chatItemHeightsRef.current.get(key);
    if (prev !== undefined && Math.abs(prev - height) <= 1) return;
    chatItemHeightsRef.current.set(key, height);
    setChatMeasureVersion((version) => version + 1);
  }, []);

  // Stable callbacks for thread row actions to prevent memoization breaks
  const handleSelectThread = useCallback((id: string) => () => selectThread(id), [selectThread]);
  const handleTogglePin = useCallback((id: string) => () => togglePin(id), [togglePin]);
  const handleToggleArchive = useCallback((id: string) => () => toggleArchive(id), [toggleArchive]);
  const handleRenameThread = useCallback((id: string) => () => renameThread(id), [renameThread]);
  const handleToggleUnread = useCallback((id: string) => () => toggleUnread(id), [toggleUnread]);
  const handleCloseWorkspace = useCallback((id: string) => () => closeWorkspace(id), [closeWorkspace]);
  const handleOpenBoardThread = useCallback((threadId: string) => {
    setShowTaskBoardPage(false);
    void selectThread(threadId);
  }, [selectThread]);

  return (
    <div className={`app${!activeThreadId ? " no-sidebar" : ""}`} style={{ ["--sidebar-width" as any]: `${sidebarWidth}px`, ["--inspector-width" as any]: `${inspectorWidth}px` }}>
      {activeThreadId && (
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="brand">
            <div className="brand-mark">C</div>
            <span className="brand-title">Chimera</span>
          </div>
          <button className="sidebar-new-session" onClick={openWorkspace} title="New Session">
            <span className="new-session-icon">+</span>
            <span className="new-session-text">Add Project</span>
          </button>
        </div>

        <div className="sidebar-body">
          <WorkspaceSwitcher />
          <div className="sidebar-toolbar">
            <div className="section-title">Conversations</div>
            <div className="sidebar-mode-toggle">
              <button
                className={threadVisibility === "relevant" ? "sidebar-mode-btn active" : "sidebar-mode-btn"}
                onClick={() => setThreadVisibility("relevant")}
              >
                Relevant
              </button>
              <button
                className={threadVisibility === "all" ? "sidebar-mode-btn active" : "sidebar-mode-btn"}
                onClick={() => setThreadVisibility("all")}
              >
                All
              </button>
            </div>
          </div>

          <div className="sidebar-filters">
            <input
              className="sidebar-search"
              type="text"
              value={threadSearch}
              onChange={(event) => setThreadSearch(event.target.value)}
              placeholder="Search conversations"
            />
            <div className="sidebar-filter-row">
              <label className="sidebar-filter-field">
                <span>Sort</span>
                <select value={sidebarSort} onChange={(event) => setSidebarSort(event.target.value as "updated" | "created" | "title")}>
                  <option value="updated">Updated</option>
                  <option value="created">Created</option>
                  <option value="title">Title</option>
                </select>
              </label>
              <label className="sidebar-filter-field">
                <span>Group</span>
                <select value={sidebarGroup} onChange={(event) => setSidebarGroup(event.target.value as "recency" | "workspace")}>
                  <option value="recency">Recency</option>
                  <option value="workspace">Workspace</option>
                </select>
              </label>
            </div>
          </div>

          {visiblePinnedThreads.length > 0 && (
            <div className="sidebar-section">
              <div className="section-title">Pinned</div>
              {visiblePinnedThreads.map((thread) => (
                <ThreadRow
                  key={thread.id}
                  thread={thread}
                  active={thread.id === activeThreadId}
                  pinned={pinnedIds.has(thread.id)}
                  archived={archivedIds.has(thread.id)}
                  unread={unreadThreadIds.has(thread.id)}
                  onSelect={handleSelectThread(thread.id)}
                  onPin={handleTogglePin(thread.id)}
                  onArchive={handleToggleArchive(thread.id)}
                  onRename={handleRenameThread(thread.id)}
                  onToggleUnread={handleToggleUnread(thread.id)}
                  onClose={handleCloseWorkspace(thread.id)}
                />
              ))}
            </div>
          )}

          <div className="sidebar-section">
            <div className="section-title">Sessions</div>
            {groupedRegularThreads.length === 0 && historyLoaded && (
              <div className="thread-empty">No matching sessions yet.</div>
            )}
            {groupedRegularThreads.map((group) => (
              <div className="sidebar-thread-group" key={group.key}>
                {showRegularGroupLabels && <div className="sidebar-thread-group-title">{group.label}</div>}
                {group.threads.map((thread) => (
                  <ThreadRow
                    key={thread.id}
                    thread={thread}
                    active={thread.id === activeThreadId}
                    pinned={pinnedIds.has(thread.id)}
                    archived={archivedIds.has(thread.id)}
                    unread={unreadThreadIds.has(thread.id)}
                    onSelect={handleSelectThread(thread.id)}
                    onPin={handleTogglePin(thread.id)}
                    onArchive={handleToggleArchive(thread.id)}
                    onRename={handleRenameThread(thread.id)}
                    onToggleUnread={handleToggleUnread(thread.id)}
                    onClose={handleCloseWorkspace(thread.id)}
                  />
                ))}
              </div>
            ))}
          </div>

          {visibleArchivedThreads.length > 0 && (
            <div className="sidebar-section">
              <div className="section-title">Archived</div>
              {visibleArchivedThreads.map((thread) => (
                <ThreadRow
                  key={thread.id}
                  thread={thread}
                  active={thread.id === activeThreadId}
                  pinned={pinnedIds.has(thread.id)}
                  archived={archivedIds.has(thread.id)}
                  unread={unreadThreadIds.has(thread.id)}
                  onSelect={handleSelectThread(thread.id)}
                  onPin={handleTogglePin(thread.id)}
                  onArchive={handleToggleArchive(thread.id)}
                  onRename={handleRenameThread(thread.id)}
                  onToggleUnread={handleToggleUnread(thread.id)}
                  onClose={handleCloseWorkspace(thread.id)}
                />
              ))}
            </div>
          )}

          <div className="sidebar-section sidebar-tools-section">
            <div className="sidebar-tools-head">
              <div className="section-title">Skills</div>
              <button
                className="ghost sidebar-tools-toggle"
                onClick={() => setShowSkillsInSidebar((prev) => !prev)}
              >
                {showSkillsInSidebar ? "Hide" : "Show"}
              </button>
            </div>
            {showSkillsInSidebar ? (
              <Suspense fallback={<LazyPanelFallback label="Loading skills..." />}>
                <SidebarSkills workspacePath={workspacePath} variant="sidebar" />
              </Suspense>
            ) : null}
          </div>

          <div className="sidebar-section sidebar-tools-section">
            <div className="sidebar-tools-head">
              <div className="section-title">Automations</div>
              <button
                className="ghost sidebar-tools-toggle"
                onClick={() => setShowAutomationsInSidebar((prev) => !prev)}
              >
                {showAutomationsInSidebar ? "Hide" : "Show"}
              </button>
            </div>
            {showAutomationsInSidebar ? (
              <Suspense fallback={<LazyPanelFallback label="Loading automations..." />}>
                <SidebarAutomations onOpenCloudPanel={openCloudSurface} variant="sidebar" />
              </Suspense>
            ) : null}
          </div>

          <div className="sidebar-section sidebar-tools-section">
            <div className="sidebar-tools-head">
              <div className="section-title">Semantic</div>
              <button
                className="ghost sidebar-tools-toggle"
                onClick={() => setShowSemanticInSidebar((prev) => !prev)}
              >
                {showSemanticInSidebar ? "Hide" : "Show"}
              </button>
            </div>
            {showSemanticInSidebar ? (
              <Suspense fallback={<LazyPanelFallback label="Loading semantic search..." />}>
                <SidebarSemanticSearch
                  workspacePath={workspacePath}
                  onOpenFile={handleSemanticOpenFile}
                  onPinContext={handlePinSemanticContext}
                />
              </Suspense>
            ) : null}
          </div>

          <div className="sidebar-section sidebar-tools-section">
            {workspaceReadyDisplay ? (
              <Suspense fallback={<LazyPanelFallback label="Loading task board..." />}>
                <SidebarTaskBoard cards={workspaceTaskBoardCards} onOpenBoard={openTaskBoardPage} />
              </Suspense>
            ) : (
              <div className="taskboard-sidebar taskboard-sidebar-empty-state">
                <div className="taskboard-sidebar-title">Task Board</div>
                <div className="taskboard-sidebar-empty-message">
                  Select a project to use the Task Board.
                </div>
                <button className="ghost" onClick={openWorkspace}>
                  Select Project
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="sidebar-footer">
          <button className="settings-btn" onClick={() => setShowSettings(true)}>Settings</button>
        </div>
      </aside>
      )}

      {activeThreadId && (
        <div className="resize-handle sidebar" onPointerDown={(event) => {
          event.preventDefault();
          (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
          dragState.current = { type: "sidebar", startX: event.clientX, startWidth: sidebarWidth };
          document.body.style.cursor = "col-resize";
          document.body.style.userSelect = "none";
        }} />
      )}

      <main className="main">
        {activeThreadId && (
        <header className="topbar">
          <div className="topbar-left">
            <div className="workspace-title-row">
              <div className="workspace-title">{activeThreadDisplay?.cwd?.split("/").pop() || activeThreadDisplay?.preview || "No folder selected"}</div>
              <WorkspaceSwitcher />
            </div>
            <div className="workspace-meta">
              {activeThreadDisplay?.cwd ? (
                <>
                  {activeThreadDisplay?.gitInfo?.branch && (<><span>{activeThreadDisplay.gitInfo.branch}</span><span className="separator">·</span></>)}
                  <span>{activeThreadDisplay.cwd}</span>
                </>
              ) : (
                <span>Select a folder to start</span>
              )}
            </div>
          </div>
          <div className="topbar-actions">
            <button
              className="ghost"
              onClick={() => textareaRef.current?.focus()}
              title="Focus composer"
            >
              New Prompt
            </button>
            <button
              className={showComposerCloud ? "ghost active" : "ghost"}
              onClick={openCloudFromComposer}
              title="Toggle cloud tasks"
              disabled={!workspaceReadyDisplay}
            >
              Cloud
            </button>
            <button
              className={showTaskBoardPage ? "ghost active" : "ghost"}
              onClick={() => {
                if (showTaskBoardPage) {
                  setShowTaskBoardPage(false);
                } else {
                  openTaskBoardPage();
                }
              }}
              title="Toggle task board"
              disabled={!workspaceReadyDisplay}
            >
              Board
            </button>
            <button
              className={showAuxPanel ? "ghost active" : "ghost"}
              onClick={toggleBrowserPanel}
              title="Toggle browser panel"
            >
              Browser
            </button>
            {showAuxPanel && (
              <button className="ghost" onClick={closeAuxPanel}>
                Close Panel
              </button>
            )}
            {activeTurnId && (
              <button className="danger" onClick={interruptTurn}>Stop</button>
            )}
          </div>
        </header>
        )}

        <div className={`workspace ${showTaskBoardPage ? "workspace-mode-page" : showAuxPanel ? "" : "workspace-no-inspector"}`}>
          {!activeThreadId ? (
            <Suspense fallback={<LazyPanelFallback label="Loading workspace..." />}>
              <WelcomeScreen
                onOpenFolder={openWorkspace}
                onOpenSettings={() => setShowSettings(true)}
                onNewSession={createNewSession}
                onSelectThread={selectThread}
              />
            </Suspense>
          ) : (
          showTaskBoardPage ? (
            <section className="mode-page">
              <Suspense fallback={<LazyPanelFallback label="Loading task board..." />}>
                <TaskBoard
                  workspacePath={workspacePath || ""}
                  cards={workspaceTaskBoardCards}
                  threads={workspaceThreads}
                  activeThreadId={activeThreadId}
                  importingCloud={importingCloudTasks}
                  onCreateCard={handleCreateTaskBoardCard}
                  onMoveCard={handleMoveTaskBoardCard}
                  onDeleteCard={handleDeleteTaskBoardCard}
                  onSetDependencies={handleSetTaskBoardDeps}
                  onLinkActiveThread={handleLinkTaskBoardActiveThread}
                  onLinkThread={handleLinkTaskBoardThread}
                  onOpenThread={handleOpenBoardThread}
                  onImportCloudTasks={handleImportCloudTasksToBoard}
                />
              </Suspense>
            </section>
          ) : (
          <SplitLayout
            leftPanel={(
              <Suspense fallback={<LazyPanelFallback label="Loading changes..." />}>
                <DiffPanel />
              </Suspense>
            )}
            rightPanel={(
              <section className="chat-panel">
            <div className={shouldVirtualizeChat ? "messages messages-virtualized" : "messages"} ref={messagesRef}>
              {shouldVirtualizeChat ? (
                <div className="messages-virtual-spacer" style={{ height: Math.max(1, chatVirtualMetrics.totalHeight) }}>
                  {visibleChatVirtualRows.map((row) => (
                    <VirtualizedChatRow
                      key={row.item.key}
                      itemKey={row.item.key}
                      top={row.top}
                      onMeasure={handleChatRowMeasure}
                    >
                      {renderChatItem(row.item)}
                    </VirtualizedChatRow>
                  ))}
                  <div
                    ref={messagesEndRef}
                    className="messages-end-anchor"
                    style={{ top: Math.max(0, chatVirtualMetrics.totalHeight - 1) }}
                  />
                </div>
              ) : (
                <>
                  {chatItems.map((item) => (
                    <React.Fragment key={item.key}>{renderChatItem(item)}</React.Fragment>
                  ))}
                  <div ref={messagesEndRef} className="messages-end-anchor" />
                </>
              )}
            </div>

            <div className={workspaceReadyDisplay ? "composer" : "composer disabled"} ref={composerRef} onPointerDown={(event) => event.stopPropagation()}>
              <div className="composer-input">
                <div className="composer-field">
                  <textarea ref={textareaRef} placeholder={workspaceReadyDisplay ? "Ask Codex to refactor, explain, or build…" : "Select a folder to start…"} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={handleComposerKey} aria-label="Codex prompt" name="prompt" autoComplete="off" disabled={!workspaceReadyDisplay} />
                  <div className="composer-bottom">
                    <div className="composer-controls">
                      <div className="composer-control">
                        <button type="button" className="composer-trigger" aria-haspopup="listbox" aria-expanded={openMenu === "model"} disabled={modelLoading || models.length === 0} onClick={() => setOpenMenu(openMenu === "model" ? null : "model")}>
                          {selectedModelId || (modelLoading ? "loading" : "model")}<span className="composer-caret">▾</span>
                        </button>
                        {openMenu === "model" && (
                          <div className="composer-menu" role="listbox" onPointerDown={(event) => event.stopPropagation()}>
                            <div className="composer-menu-title">Models</div>
                            {models.map((model) => (
                              <button key={model.id} type="button" className={model.id === selectedModelId ? "composer-menu-item active" : "composer-menu-item"} role="option" aria-selected={model.id === selectedModelId} onClick={() => { setSelectedModelId(model.id); setOpenMenu(null); }}>
                                {model.id}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {effortOptions.length > 0 && (
                        <div className="composer-control">
                          <button type="button" className="composer-trigger" aria-haspopup="listbox" aria-expanded={openMenu === "effort"} onClick={() => setOpenMenu(openMenu === "effort" ? null : "effort")}>
                            {selectedEffort || "think"}<span className="composer-caret">▾</span>
                          </button>
                          {openMenu === "effort" && (
                            <div className="composer-menu" role="listbox" onPointerDown={(event) => event.stopPropagation()}>
                              <div className="composer-menu-title">Thinking</div>
                              {effortOptions.map((option) => (
                                <button key={option.value} type="button" className={option.value === selectedEffort ? "composer-menu-item active" : "composer-menu-item"} role="option" aria-selected={option.value === selectedEffort} onClick={() => { setSelectedEffort(option.value); setOpenMenu(null); }}>
                                  {option.value === "minimal" ? "min" : option.value === "medium" ? "med" : option.value}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="composer-control">
                        <button type="button" className="composer-trigger" aria-haspopup="listbox" aria-expanded={openMenu === "preset"} onClick={() => setOpenMenu(openMenu === "preset" ? null : "preset")}>
                          {activeApprovalPreset.label}<span className="composer-caret">▾</span>
                        </button>
                        {openMenu === "preset" && (
                          <div className="composer-menu" role="listbox" onPointerDown={(event) => event.stopPropagation()}>
                            <div className="composer-menu-title">Mode</div>
                            {approvalPresets.map((preset) => (
                              <button key={preset.id} type="button" className={preset.id === approvalPresetId ? "composer-menu-item active" : "composer-menu-item"} role="option" aria-selected={preset.id === approvalPresetId} onClick={() => { setApprovalPresetId(preset.id); setOpenMenu(null); }}>
                                {preset.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {modelError ? <div className="composer-error">{modelError}</div> : null}
                    </div>

                    <div className="composer-actions">
                      <span className="composer-shortcut">⌘⏎ to run</span>
                      <button
                        className={useSemanticContext ? "ghost semantic-quick active" : "ghost semantic-quick"}
                        type="button"
                        aria-pressed={useSemanticContext}
                        onClick={() => setUseSemanticContext((prev) => !prev)}
                        disabled={!workspaceReadyDisplay}
                      >
                        Semantic
                      </button>
                      <button
                        className={showComposerCloud ? "ghost cloud-quick active" : "ghost cloud-quick"}
                        type="button"
                        aria-pressed={showComposerCloud}
                        onClick={openCloudFromComposer}
                        disabled={!workspaceReadyDisplay}
                      >
                        ☁ Cloud
                      </button>
                      <button className="ghost attach" type="button" disabled={!workspaceReadyDisplay}>Attach</button>
                      <button className="primary inline-run" onClick={sendTurn} disabled={!workspaceReadyDisplay || !input.trim()}>Run</button>
                    </div>
                  </div>
                  {(lastSemanticContextMeta || pinnedSemanticContext.length > 0) && (
                    <div className="composer-semantic-strip">
                      {lastSemanticContextMeta ? (
                        <span className="composer-semantic-meta">
                          Context used: {lastSemanticContextMeta.autoHits} auto + {lastSemanticContextMeta.pinned} pinned
                        </span>
                      ) : null}
                      {pinnedSemanticContext.length > 0 ? (
                        <>
                          <span className="composer-semantic-meta">
                            Pinned: {pinnedSemanticContext.length}
                          </span>
                          <button className="ghost composer-semantic-clear" type="button" onClick={clearPinnedSemanticContext}>
                            Clear pinned
                          </button>
                        </>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
              {showComposerCloud && workspaceReadyDisplay && (
                <div className="composer-cloud-surface" onPointerDown={(event) => event.stopPropagation()}>
                  <Suspense fallback={<LazyPanelFallback label="Loading cloud tasks..." />}>
                    <CloudPanel />
                  </Suspense>
                </div>
              )}
            </div>
              </section>
            )}
          />
          )
          )}

          {activeThreadId && showAuxPanel && (
            <>
            <div className="resize-handle right" onPointerDown={(event) => {
              event.preventDefault();
              (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
              dragState.current = { type: "inspector", startX: event.clientX, startWidth: inspectorWidth };
              document.body.style.cursor = "col-resize";
              document.body.style.userSelect = "none";
            }} />

          <aside className="right-panel aux-panel">
            <div className="aux-panel-header">
              <div className="aux-panel-title">Browser</div>
              <button className="ghost" onClick={closeAuxPanel}>Close</button>
            </div>

            <div className="tab-body">
              <Suspense fallback={<LazyPanelFallback label="Loading browser..." />}>
                <BrowserPanel
                  onNavigate={() => {}}
                  onSnapshot={() => {}}
                />
              </Suspense>
            </div>
          </aside>
            </>
          )}
        </div>

        {activeThreadId && activeThreadDisplay?.cwd && showTerminal && (
          <Suspense fallback={<LazyPanelFallback label="Loading terminal..." />}>
            <TerminalPanel
              cwd={activeThreadDisplay.cwd}
              isOpen={showTerminal}
              onClose={() => setShowTerminal(false)}
            />
          </Suspense>
        )}
      </main>

      {showSettings && (
        <Suspense fallback={<LazyOverlayFallback label="Loading settings..." />}>
          <Settings
            isOpen={showSettings}
            onClose={() => setShowSettings(false)}
          />
        </Suspense>
      )}

      {showCommandPalette && (
        <Suspense fallback={<LazyOverlayFallback label="Loading commands..." />}>
          <CommandPalette
            commands={commands}
            isOpen={showCommandPalette}
            onClose={() => setShowCommandPalette(false)}
          />
        </Suspense>
      )}

      <UpdateNotification position="top-right" />
    </div>
  );
}

const VirtualizedChatRow = React.memo(function VirtualizedChatRow({
  itemKey,
  top,
  onMeasure,
  children,
}: {
  itemKey: string;
  top: number;
  onMeasure: (itemKey: string, height: number) => void;
  children: React.ReactNode;
}) {
  const rowRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const node = rowRef.current;
    if (!node) return;
    onMeasure(itemKey, node.offsetHeight);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      onMeasure(itemKey, node.offsetHeight);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [itemKey, onMeasure]);

  return (
    <div className="messages-virtual-row" style={{ transform: `translateY(${top}px)` }}>
      <div ref={rowRef} className="messages-virtual-inner">
        {children}
      </div>
    </div>
  );
});

// Thread Row Component - each session represents a project workspace
type ThreadRowProps = {
  thread: ThreadSummary;
  active: boolean;
  pinned: boolean;
  archived: boolean;
  unread: boolean;
  onSelect: () => void;
  onPin: () => void;
  onArchive: () => void;
  onRename: () => void;
  onToggleUnread: () => void;
  onClose: () => void;
};

const ThreadRow = React.memo(function ThreadRow({
  thread,
  active,
  pinned,
  archived,
  unread,
  onSelect,
  onPin,
  onArchive,
  onRename,
  onToggleUnread,
  onClose,
}: ThreadRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const projectName = getProjectName(thread);
  const sessionPreview = thread.preview && thread.preview !== projectName ? thread.preview : null;

  useEffect(() => {
    if (!menuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [menuOpen]);

  const runMenuAction = (event: React.MouseEvent, action: () => void) => {
    event.stopPropagation();
    action();
    setMenuOpen(false);
  };

  return (
    <div
      className={active ? "thread-row active" : "thread-row"}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      tabIndex={0}
      role="button"
      title={thread.cwd || undefined}
    >
      <div className="thread-icon thread-icon--project">
        <span className="thread-project-initial">{projectName.charAt(0).toUpperCase()}</span>
      </div>
      <div className="thread-main">
        <div className="thread-project">{projectName}</div>
        {sessionPreview && <div className="thread-preview">{sessionPreview}</div>}
        <div className="thread-meta-row">
          {thread.gitInfo?.branch ? <span className="thread-branch">{thread.gitInfo.branch}</span> : null}
          <span className="thread-time">
            {thread.updatedAt || thread.createdAt ? formatTime(getThreadUpdatedAt(thread) * 1000) : "--"}
          </span>
        </div>
      </div>
      <div className="thread-row-trailing">
        {unread ? <span className="thread-unread-dot" title="Unread messages" /> : null}
        <div className={menuOpen ? "thread-actions menu-open" : "thread-actions"} ref={menuRef}>
          <button
            className="ghost icon thread-menu-trigger"
            onClick={(event) => {
              event.stopPropagation();
              setMenuOpen((prev) => !prev);
            }}
            title="Conversation actions"
          >
            ⋯
          </button>
          {menuOpen ? (
            <div className="thread-menu" onClick={(event) => event.stopPropagation()}>
              <button className="thread-menu-item" onClick={(event) => runMenuAction(event, onRename)}>Rename</button>
              <button className="thread-menu-item" onClick={(event) => runMenuAction(event, onPin)}>{pinned ? "Unpin" : "Pin"}</button>
              <button className="thread-menu-item" onClick={(event) => runMenuAction(event, onArchive)}>{archived ? "Unarchive" : "Archive"}</button>
              <button className="thread-menu-item" onClick={(event) => runMenuAction(event, onToggleUnread)}>{unread ? "Mark as read" : "Mark as unread"}</button>
              <button className="thread-menu-item danger" onClick={(event) => runMenuAction(event, onClose)}>Close</button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
});

// Chat Bubble Component - memoized to prevent unnecessary re-renders
const ChatBubble = React.memo(function ChatBubble({ message }: { message: Message }) {
  const content = message.text || "";
  const markdown = (
    <Suspense fallback={<span className="markdown-fallback">{content}</span>}>
      <MarkdownContent content={content} />
    </Suspense>
  );

  if (message.role === "user") {
    return <div className="chat-row"><div className="message-bubble user markdown">{markdown}</div></div>;
  }
  return <div className={message.streaming ? "chat-row message-streaming" : "chat-row"}><div className="assistant-line markdown">{markdown}</div></div>;
});

// Approval Card Component - memoized to prevent unnecessary re-renders
const ApprovalCard = React.memo(function ApprovalCard({ approval, onAccept, onDecline }: { approval: ApprovalRequest; onAccept: () => void; onDecline: () => void }) {
  return (
    <div className="approval-card">
      <div className="approval-title">{approval.kind === "command" ? "Approve command" : "Approve file changes"}</div>
      {approval.command ? <div className="approval-command">{approval.command}</div> : null}
      {approval.reason ? <div className="approval-reason">{approval.reason}</div> : null}
      {approval.risk ? <div className="approval-risk">Risk: {approval.risk}</div> : null}
      <div className="approval-actions">
        <button className="ghost" onClick={onDecline}>Decline</button>
        <button className="primary" onClick={onAccept}>Accept</button>
      </div>
    </div>
  );
});
