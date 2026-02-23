export {};

// Codex Cloud types
type TaskId = { id: string };

type TaskStatus = "pending" | "ready" | "applied" | "error";

type DiffSummary = {
  files_changed: number;
  lines_added: number;
  lines_removed: number;
};

type TaskSummary = {
  id: TaskId;
  title: string;
  status: TaskStatus;
  updated_at: string;
  environment_id?: string;
  environment_label?: string;
  summary: DiffSummary;
  is_review: boolean;
  attempt_total?: number;
};

type AttemptStatus = "pending" | "in_progress" | "completed" | "failed" | "cancelled" | "unknown";

type TurnAttempt = {
  turn_id: string;
  attempt_placement?: number;
  created_at?: string;
  status: AttemptStatus;
  diff?: string;
  messages: string[];
};

type ApplyStatus = "success" | "partial" | "error";

type ApplyOutcome = {
  applied: boolean;
  status: ApplyStatus;
  message: string;
  skipped_paths: string[];
  conflict_paths: string[];
};

type CreatedTask = {
  id: TaskId;
};

type TaskText = {
  prompt?: string;
  messages: string[];
  turn_id?: string;
  sibling_turn_ids: string[];
  attempt_placement?: number;
  attempt_status: AttemptStatus;
};

type CloudEnvironment = {
  id: string;
  label?: string;
  is_pinned?: boolean;
  repo_hints?: string;
};

// Task details types
type ContentFragment = {
  content_type: string;
  text?: string;
};

type WorklogMessageAuthor = {
  role?: string;
};

type WorklogMessageContent = {
  parts?: (ContentFragment | string)[];
};

type WorklogMessage = {
  author?: WorklogMessageAuthor;
  content?: WorklogMessageContent;
};

type Worklog = {
  messages?: WorklogMessage[];
};

type TurnItem = {
  type: string;
  role?: string;
  content?: ContentFragment[] | string[];
  diff?: string;
  output_diff?: {
    diff?: string;
  };
};

type Turn = {
  id?: string;
  attempt_placement?: number;
  turn_status?: string;
  sibling_turn_ids?: string[];
  input_items?: TurnItem[];
  output_items?: TurnItem[];
  worklog?: Worklog;
  error?: {
    code?: string;
    message?: string;
  };
};

type CodeTaskDetailsResponse = {
  current_user_turn?: Turn;
  current_assistant_turn?: Turn;
  current_diff_task_turn?: Turn;
};

// Workspace types
type Workspace = {
  path: string;
  name: string;
  lastOpened: number;
};

// Database types
type DbThread = {
  id: string;
  preview: string;
  cwd: string | null;
  git_branch: string | null;
  git_sha: string | null;
  git_origin: string | null;
  model_provider: string;
  created_at: number;
  updated_at: number;
  is_pinned: number;
  is_archived: number;
};

type DbMessage = {
  id: string;
  thread_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: number;
};

type DbFileChange = {
  id: number;
  thread_id: string;
  path: string;
  kind: string;
  created_at: number;
};

type DbActivity = {
  id: number;
  thread_id: string;
  kind: string;
  title: string | null;
  detail: string | null;
  meta: string[] | null;
  created_at: number;
};

type DbWorkspaceFile = {
  workspace_id: string;
  file_path: string;
  is_active: number;
  position: number;
};

type BrowserAutomation = {
  navigate: (url: string) => Promise<void>;
  screenshot: () => Promise<string>;
  executeJS: (code: string) => Promise<unknown>;
  click: (selector: string) => Promise<boolean>;
  type: (selector: string, text: string) => Promise<boolean>;
  getUrl: () => Promise<string>;
  getTitle: () => Promise<string>;
};

type BrowserPanelController = {
  navigate: (url: string) => void;
  goBack: () => void;
  goForward: () => void;
  reload: () => void;
  takeSnapshot: () => Promise<void>;
  executeJS: (code: string) => Promise<unknown>;
  screenshot: () => Promise<string>;
  click: (selector: string) => Promise<boolean>;
  type: (selector: string, text: string) => Promise<boolean>;
  getUrl: () => string;
  getTitle: () => string;
};

type CodexCliInfo = {
  source: "env" | "bundled" | "path";
  executablePath: string;
  available: boolean;
  version: string | null;
};

type SemanticSearchHit = {
  id: string;
  source: "semantic" | "rg" | "hybrid";
  score: number;
  path: string;
  absolutePath: string;
  startLine: number;
  endLine: number;
  language: string;
  snippet: string;
};

type SemanticIndexStatus = {
  workspacePath: string;
  indexPath: string;
  exists: boolean;
  indexing: boolean;
  totalFiles?: number;
  totalChunks?: number;
  indexedAt?: number;
  lastError?: string | null;
};

