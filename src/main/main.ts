import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { spawn, ChildProcessWithoutNullStreams, execFile } from "child_process";
import path from "path";
import os from "os";
import fs from "fs";
import readline from "readline";
import http from "http";
import * as db from "./database";
import * as pty from "./pty";
import * as workspaces from "./workspaces";
import { CodexCloudClient, CloudTaskError, type TaskId } from "./cloud/index";
import { setupAutoUpdater } from "./updater";

// MCP HTTP Server for browser automation
const MCP_HTTP_PORT = 18799;
let mcpHttpServer: http.Server | null = null;

// MCP Tool type definitions for Codex integration
type McpTool = {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
  };
};

// Browser MCP Bridge - handles stdio communication with browser-server.ts
class BrowserMcpBridge {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (reason: Error) => void;
      timeoutId: NodeJS.Timeout;
    }
  >();
  private tools: McpTool[] = [];
  private ready = false;
  private readyPromise: Promise<void>;
  private readyResolve!: () => void;
  private stderrInterface: readline.Interface | null = null;
  private stdoutInterface: readline.Interface | null = null;

  constructor() {
    this.readyPromise = new Promise((resolve) => {
      this.readyResolve = resolve;
    });
  }

  async start() {
    if (this.proc) {
      return;
    }

    if (process.env.NODE_ENV === "development") {
      console.log("[MCP Bridge] Starting browser MCP server...");
    }

    // Determine the correct paths based on whether the app is packaged
    const isPackaged = app.isPackaged;
    const appPath = app.getAppPath();
    
    let cwd: string;
    let command: string;
    let args: string[];
    
    if (isPackaged) {
      // In production, use the resources path
      cwd = process.resourcesPath;
      command = "node";
      // The browser-server.ts should be compiled to JS in the dist folder
      args = [path.join(process.resourcesPath, "app", "dist", "mcp", "browser-server.js")];
    } else {
      // In development, use tsx
      cwd = appPath;
      command = "npx";
      args = ["tsx", "src/mcp/browser-server.ts"];
    }

    this.proc = spawn(command, args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, CHIMERA_APP_PATH: appPath },
    });

    this.proc.on("error", (err) => {
      if (process.env.NODE_ENV === "development") {
        console.error("[MCP Bridge] Failed to start:", err.message);
      }
      this.cleanup();
    });

    this.proc.on("exit", (code, signal) => {
      const suffix = signal ? ` (signal ${signal})` : "";
      if (process.env.NODE_ENV === "development") {
        console.log(`[MCP Bridge] Process exited with code ${code ?? "?"}${suffix}`);
      }
      this.cleanup();
    });

    // Handle stderr (logging from MCP server)
    this.stderrInterface = readline.createInterface({ input: this.proc.stderr });
    this.stderrInterface.on("line", (line) => {
      if (process.env.NODE_ENV === "development") {
        console.error("[MCP Server]", line);
      }
    });

    // Handle stdout (JSON-RPC responses)
    this.stdoutInterface = readline.createInterface({ input: this.proc.stdout });
    this.stdoutInterface.on("line", (line) => this.handleStdoutLine(line));

    // Initialize: get tools list
    try {
      const response = await this.request("tools/list", {});
      this.tools = (response as { tools: McpTool[] })?.tools ?? [];
      if (process.env.NODE_ENV === "development") {
        console.log(`[MCP Bridge] Loaded ${this.tools.length} tools:`, this.tools.map((t) => t.name).join(", "));
      }
      this.ready = true;
      this.readyResolve();
    } catch (err) {
      if (process.env.NODE_ENV === "development") {
        console.error("[MCP Bridge] Failed to initialize:", err);
      }
      this.cleanup();
      throw err;
    }
  }

  private cleanup() {
    // Close readline interfaces to prevent memory leaks
    if (this.stderrInterface) {
      this.stderrInterface.close();
      this.stderrInterface = null;
    }
    if (this.stdoutInterface) {
      this.stdoutInterface.close();
      this.stdoutInterface = null;
    }
    // Reject all pending requests
    this.pending.forEach((p) => {
      clearTimeout(p.timeoutId);
      p.reject(new Error("MCP bridge closed"));
    });
    this.pending.clear();
    this.proc = null;
    this.ready = false;
  }

  async stop() {
    this.cleanup();
    this.tools = [];
    // Reset ready promise for next start
    this.readyPromise = new Promise((resolve) => {
      this.readyResolve = resolve;
    });
  }

  async request(method: string, params?: unknown): Promise<unknown> {
    if (!this.proc) {
      throw new Error("MCP server is not running");
    }

    const id = this.nextId++;
    const payload = { jsonrpc: "2.0", id, method, params };

    const result = new Promise<unknown>((resolve, reject) => {
      // Timeout after 30 seconds
      const timeoutId = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`MCP request timeout: ${method}`));
        }
      }, 30000);
      this.pending.set(id, { resolve, reject, timeoutId });
    });

    const line = JSON.stringify(payload);
    if (process.env.NODE_ENV === "development") {
      console.log("[MCP Bridge] →", line);
    }
    this.proc.stdin.write(`${line}\n`);
    return result;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<{ content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>; isError?: boolean }> {
    const response = await this.request("tools/call", { name, arguments: args });
    return response as { content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>; isError?: boolean };
  }

  getTools(): McpTool[] {
    return this.tools;
  }

  isReady(): boolean {
    return this.ready;
  }

  async waitForReady(): Promise<void> {
    return this.readyPromise;
  }

  private handleStdoutLine(line: string) {
    if (process.env.NODE_ENV === "development") {
      console.log("[MCP Bridge] ←", line.substring(0, 200));
    }

    let payload: { id?: number; result?: unknown; error?: { message?: string; data?: unknown } };
    try {
      payload = JSON.parse(line);
    } catch {
      console.error("[MCP Bridge] Non-JSON output:", line);
      return;
    }

    if (payload.id !== undefined) {
      const pending = this.pending.get(payload.id);
      if (!pending) {
        return;
      }
      this.pending.delete(payload.id);
      clearTimeout(pending.timeoutId);

      if (payload.error) {
        const message = payload.error.message || "MCP request failed";
        pending.reject(new Error(message));
        return;
      }

      pending.resolve(payload.result);
      return;
    }

    // Handle notifications (server -> client)
    if ((payload as { method?: string }).method) {
      // For now, we don't handle notifications from MCP server
      if (process.env.NODE_ENV === "development") {
        console.log("[MCP Bridge] Notification:", payload);
      }
    }
  }
}

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

