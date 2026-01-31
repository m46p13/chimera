import { useEffect, useRef, useCallback, useState, memo } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { EditorState, Extension } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldGutter, foldKeymap } from "@codemirror/language";
import { oneDark } from "@codemirror/theme-one-dark";

import {
  openFilesAtom,
  activeFileAtom,
  fileContentsAtom,
  dirtyFilesAtom,
  openFileAtom,
  closeFileAtom,
  setFileContentAtom,
  saveFileAtom,
  setActiveFileAtom,
  loadWorkspaceFilesAtom,
  splitViewEnabledAtom,
} from "../state/atoms/editor";
import { themeAtom } from "../state/atoms/settings";

// Language extensions cache to avoid reloading
const languageCache = new Map<string, Extension>();

// Dynamic language loader to reduce bundle size
const loadLanguageExtension = async (filename: string): Promise<Extension> => {
  const ext = filename.split(".").pop()?.toLowerCase();
  
  // Check cache first
  if (ext && languageCache.has(ext)) {
    return languageCache.get(ext)!;
  }

  let extension: Extension = [];

  try {
    switch (ext) {
      case "js":
      case "jsx":
      case "mjs":
      case "cjs": {
        const { javascript } = await import("@codemirror/lang-javascript");
        extension = javascript({ jsx: true });
        break;
      }
      case "ts":
      case "tsx":
      case "mts":
      case "cts": {
        const { javascript } = await import("@codemirror/lang-javascript");
        extension = javascript({ jsx: true, typescript: true });
        break;
      }
      case "py":
      case "pyw": {
        const { python } = await import("@codemirror/lang-python");
        extension = python();
        break;
      }
      case "css":
      case "scss":
      case "less": {
        const { css } = await import("@codemirror/lang-css");
        extension = css();
        break;
      }
      case "html":
      case "htm":
      case "vue":
      case "svelte": {
        const { html } = await import("@codemirror/lang-html");
        extension = html();
        break;
      }
      case "json":
      case "jsonc": {
        const { json } = await import("@codemirror/lang-json");
        extension = json();
        break;
      }
      case "md":
      case "mdx":
      case "markdown": {
        const { markdown } = await import("@codemirror/lang-markdown");
        extension = markdown();
        break;
      }
    }
  } catch (err) {
    // Language module failed to load, continue without syntax highlighting
    console.warn(`Failed to load language support for .${ext}:`, err);
  }

  // Cache the result
  if (ext) {
    languageCache.set(ext, extension);
  }

  return extension;
};

// Light theme for CodeMirror
const lightTheme = EditorView.theme({
  "&": {
    backgroundColor: "var(--bg-primary)",
    color: "var(--text-primary)",
    height: "100%",
  },
  ".cm-content": {
    fontFamily: "var(--font-mono)",
    fontSize: "13px",
    caretColor: "var(--accent-primary)",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--accent-primary)",
  },
  ".cm-selectionBackground, ::selection": {
    backgroundColor: "var(--accent-soft) !important",
  },
  ".cm-activeLine": {
    backgroundColor: "var(--bg-tertiary)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "var(--bg-tertiary)",
  },
  ".cm-gutters": {
    backgroundColor: "var(--bg-secondary)",
    color: "var(--text-tertiary)",
    border: "none",
    borderRight: "1px solid var(--border-color)",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    padding: "0 8px",
    minWidth: "40px",
  },
  ".cm-foldGutter .cm-gutterElement": {
    padding: "0 4px",
    cursor: "pointer",
  },
}, { dark: false });

// Shared base extensions
const baseExtensions: Extension[] = [
  lineNumbers(),
  highlightActiveLine(),
  highlightActiveLineGutter(),
  history(),
  bracketMatching(),
  foldGutter(),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  keymap.of([
    ...defaultKeymap,
    ...historyKeymap,
    ...foldKeymap,
    indentWithTab,
  ]),
  EditorView.lineWrapping,
];

type EditorTabsProps = {
  files: string[];
  activeFile: string | null;
  dirtyFiles: Set<string>;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
};

// Memoized EditorTabs component
const EditorTabs = memo(function EditorTabs({ files, activeFile, dirtyFiles, onSelect, onClose }: EditorTabsProps) {
  if (files.length === 0) return null;

  return (
    <div className="editor-tabs">
      {files.map((path) => {
        const name = path.split("/").pop() || path;
        const isDirty = dirtyFiles.has(path);
        const isActive = path === activeFile;

        return (
          <div
            key={path}
            className={`editor-tab ${isActive ? "active" : ""}`}
            onClick={() => onSelect(path)}
            title={path}
          >
            <span className="editor-tab-name">
              {isDirty && <span className="editor-tab-dirty" aria-label="Unsaved changes" />}
              {name}
            </span>
            <button
              className="editor-tab-close"
              onClick={(e) => {
                e.stopPropagation();
                onClose(path);
              }}
            >
              x
            </button>
          </div>
        );
      })}
    </div>
  );
});

type CodeEditorProps = {
  content: string;
  filename: string;
  readOnly?: boolean;
  onChange?: (content: string) => void;
  onSave?: () => void;
};