type SemanticIndexStats = {
  workspacePath: string;
  indexPath: string;
  totalFiles: number;
  totalChunks: number;
  indexedAt: number;
  durationMs: number;
  reusedFiles: number;
  updatedFiles: number;
  removedFiles: number;
};

type SemanticSearchResult = {
  query: string;
  mode: "semantic" | "smart";
  tookMs: number;
  fromIndex: boolean;
  autoRefreshed: boolean;
  hits: SemanticSearchHit[];
};

// MCP Tool types
type McpTool = {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
  };
};

// Updater types
type UpdateStatus = {
  status: 'checking' | 'available' | 'up-to-date' | 'downloading' | 'ready' | 'error';
  version?: string;
  percent?: number;
  error?: string;
  releaseNotes?: string;
};

type McpToolResult = {
  content: Array<
    | { type: "text"; text: string }
    | { type: "image"; data: string; mimeType?: string }
  >;
  isError?: boolean;
};

// Usage stats types
type UsageStats = {
  sessionsThisWeek: number;
  totalSessions: number;
  totalMessages: number;
  userMessages: number;
  assistantMessages: number;
  totalFileChanges: number;
  totalActivities: number;
  timeSpentMinutes: number;
  mostActiveDay: string | null;
  mostActiveDayCount: number;
};

// Rate limit types
type RateLimitWindow = {
  used_percent: number;
  resets_at?: number;
  window_minutes?: number;
};

type CreditsSnapshot = {
  has_credits: boolean;
  unlimited: boolean;
  balance?: string;
};

type RateLimitSnapshot = {
  captured_at: number;
  primary?: RateLimitWindow;
  secondary?: RateLimitWindow;
  credits?: CreditsSnapshot;
};

