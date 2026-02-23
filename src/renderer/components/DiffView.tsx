import { useState, useMemo } from "react";
import hljs from "highlight.js/lib/core";

// Import common languages for highlight.js
import typescript from "highlight.js/lib/languages/typescript";
import javascript from "highlight.js/lib/languages/javascript";
import python from "highlight.js/lib/languages/python";
import json from "highlight.js/lib/languages/json";
import css from "highlight.js/lib/languages/css";
import xml from "highlight.js/lib/languages/xml";
import markdown from "highlight.js/lib/languages/markdown";
import bash from "highlight.js/lib/languages/bash";
import yaml from "highlight.js/lib/languages/yaml";
import rust from "highlight.js/lib/languages/rust";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import cpp from "highlight.js/lib/languages/cpp";
import c from "highlight.js/lib/languages/c";
import csharp from "highlight.js/lib/languages/csharp";
import php from "highlight.js/lib/languages/php";
import ruby from "highlight.js/lib/languages/ruby";
import sql from "highlight.js/lib/languages/sql";
import ini from "highlight.js/lib/languages/ini";
import diff from "highlight.js/lib/languages/diff";

// Register languages
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("python", python);
hljs.registerLanguage("json", json);
hljs.registerLanguage("css", css);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("yaml", yaml);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("go", go);
hljs.registerLanguage("java", java);
hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("c", c);
hljs.registerLanguage("csharp", csharp);
hljs.registerLanguage("php", php);
hljs.registerLanguage("ruby", ruby);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("ini", ini);
hljs.registerLanguage("diff", diff);

export type DiffViewMode = "unified" | "split";

export type FileDiff = {
  path: string;
  kind: "create" | "modify" | "delete";
  hunks: DiffHunk[];
};

type DiffViewProps = {
  files: FileDiff[];
  mode?: DiffViewMode;
  onApplyFile?: (path: string) => void;
  onRejectFile?: (path: string) => void;
  onApplyHunk?: (path: string, hunkId: string) => void;
  onRejectHunk?: (path: string, hunkId: string) => void;
  onApplyAll?: () => void;
  onRejectAll?: () => void;
  applyingFiles?: Set<string>;
  applyingHunks?: Set<string>;
  fileFeedback?: Record<string, { type: "success" | "error"; message: string }>;
  hunkFeedback?: Record<string, { type: "success" | "error"; message: string }>;
};

type DiffLine = {
  type: "add" | "remove" | "context";
  oldLine?: number;
  newLine?: number;
  content: string;
};

export type DiffHunk = {
  id: string;
  header: string;
  lines: DiffLine[];
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
};

// Language detection from file extension
const EXTENSION_MAP: Record<string, string> = {
  // TypeScript
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  // JavaScript
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  // Python
  py: "python",
  pyw: "python",
  pyi: "python",
  // JSON
  json: "json",
  jsonc: "json",
  // CSS
  css: "css",
  scss: "css",
  sass: "css",
  less: "css",
  // HTML
  html: "html",
  htm: "html",
  xhtml: "html",
  // Markdown
  md: "markdown",
  mdx: "markdown",
  mdown: "markdown",
  markdown: "markdown",
  // Shell
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  fish: "bash",
  // YAML
  yml: "yaml",
  yaml: "yaml",
  // Rust
  rs: "rust",
  // Go
  go: "go",
  // Java
  java: "java",
  // C/C++
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  h: "c",
  c: "c",
  // C#
  cs: "csharp",
  // PHP
  php: "php",
  // Ruby
  rb: "ruby",
  // SQL
  sql: "sql",
  // Config
  ini: "ini",
  cfg: "ini",
  conf: "ini",
  env: "ini",
  toml: "ini",
};

function detectLanguage(filePath: string): string | undefined {
  const ext = filePath.split(".").pop()?.toLowerCase();
  if (!ext) return undefined;
  return EXTENSION_MAP[ext];
}

function highlightCode(content: string, language?: string): string {
  if (!language) {
    // Auto-detect if no language specified
    const result = hljs.highlightAuto(content);
    return result.value;
  }
  try {
    const result = hljs.highlight(content, { language });
    return result.value;
  } catch {
    // Fallback to auto-detection if language fails
    const result = hljs.highlightAuto(content);
    return result.value;
  }
}