// Memoized CodeEditor component
const CodeEditor = memo(function CodeEditor({ content, filename, readOnly = false, onChange, onSave }: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const theme = useAtomValue(themeAtom);
  const [languageExt, setLanguageExt] = useState<Extension>([]);

  // Load language extension dynamically
  useEffect(() => {
    let cancelled = false;
    loadLanguageExtension(filename).then((ext) => {
      if (!cancelled) {
        setLanguageExt(ext);
      }
    });
    return () => { cancelled = true; };
  }, [filename]);

  const handleChange = useCallback(
    (update: { state: EditorState; docChanged: boolean }) => {
      if (update.docChanged && onChange) {
        onChange(update.state.doc.toString());
      }
    },
    [onChange]
  );

  // Initialize or recreate editor when dependencies change
  useEffect(() => {
    if (!containerRef.current) return;

    // Clean up existing editor
    if (viewRef.current) {
      viewRef.current.destroy();
    }

    const saveKeymap = onSave
      ? keymap.of([
        {
          key: "Mod-s",
          run: () => {
            onSave();
            return true;
          },
        },
      ])
      : [];

    const extensions: Extension[] = [
      saveKeymap,
      ...baseExtensions,
      languageExt,
      theme === "dark" ? oneDark : lightTheme,
      EditorView.editable.of(!readOnly),
      EditorView.updateListener.of(handleChange),
    ];

    const state = EditorState.create({
      doc: content,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
    };
  }, [filename, theme, readOnly, onSave, languageExt]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update content when it changes externally (but not from editor itself)
  useEffect(() => {
    if (viewRef.current) {
      const currentContent = viewRef.current.state.doc.toString();
      if (currentContent !== content) {
        viewRef.current.dispatch({
          changes: {
            from: 0,
            to: currentContent.length,
            insert: content,
          },
        });
      }
    }
  }, [content]);

  return <div className="code-editor-container" ref={containerRef} />;
});

type EditorPanelProps = {
  workspaceId?: string | null;
};

// Memoized EditorPanel component
export const EditorPanel = memo(function EditorPanel({ workspaceId }: EditorPanelProps) {
  const [openFiles, setOpenFiles] = useAtom(openFilesAtom);
  const [activeFile, setActiveFile] = useAtom(activeFileAtom);
  const [fileContents, setFileContents] = useAtom(fileContentsAtom);
  const [dirtyFiles, setDirtyFiles] = useAtom(dirtyFilesAtom);
  const [splitViewEnabled, setSplitViewEnabled] = useAtom(splitViewEnabledAtom);
  const openFile = useSetAtom(openFileAtom);
  const closeFile = useSetAtom(closeFileAtom);
  const setFileContent = useSetAtom(setFileContentAtom);
  const saveFile = useSetAtom(saveFileAtom);
  const setActiveFileAction = useSetAtom(setActiveFileAtom);
  const loadWorkspaceFiles = useSetAtom(loadWorkspaceFilesAtom);

  // Load workspace files when workspace changes
  useEffect(() => {
    if (workspaceId) {
      loadWorkspaceFiles(workspaceId);
    } else {
      // Clear files when no workspace is active
      setOpenFiles([]);
      setActiveFile(null);
      setFileContents(new Map());
      setDirtyFiles(new Set());
    }
  }, [workspaceId, loadWorkspaceFiles, setOpenFiles, setActiveFile, setFileContents, setDirtyFiles]);

  // Load file content when a file is selected
  useEffect(() => {
    if (!activeFile) return;
    if (fileContents.has(activeFile)) return;

    // Load file content from main process
    window.codex?.fs.readFile(activeFile).then((result) => {
      if (result.success && result.content !== undefined) {
        const newContents = new Map(fileContents);
        newContents.set(activeFile, result.content);
        setFileContents(newContents);
      }
    });
  }, [activeFile, fileContents, setFileContents]);

  const handleContentChange = useCallback(
    (content: string) => {
      if (!activeFile) return;
      setFileContent({ path: activeFile, content, markDirty: true });
    },
    [activeFile, setFileContent]
  );

  const handleCloseFile = useCallback(
    (path: string) => {
      if (dirtyFiles.has(path)) {
        const name = path.split("/").pop() || path;
        const shouldClose = window.confirm(`Discard unsaved changes in ${name}?`);
        if (!shouldClose) {
          return;
        }
      }
      closeFile({ path, workspaceId: workspaceId ?? undefined });
    },
    [closeFile, workspaceId, dirtyFiles]
  );

  const handleSelectFile = useCallback(
    (path: string) => {
      setActiveFileAction({ path, workspaceId: workspaceId ?? undefined });
    },
    [setActiveFileAction, workspaceId]
  );

  const toggleSplitView = useCallback(() => {
    setSplitViewEnabled(!splitViewEnabled);
  }, [splitViewEnabled, setSplitViewEnabled]);

  const handleSaveFile = useCallback(async () => {
    if (!activeFile) return;
    const result = await saveFile(activeFile);
    if (!result?.success) {
      console.error("Failed to save file:", result?.error);
    }
  }, [activeFile, saveFile]);

  const currentContent = activeFile ? fileContents.get(activeFile) : undefined;

  return (
    <div className="editor-panel">
      <div className="editor-panel-header">
        <EditorTabs
          files={openFiles}
          activeFile={activeFile}
          dirtyFiles={dirtyFiles}
          onSelect={handleSelectFile}
          onClose={handleCloseFile}
        />
        <div className="editor-panel-actions">
          <button
            className={`ghost icon ${splitViewEnabled ? "active" : ""}`}
            onClick={toggleSplitView}
            title="Toggle split view"
          >
            ||
          </button>
        </div>
      </div>

      <div className="editor-panel-content">
        {activeFile && currentContent !== undefined ? (
          <CodeEditor
            content={currentContent}
            filename={activeFile}
            onChange={handleContentChange}
            onSave={handleSaveFile}
          />
        ) : activeFile ? (
          <div className="editor-loading">Loading...</div>
        ) : (
          <div className="editor-empty">
            <p>No file open</p>
            <p className="editor-empty-hint">Select a file from the tree to open it here</p>
          </div>
        )}
      </div>
    </div>
  );
});

// Export hook for opening files from other components
export function useOpenFile() {
  const openFile = useSetAtom(openFileAtom);
  return openFile;
}
