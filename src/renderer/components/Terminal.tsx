import { useEffect, useRef, useState, useCallback } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";

type TerminalTab = {
  id: string;
  title: string;
};

type TerminalProps = {
  cwd: string;
  isVisible: boolean;
  onClose: () => void;
};

export function Terminal({ cwd, isVisible, onClose }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const terminalsRef = useRef<Map<string, XTerm>>(new Map());
  const fitAddonsRef = useRef<Map<string, FitAddon>>(new Map());

  // Generate unique terminal ID
  const generateId = useCallback(() => {
    return `term-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }, []);

  // Create a new terminal tab
  const createTerminal = useCallback(async () => {
    const id = generateId();
    const title = `Terminal ${tabs.length + 1}`;

    // Create PTY on main process
    await window.codex?.pty.create(id, cwd);

    // Add to tabs
    setTabs((prev) => [...prev, { id, title }]);
    setActiveTab(id);

    return id;
  }, [cwd, generateId, tabs.length]);

  // Close a terminal tab
  const closeTerminal = useCallback(
    async (id: string) => {
      // Kill PTY
      await window.codex?.pty.kill(id);

      // Dispose xterm instance
      const terminal = terminalsRef.current.get(id);
      if (terminal) {
        terminal.dispose();
        terminalsRef.current.delete(id);
      }
      fitAddonsRef.current.delete(id);

      // Update tabs
      setTabs((prev) => {
        const newTabs = prev.filter((t) => t.id !== id);
        if (activeTab === id && newTabs.length > 0) {
          setActiveTab(newTabs[newTabs.length - 1].id);
        } else if (newTabs.length === 0) {
          setActiveTab(null);
        }
        return newTabs;
      });
    },
    [activeTab]
  );

  // Initialize terminal instance for active tab
  useEffect(() => {
    if (!activeTab || !containerRef.current || !isVisible) return;

    // Check if terminal already exists for this tab
    let terminal = terminalsRef.current.get(activeTab);
    let fitAddon = fitAddonsRef.current.get(activeTab);

    if (!terminal) {
      // Create new xterm instance
      terminal = new XTerm({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        theme: {
          background: "var(--bg-primary, #0b0d0f)",
          foreground: "var(--text-primary, #e1e4e8)",
          cursor: "var(--accent-primary, #58a6ff)",
          cursorAccent: "var(--bg-primary, #0b0d0f)",
          selectionBackground: "rgba(88, 166, 255, 0.3)",
          black: "#484f58",
          red: "#ff7b72",
          green: "#3fb950",
          yellow: "#d29922",
          blue: "#58a6ff",
          magenta: "#bc8cff",
          cyan: "#39c5cf",
          white: "#b1bac4",
          brightBlack: "#6e7681",
          brightRed: "#ffa198",
          brightGreen: "#56d364",
          brightYellow: "#e3b341",
          brightBlue: "#79c0ff",
          brightMagenta: "#d2a8ff",
          brightCyan: "#56d4dd",
          brightWhite: "#f0f6fc",
        },
        allowProposedApi: true,
      });

      fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.loadAddon(new WebLinksAddon());

      terminalsRef.current.set(activeTab, terminal);
      fitAddonsRef.current.set(activeTab, fitAddon);

      // Handle input
      const tabId = activeTab;
      terminal.onData((data) => {
        window.codex?.pty.write(tabId, data);
      });
    }

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon || null;

    // Clear container and attach terminal
    containerRef.current.innerHTML = "";
    terminal.open(containerRef.current);

    // Fit after a small delay to ensure container is sized
    requestAnimationFrame(() => {
      fitAddon?.fit();
      // Resize PTY to match
      const cols = terminal?.cols || 80;
      const rows = terminal?.rows || 24;
      window.codex?.pty.resize(activeTab, cols, rows);
    });
  }, [activeTab, isVisible]);

  // Handle PTY data events
  useEffect(() => {
    const unsubData = window.codex?.pty.onData(({ id, data }) => {
      const terminal = terminalsRef.current.get(id);
      if (terminal) {
        terminal.write(data);
      }
    });

    const unsubExit = window.codex?.pty.onExit(({ id, exitCode }) => {
      const terminal = terminalsRef.current.get(id);
      if (terminal) {
        terminal.writeln(`\r\n[Process exited with code ${exitCode}]`);
      }
    });

    return () => {
      unsubData?.();
      unsubExit?.();
    };
  }, []);

  // Handle resize
  useEffect(() => {
    if (!isVisible) return;

    const handleResize = () => {
      if (fitAddonRef.current && activeTab) {
        fitAddonRef.current.fit();
        const terminal = terminalsRef.current.get(activeTab);
        if (terminal) {
          window.codex?.pty.resize(activeTab, terminal.cols, terminal.rows);
        }
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    if (containerRef.current?.parentElement) {
      resizeObserver.observe(containerRef.current.parentElement);
    }

    window.addEventListener("resize", handleResize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", handleResize);
    };
  }, [activeTab, isVisible]);

  // Create initial terminal if none exists
  useEffect(() => {
    if (tabs.length === 0 && isVisible && cwd) {
      createTerminal();
    }
  }, [isVisible, cwd, tabs.length, createTerminal]);

  // Focus terminal when visible
  useEffect(() => {
    if (isVisible && terminalRef.current) {
      terminalRef.current.focus();
    }
  }, [isVisible, activeTab]);

  if (!isVisible) return null;

  return (
    <div className="terminal-panel">
      <div className="terminal-header">
        <div className="terminal-tabs">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`terminal-tab ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="terminal-tab-title">{tab.title}</span>
              <button
                className="terminal-tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTerminal(tab.id);
                }}
              >
                x
              </button>
            </div>
          ))}
          <button className="terminal-new-tab" onClick={createTerminal} title="New Terminal">
            +
          </button>
        </div>
        <div className="terminal-actions">
          <button className="terminal-close" onClick={onClose} title="Close Terminal Panel">
            x
          </button>
        </div>
      </div>
      <div className="terminal-content" ref={containerRef} />
    </div>
  );
}

// Standalone terminal panel component with resizable height
export function TerminalPanel({
  cwd,
  isOpen,
  onClose,
  defaultHeight = 300,
}: {
  cwd: string;
  isOpen: boolean;
  onClose: () => void;
  defaultHeight?: number;
}) {
  const [height, setHeight] = useState(defaultHeight);
  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Handle resize drag
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!panelRef.current) return;
      const parentRect = panelRef.current.parentElement?.getBoundingClientRect();
      if (!parentRect) return;
      const newHeight = parentRect.bottom - e.clientY;
      setHeight(Math.max(100, Math.min(newHeight, parentRect.height * 0.8)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  if (!isOpen) return null;

  return (
    <div className="terminal-panel-wrapper" ref={panelRef} style={{ height }}>
      <div
        className="terminal-resize-handle"
        onMouseDown={(e) => {
          e.preventDefault();
          setIsResizing(true);
        }}
      />
      <Terminal cwd={cwd} isVisible={isOpen} onClose={onClose} />
    </div>
  );
}
