import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const INDEX_VERSION = 2;
const VECTOR_DIMENSION = 384;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_CHUNK_CHARS = 1800;
const CHUNK_LINE_OVERLAP = 4;
const DEFAULT_MIN_SCORE = 0.2;
const DEFAULT_LIMIT = 8;
const AUTO_REFRESH_INTERVAL_MS = 2500;

const EXCLUDED_DIR_NAMES = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  "target",
  "vendor",
  "__pycache__",
  ".next",
  ".nuxt",
  ".turbo",
  ".cache",
  ".idea",
  ".vscode",
]);

const INCLUDED_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".mdx",
  ".py",
  ".rs",
  ".go",
  ".java",
  ".rb",
  ".php",
  ".c",
  ".h",
  ".cc",
  ".cpp",
  ".cxx",
  ".hpp",
  ".css",
  ".scss",
  ".html",
  ".xml",
  ".yaml",
  ".yml",
  ".toml",
  ".sh",
  ".sql",
]);

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "has",
  "he",
  "in",
  "is",
  "it",
  "its",
  "of",
  "on",
  "that",
  "the",
  "to",
  "was",
  "were",
  "will",
  "with",
  "this",
  "these",
  "those",
  "or",
  "if",
  "else",
  "then",
  "return",
  "const",
  "let",
  "var",
  "function",
  "class",
  "void",
]);

export type SemanticHitSource = "semantic" | "rg" | "hybrid";

export type SemanticSearchHit = {
  id: string;
  source: SemanticHitSource;
  score: number;
  path: string;
  absolutePath: string;
  startLine: number;
  endLine: number;
  language: string;
  snippet: string;
};

export type SemanticIndexStatus = {
  workspacePath: string;
  indexPath: string;
  exists: boolean;
  indexing: boolean;
  totalFiles?: number;
  totalChunks?: number;
  indexedAt?: number;
  lastError?: string | null;
};

export type SemanticIndexStats = {
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

export type SemanticSearchRequest = {
  workspacePath: string;
  query: string;
  limit?: number;
  minScore?: number;
  mode?: "semantic" | "smart";
};

export type SemanticSearchResponse = {
  query: string;
  mode: "semantic" | "smart";
  tookMs: number;
  fromIndex: boolean;
  autoRefreshed: boolean;
  hits: SemanticSearchHit[];
};

type WorkspaceIndexChunk = {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  language: string;
  content: string;
  tokens: string[];
  vector: number[];
};

type WorkspaceFileEntry = {
  size: number;
  mtimeMs: number;
  chunkIds: string[];
};

type WorkspaceIndex = {
  version: number;
  workspacePath: string;
  indexedAt: number;
  totalFiles: number;
  totalChunks: number;
  dimension: number;
  idf: Record<string, number>;
  files: Record<string, WorkspaceFileEntry>;
  chunks: WorkspaceIndexChunk[];
};

type ChunkDraft = {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  language: string;
  content: string;
  tokens: string[];
};

type CachedIndex = {
  indexPath: string;
  mtimeMs: number;
  data: WorkspaceIndex;
};

type EnsureIndexResult = {
  index: WorkspaceIndex;
  autoRefreshed: boolean;
};

type FileMeta = {
  absolutePath: string;
  relativePath: string;
  size: number;
  mtimeMs: number;
};

const toPosixPath = (target: string) => target.split(path.sep).join("/");

const ensureAsciiWhitespace = (value: string): string => value.replace(/\s+/g, " ").trim();

const languageFromPath = (filePath: string): string => {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".ts":
    case ".tsx":
      return "typescript";
    case ".js":
    case ".jsx":
    case ".mjs":
    case ".cjs":
      return "javascript";
    case ".py":
      return "python";
    case ".rs":
      return "rust";
    case ".go":
      return "go";
    case ".java":
      return "java";
    case ".rb":
      return "ruby";
    case ".md":
    case ".mdx":
      return "markdown";
    case ".json":
      return "json";
    case ".html":
      return "html";
    case ".css":
    case ".scss":
      return "css";
    case ".sql":
      return "sql";
    case ".yaml":
    case ".yml":
      return "yaml";
    default:
      return "text";
  }
};

