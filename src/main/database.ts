import Database from "better-sqlite3";
import { app } from "electron";
import path from "path";
import fs from "fs";

// Types
export type DbThread = {
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

export type DbMessage = {
  id: string;
  thread_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: number;
};

export type DbSetting = {
  key: string;
  value: string;
};

export type DbFileChange = {
  id: number;
  thread_id: string;
  path: string;
  kind: string;
  created_at: number;
};

export type DbWorkspaceFile = {
  workspace_id: string;
  file_path: string;
  is_active: number;
  position: number;
};

export type DbAppSession = {
  id: number;
  started_at: number;
  ended_at: number | null;
  duration_seconds: number | null;
};

let db: Database.Database | null = null;

const getDbPath = (): string => {
  const userDataPath = app.getPath("userData");
  const dbDir = path.join(userDataPath, "data");
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  return path.join(dbDir, "chimera.db");
};

export const initDatabase = (): Database.Database => {
  if (db) return db;

  const dbPath = getDbPath();
  db = new Database(dbPath);

  // Enable WAL mode for better performance
  db.pragma("journal_mode = WAL");

  // Create tables
  db.exec(`
    -- Settings table
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Threads table
    CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY,
      preview TEXT NOT NULL DEFAULT 'Untitled',
      cwd TEXT,
      git_branch TEXT,
      git_sha TEXT,
      git_origin TEXT,
      model_provider TEXT DEFAULT 'openai',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      is_pinned INTEGER NOT NULL DEFAULT 0,
      is_archived INTEGER NOT NULL DEFAULT 0
    );

    -- Messages table with FTS
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
    );

    -- Full-text search for messages
    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
      content,
      content='messages',
      content_rowid='rowid'
    );

    -- Triggers to keep FTS in sync
    CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
      INSERT INTO messages_fts(rowid, content) VALUES (NEW.rowid, NEW.content);
    END;

    CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', OLD.rowid, OLD.content);
    END;

    CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', OLD.rowid, OLD.content);
      INSERT INTO messages_fts(rowid, content) VALUES (NEW.rowid, NEW.content);
    END;

    -- File changes table
    CREATE TABLE IF NOT EXISTS file_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id TEXT NOT NULL,
      path TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'update',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
    );

    -- Activity log table
    CREATE TABLE IF NOT EXISTS activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      title TEXT,
      detail TEXT,
      meta TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
    );

    -- Workspace files table (persist open files per workspace)
    CREATE TABLE IF NOT EXISTS workspace_files (
      workspace_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      is_active INTEGER DEFAULT 0,
      position INTEGER DEFAULT 0,
      PRIMARY KEY (workspace_id, file_path)
    );

    CREATE INDEX IF NOT EXISTS idx_workspace_files_workspace ON workspace_files(workspace_id);

    -- App sessions table (track actual app usage time)
    CREATE TABLE IF NOT EXISTS app_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      ended_at INTEGER,
      duration_seconds INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_app_sessions_started ON app_sessions(started_at);

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);
    CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
    CREATE INDEX IF NOT EXISTS idx_threads_updated ON threads(updated_at);
    CREATE INDEX IF NOT EXISTS idx_file_changes_thread ON file_changes(thread_id);
    CREATE INDEX IF NOT EXISTS idx_activity_thread ON activity(thread_id);
  `);

  return db;
};

export const getDatabase = (): Database.Database => {
  if (!db) {
    return initDatabase();
  }
  return db;
};

export const closeDatabase = (): void => {
  if (db) {
    db.close();
    db = null;
  }
};

// Settings operations
export const getSetting = (key: string): string | null => {
  const db = getDatabase();
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as DbSetting | undefined;
  return row?.value ?? null;
};

export const setSetting = (key: string, value: string): void => {
  const db = getDatabase();
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
};

export const getAllSettings = (): Record<string, string> => {
  const db = getDatabase();
  const rows = db.prepare("SELECT key, value FROM settings").all() as DbSetting[];
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
};

// Thread operations
export const getThread = (id: string): DbThread | null => {
  const db = getDatabase();
  return db.prepare("SELECT * FROM threads WHERE id = ?").get(id) as DbThread | undefined ?? null;
};

export const getAllThreads = (): DbThread[] => {
  const db = getDatabase();
  return db.prepare("SELECT * FROM threads ORDER BY updated_at DESC").all() as DbThread[];
};

export const createThread = (thread: Partial<DbThread> & { id: string }): DbThread => {
  const db = getDatabase();
  const now = Math.floor(Date.now() / 1000);
  db.prepare(`
    INSERT INTO threads (id, preview, cwd, git_branch, git_sha, git_origin, model_provider, created_at, updated_at, is_pinned, is_archived)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    thread.id,
    thread.preview ?? "Untitled",
    thread.cwd ?? null,
    thread.git_branch ?? null,
    thread.git_sha ?? null,
    thread.git_origin ?? null,
    thread.model_provider ?? "openai",
    thread.created_at ?? now,
    thread.updated_at ?? now,
    thread.is_pinned ?? 0,
    thread.is_archived ?? 0
  );
  return getThread(thread.id)!;
};

export const updateThread = (id: string, updates: Partial<DbThread>): DbThread | null => {
  const db = getDatabase();
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.preview !== undefined) { fields.push("preview = ?"); values.push(updates.preview); }
  if (updates.cwd !== undefined) { fields.push("cwd = ?"); values.push(updates.cwd); }
  if (updates.git_branch !== undefined) { fields.push("git_branch = ?"); values.push(updates.git_branch); }
  if (updates.git_sha !== undefined) { fields.push("git_sha = ?"); values.push(updates.git_sha); }
  if (updates.git_origin !== undefined) { fields.push("git_origin = ?"); values.push(updates.git_origin); }
  if (updates.model_provider !== undefined) { fields.push("model_provider = ?"); values.push(updates.model_provider); }
  if (updates.is_pinned !== undefined) { fields.push("is_pinned = ?"); values.push(updates.is_pinned); }
  if (updates.is_archived !== undefined) { fields.push("is_archived = ?"); values.push(updates.is_archived); }

  fields.push("updated_at = ?");
  values.push(Math.floor(Date.now() / 1000));
  values.push(id);

  if (fields.length > 1) {
    db.prepare(`UPDATE threads SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  }

  return getThread(id);
};

export const deleteThread = (id: string): void => {
  const db = getDatabase();
  db.prepare("DELETE FROM threads WHERE id = ?").run(id);
};

// Message operations
export const getMessages = (threadId: string, limit = 1000): DbMessage[] => {
  const db = getDatabase();
  return db.prepare("SELECT * FROM messages WHERE thread_id = ? ORDER BY created_at ASC LIMIT ?").all(threadId, limit) as DbMessage[];
};

export const addMessage = (message: Omit<DbMessage, "created_at"> & { created_at?: number }): DbMessage => {
  const db = getDatabase();
  const now = message.created_at ?? Math.floor(Date.now() / 1000);
  db.prepare(`
    INSERT INTO messages (id, thread_id, role, content, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(message.id, message.thread_id, message.role, message.content, now);

  // Update thread's updated_at
  db.prepare("UPDATE threads SET updated_at = ? WHERE id = ?").run(now, message.thread_id);

  return { ...message, created_at: now } as DbMessage;
};

export const updateMessage = (id: string, content: string): void => {
  const db = getDatabase();
  db.prepare("UPDATE messages SET content = ? WHERE id = ?").run(content, id);
};

export const deleteMessage = (id: string): void => {
  const db = getDatabase();
  db.prepare("DELETE FROM messages WHERE id = ?").run(id);
};

// Search messages
export const searchMessages = (query: string, limit = 50): Array<DbMessage & { thread_preview: string }> => {
  const db = getDatabase();
  return db.prepare(`
    SELECT m.*, t.preview as thread_preview
    FROM messages m
    JOIN messages_fts fts ON m.rowid = fts.rowid
    JOIN threads t ON m.thread_id = t.id
    WHERE messages_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `).all(query, limit) as Array<DbMessage & { thread_preview: string }>;
};

// File change operations
export const addFileChange = (threadId: string, filePath: string, kind: string): void => {
  const db = getDatabase();
  db.prepare("INSERT INTO file_changes (thread_id, path, kind) VALUES (?, ?, ?)").run(threadId, filePath, kind);
};

export const getFileChanges = (threadId: string): DbFileChange[] => {
  const db = getDatabase();
  return db.prepare("SELECT * FROM file_changes WHERE thread_id = ? ORDER BY created_at DESC").all(threadId) as DbFileChange[];
};

// Activity operations
export const addActivity = (threadId: string, kind: string, title?: string, detail?: string, meta?: string[]): void => {
  const db = getDatabase();
  db.prepare("INSERT INTO activity (thread_id, kind, title, detail, meta) VALUES (?, ?, ?, ?, ?)").run(
    threadId,
    kind,
    title ?? null,
    detail ?? null,
    meta ? JSON.stringify(meta) : null
  );
};

export const getActivity = (threadId: string, limit = 100): Array<{ id: number; thread_id: string; kind: string; title: string | null; detail: string | null; meta: string[] | null; created_at: number }> => {
  const db = getDatabase();
  const rows = db.prepare("SELECT * FROM activity WHERE thread_id = ? ORDER BY created_at DESC LIMIT ?").all(threadId, limit) as any[];
  return rows.map((row) => ({
    ...row,
    meta: row.meta ? JSON.parse(row.meta) : null,
  }));
};

// Workspace files operations
export const saveWorkspaceFiles = (workspaceId: string, files: { file_path: string; is_active: number; position: number }[]): void => {
  const db = getDatabase();
  // Clear existing files for this workspace
  db.prepare("DELETE FROM workspace_files WHERE workspace_id = ?").run(workspaceId);
  // Insert new files
  const insert = db.prepare("INSERT INTO workspace_files (workspace_id, file_path, is_active, position) VALUES (?, ?, ?, ?)");
  for (const file of files) {
    insert.run(workspaceId, file.file_path, file.is_active, file.position);
  }
};

export const loadWorkspaceFiles = (workspaceId: string): DbWorkspaceFile[] => {
  const db = getDatabase();
  return db.prepare("SELECT * FROM workspace_files WHERE workspace_id = ? ORDER BY position ASC").all(workspaceId) as DbWorkspaceFile[];
};

export const clearWorkspaceFiles = (workspaceId: string): void => {
  const db = getDatabase();
  db.prepare("DELETE FROM workspace_files WHERE workspace_id = ?").run(workspaceId);
};

// Export for backup
export const exportData = (): { settings: Record<string, string>; threads: DbThread[]; messages: DbMessage[] } => {
  return {
    settings: getAllSettings(),
    threads: getAllThreads(),
    messages: getDatabase().prepare("SELECT * FROM messages ORDER BY created_at ASC").all() as DbMessage[],
  };
};

// App session operations
export const startAppSession = (): number => {
  const database = getDatabase();
  const now = Math.floor(Date.now() / 1000);
  const result = database.prepare(
    "INSERT INTO app_sessions (started_at, ended_at, duration_seconds) VALUES (?, NULL, NULL)"
  ).run(now);
  return result.lastInsertRowid as number;
};

export const updateAppSession = (sessionId: number): void => {
  const database = getDatabase();
  const now = Math.floor(Date.now() / 1000);
  database.prepare(
    "UPDATE app_sessions SET ended_at = ?, duration_seconds = ended_at - started_at WHERE id = ?"
  ).run(now, sessionId);
};

export const getCurrentAppSession = (): DbAppSession | null => {
  const database = getDatabase();
  // Get the most recent session that has no ended_at (still active)
  return database.prepare(
    "SELECT * FROM app_sessions WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1"
  ).get() as DbAppSession | undefined ?? null;
};

// Usage statistics
export type UsageStats = {
  sessionsThisWeek: number;
  totalSessions: number;
  totalMessages: number;
  userMessages: number;
  assistantMessages: number;
  totalFileChanges: number;
  totalActivities: number;
  timeSpentMinutes: number;
  timeSpentThisWeekMinutes: number;
  mostActiveDay: string | null;
  mostActiveDayCount: number;
};

export const getUsageStats = (): UsageStats => {
  const database = getDatabase();
  const now = Math.floor(Date.now() / 1000);
  const oneWeekAgo = now - 7 * 24 * 60 * 60;

  // Sessions this week
  const sessionsThisWeek = database.prepare(
    "SELECT COUNT(*) as count FROM threads WHERE created_at >= ?"
  ).get(oneWeekAgo) as { count: number };

  // Total sessions
  const totalSessions = database.prepare(
    "SELECT COUNT(*) as count FROM threads"
  ).get() as { count: number };

  // Total messages breakdown
  const totalMessages = database.prepare(
    "SELECT COUNT(*) as count FROM messages"
  ).get() as { count: number };

  const userMessages = database.prepare(
    "SELECT COUNT(*) as count FROM messages WHERE role = 'user'"
  ).get() as { count: number };

  const assistantMessages = database.prepare(
    "SELECT COUNT(*) as count FROM messages WHERE role = 'assistant'"
  ).get() as { count: number };

  // Total file changes
  const totalFileChanges = database.prepare(
    "SELECT COUNT(*) as count FROM file_changes"
  ).get() as { count: number };

  // Total activities (excluding thinking for cleaner count)
  const totalActivities = database.prepare(
    "SELECT COUNT(*) as count FROM activity WHERE kind != 'thinking'"
  ).get() as { count: number };

  // Calculate actual time spent from app_sessions
  // Total time: sum of all completed sessions
  const totalTimeResult = database.prepare(
    "SELECT COALESCE(SUM(duration_seconds), 0) as total_seconds FROM app_sessions WHERE duration_seconds IS NOT NULL"
  ).get() as { total_seconds: number };

  // Time this week: sum of sessions started this week (or with duration falling in this week)
  const timeThisWeekResult = database.prepare(
    "SELECT COALESCE(SUM(duration_seconds), 0) as total_seconds FROM app_sessions WHERE started_at >= ? AND duration_seconds IS NOT NULL"
  ).get(oneWeekAgo) as { total_seconds: number };

  // Also add the current active session time if there is one
  const currentSession = getCurrentAppSession();
  let currentSessionMinutes = 0;
  if (currentSession) {
    currentSessionMinutes = Math.floor((now - currentSession.started_at) / 60);
  }

  const timeSpentMinutes = Math.floor(totalTimeResult.total_seconds / 60) + currentSessionMinutes;
  const timeSpentThisWeekMinutes = Math.floor(timeThisWeekResult.total_seconds / 60) + 
    (currentSession && currentSession.started_at >= oneWeekAgo ? currentSessionMinutes : 0);

  // Most active day
  const mostActiveDay = database.prepare(`
    SELECT 
      DATE(created_at, 'unixepoch') as day,
      COUNT(*) as count
    FROM messages
    GROUP BY day
    ORDER BY count DESC
    LIMIT 1
  `).get() as { day: string; count: number } | undefined;

  return {
    sessionsThisWeek: sessionsThisWeek.count,
    totalSessions: totalSessions.count,
    totalMessages: totalMessages.count,
    userMessages: userMessages.count,
    assistantMessages: assistantMessages.count,
    totalFileChanges: totalFileChanges.count,
    totalActivities: totalActivities.count,
    timeSpentMinutes,
    timeSpentThisWeekMinutes,
    mostActiveDay: mostActiveDay?.day ?? null,
    mostActiveDayCount: mostActiveDay?.count ?? 0,
  };
};