function DiffFile({
  file,
  mode,
  isExpanded,
  onToggle,
  onApplyFile,
  onRejectFile,
  onApplyHunk,
  onRejectHunk,
  applyingFiles,
  applyingHunks,
  fileFeedback,
  hunkFeedback,
}: {
  file: FileDiff;
  mode: DiffViewMode;
  isExpanded: boolean;
  onToggle: () => void;
  onApplyFile?: () => void;
  onRejectFile?: () => void;
  onApplyHunk?: (hunkId: string) => void;
  onRejectHunk?: (hunkId: string) => void;
  applyingFiles?: Set<string>;
  applyingHunks?: Set<string>;
  fileFeedback?: { type: "success" | "error"; message: string };
  hunkFeedback?: Record<string, { type: "success" | "error"; message: string }>;
}) {
  const language = useMemo(() => detectLanguage(file.path), [file.path]);

  const stats = useMemo(() => {
    const added = file.hunks.reduce(
      (count, hunk) => count + hunk.lines.filter((l) => l.type === "add").length,
      0
    );
    const removed = file.hunks.reduce(
      (count, hunk) => count + hunk.lines.filter((l) => l.type === "remove").length,
      0
    );
    return { added, removed };
  }, [file.hunks]);

  const isApplyingFile = applyingFiles?.has(file.path) ?? false;

  const kindLabel = file.kind === "create" ? "NEW" : file.kind === "delete" ? "DEL" : "MOD";
  const kindClass = file.kind === "create" ? "add" : file.kind === "delete" ? "delete" : "modify";

  return (
    <div className="diff-file">
      <button className="diff-file-header" onClick={onToggle}>
        <span className={`diff-file-kind ${kindClass}`}>{kindLabel}</span>
        <span className="diff-file-path">{file.path}</span>
        <span className="diff-file-stats">
          {stats.added > 0 && <span className="diff-stat-add">+{stats.added}</span>}
          {stats.removed > 0 && <span className="diff-stat-remove">-{stats.removed}</span>}
        </span>
        <span className="diff-file-toggle">{isExpanded ? "▼" : "▶"}</span>
      </button>

      {isExpanded && (
        <>
          <div className={`diff-content ${mode}`}>
            {file.hunks.map((hunk) => {
              const isApplyingHunk = applyingHunks?.has(hunk.id) ?? false;
              const feedback = hunkFeedback?.[hunk.id];
              return (
                <div key={hunk.id} className="diff-hunk">
                  <div className="diff-hunk-header">
                    <span className="diff-hunk-label">{hunk.header}</span>
                    {feedback && (
                      <span className={`diff-feedback ${feedback.type}`}>
                        {feedback.message}
                      </span>
                    )}
                    {(onApplyHunk || onRejectHunk) && (
                      <div className="diff-hunk-actions">
                        {onRejectHunk && (
                          <button className="ghost" onClick={() => onRejectHunk(hunk.id)} disabled={isApplyingHunk}>
                            Reject Hunk
                          </button>
                        )}
                        {onApplyHunk && (
                          <button className="primary" onClick={() => onApplyHunk(hunk.id)} disabled={isApplyingHunk}>
                            {isApplyingHunk ? "Applying..." : "Apply Hunk"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {mode === "unified" ? (
                    <UnifiedDiff lines={hunk.lines} language={language} />
                  ) : (
                    <SplitDiff lines={hunk.lines} language={language} />
                  )}
                </div>
              );
            })}
          </div>
          {(onApplyFile || onRejectFile) && (
            <div className="diff-file-actions">
              {fileFeedback && (
                <span className={`diff-feedback ${fileFeedback.type}`}>
                  {fileFeedback.message}
                </span>
              )}
              {onRejectFile && (
                <button className="ghost" onClick={onRejectFile} disabled={isApplyingFile}>
                  Reject
                </button>
              )}
              {onApplyFile && (
                <button className="primary" onClick={onApplyFile} disabled={isApplyingFile}>
                  {isApplyingFile ? "Applying..." : "Apply"}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function UnifiedDiff({ lines, language }: { lines: DiffLine[]; language?: string }) {
  return (
    <div className="diff-unified">
      {lines.map((line, index) => {
        const highlightedContent = highlightCode(line.content, language);
        return (
          <div key={index} className={`diff-line diff-line-${line.type}`}>
            <span className="diff-line-number old">{line.oldLine ?? ""}</span>
            <span className="diff-line-number new">{line.newLine ?? ""}</span>
            <span className="diff-line-prefix">
              {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
            </span>
            <span
              className="diff-line-content"
              dangerouslySetInnerHTML={{ __html: highlightedContent }}
            />
          </div>
        );
      })}
    </div>
  );
}

function SplitDiff({ lines, language }: { lines: DiffLine[]; language?: string }) {
  // Build paired lines for split view
  const pairs = useMemo(() => {
    const result: Array<{ left?: DiffLine; right?: DiffLine }> = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      if (line.type === "context") {
        result.push({ left: line, right: line });
        i++;
      } else if (line.type === "remove") {
        // Look for corresponding add
        const removeLines: DiffLine[] = [];
        while (i < lines.length && lines[i].type === "remove") {
          removeLines.push(lines[i]);
          i++;
        }
        const addLines: DiffLine[] = [];
        while (i < lines.length && lines[i].type === "add") {
          addLines.push(lines[i]);
          i++;
        }
        // Pair them up
        const maxLen = Math.max(removeLines.length, addLines.length);
        for (let j = 0; j < maxLen; j++) {
          result.push({
            left: removeLines[j],
            right: addLines[j],
          });
        }
      } else if (line.type === "add") {
        result.push({ left: undefined, right: line });
        i++;
      }
    }

    return result;
  }, [lines]);

  return (
    <div className="diff-split">
      <div className="diff-split-side left">
        {pairs.map((pair, index) => {
          const highlightedContent = pair.left?.content
            ? highlightCode(pair.left.content, language)
            : "";
          return (
            <div
              key={index}
              className={`diff-line ${pair.left ? `diff-line-${pair.left.type}` : "diff-line-empty"}`}
            >
              <span className="diff-line-number">{pair.left?.oldLine ?? ""}</span>
              <span
                className="diff-line-content"
                dangerouslySetInnerHTML={{ __html: highlightedContent }}
              />
            </div>
          );
        })}
      </div>
      <div className="diff-split-side right">
        {pairs.map((pair, index) => {
          const highlightedContent = pair.right?.content
            ? highlightCode(pair.right.content, language)
            : "";
          return (
            <div
              key={index}
              className={`diff-line ${pair.right ? `diff-line-${pair.right.type}` : "diff-line-empty"}`}
            >
              <span className="diff-line-number">{pair.right?.newLine ?? ""}</span>
              <span
                className="diff-line-content"
                dangerouslySetInnerHTML={{ __html: highlightedContent }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DiffView({
  files,
  mode = "unified",
  onApplyFile,
  onRejectFile,
  onApplyHunk,
  onRejectHunk,
  onApplyAll,
  onRejectAll,
  applyingFiles,
  applyingHunks,
  fileFeedback,
  hunkFeedback,
}: DiffViewProps) {
  const [viewMode, setViewMode] = useState<DiffViewMode>(mode);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(
    new Set(files.map((f) => f.path))
  );

  const toggleFile = (path: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const expandAll = () => setExpandedFiles(new Set(files.map((f) => f.path)));
  const collapseAll = () => setExpandedFiles(new Set());

  if (files.length === 0) {
    return <div className="diff-empty">No changes to display</div>;
  }

  return (
    <div className="diff-view-container">
      <div className="diff-toolbar">
        <div className="diff-toolbar-left">
          <span className="diff-toolbar-count">{files.length} file{files.length !== 1 ? "s" : ""} changed</span>
          <button className="ghost icon" onClick={expandAll} title="Expand all">
            ↓
          </button>
          <button className="ghost icon" onClick={collapseAll} title="Collapse all">
            ↑
          </button>
        </div>
        <div className="diff-toolbar-right">
          <div className="diff-mode-toggle">
            <button
              className={viewMode === "unified" ? "active" : ""}
              onClick={() => setViewMode("unified")}
            >
              Unified
            </button>
            <button
              className={viewMode === "split" ? "active" : ""}
              onClick={() => setViewMode("split")}
            >
              Split
            </button>
          </div>
          {(onApplyAll || onRejectAll) && (
            <div className="diff-toolbar-actions">
              {onRejectAll && (
                <button className="ghost" onClick={onRejectAll}>
                  Reject All
                </button>
              )}
              {onApplyAll && (
                <button className="primary" onClick={onApplyAll}>
                  Apply All
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="diff-files">
        {files.map((file) => (
          <DiffFile
            key={file.path}
            file={file}
            mode={viewMode}
            isExpanded={expandedFiles.has(file.path)}
            onToggle={() => toggleFile(file.path)}
            onApplyFile={onApplyFile ? () => onApplyFile(file.path) : undefined}
            onRejectFile={onRejectFile ? () => onRejectFile(file.path) : undefined}
            onApplyHunk={onApplyHunk ? (hunkId) => onApplyHunk(file.path, hunkId) : undefined}
            onRejectHunk={onRejectHunk ? (hunkId) => onRejectHunk(file.path, hunkId) : undefined}
            applyingFiles={applyingFiles}
            applyingHunks={applyingHunks}
            fileFeedback={fileFeedback?.[file.path]}
            hunkFeedback={hunkFeedback}
          />
        ))}
      </div>
    </div>
  );
}

export default DiffView;