declare global {
  interface Window {
    codex?: {
      request: (method: string, params?: unknown) => Promise<unknown>;
      respond: (
        id: number,
        result?: unknown,
        error?: { message?: string; data?: unknown }
      ) => Promise<unknown>;
      getStatus: () => Promise<{
        state: "starting" | "ready" | "error" | "stopped";
        message?: string;
      }>;
      pickFolder: () => Promise<string | null>;
      createNewSession: () => Promise<{ success: boolean; path?: string; workspace?: Workspace; error?: string }>;
      onNotification: (handler: (notification: { method: string; params?: any }) => void) => () => void;
      onRequest: (
        handler: (request: { id: number; method: string; params?: any }) => void
      ) => () => void;
      onStderr: (handler: (line: string) => void) => () => void;
      onStatus: (
        handler: (status: { state: "starting" | "ready" | "error" | "stopped"; message?: string }) => void
      ) => () => void;

      // Browser automation API
      browser: BrowserAutomation;

      // Database API
      db: {
        settings: {
          get: (key: string) => Promise<string | null>;
          set: (key: string, value: string) => Promise<boolean>;
          all: () => Promise<Record<string, string>>;
        };
        threads: {
          get: (id: string) => Promise<DbThread | null>;
          all: () => Promise<DbThread[]>;
          create: (thread: { id: string; preview?: string; cwd?: string | null; git_branch?: string | null; git_sha?: string | null; git_origin?: string | null; model_provider?: string }) => Promise<DbThread>;
          update: (id: string, updates: { preview?: string; cwd?: string | null; git_branch?: string | null; is_pinned?: number; is_archived?: number }) => Promise<DbThread | null>;
          delete: (id: string) => Promise<boolean>;
        };
        messages: {
          get: (threadId: string, limit?: number) => Promise<DbMessage[]>;
          add: (message: { id: string; thread_id: string; role: "user" | "assistant"; content: string }) => Promise<DbMessage>;
          update: (id: string, content: string) => Promise<boolean>;
          delete: (id: string) => Promise<boolean>;
          search: (query: string, limit?: number) => Promise<Array<DbMessage & { thread_preview: string }>>;
        };
        files: {
          add: (threadId: string, path: string, kind: string) => Promise<boolean>;
          get: (threadId: string) => Promise<DbFileChange[]>;
        };
        activity: {
          add: (threadId: string, kind: string, title?: string, detail?: string, meta?: string[]) => Promise<boolean>;
          get: (threadId: string, limit?: number) => Promise<DbActivity[]>;
        };
        export: () => Promise<{ settings: Record<string, string>; threads: DbThread[]; messages: DbMessage[] }>;
        workspaceFiles: {
          save: (workspaceId: string, files: { file_path: string; is_active: number; position: number }[]) => Promise<boolean>;
          load: (workspaceId: string) => Promise<DbWorkspaceFile[]>;
          clear: (workspaceId: string) => Promise<boolean>;
        };
        stats: () => Promise<UsageStats>;
      };

      // File system API
      fs: {
        listDirectory: (dirPath: string) => Promise<{ success: boolean; nodes?: Array<{ name: string; path: string; type: "file" | "directory" }>; error?: string }>;
        readFile: (filePath: string) => Promise<{ success: boolean; content?: string; error?: string }>;
        writeFile: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>;
        deleteFile: (filePath: string) => Promise<{ success: boolean; error?: string }>;
        stat: (filePath: string) => Promise<{ success: boolean; stats?: { isFile: boolean; isDirectory: boolean; size: number; mtime: string }; error?: string }>;
      };

      // PTY API
      pty: {
        create: (id: string, cwd: string) => Promise<string>;
        write: (id: string, data: string) => Promise<boolean>;
        resize: (id: string, cols: number, rows: number) => Promise<boolean>;
        kill: (id: string) => Promise<boolean>;
        onData: (handler: (payload: { id: string; data: string }) => void) => () => void;
        onExit: (handler: (payload: { id: string; exitCode: number; signal?: number }) => void) => () => void;
      };

      // Codex Cloud API
      cloud: {
        listTasks: (environmentId?: string) => Promise<{ success: boolean; tasks?: TaskSummary[]; error?: string }>;
        createTask: (params: { envId: string; prompt: string; gitRef: string; qaMode?: boolean; bestOfN?: number }) => Promise<{ success: boolean; task?: CreatedTask; error?: string }>;
        getTaskDiff: (taskId: string) => Promise<{ success: boolean; diff?: string | null; error?: string }>;
        getTaskText: (taskId: string) => Promise<{ success: boolean; text?: TaskText; error?: string }>;
        getTaskDetails: (taskId: string) => Promise<{ success: boolean; details?: unknown; error?: string }>;
        listSiblingAttempts: (params: { taskId: string; turnId: string }) => Promise<{ success: boolean; attempts?: TurnAttempt[]; error?: string }>;
        applyTask: (params: { taskId: string; diffOverride?: string; cwd?: string; preflight?: boolean }) => Promise<{ success: boolean; outcome?: ApplyOutcome; error?: string }>;
        checkAuth: () => Promise<{ success: boolean; isAuthenticated?: boolean; error?: string }>;
        listEnvironments: () => Promise<{ success: boolean; environments?: CloudEnvironment[]; error?: string }>;
      };

      // Workspaces API
      workspaces: {
        list: () => Promise<{ success: boolean; workspaces?: Workspace[]; error?: string }>;
        add: (folderPath: string) => Promise<{ success: boolean; workspace?: Workspace; error?: string }>;
        remove: (folderPath: string) => Promise<{ success: boolean; error?: string }>;
        switch: (folderPath: string | null) => Promise<{ success: boolean; error?: string }>;
        touch: (folderPath: string) => Promise<{ success: boolean; error?: string }>;
      };

      // Semantic search API
      semantic: {
        getStatus: (workspacePath: string) => Promise<{ success: boolean; status?: SemanticIndexStatus; error?: string }>;
        indexWorkspace: (workspacePath: string) => Promise<{ success: boolean; stats?: SemanticIndexStats; error?: string }>;
        search: (params: {
          workspacePath: string;
          query: string;
          limit?: number;
          minScore?: number;
          mode?: "semantic" | "smart";
        }) => Promise<{ success: boolean; result?: SemanticSearchResult; error?: string }>;
      };

      // MCP Browser Tools API
      mcp: {
        listTools: () => Promise<{ success: boolean; tools?: McpTool[]; error?: string }>;
        callTool: (name: string, args: Record<string, unknown>) => Promise<{ success: boolean; result?: McpToolResult; error?: string }>;
      };

      // Skills API
      skills: {
        installGit: (params: { repoUrl: string; workspacePath?: string | null; scope?: "personal" | "project" }) =>
          Promise<{ success: boolean; path?: string; warning?: string; error?: string }>;
      };

      // Updater API
      updater: {
        check: () => Promise<void>;
        download: () => Promise<void>;
        install: () => Promise<void>;
        onStatus: (callback: (status: UpdateStatus) => void) => () => void;
      };

      // Rate limits API
      getRateLimits: () => Promise<RateLimitSnapshot | null>;
      onRateLimits: (handler: (snapshot: RateLimitSnapshot | null) => void) => () => void;

      // Clone repository API
      cloneRepo?: (url: string, destinationPath?: string) => Promise<{ success: boolean; path?: string; workspace?: Workspace; error?: string }>;
      onCloneProgress?: (handler: (payload: { stage: string; message: string }) => void) => () => void;

      // App info API
      getAppPath?: () => Promise<string>;
      getVersion?: () => Promise<string>;
      getAppVersion?: () => Promise<string>;
      getHomePath?: () => Promise<string>;
      getCliInfo?: () => Promise<CodexCliInfo>;

      // Login item settings
      setLoginItemSettings?: (settings: { openAtLogin: boolean }) => Promise<void>;

      // Browser data management
      clearBrowserData?: () => Promise<void>;
    };

    browserPanel?: BrowserPanelController;
  }
}