type JsonRpcRequest = {
  id: number;
  method: string;
  params?: unknown;
};

type JsonRpcResponse = {
  id: number;
  result?: unknown;
  error?: {
    message?: string;
    data?: unknown;
  };
};

type JsonRpcServerRequest = {
  id: number;
  method: string;
  params?: unknown;
};

type JsonRpcNotification = {
  method: string;
  params?: unknown;
};

type CodexStatus = {
  state: "starting" | "ready" | "error" | "stopped";
  message?: string;
};

class CodexAppServer {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (reason: Error) => void;
      timeoutId: NodeJS.Timeout;
    }
  >();
  private stdoutInterface: readline.Interface | null = null;
  private stderrInterface: readline.Interface | null = null;

  constructor(
    private onNotification: (notification: JsonRpcNotification) => void,
    private onRequest: (request: JsonRpcServerRequest) => void,
    private onStderr: (line: string) => void,
    private onStatus: (status: CodexStatus) => void
  ) {}

  async start() {
    if (this.proc) {
      return;
    }

    this.onStatus({ state: "starting" });

    // Get the user's shell PATH to ensure codex can be found
    // This is necessary because packaged Electron apps don't inherit shell env
    let userPath = process.env.PATH || "";
    try {
      const { execSync } = await import("child_process");
      const shellPath = execSync(
        process.platform === "darwin" 
          ? "source ~/.zshrc 2>/dev/null || source ~/.bash_profile 2>/dev/null || true; echo $PATH"
          : "source ~/.bashrc 2>/dev/null || source ~/.profile 2>/dev/null || true; echo $PATH",
        { shell: "/bin/bash", encoding: "utf-8" }
      ).trim();
      if (shellPath) {
        userPath = shellPath;
      }
    } catch {
      // Fallback to common paths if shell detection fails
      const commonPaths = [
        "/usr/local/bin",
        "/opt/homebrew/bin",
        "/usr/bin",
        "/bin",
        "/usr/sbin",
        "/sbin",
        `${os.homedir()}/.nvm/versions/node/v22.14.0/bin`,
        `${os.homedir()}/.local/bin`,
        `${os.homedir()}/.npm-global/bin`,
        `${os.homedir()}/.yarn/bin`,
        `${os.homedir()}/node_modules/.bin`,
      ];
      userPath = commonPaths.join(":") + (userPath ? ":" + userPath : "");
    }

    const env = {
      ...process.env,
      PATH: userPath,
    };

    if (process.env.NODE_ENV === "development") {
      console.log("[Codex] Starting with PATH:", userPath.substring(0, 200) + "...");
    }

    this.proc = spawn("codex", ["app-server"], {
      stdio: ["pipe", "pipe", "pipe"],
      env,
      shell: false,
    });

    this.proc.on("error", (err) => {
      const message =
        err && "code" in err && err.code === "ENOENT"
          ? "Codex CLI not found in PATH. Install it and restart Chimera."
          : `Failed to start codex app-server: ${String(err)}`;
      this.onStatus({ state: "error", message });
      this.cleanup();
    });

    this.proc.on("exit", (code, signal) => {
      const suffix = signal ? ` (signal ${signal})` : "";
      const message = `codex app-server exited with code ${code ?? "?"}${suffix}`;
      this.onStatus({ state: "stopped", message });
      this.cleanup();
    });

    this.stdoutInterface = readline.createInterface({ input: this.proc.stdout });
    this.stdoutInterface.on("line", (line) => this.handleStdoutLine(line));

    this.stderrInterface = readline.createInterface({ input: this.proc.stderr });
    this.stderrInterface.on("line", (line) => this.onStderr(line));

    try {
      await this.initialize();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : `Failed to initialize: ${String(err)}`;
      this.onStatus({ state: "error", message });
      this.cleanup();
    }
  }

  private cleanup() {
    // Close readline interfaces to prevent memory leaks
    if (this.stdoutInterface) {
      this.stdoutInterface.close();
      this.stdoutInterface = null;
    }
    if (this.stderrInterface) {
      this.stderrInterface.close();
      this.stderrInterface = null;
    }
    // Reject all pending requests
    this.pending.forEach((p) => {
      clearTimeout(p.timeoutId);
      p.reject(new Error("Codex app-server closed"));
    });
    this.pending.clear();
    this.proc = null;
  }

  async stop() {
    this.cleanup();
    this.onStatus({ state: "stopped" });
  }

  async request(method: string, params?: unknown, timeoutMs = 60000) {
    if (!this.proc) {
      throw new Error("codex app-server is not running");
    }

    const id = this.nextId++;
    const payload: JsonRpcRequest = { id, method, params };

    const result = new Promise<unknown>((resolve, reject) => {
      // Set timeout to prevent hanging requests
      const timeoutId = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`Request timeout: ${method}`));
        }
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timeoutId });
    });

    this.proc.stdin.write(`${JSON.stringify(payload)}\n`);
    return result;
  }

  respond(id: number, result?: unknown, error?: { message?: string; data?: unknown }) {
    if (!this.proc) {
      return;
    }
    const payload = error ? { id, error } : { id, result: result ?? {} };
    this.proc.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  notify(method: string, params?: unknown) {
    if (!this.proc) {
      return;
    }

    const payload: JsonRpcNotification = { method, params };
    this.proc.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  private async initialize() {
    const result = await this.request("initialize", {
      clientInfo: {
        name: "chimera",
        title: "Chimera",
        version: app.getVersion()
      }
    });

    this.notify("initialized");
    this.onStatus({ state: "ready" });
    return result;
  }

  private handleStdoutLine(line: string) {
    let payload: JsonRpcResponse | JsonRpcNotification;
    try {
      payload = JSON.parse(line) as JsonRpcResponse | JsonRpcNotification;
    } catch {
      this.onStderr(`Non-JSON output: ${line}`);
      return;
    }

    if ("id" in payload && payload.id !== undefined) {
      if ("method" in payload && payload.method && !("result" in payload) && !("error" in payload)) {
        this.onRequest(payload as JsonRpcServerRequest);
        return;
      }

      const pending = this.pending.get(payload.id);
      if (!pending) {
        return;
      }
      this.pending.delete(payload.id);
      clearTimeout(pending.timeoutId);

      if ("error" in payload && payload.error) {
        const message = payload.error.message || "Request failed";
        pending.reject(new Error(message));
        return;
      }

      pending.resolve((payload as JsonRpcResponse).result);
      return;
    }

    if ("method" in payload && (payload as JsonRpcNotification).method) {
      this.onNotification(payload as JsonRpcNotification);
    }
  }
}

let mainWindow: BrowserWindow | null = null;
let codex: CodexAppServer | null = null;
let browserMcp: BrowserMcpBridge | null = null;
let lastStatus: CodexStatus = { state: "starting" };
let currentAppSessionId: number | null = null;
let appSessionHeartbeat: NodeJS.Timeout | null = null;
const APP_SESSION_HEARTBEAT_INTERVAL = 30000; // 30 seconds

const callBrowserPanel = async <T>(method: string, ...args: unknown[]): Promise<T> => {
  if (!mainWindow) {
    throw new Error("Main window not available");
  }
  const payload = JSON.stringify(args);
  const script = `(() => {
    const panel = window.browserPanel;
    if (!panel || typeof panel.${method} !== "function") {
      throw new Error("Browser panel unavailable");
    }
    return panel.${method}(...${payload});
  })()`;
  return mainWindow.webContents.executeJavaScript(script, true) as Promise<T>;
};

const updateStatus = (status: CodexStatus) => {
  lastStatus = status;
  if (mainWindow) {
    mainWindow.webContents.send("codex:status", status);
  }
};

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: "#0b0d0f",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      // Performance optimizations
      spellcheck: false, // Disable spellcheck to reduce CPU usage
      enablePreferredSizeMode: false,
    }
  });

  mainWindow.setMenuBarVisibility(false);

  // Background throttling to save battery when not focused
  mainWindow.on("blur", () => {
    mainWindow?.webContents.setBackgroundThrottling(true);
    // Reduce frame rate when not focused
    mainWindow?.webContents.setFrameRate(30);
  });

  mainWindow.on("focus", () => {
    mainWindow?.webContents.setBackgroundThrottling(false);
    // Restore frame rate when focused
    mainWindow?.webContents.setFrameRate(60);
  });

  if (DEV_SERVER_URL) {
    mainWindow.loadURL(DEV_SERVER_URL);
  } else {
    const indexPath = path.join(__dirname, "../renderer/index.html");
    mainWindow.loadFile(indexPath);
  }

  mainWindow.on("closed", async () => {
    mainWindow = null;
    pty.setMainWindow(null);
    // Stop child processes to prevent memory leaks
    await codex?.stop();
    await browserMcp?.stop();
  });

  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow?.webContents.send("codex:status", lastStatus);
  });
};