const tokenize = (text: string): string[] => {
  const normalized = text
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_\-/.]/g, " ")
    .toLowerCase();

  const matches = normalized.match(/[a-z][a-z0-9]{1,31}/g) || [];
  const tokens: string[] = [];

  for (const token of matches) {
    if (STOPWORDS.has(token)) continue;
    tokens.push(token);
  }

  return tokens;
};

const isLikelyBinary = (buffer: Buffer): boolean => {
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  for (let i = 0; i < sample.length; i += 1) {
    if (sample[i] === 0) {
      return true;
    }
  }
  return false;
};

const hashToken = (token: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % VECTOR_DIMENSION;
};

const normalizeVector = (vector: number[]): number[] => {
  let magnitude = 0;
  for (const value of vector) magnitude += value * value;
  if (!magnitude) return vector;
  const scale = 1 / Math.sqrt(magnitude);
  for (let i = 0; i < vector.length; i += 1) vector[i] *= scale;
  return vector;
};

const buildVector = (tokens: string[], idf: Record<string, number>): number[] => {
  const tf = new Map<string, number>();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1);
  }

  const vector = new Array<number>(VECTOR_DIMENSION).fill(0);
  for (const [token, count] of tf.entries()) {
    const weight = count * (idf[token] ?? 1);
    const slot = hashToken(token);
    vector[slot] += weight;
  }

  return normalizeVector(vector);
};

const dot = (a: number[], b: number[]): number => {
  const n = Math.min(a.length, b.length);
  let score = 0;
  for (let i = 0; i < n; i += 1) {
    score += a[i] * b[i];
  }
  return score;
};

const stableIdForChunk = (relativePath: string, startLine: number, endLine: number): string => {
  return crypto
    .createHash("sha1")
    .update(`${relativePath}:${startLine}:${endLine}`)
    .digest("hex")
    .slice(0, 16);
};

const projectIdForPath = (workspacePath: string): string => {
  const normalized = toPosixPath(path.resolve(workspacePath));
  return crypto.createHash("sha1").update(normalized).digest("hex").slice(0, 20);
};

const extractRelativePath = (workspacePath: string, absolutePath: string): string => {
  const rel = path.relative(workspacePath, absolutePath);
  return toPosixPath(rel);
};

const buildChunksForFile = (workspacePath: string, absolutePath: string, text: string): ChunkDraft[] => {
  const relativePath = extractRelativePath(workspacePath, absolutePath);
  const language = languageFromPath(absolutePath);
  const lines = text.split(/\r?\n/);

  if (!lines.length) return [];

  const chunks: ChunkDraft[] = [];
  let start = 0;

  while (start < lines.length) {
    let end = start;
    let charCount = 0;

    while (end < lines.length) {
      const nextCount = charCount + lines[end].length + 1;
      if (nextCount > MAX_CHUNK_CHARS && end > start) break;
      charCount = nextCount;
      end += 1;
      if (charCount >= MAX_CHUNK_CHARS) break;
    }

    if (end <= start) {
      end = start + 1;
    }

    const content = lines.slice(start, end).join("\n").trim();
    if (content) {
      const tokens = tokenize(content);
      if (tokens.length > 0) {
        const startLine = start + 1;
        const endLine = end;
        chunks.push({
          id: stableIdForChunk(relativePath, startLine, endLine),
          path: relativePath,
          startLine,
          endLine,
          language,
          content,
          tokens,
        });
      }
    }

    if (end >= lines.length) break;
    start = Math.max(end - CHUNK_LINE_OVERLAP, start + 1);
  }

  return chunks;
};

