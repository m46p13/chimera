import { contextBridge, ipcRenderer } from "electron";

type CodexStatus = {
  state: "starting" | "ready" | "error" | "stopped";
  message?: string;
};

type CodexNotification = {
  method: string;
  params?: unknown;
};

type CodexRequest = {
  id: number;
  method: string;
  params?: unknown;
};

type UpdateStatus = {
  status: 'checking' | 'available' | 'up-to-date' | 'downloading' | 'ready' | 'error';
  version?: string;
  percent?: number;
  error?: string;
  releaseNotes?: string;
};

const api = {
  request: (method: string, params?: unknown) =>
    ipcRenderer.invoke("codex:request", { method, params }),
  respond: (id: number, result?: unknown, error?: { message?: string; data?: unknown }) =>
    ipcRenderer.invoke("codex:respond", { id, result, error }),
  getStatus: () => ipcRenderer.invoke("codex:status"),
  pickFolder: () => ipcRenderer.invoke("chimera:pick-folder"),
  onNotification: (handler: (notification: CodexNotification) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: CodexNotification) => {
      handler(payload);
    };
    ipcRenderer.on("codex:notification", listener);
    return () => ipcRenderer.removeListener("codex:notification", listener);
  },
  onRequest: (handler: (request: CodexRequest) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: CodexRequest) => {
      handler(payload);
    };
    ipcRenderer.on("codex:request", listener);
    return () => ipcRenderer.removeListener("codex:request", listener);
  },
  onStderr: (handler: (line: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, line: string) => {
      handler(line);
    };
    ipcRenderer.on("codex:stderr", listener);
    return () => ipcRenderer.removeListener("codex:stderr", listener);
  },
  onStatus: (handler: (status: CodexStatus) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: CodexStatus) => {
      handler(status);
    };
    ipcRenderer.on("codex:status", listener);
    return () => ipcRenderer.removeListener("codex:status", listener);
  },

  // Browser automation API
  browser: {
    navigate: (url: string) => ipcRenderer.invoke("browser:navigate", url),
    screenshot: () => ipcRenderer.invoke("browser:screenshot"),
    executeJS: (code: string) => ipcRenderer.invoke("browser:execute-js", code),
    click: (selector: string) => ipcRenderer.invoke("browser:click", selector),
    type: (selector: string, text: string) => ipcRenderer.invoke("browser:type", selector, text),
    getUrl: () => ipcRenderer.invoke("browser:get-url"),
    getTitle: () => ipcRenderer.invoke("browser:get-title"),
  },

  // Database API
  db: {
    // Settings
    settings: {
      get: (key: string) => ipcRenderer.invoke("db:settings:get", key),
      set: (key: string, value: string) => ipcRenderer.invoke("db:settings:set", key, value),
      all: () => ipcRenderer.invoke("db:settings:all"),
    },
    // Threads
    threads: {
      get: (id: string) => ipcRenderer.invoke("db:threads:get", id),
      all: () => ipcRenderer.invoke("db:threads:all"),
      create: (thread: { id: string; preview?: string; cwd?: string | null; git_branch?: string | null; git_sha?: string | null; git_origin?: string | null; model_provider?: string }) =>
        ipcRenderer.invoke("db:threads:create", thread),
      update: (id: string, updates: { preview?: string; cwd?: string | null; git_branch?: string | null; is_pinned?: number; is_archived?: number }) =>
        ipcRenderer.invoke("db:threads:update", id, updates),
      delete: (id: string) => ipcRenderer.invoke("db:threads:delete", id),
    },
    // Messages
    messages: {
      get: (threadId: string, limit?: number) => ipcRenderer.invoke("db:messages:get", threadId, limit),
      add: (message: { id: string; thread_id: string; role: "user" | "assistant"; content: string }) =>
        ipcRenderer.invoke("db:messages:add", message),
      update: (id: string, content: string) => ipcRenderer.invoke("db:messages:update", id, content),
      delete: (id: string) => ipcRenderer.invoke("db:messages:delete", id),
      search: (query: string, limit?: number) => ipcRenderer.invoke("db:messages:search", query, limit),
    },
    // Files
    files: {
      add: (threadId: string, path: string, kind: string) => ipcRenderer.invoke("db:files:add", threadId, path, kind),
      get: (threadId: string) => ipcRenderer.invoke("db:files:get", threadId),
    },
    // Activity
    activity: {
      add: (threadId: string, kind: string, title?: string, detail?: string, meta?: string[]) =>
        ipcRenderer.invoke("db:activity:add", threadId, kind, title, detail, meta),
      get: (threadId: string, limit?: number) => ipcRenderer.invoke("db:activity:get", threadId, limit),
    },
    // Export
    export: () => ipcRenderer.invoke("db:export"),
    // Workspace files
    workspaceFiles: {
      save: (workspaceId: string, files: { file_path: string; is_active: number; position: number }[]) =>
        ipcRenderer.invoke("db:workspace-files:save", workspaceId, files),
      load: (workspaceId: string) => ipcRenderer.invoke("db:workspace-files:load", workspaceId),
      clear: (workspaceId: string) => ipcRenderer.invoke("db:workspace-files:clear", workspaceId),
    },
  },

  // File system API
  fs: {
    listDirectory: (dirPath: string) => ipcRenderer.invoke("fs:list-directory", dirPath),
    readFile: (filePath: string) => ipcRenderer.invoke("fs:read-file", filePath),
    writeFile: (filePath: string, content: string) => ipcRenderer.invoke("fs:write-file", filePath, content),
    deleteFile: (filePath: string) => ipcRenderer.invoke("fs:delete-file", filePath),
    stat: (filePath: string) => ipcRenderer.invoke("fs:stat", filePath),
  },

  // PTY API
  pty: {
    create: (id: string, cwd: string) => ipcRenderer.invoke("pty:create", id, cwd),
    write: (id: string, data: string) => ipcRenderer.invoke("pty:write", id, data),
    resize: (id: string, cols: number, rows: number) => ipcRenderer.invoke("pty:resize", id, cols, rows),
    kill: (id: string) => ipcRenderer.invoke("pty:kill", id),
    onData: (handler: (payload: { id: string; data: string }) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: { id: string; data: string }) => {
        handler(payload);
      };
      ipcRenderer.on("pty:data", listener);
      return () => ipcRenderer.removeListener("pty:data", listener);
    },
    onExit: (handler: (payload: { id: string; exitCode: number; signal?: number }) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: { id: string; exitCode: number; signal?: number }) => {
        handler(payload);
      };
      ipcRenderer.on("pty:exit", listener);
      return () => ipcRenderer.removeListener("pty:exit", listener);
    },
  },

  // Codex Cloud API
  cloud: {
    listTasks: (environmentId?: string) => ipcRenderer.invoke("cloud:list-tasks", environmentId),
    createTask: (params: { envId: string; prompt: string; gitRef: string; qaMode?: boolean; bestOfN?: number }) =>
      ipcRenderer.invoke("cloud:create-task", params),
    getTaskDiff: (taskId: string) => ipcRenderer.invoke("cloud:get-task-diff", taskId),
    getTaskText: (taskId: string) => ipcRenderer.invoke("cloud:get-task-text", taskId),
    getTaskDetails: (taskId: string) => ipcRenderer.invoke("cloud:get-task-details", taskId),
    listSiblingAttempts: (params: { taskId: string; turnId: string }) =>
      ipcRenderer.invoke("cloud:list-sibling-attempts", params),
    applyTask: (params: { taskId: string; diffOverride?: string; cwd?: string; preflight?: boolean }) =>
      ipcRenderer.invoke("cloud:apply-task", params),
    checkAuth: () => ipcRenderer.invoke("cloud:check-auth"),
    listEnvironments: () => ipcRenderer.invoke("cloud:list-environments"),
  },

  // Workspaces API
  workspaces: {
    list: () => ipcRenderer.invoke("workspaces:list"),
    add: (folderPath: string) => ipcRenderer.invoke("workspaces:add", folderPath),
    remove: (folderPath: string) => ipcRenderer.invoke("workspaces:remove", folderPath),
    switch: (folderPath: string | null) => ipcRenderer.invoke("workspaces:switch", folderPath),
    touch: (folderPath: string) => ipcRenderer.invoke("workspaces:touch", folderPath),
  },

  // MCP Browser Tools API
  mcp: {
    listTools: () => ipcRenderer.invoke("mcp:tools:list"),
    callTool: (name: string, args: Record<string, unknown>) => ipcRenderer.invoke("mcp:tools:call", name, args),
  },

  // App path API
  getAppPath: () => ipcRenderer.invoke("app:getPath"),
  getVersion: () => ipcRenderer.invoke("app:getVersion"),

  // Updater API
  updater: {
    check: () => ipcRenderer.invoke("updater:check"),
    download: () => ipcRenderer.invoke("updater:download"),
    install: () => ipcRenderer.invoke("updater:install"),
    onStatus: (callback: (status: UpdateStatus) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, status: UpdateStatus) => callback(status);
      ipcRenderer.on("updater:status", handler);
      return () => ipcRenderer.removeListener("updater:status", handler);
    },
  },
};

contextBridge.exposeInMainWorld("codex", api);
