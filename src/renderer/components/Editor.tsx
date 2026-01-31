import { useEffect, useRef, useCallback } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { EditorState, Extension } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldGutter, foldKeymap } from "@codemirror/language";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
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

// Get language extension based on file extension
const getLanguageExtension = (filename: string): Extension => {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return javascript({ jsx: true });
    case "ts":
    case "tsx":
    case "mts":
    case "cts":
      return javascript({ jsx: true, typescript: true });
    case "py":
    case "pyw":
      return python();
    case "css":
    case "scss":
    case "less":
      return css();
    case "html":
    case "htm":
    case "vue":
    case "svelte":
      return html();
    case "json":
    case "jsonc":
      return json();
    case "md":
    case "mdx":
    case "markdown":
      return markdown();
    default:
      return [];
  }
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

function EditorTabs({ files, activeFile, dirtyFiles, onSelect, onClose }: EditorTabsProps) {
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
}

type CodeEditorProps = {
  content: string;
  filename: string;
  readOnly?: boolean;
  onChange?: (content: string) => void;
  onSave?: () => void;
};

function CodeEditor({ content, filename, readOnly = false, onChange, onSave }: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const theme = useAtomValue(themeAtom);

  const handleChange = useCallback(
    (update: { state: EditorState; docChanged: boolean }) => {
      if (update.docChanged && onChange) {
        onChange(update.state.doc.toString());
      }
    },
    [onChange]
  );

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
      getLanguageExtension(filename),
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
  }, [filename, theme, readOnly, onSave]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update content when it changes externally
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
}

type EditorPanelProps = {
  workspaceId?: string | null;
};

export function EditorPanel({ workspaceId }: EditorPanelProps) {
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
}

// Export hook for opening files from other components
export function useOpenFile() {
  const openFile = useSetAtom(openFileAtom);
  return openFile;
}