const collectFiles = async (workspacePath: string): Promise<FileMeta[]> => {
  const files: FileMeta[] = [];
  const stack: string[] = [workspacePath];

  while (stack.length > 0) {
    const current = stack.pop()!;
    let entries: fs.Dirent[] = [];

    try {
      entries = await fs.promises.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const absolutePath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        if (EXCLUDED_DIR_NAMES.has(entry.name)) continue;
        stack.push(absolutePath);
        continue;
      }

      if (!entry.isFile()) continue;

      const ext = path.extname(entry.name).toLowerCase();
      if (!INCLUDED_EXTENSIONS.has(ext)) continue;

      let stat: fs.Stats;
      try {
        stat = await fs.promises.stat(absolutePath);
      } catch {
        continue;
      }

      if (!stat.isFile() || stat.size > MAX_FILE_BYTES) continue;

      files.push({
        absolutePath,
        relativePath: extractRelativePath(workspacePath, absolutePath),
        size: stat.size,
        mtimeMs: stat.mtimeMs,
      });
    }
  }

  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return files;
};

const readTextFile = async (filePath: string): Promise<string | null> => {
  let buffer: Buffer;
  try {
    buffer = await fs.promises.readFile(filePath);
  } catch {
    return null;
  }

  if (isLikelyBinary(buffer)) {
    return null;
  }

  return buffer.toString("utf8");
};

const extractRgSnippet = (line: string): string => {
  return ensureAsciiWhitespace(line).slice(0, 320);
};

const parseRgOutput = (stdout: string, workspacePath: string, limit: number): SemanticSearchHit[] => {
  const hits: SemanticSearchHit[] = [];
  const lines = stdout.split(/\r?\n/).filter(Boolean);

  for (const line of lines) {
    const match = line.match(/^(.+?):(\d+):(.*)$/);
    if (!match) continue;
    const [, relPathRaw, lineRaw, body] = match;
    const relPath = toPosixPath(relPathRaw);
    const startLine = Number(lineRaw);
    if (!Number.isFinite(startLine)) continue;

    const absolutePath = path.join(workspacePath, relPathRaw);
    const language = languageFromPath(relPathRaw);
    hits.push({
      id: crypto.createHash("sha1").update(`rg:${relPath}:${startLine}:${body}`).digest("hex").slice(0, 16),
      source: "rg",
      score: Math.max(0.35, 0.96 - hits.length * 0.02),
      path: relPath,
      absolutePath,
      startLine,
      endLine: startLine,
      language,
      snippet: extractRgSnippet(body),
    });

    if (hits.length >= limit) break;
  }

  return hits;
};