const setupIpc = () => {
  ipcMain.handle("codex:status", () => lastStatus);

  ipcMain.handle("app:getPath", () => app.getAppPath());
  ipcMain.handle("app:getVersion", () => app.getVersion());

  ipcMain.handle("codex:request", async (_event, payload) => {
    if (!codex) {
      throw new Error("codex app-server unavailable");
    }
    if (!payload || typeof payload.method !== "string") {
      throw new Error("Invalid request payload");
    }
    return codex.request(payload.method, payload.params);
  });

  ipcMain.handle("codex:respond", (_event, payload) => {
    if (!codex) {
      throw new Error("codex app-server unavailable");
    }
    if (!payload || typeof payload.id !== "number") {
      throw new Error("Invalid response payload");
    }
    codex.respond(payload.id, payload.result, payload.error);
  });

  // MCP Browser tools IPC handlers
  ipcMain.handle("mcp:tools:list", async () => {
    if (!browserMcp) {
      return { success: false, error: "MCP bridge not initialized", tools: [] };
    }
    // Wait for bridge to be ready (with timeout)
    try {
      await Promise.race([
        browserMcp.waitForReady(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000))
      ]);
    } catch {
      return { success: false, error: "MCP bridge not ready (timeout)", tools: [] };
    }
    return { success: true, tools: browserMcp.getTools() };
  });

  ipcMain.handle("mcp:tools:call", async (_event, name: string, args: Record<string, unknown>) => {
    if (!browserMcp || !browserMcp.isReady()) {
      return { success: false, error: "MCP bridge not ready" };
    }
    try {
      const result = await browserMcp.callTool(name, args);
      return { success: true, result };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle("chimera:pick-folder", async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Select a workspace folder",
      defaultPath: app.getPath("home"),
      properties: ["openDirectory", "dontAddToRecent"]
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  // Workspace IPC handlers
  ipcMain.handle("workspaces:list", () => {
    const workspaceList = workspaces.listWorkspaces();
    return { success: true, workspaces: workspaceList };
  });

  ipcMain.handle("workspaces:add", (_event, folderPath: string) => {
    try {
      const workspace = workspaces.addWorkspace(folderPath);
      return { success: true, workspace };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("workspaces:remove", (_event, folderPath: string) => {
    try {
      const removed = workspaces.removeWorkspace(folderPath);
      return { success: removed };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("workspaces:switch", (_event, folderPath: string | null) => {
    try {
      if (folderPath) {
        workspaces.touchWorkspace(folderPath);
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("workspaces:touch", (_event, folderPath: string) => {
    try {
      workspaces.touchWorkspace(folderPath);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // Database IPC handlers
  // Settings
  ipcMain.handle("db:settings:get", (_event, key: string) => {
    return db.getSetting(key);
  });

  ipcMain.handle("db:settings:set", (_event, key: string, value: string) => {
    db.setSetting(key, value);
    return true;
  });

  ipcMain.handle("db:settings:all", () => {
    return db.getAllSettings();
  });

  // Threads
  ipcMain.handle("db:threads:get", (_event, id: string) => {
    return db.getThread(id);
  });

  ipcMain.handle("db:threads:all", () => {
    return db.getAllThreads();
  });

  ipcMain.handle("db:threads:create", (_event, thread: Parameters<typeof db.createThread>[0]) => {
    return db.createThread(thread);
  });

  ipcMain.handle("db:threads:update", (_event, id: string, updates: Parameters<typeof db.updateThread>[1]) => {
    return db.updateThread(id, updates);
  });

  ipcMain.handle("db:threads:delete", (_event, id: string) => {
    db.deleteThread(id);
    return true;
  });

  // Messages
  ipcMain.handle("db:messages:get", (_event, threadId: string, limit?: number) => {
    return db.getMessages(threadId, limit);
  });

  ipcMain.handle("db:messages:add", (_event, message: Parameters<typeof db.addMessage>[0]) => {
    return db.addMessage(message);
  });

  ipcMain.handle("db:messages:update", (_event, id: string, content: string) => {
    db.updateMessage(id, content);
    return true;
  });

  ipcMain.handle("db:messages:delete", (_event, id: string) => {
    db.deleteMessage(id);
    return true;
  });

  ipcMain.handle("db:messages:search", (_event, query: string, limit?: number) => {
    return db.searchMessages(query, limit);
  });

  // File changes
  ipcMain.handle("db:files:add", (_event, threadId: string, filePath: string, kind: string) => {
    db.addFileChange(threadId, filePath, kind);
    return true;
  });

  ipcMain.handle("db:files:get", (_event, threadId: string) => {
    return db.getFileChanges(threadId);
  });

  // Activity
  ipcMain.handle("db:activity:add", (_event, threadId: string, kind: string, title?: string, detail?: string, meta?: string[]) => {
    db.addActivity(threadId, kind, title, detail, meta);
    return true;
  });

  ipcMain.handle("db:activity:get", (_event, threadId: string, limit?: number) => {
    return db.getActivity(threadId, limit);
  });

  // Usage stats
  ipcMain.handle("db:stats:get", () => {
    return db.getUsageStats();
  });

  // Browser automation IPC handlers
  ipcMain.handle("browser:navigate", async (_event, url: string) => {
    if (typeof url !== "string") {
      throw new Error("Invalid URL payload");
    }
    return callBrowserPanel<void>("navigate", url);
  });

  ipcMain.handle("browser:screenshot", async () => {
    return callBrowserPanel<string>("screenshot");
  });

  ipcMain.handle("browser:execute-js", async (_event, code: string) => {
    if (typeof code !== "string") {
      throw new Error("Invalid JavaScript payload");
    }
    return callBrowserPanel<unknown>("executeJS", code);
  });

  ipcMain.handle("browser:click", async (_event, selector: string) => {
    if (typeof selector !== "string") {
      throw new Error("Invalid selector payload");
    }
    return callBrowserPanel<boolean>("click", selector);
  });

  ipcMain.handle("browser:type", async (_event, selector: string, text: string) => {
    if (typeof selector !== "string" || typeof text !== "string") {
      throw new Error("Invalid type payload");
    }
    return callBrowserPanel<boolean>("type", selector, text);
  });

  ipcMain.handle("browser:get-url", async () => {
    return callBrowserPanel<string>("getUrl");
  });

  ipcMain.handle("browser:get-title", async () => {
    return callBrowserPanel<string>("getTitle");
  });

  // Export
  ipcMain.handle("db:export", () => {
    return db.exportData();
  });

  // Workspace files
  ipcMain.handle("db:workspace-files:save", (_event, workspaceId: string, files: { file_path: string; is_active: number; position: number }[]) => {
    db.saveWorkspaceFiles(workspaceId, files);
    return true;
  });

  ipcMain.handle("db:workspace-files:load", (_event, workspaceId: string) => {
    return db.loadWorkspaceFiles(workspaceId);
  });

  ipcMain.handle("db:workspace-files:clear", (_event, workspaceId: string) => {
    db.clearWorkspaceFiles(workspaceId);
    return true;
  });

  // File system IPC handlers
  ipcMain.handle("fs:list-directory", async (_event, dirPath: string) => {
    try {
      // Validate path exists and is a directory
      const stats = await fs.promises.stat(dirPath);
      if (!stats.isDirectory()) {
        throw new Error("Path is not a directory");
      }

      // Read directory entries
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

      // Check for .gitignore to get ignored patterns
      let ignoredPatterns: string[] = [];
      const gitignorePath = path.join(dirPath, ".gitignore");
      try {
        const gitignoreContent = await fs.promises.readFile(gitignorePath, "utf-8");
        ignoredPatterns = gitignoreContent
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line && !line.startsWith("#"));
      } catch {
        // No .gitignore or can't read it
      }

      // Always ignore common patterns
      const defaultIgnored = ["node_modules", ".git", ".DS_Store", "dist", "build", ".next", "__pycache__", ".pytest_cache", "coverage", ".nyc_output"];

      const shouldIgnore = (name: string): boolean => {
        if (defaultIgnored.includes(name)) return true;
        // Simple pattern matching for gitignore (not full implementation)
        for (const pattern of ignoredPatterns) {
          if (pattern === name) return true;
          if (pattern.endsWith("/") && pattern.slice(0, -1) === name) return true;
          if (pattern.startsWith("*") && name.endsWith(pattern.slice(1))) return true;
        }
        return false;
      };

      // Map entries to file nodes
      const nodes = entries
        .filter((entry) => !shouldIgnore(entry.name))
        .map((entry) => ({
          name: entry.name,
          path: path.join(dirPath, entry.name),
          type: entry.isDirectory() ? "directory" : "file",
        }))
        .sort((a, b) => {
          // Directories first, then alphabetically
          if (a.type !== b.type) {
            return a.type === "directory" ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        });

      return { success: true, nodes };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("fs:read-file", async (_event, filePath: string) => {
    try {
      const stats = await fs.promises.stat(filePath);
      if (!stats.isFile()) {
        throw new Error("Path is not a file");
      }
      // Limit file size to 1MB for preview
      if (stats.size > 1024 * 1024) {
        return { success: false, error: "File too large for preview (max 1MB)" };
      }
      const content = await fs.promises.readFile(filePath, "utf-8");
      return { success: true, content };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("fs:write-file", async (_event, filePath: string, content: string) => {
    try {
      try {
        const stats = await fs.promises.stat(filePath);
        if (!stats.isFile()) {
          throw new Error("Path is not a file");
        }
      } catch (err) {
        const code = err && typeof err === "object" && "code" in err ? String((err as NodeJS.ErrnoException).code) : "";
        if (code && code !== "ENOENT") {
          throw err;
        }
      }

      await fs.promises.writeFile(filePath, content, "utf-8");
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("fs:delete-file", async (_event, filePath: string) => {
    try {
      await fs.promises.unlink(filePath);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("fs:stat", async (_event, filePath: string) => {
    try {
      const stats = await fs.promises.stat(filePath);
      return {
        success: true,
        stats: {
          isFile: stats.isFile(),
          isDirectory: stats.isDirectory(),
          size: stats.size,
          mtime: stats.mtime.toISOString(),
        },
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // PTY IPC handlers
  ipcMain.handle("pty:create", (_event, id: string, cwd: string) => {
    return pty.createPty(id, cwd);
  });

  ipcMain.handle("pty:write", (_event, id: string, data: string) => {
    return pty.writePty(id, data);
  });

  ipcMain.handle("pty:resize", (_event, id: string, cols: number, rows: number) => {
    return pty.resizePty(id, cols, rows);
  });

  ipcMain.handle("pty:kill", (_event, id: string) => {
    return pty.killPty(id);
  });

  // Codex Cloud IPC handlers
  const cloudClient = new CodexCloudClient();

  ipcMain.handle("cloud:list-tasks", async (_event, environmentId?: string) => {
    try {
      const tasks = await cloudClient.listTasks(environmentId);
      return { success: true, tasks };
    } catch (err) {
      const message = err instanceof CloudTaskError ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle("cloud:create-task", async (_event, params: {
    envId: string;
    prompt: string;
    gitRef: string;
    qaMode?: boolean;
    bestOfN?: number;
  }) => {
    try {
      const { envId, prompt, gitRef, qaMode = false, bestOfN = 1 } = params;
      const task = await cloudClient.createTask(envId, prompt, gitRef, qaMode, bestOfN);
      return { success: true, task };
    } catch (err) {
      const message = err instanceof CloudTaskError ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle("cloud:get-task-diff", async (_event, taskId: string) => {
    try {
      const id: TaskId = { id: taskId };
      const diff = await cloudClient.getTaskDiff(id);
      return { success: true, diff };
    } catch (err) {
      const message = err instanceof CloudTaskError ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle("cloud:get-task-text", async (_event, taskId: string) => {
    try {
      const id: TaskId = { id: taskId };
      const text = await cloudClient.getTaskText(id);
      return { success: true, text };
    } catch (err) {
      const message = err instanceof CloudTaskError ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle("cloud:get-task-details", async (_event, taskId: string) => {
    try {
      const id: TaskId = { id: taskId };
      const details = await cloudClient.getTaskDetails(id);
      return { success: true, details };
    } catch (err) {
      const message = err instanceof CloudTaskError ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle("cloud:list-sibling-attempts", async (_event, params: { taskId: string; turnId: string }) => {
    try {
      const id: TaskId = { id: params.taskId };
      const attempts = await cloudClient.listSiblingAttempts(id, params.turnId);
      return { success: true, attempts };
    } catch (err) {
      const message = err instanceof CloudTaskError ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle("cloud:apply-task", async (_event, params: {
    taskId: string;
    diffOverride?: string;
    cwd?: string;
    preflight?: boolean;
  }) => {
    try {
      const id: TaskId = { id: params.taskId };
      const outcome = params.preflight
        ? await cloudClient.applyTaskPreflight(id, params.diffOverride, params.cwd)
        : await cloudClient.applyTask(id, params.diffOverride, params.cwd);
      return { success: true, outcome };
    } catch (err) {
      const message = err instanceof CloudTaskError ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle("cloud:check-auth", async () => {
    try {
      const isAuthenticated = await cloudClient["authManager"].isAuthenticated();
      return { success: true, isAuthenticated };
    } catch (err) {
      const message = err instanceof CloudTaskError ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle("cloud:list-environments", async () => {
    try {
      const environments = await cloudClient.listEnvironments();
      return { success: true, environments };
    } catch (err) {
      const message = err instanceof CloudTaskError ? err.message : String(err);
      return { success: false, error: message };
    }
  });
};

// Auto-register MCP server with Codex CLI
const registerMcpWithCodex = async (): Promise<void> => {
  return new Promise((resolve) => {
    // First check if codex CLI is available
    execFile("codex", ["--version"], (versionErr) => {
      if (versionErr) {
        // Codex CLI not installed - silently skip
        if (process.env.NODE_ENV === "development") {
          console.log("Codex CLI not found, skipping MCP auto-registration");
        }
        resolve();
        return;
      }

      // Check if already registered
      execFile("codex", ["mcp", "list"], { maxBuffer: 10 * 1024 * 1024 }, (listErr, stdout) => {
        if (listErr) {
          if (process.env.NODE_ENV === "development") {
            console.log("Failed to check MCP list:", listErr.message);
          }
          resolve();
          return;
        }

        // Check if chimera-browser is already registered
        if (stdout.includes("chimera-browser")) {
          if (process.env.NODE_ENV === "development") {
            console.log("chimera-browser MCP server already registered");
          }
          resolve();
          return;
        }

        // Register the MCP server
        const appPath = app.getAppPath();
        const addCommand = "codex";
        const addArgs = [
          "mcp",
          "add",
          "chimera-browser",
          "--",
          "npm",
          "run",
          "mcp:browser",
          "--prefix",
          appPath
        ];

        execFile(addCommand, addArgs, (addErr, addStdout, addStderr) => {
          if (addErr) {
            if (process.env.NODE_ENV === "development") {
              console.log("Failed to register MCP server:", addStderr || addErr.message);
            }
          } else {
            if (process.env.NODE_ENV === "development") {
              console.log("Successfully registered chimera-browser MCP server with Codex");
            }
          }
          resolve();
        });
      });
    });
  });
};

// Create MCP HTTP server for browser automation
const createMcpHttpServer = () => {
  const server = http.createServer(async (req, res) => {
    // Enable CORS for localhost only
    const origin = req.headers.origin;
    if (origin && (origin.startsWith("http://localhost:") || origin.startsWith("https://localhost:"))) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    }

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    res.setHeader("Content-Type", "application/json");

    try {
      const url = new URL(req.url || "/", `http://localhost:${MCP_HTTP_PORT}`);
      const path = url.pathname;

      // Helper to parse JSON body
      const parseBody = async (): Promise<unknown> => {
        return new Promise((resolve, reject) => {
          let body = "";
          req.on("data", (chunk) => { body += chunk; });
          req.on("end", () => {
            try {
              resolve(body ? JSON.parse(body) : {});
            } catch (err) {
              reject(new Error("Invalid JSON body"));
            }
          });
          req.on("error", reject);
        });
      };

      switch (path) {
        case "/browser/navigate": {
          if (req.method !== "POST") {
            res.writeHead(405);
            res.end(JSON.stringify({ error: "Method not allowed" }));
            return;
          }
          const body = await parseBody() as { url?: string };
          if (!body.url) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: "Missing url in body" }));
            return;
          }
          await callBrowserPanel("navigate", body.url);
          res.writeHead(200);
          res.end(JSON.stringify({ success: true }));
          break;
        }

        case "/browser/screenshot": {
          if (req.method !== "POST") {
            res.writeHead(405);
            res.end(JSON.stringify({ error: "Method not allowed" }));
            return;
          }
          const result = await callBrowserPanel<string>("screenshot");
          res.writeHead(200);
          res.end(JSON.stringify({ success: true, image: result }));
          break;
        }

        case "/browser/click": {
          if (req.method !== "POST") {
            res.writeHead(405);
            res.end(JSON.stringify({ error: "Method not allowed" }));
            return;
          }
          const body = await parseBody() as { selector?: string };
          if (!body.selector) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: "Missing selector in body" }));
            return;
          }
          const result = await callBrowserPanel<boolean>("click", body.selector);
          res.writeHead(200);
          res.end(JSON.stringify({ success: true, clicked: result }));
          break;
        }

        case "/browser/type": {
          if (req.method !== "POST") {
            res.writeHead(405);
            res.end(JSON.stringify({ error: "Method not allowed" }));
            return;
          }
          const body = await parseBody() as { selector?: string; text?: string };
          if (!body.selector || body.text === undefined) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: "Missing selector or text in body" }));
            return;
          }
          const result = await callBrowserPanel<boolean>("type", body.selector, body.text);
          res.writeHead(200);
          res.end(JSON.stringify({ success: true, typed: result }));
          break;
        }

        case "/browser/evaluate": {
          if (req.method !== "POST") {
            res.writeHead(405);
            res.end(JSON.stringify({ error: "Method not allowed" }));
            return;
          }
          const body = await parseBody() as { code?: string };
          if (!body.code) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: "Missing code in body" }));
            return;
          }
          const result = await callBrowserPanel<unknown>("executeJS", body.code);
          res.writeHead(200);
          res.end(JSON.stringify({ success: true, result }));
          break;
        }

        case "/browser/url": {
          if (req.method !== "GET") {
            res.writeHead(405);
            res.end(JSON.stringify({ error: "Method not allowed" }));
            return;
          }
          const result = await callBrowserPanel<string>("getUrl");
          res.writeHead(200);
          res.end(JSON.stringify({ success: true, url: result }));
          break;
        }

        case "/browser/title": {
          if (req.method !== "GET") {
            res.writeHead(405);
            res.end(JSON.stringify({ error: "Method not allowed" }));
            return;
          }
          const result = await callBrowserPanel<string>("getTitle");
          res.writeHead(200);
          res.end(JSON.stringify({ success: true, title: result }));
          break;
        }

        default:
          res.writeHead(404);
          res.end(JSON.stringify({ error: "Not found" }));
      }
    } catch (err) {
      if (process.env.NODE_ENV === "development") {
        console.error("MCP HTTP Server error:", err);
      }
      res.writeHead(500);
      const message = err instanceof Error ? err.message : String(err);
      res.end(JSON.stringify({ error: message }));
    }
  });

  server.listen(MCP_HTTP_PORT, "127.0.0.1", () => {
    if (process.env.NODE_ENV === "development") {
      console.log(`MCP HTTP server listening on http://127.0.0.1:${MCP_HTTP_PORT}`);
    }
  });

  return server;
};

// App session management
const startAppSession = (): void => {
  currentAppSessionId = db.startAppSession();
  if (process.env.NODE_ENV === "development") {
    console.log("[App Session] Started session:", currentAppSessionId);
  }
};

const updateCurrentAppSession = (): void => {
  if (currentAppSessionId !== null) {
    db.updateAppSession(currentAppSessionId);
  }
};

const stopAppSession = (): void => {
  if (appSessionHeartbeat) {
    clearInterval(appSessionHeartbeat);
    appSessionHeartbeat = null;
  }
  if (currentAppSessionId !== null) {
    db.updateAppSession(currentAppSessionId);
    if (process.env.NODE_ENV === "development") {
      console.log("[App Session] Stopped session:", currentAppSessionId);
    }
    currentAppSessionId = null;
  }
};

const setupAppSessionHeartbeat = (): void => {
  // Update the session every 30 seconds while app is running
  appSessionHeartbeat = setInterval(() => {
    if (currentAppSessionId !== null) {
      db.updateAppSession(currentAppSessionId);
      if (process.env.NODE_ENV === "development") {
        console.log("[App Session] Heartbeat updated:", currentAppSessionId);
      }
    }
  }, APP_SESSION_HEARTBEAT_INTERVAL);
};

// Handle tool calls from Codex by forwarding to MCP bridge
const handleCodexRequest = async (request: JsonRpcServerRequest) => {
  // Check if this is a dynamic tool call
  if (request.method === "item/tool/call") {
    const params = request.params as { callId: string; threadId: string; turnId: string; tool: string; arguments: Record<string, unknown> };
    if (process.env.NODE_ENV === "development") {
      console.log("[Codex] Tool call request:", params.tool, params.arguments);
    }

    if (!browserMcp || !browserMcp.isReady()) {
      console.error("[Codex] MCP bridge not ready, declining tool call");
      codex?.respond(request.id, null, { message: "Browser MCP server is not available" });
      return;
    }

    try {
      // Forward to MCP bridge
      const result = await browserMcp.callTool(params.tool, params.arguments);
      if (process.env.NODE_ENV === "development") {
        console.log("[Codex] Tool call result:", result);
      }

      // Convert MCP result to Codex response format
      // Format output as text from content array
      let output = "";
      for (const item of result.content) {
        if (item.type === "text" && item.text) {
          output += item.text + "\n";
        } else if (item.type === "image" && item.data) {
          output += `[Image: ${item.mimeType || "image/png"}]\n`;
        }
      }

      const response = {
        output: output.trim(),
        success: !result.isError,
      };

      codex?.respond(request.id, response);
    } catch (err) {
      if (process.env.NODE_ENV === "development") {
        console.error("[Codex] Tool call failed:", err);
      }
      const message = err instanceof Error ? err.message : String(err);
      codex?.respond(request.id, { output: `Error: ${message}`, success: false });
    }
    return;
  }

  // For other requests, forward to renderer
  mainWindow?.webContents.send("codex:request", request);
};

const bootCodex = async () => {
  if (!mainWindow) {
    return;
  }

  // Start browser MCP bridge first
  browserMcp = new BrowserMcpBridge();
  try {
    await browserMcp.start();
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error("[Main] Failed to start MCP bridge:", err);
    }
    // Continue without MCP - Codex will still work but browser tools won't be available
  }

  codex = new CodexAppServer(
    (notification) => {
      mainWindow?.webContents.send("codex:notification", notification);
    },
    handleCodexRequest,
    (line) => {
      mainWindow?.webContents.send("codex:stderr", line);
    },
    updateStatus
  );

  await codex.start();
};

app.whenReady().then(async () => {
  // Initialize database
  db.initDatabase();

  createWindow();
  pty.setMainWindow(mainWindow);
  setupIpc();

  // Setup auto-updater
  if (mainWindow) {
    setupAutoUpdater(mainWindow);
  }

  // Start MCP HTTP server for browser automation
  mcpHttpServer = createMcpHttpServer();

  // Auto-register MCP server with Codex (runs silently in background)
  registerMcpWithCodex().catch(() => {
    // Silently ignore any errors - this is best-effort
  });

  await bootCodex();

  // Start app session tracking
  startAppSession();
  setupAppSessionHeartbeat();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", async () => {
  stopAppSession();
  await codex?.stop();
  await browserMcp?.stop();
  pty.killAllPty();
  db.closeDatabase();
  if (mcpHttpServer) {
    mcpHttpServer.close();
    mcpHttpServer = null;
  }
});
