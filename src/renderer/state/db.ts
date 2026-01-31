// Database hooks and utilities for renderer

// Re-export types for convenience
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

export type DbFileChange = {
  id: number;
  thread_id: string;
  path: string;
  kind: string;
  created_at: number;
};

export type DbActivity = {
  id: number;
  thread_id: string;
  kind: string;
  title: string | null;
  detail: string | null;
  meta: string[] | null;
  created_at: number;
};

export type DbWorkspaceFile = {
  workspace_id: string;
  file_path: string;
  is_active: number;
  position: number;
};

// Helper to get db API
const getDb = () => {
  if (!window.codex?.db) {
    throw new Error("Database API not available");
  }
  return window.codex.db;
};

// Settings API
export const dbSettings = {
  get: async (key: string): Promise<string | null> => {
    return getDb().settings.get(key);
  },
  set: async (key: string, value: string): Promise<void> => {
    await getDb().settings.set(key, value);
  },
  getJson: async <T>(key: string, defaultValue: T): Promise<T> => {
    const value = await getDb().settings.get(key);
    if (value === null) return defaultValue;
    try {
      return JSON.parse(value) as T;
    } catch {
      return defaultValue;
    }
  },
  setJson: async <T>(key: string, value: T): Promise<void> => {
    await getDb().settings.set(key, JSON.stringify(value));
  },
  all: async (): Promise<Record<string, string>> => {
    return getDb().settings.all();
  },
};

// Threads API
export const dbThreads = {
  get: async (id: string): Promise<DbThread | null> => {
    return getDb().threads.get(id);
  },
  all: async (): Promise<DbThread[]> => {
    return getDb().threads.all();
  },
  create: async (thread: {
    id: string;
    preview?: string;
    cwd?: string | null;
    git_branch?: string | null;
    git_sha?: string | null;
    git_origin?: string | null;
    model_provider?: string;
  }): Promise<DbThread> => {
    return getDb().threads.create(thread);
  },
  update: async (
    id: string,
    updates: {
      preview?: string;
      cwd?: string | null;
      git_branch?: string | null;
      is_pinned?: number;
      is_archived?: number;
    }
  ): Promise<DbThread | null> => {
    return getDb().threads.update(id, updates);
  },
  delete: async (id: string): Promise<void> => {
    await getDb().threads.delete(id);
  },
  pin: async (id: string, pinned: boolean): Promise<DbThread | null> => {
    return getDb().threads.update(id, { is_pinned: pinned ? 1 : 0 });
  },
  archive: async (id: string, archived: boolean): Promise<DbThread | null> => {
    return getDb().threads.update(id, { is_archived: archived ? 1 : 0 });
  },
};

// Messages API
export const dbMessages = {
  get: async (threadId: string, limit?: number): Promise<DbMessage[]> => {
    return getDb().messages.get(threadId, limit);
  },
  add: async (message: {
    id: string;
    thread_id: string;
    role: "user" | "assistant";
    content: string;
  }): Promise<DbMessage> => {
    return getDb().messages.add(message);
  },
  update: async (id: string, content: string): Promise<void> => {
    await getDb().messages.update(id, content);
  },
  delete: async (id: string): Promise<void> => {
    await getDb().messages.delete(id);
  },
  search: async (
    query: string,
    limit?: number
  ): Promise<Array<DbMessage & { thread_preview: string }>> => {
    return getDb().messages.search(query, limit);
  },
};

// Files API
export const dbFiles = {
  add: async (threadId: string, path: string, kind: string): Promise<void> => {
    await getDb().files.add(threadId, path, kind);
  },
  get: async (threadId: string): Promise<DbFileChange[]> => {
    return getDb().files.get(threadId);
  },
};

// Activity API
export const dbActivity = {
  add: async (
    threadId: string,
    kind: string,
    title?: string,
    detail?: string,
    meta?: string[]
  ): Promise<void> => {
    await getDb().activity.add(threadId, kind, title, detail, meta);
  },
  get: async (threadId: string, limit?: number): Promise<DbActivity[]> => {
    return getDb().activity.get(threadId, limit);
  },
};

// Export API
export const dbExport = async () => {
  return getDb().export();
};

// Workspace files API
export const dbWorkspaceFiles = {
  save: async (workspaceId: string, files: { file_path: string; is_active: number; position: number }[]): Promise<void> => {
    await getDb().workspaceFiles.save(workspaceId, files);
  },
  load: async (workspaceId: string): Promise<DbWorkspaceFile[]> => {
    return getDb().workspaceFiles.load(workspaceId);
  },
  clear: async (workspaceId: string): Promise<void> => {
    await getDb().workspaceFiles.clear(workspaceId);
  },
};

// Convert DbThread to ThreadSummary format used by the app
export const toThreadSummary = (dbThread: DbThread) => ({
  id: dbThread.id,
  preview: dbThread.preview,
  createdAt: dbThread.created_at,
  updatedAt: dbThread.updated_at,
  modelProvider: dbThread.model_provider,
  cwd: dbThread.cwd,
  gitInfo: dbThread.git_branch || dbThread.git_sha || dbThread.git_origin
    ? {
        branch: dbThread.git_branch,
        sha: dbThread.git_sha,
        originUrl: dbThread.git_origin,
      }
    : null,
});

// Convert ThreadSummary to DbThread format for storage
export const fromThreadSummary = (thread: {
  id: string;
  preview?: string;
  cwd?: string | null;
  gitInfo?: { branch?: string | null; sha?: string | null; originUrl?: string | null } | null;
  modelProvider?: string;
  createdAt?: number;
  updatedAt?: number;
}) => ({
  id: thread.id,
  preview: thread.preview ?? "Untitled",
  cwd: thread.cwd ?? null,
  git_branch: thread.gitInfo?.branch ?? null,
  git_sha: thread.gitInfo?.sha ?? null,
  git_origin: thread.gitInfo?.originUrl ?? null,
  model_provider: thread.modelProvider ?? "openai",
  created_at: thread.createdAt ?? Math.floor(Date.now() / 1000),
  updated_at: thread.updatedAt ?? Math.floor(Date.now() / 1000),
});