const mergeSmartResults = (
  semanticHits: SemanticSearchHit[],
  rgHits: SemanticSearchHit[],
  limit: number
): SemanticSearchHit[] => {
  const byLocation = new Map<string, SemanticSearchHit>();

  const upsert = (hit: SemanticSearchHit) => {
    const key = `${hit.path}:${hit.startLine}:${hit.endLine}`;
    const existing = byLocation.get(key);
    if (!existing) {
      byLocation.set(key, hit);
      return;
    }

    byLocation.set(key, {
      ...existing,
      score: Math.max(existing.score, hit.score),
      source:
        existing.source === hit.source
          ? existing.source
          : existing.source === "hybrid" || hit.source === "hybrid"
            ? "hybrid"
            : "hybrid",
      snippet: existing.snippet.length >= hit.snippet.length ? existing.snippet : hit.snippet,
    });
  };

  semanticHits.forEach(upsert);
  rgHits.forEach(upsert);

  return Array.from(byLocation.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
};

export class SemanticSearchEngine {
  private baseDir: string;
  private cache = new Map<string, CachedIndex>();
  private indexing = new Set<string>();
  private lastError = new Map<string, string>();
  private lastFreshnessCheck = new Map<string, number>();

  constructor(baseDir = path.join(os.homedir(), ".chimera", "semantic")) {
    this.baseDir = baseDir;
  }

  private resolveWorkspace(workspacePath: string): string {
    return path.resolve(workspacePath);
  }

  private indexFileForWorkspace(workspacePath: string): string {
    const projectId = projectIdForPath(workspacePath);
    return path.join(this.baseDir, `${projectId}.json`);
  }

  private async ensureBaseDir() {
    await fs.promises.mkdir(this.baseDir, { recursive: true });
  }

  private async readIndex(workspacePath: string): Promise<WorkspaceIndex | null> {
    const resolvedWorkspace = this.resolveWorkspace(workspacePath);
    const indexPath = this.indexFileForWorkspace(resolvedWorkspace);

    let stat: fs.Stats;
    try {
      stat = await fs.promises.stat(indexPath);
    } catch {
      return null;
    }

    const cached = this.cache.get(resolvedWorkspace);
    if (cached && cached.indexPath === indexPath && cached.mtimeMs === stat.mtimeMs) {
      return cached.data;
    }

    let raw = "";
    try {
      raw = await fs.promises.readFile(indexPath, "utf8");
    } catch {
      return null;
    }

    let parsed: WorkspaceIndex;
    try {
      parsed = JSON.parse(raw) as WorkspaceIndex;
    } catch {
      return null;
    }

    const fileEntries = Object.values((parsed as WorkspaceIndex).files || {});
    const valid =
      parsed.version === INDEX_VERSION &&
      Array.isArray(parsed.chunks) &&
      parsed.chunks.every((chunk) => Array.isArray((chunk as WorkspaceIndexChunk).tokens)) &&
      parsed.files &&
      typeof parsed.files === "object" &&
      fileEntries.every(
        (entry) =>
          entry &&
          typeof (entry as WorkspaceFileEntry).size === "number" &&
          typeof (entry as WorkspaceFileEntry).mtimeMs === "number" &&
          Array.isArray((entry as WorkspaceFileEntry).chunkIds)
      );

    if (!valid) {
      return null;
    }

    this.cache.set(resolvedWorkspace, {
      indexPath,
      mtimeMs: stat.mtimeMs,
      data: parsed,
    });

    return parsed;
  }

  async getStatus(workspacePath: string): Promise<SemanticIndexStatus> {
    const resolvedWorkspace = this.resolveWorkspace(workspacePath);
    const indexPath = this.indexFileForWorkspace(resolvedWorkspace);
    const status: SemanticIndexStatus = {
      workspacePath: resolvedWorkspace,
      indexPath,
      exists: false,
      indexing: this.indexing.has(resolvedWorkspace),
      lastError: this.lastError.get(resolvedWorkspace) ?? null,
    };

    const index = await this.readIndex(resolvedWorkspace);
    if (!index) {
      return status;
    }

    status.exists = true;
    status.totalFiles = index.totalFiles;
    status.totalChunks = index.totalChunks;
    status.indexedAt = index.indexedAt;

    return status;
  }

  async indexWorkspace(workspacePath: string): Promise<SemanticIndexStats> {
    const resolvedWorkspace = this.resolveWorkspace(workspacePath);
    const startedAt = Date.now();

    if (this.indexing.has(resolvedWorkspace)) {
      throw new Error("Semantic indexing already in progress for this workspace.");
    }

    this.indexing.add(resolvedWorkspace);
    this.lastError.delete(resolvedWorkspace);

    try {
      await this.ensureBaseDir();

      const previousIndex = await this.readIndex(resolvedWorkspace);
      const previousFiles = previousIndex?.files ?? {};
      const previousChunksById = new Map<string, WorkspaceIndexChunk>();
      previousIndex?.chunks.forEach((chunk) => {
        previousChunksById.set(chunk.id, chunk);
      });

      const files = await collectFiles(resolvedWorkspace);
      const chunks: WorkspaceIndexChunk[] = [];
      const nextFiles: Record<string, WorkspaceFileEntry> = {};
      let reusedFiles = 0;
      let updatedFiles = 0;

      for (const file of files) {
        const previousFile = previousFiles[file.relativePath];
        const unchanged =
          Boolean(previousFile) &&
          previousFile.size === file.size &&
          previousFile.mtimeMs === file.mtimeMs;

        if (unchanged && previousFile) {
          const reusedChunks: WorkspaceIndexChunk[] = [];
          let reusable = true;

          for (const chunkId of previousFile.chunkIds) {
            const existing = previousChunksById.get(chunkId);
            if (!existing || !Array.isArray(existing.tokens)) {
              reusable = false;
              break;
            }
            reusedChunks.push({
              ...existing,
              tokens: [...existing.tokens],
              vector: [...existing.vector],
            });
          }

          if (reusable) {
            chunks.push(...reusedChunks);
            nextFiles[file.relativePath] = {
              size: file.size,
              mtimeMs: file.mtimeMs,
              chunkIds: [...previousFile.chunkIds],
            };
            reusedFiles += 1;
            continue;
          }
        }

        updatedFiles += 1;
        const chunkIds: string[] = [];
        const content = await readTextFile(file.absolutePath);
        if (content) {
          const fileChunks = buildChunksForFile(resolvedWorkspace, file.absolutePath, content);
          for (const chunk of fileChunks) {
            chunkIds.push(chunk.id);
            chunks.push({
              id: chunk.id,
              path: chunk.path,
              startLine: chunk.startLine,
              endLine: chunk.endLine,
              language: chunk.language,
              content: chunk.content,
              tokens: chunk.tokens,
              vector: new Array<number>(VECTOR_DIMENSION).fill(0),
            });
          }
        }

        nextFiles[file.relativePath] = {
          size: file.size,
          mtimeMs: file.mtimeMs,
          chunkIds,
        };
      }

      const removedFiles = Object.keys(previousFiles).filter(
        (relativePath) => !Object.prototype.hasOwnProperty.call(nextFiles, relativePath)
      ).length;

      const documentFrequency = new Map<string, number>();
      for (const chunk of chunks) {
        const uniqueTokens = new Set(chunk.tokens);
        for (const token of uniqueTokens) {
          documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1);
        }
      }

      const totalDocuments = chunks.length;
      const idf: Record<string, number> = {};
      if (totalDocuments > 0) {
        for (const [token, df] of documentFrequency.entries()) {
          idf[token] = Math.log((totalDocuments + 1) / (df + 1)) + 1;
        }
      }

      const persistedChunks: WorkspaceIndexChunk[] = chunks.map((chunk) => ({
        ...chunk,
        vector: buildVector(chunk.tokens, idf),
      }));

      const indexData: WorkspaceIndex = {
        version: INDEX_VERSION,
        workspacePath: resolvedWorkspace,
        indexedAt: Math.floor(Date.now() / 1000),
        totalFiles: files.length,
        totalChunks: persistedChunks.length,
        dimension: VECTOR_DIMENSION,
        idf,
        files: nextFiles,
        chunks: persistedChunks,
      };

      const indexPath = this.indexFileForWorkspace(resolvedWorkspace);
      await fs.promises.writeFile(indexPath, JSON.stringify(indexData), "utf8");

      const stat = await fs.promises.stat(indexPath);
      this.cache.set(resolvedWorkspace, {
        indexPath,
        mtimeMs: stat.mtimeMs,
        data: indexData,
      });
      this.lastFreshnessCheck.set(resolvedWorkspace, Date.now());

      return {
        workspacePath: resolvedWorkspace,
        indexPath,
        totalFiles: indexData.totalFiles,
        totalChunks: indexData.totalChunks,
        indexedAt: indexData.indexedAt,
        durationMs: Date.now() - startedAt,
        reusedFiles,
        updatedFiles,
        removedFiles,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.lastError.set(resolvedWorkspace, message);
      throw error;
    } finally {
      this.indexing.delete(resolvedWorkspace);
    }
  }

  private async workspaceHasChanged(workspacePath: string, index: WorkspaceIndex): Promise<boolean> {
    const files = await collectFiles(workspacePath);
    if (files.length !== index.totalFiles) {
      return true;
    }

    const knownFiles = index.files || {};
    for (const file of files) {
      const entry = knownFiles[file.relativePath];
      if (!entry) {
        return true;
      }
      if (entry.size !== file.size || entry.mtimeMs !== file.mtimeMs) {
        return true;
      }
    }

    return false;
  }

  private async ensureIndex(workspacePath: string): Promise<EnsureIndexResult> {
    const resolvedWorkspace = this.resolveWorkspace(workspacePath);
    const existing = await this.readIndex(resolvedWorkspace);
    if (existing) {
      const now = Date.now();
      const lastCheck = this.lastFreshnessCheck.get(resolvedWorkspace) || 0;
      const shouldCheckFreshness =
        !this.indexing.has(resolvedWorkspace) && now - lastCheck >= AUTO_REFRESH_INTERVAL_MS;

      if (shouldCheckFreshness) {
        this.lastFreshnessCheck.set(resolvedWorkspace, now);
        try {
          const changed = await this.workspaceHasChanged(resolvedWorkspace, existing);
          if (changed) {
            await this.indexWorkspace(resolvedWorkspace);
            const refreshed = await this.readIndex(resolvedWorkspace);
            if (refreshed) {
              return { index: refreshed, autoRefreshed: true };
            }
          }
        } catch {
          // freshness checks are best effort; keep using the last successful index
        }
      }
      return { index: existing, autoRefreshed: false };
    }

    await this.indexWorkspace(resolvedWorkspace);
    const built = await this.readIndex(resolvedWorkspace);
    if (!built) {
      throw new Error("Semantic index unavailable after indexing.");
    }
    return { index: built, autoRefreshed: false };
  }

  private async runRgSearch(workspacePath: string, query: string, limit: number): Promise<SemanticSearchHit[]> {
    try {
      const { stdout } = await execFileAsync(
        "rg",
        ["--no-heading", "--line-number", "--smart-case", "--max-count", String(Math.max(20, limit * 8)), query, "."],
        { cwd: workspacePath, maxBuffer: 6 * 1024 * 1024 }
      );
      return parseRgOutput(stdout, workspacePath, limit);
    } catch {
      return [];
    }
  }

  private semanticOnlySearch(index: WorkspaceIndex, workspacePath: string, query: string, limit: number, minScore: number): SemanticSearchHit[] {
    const queryTokens = tokenize(query);
    if (!queryTokens.length || index.totalChunks === 0) {
      return [];
    }

    const queryVector = buildVector(queryTokens, index.idf || {});

    const scored = index.chunks
      .map((chunk) => {
        const score = dot(queryVector, chunk.vector);
        return { chunk, score };
      })
      .filter((entry) => entry.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, limit * 2));

    return scored.slice(0, limit).map(({ chunk, score }) => ({
      id: chunk.id,
      source: "semantic" as const,
      score,
      path: chunk.path,
      absolutePath: path.join(workspacePath, chunk.path),
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      language: chunk.language,
      snippet: chunk.content.slice(0, 480),
    }));
  }

  async search(request: SemanticSearchRequest): Promise<SemanticSearchResponse> {
    const startedAt = Date.now();
    const mode = request.mode || "smart";
    const limit = Math.max(1, Math.min(20, request.limit || DEFAULT_LIMIT));
    const minScore = Math.min(0.95, Math.max(0.01, request.minScore ?? DEFAULT_MIN_SCORE));
    const resolvedWorkspace = this.resolveWorkspace(request.workspacePath);
    const query = (request.query || "").trim();

    if (!query) {
      return {
        query,
        mode,
        fromIndex: false,
        autoRefreshed: false,
        tookMs: Date.now() - startedAt,
        hits: [],
      };
    }

    const ensureResult = await this.ensureIndex(resolvedWorkspace);
    const index = ensureResult.index;
    const semanticHits = this.semanticOnlySearch(index, resolvedWorkspace, query, limit, minScore);

    let hits = semanticHits;
    if (mode === "smart") {
      const rgHits = await this.runRgSearch(resolvedWorkspace, query, limit);
      hits = mergeSmartResults(semanticHits, rgHits, limit);
    }

    return {
      query,
      mode,
      fromIndex: true,
      autoRefreshed: ensureResult.autoRefreshed,
      tookMs: Date.now() - startedAt,
      hits,
    };
  }
}
