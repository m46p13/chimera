import { useState } from "react";
import { useAtomValue } from "jotai";
import type { ThreadSummary } from "../state/types";
import { threadsArrayAtom } from "../state/atoms/threads";
import { codexStatusAtom } from "../state/atoms/settings";

interface WelcomeScreenProps {
  onOpenFolder: () => void;
  onOpenSettings: () => void;
  onNewSession: () => void;
  onSelectThread: (threadId: string) => void;
}

// SVG Icon Components
function FolderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function GitCloneIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <circle cx="18" cy="6" r="3" />
      <path d="M6 9v3a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V9" />
      <path d="M12 15V9" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function ProjectIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3h18v18H3z" />
      <path d="M3 9h18" />
      <path d="M9 21V9" />
    </svg>
  );
}

// Format time relative (e.g., "2h ago", "Yesterday", etc.)
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp * 1000;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(timestamp * 1000).toLocaleDateString([], { month: "short", day: "numeric" });
}

// Quick Action Card Component
function QuickActionCard({
  icon,
  title,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button className="quick-action-card" onClick={onClick}>
      <div className="quick-action-icon">{icon}</div>
      <div className="quick-action-content">
        <div className="quick-action-title">{title}</div>
        <div className="quick-action-desc">{description}</div>
      </div>
    </button>
  );
}

// Status Indicator Component
function StatusIndicator({
  label,
  status,
  onClick,
}: {
  label: string;
  status: "connected" | "disconnected" | "ready" | "not-ready" | "logged-in" | "logged-out";
  onClick?: () => void;
}) {
  const statusMap = {
    connected: { dot: "ok", text: "Connected" },
    disconnected: { dot: "error", text: "Disconnected" },
    ready: { dot: "ok", text: "Ready" },
    "not-ready": { dot: "idle", text: "Not Ready" },
    "logged-in": { dot: "ok", text: "Logged In" },
    "logged-out": { dot: "idle", text: "Log In" },
  };

  const { dot, text } = statusMap[status];

  return (
    <button
      className={`status-indicator ${onClick ? "clickable" : ""}`}
      onClick={onClick}
      disabled={!onClick}
    >
      <span className={`status-dot ${dot}`} />
      <span className="status-label">{label}</span>
    </button>
  );
}

// Recent Session Row Component
function RecentSessionRow({
  thread,
  onClick,
}: {
  thread: ThreadSummary;
  onClick: () => void;
}) {
  const projectName = thread.cwd
    ? thread.cwd.split("/").pop() || thread.cwd
    : thread.preview || "Untitled";

  return (
    <button className="recent-session-row" onClick={onClick}>
      <div className="recent-session-icon">
        <ProjectIcon className="recent-session-svg" />
      </div>
      <div className="recent-session-info">
        <div className="recent-session-name">{projectName}</div>
        <div className="recent-session-meta">
          {thread.gitInfo?.branch && (
            <span className="recent-session-branch">{thread.gitInfo.branch}</span>
          )}
          <span className="recent-session-time">
            {formatRelativeTime(thread.updatedAt || thread.createdAt)}
          </span>
        </div>
      </div>
    </button>
  );
}

// Clone Repository Modal Component
function CloneModal({
  isOpen,
  onClose,
  onClone,
}: {
  isOpen: boolean;
  onClose: () => void;
  onClone: (url: string) => void;
}) {
  const [url, setUrl] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      onClone(url.trim());
      setUrl("");
      onClose();
    }
  };

  return (
    <div className="clone-modal-overlay" onClick={onClose}>
      <div className="clone-modal" onClick={(e) => e.stopPropagation()}>
        <div className="clone-modal-header">
          <h3>Clone Repository</h3>
          <button className="clone-modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="clone-modal-body">
            <label htmlFor="clone-url">Repository URL</label>
            <input
              id="clone-url"
              type="text"
              placeholder="https://github.com/user/repo.git"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              autoFocus
            />
          </div>
          <div className="clone-modal-footer">
            <button type="button" className="ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={!url.trim()}>
              Clone
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Keyboard Shortcut Component
function KeyboardShortcut({ keys }: { keys: string[] }) {
  return (
    <span className="keyboard-shortcut">
      {keys.map((key, index) => (
        <span key={index} className="keyboard-key">
          {key}
        </span>
      ))}
    </span>
  );
}

// Main Welcome Screen Component
export function WelcomeScreen({
  onOpenFolder,
  onOpenSettings,
  onNewSession,
  onSelectThread,
}: WelcomeScreenProps) {
  const [showCloneModal, setShowCloneModal] = useState(false);
  const threads = useAtomValue(threadsArrayAtom);
  const codexStatus = useAtomValue(codexStatusAtom);

  // Get last 5 recent sessions, sorted by updatedAt
  const recentSessions = [...threads]
    .sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt))
    .slice(0, 5);

  const handleClone = (url: string) => {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.log("Clone repository:", url);
    }
    onOpenFolder();
  };

  return (
    <div className="welcome-screen-container">
      {/* Background Pattern */}
      <div className="welcome-bg-pattern" />

      {/* Main Content */}
      <div className="welcome-content">
        {/* Hero Section */}
        <div className="welcome-hero">
          <div className="welcome-brand">
            <div className="welcome-brand-mark">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <h1 className="welcome-brand-title">CHIMERA</h1>
          </div>
          <p className="welcome-tagline">AI-powered coding assistant</p>
        </div>

        {/* Quick Actions */}
        <div className="welcome-section">
          <h2 className="welcome-section-title">Quick Actions</h2>
          <div className="quick-actions-grid">
            <QuickActionCard
              icon={<FolderIcon className="quick-action-svg" />}
              title="Open Folder"
              description="Open an existing project folder"
              onClick={onOpenFolder}
            />
            <QuickActionCard
              icon={<GitCloneIcon className="quick-action-svg" />}
              title="Clone Repository"
              description="Clone a Git repository"
              onClick={() => setShowCloneModal(true)}
            />
            <QuickActionCard
              icon={<PlusIcon className="quick-action-svg" />}
              title="New Session"
              description="Start a new coding session"
              onClick={onNewSession}
            />
          </div>
        </div>

        {/* Recent Sessions */}
        <div className="welcome-section">
          <h2 className="welcome-section-title">Recent Sessions</h2>
          {recentSessions.length > 0 ? (
            <div className="recent-sessions-list">
              {recentSessions.map((thread) => (
                <RecentSessionRow
                  key={thread.id}
                  thread={thread}
                  onClick={() => onSelectThread(thread.id)}
                />
              ))}
            </div>
          ) : (
            <div className="recent-sessions-empty">
              <ProjectIcon className="recent-sessions-empty-icon" />
              <p>No recent sessions</p>
              <span>Open a folder to get started</span>
            </div>
          )}
        </div>

        {/* Status Indicators */}
        <div className="welcome-section welcome-section--compact">
          <div className="status-indicators-row">
            <StatusIndicator
              label="Codex"
              status={codexStatus.state === "ready" ? "connected" : "disconnected"}
            />
            <StatusIndicator label="Browser" status="ready" />
            <StatusIndicator
              label="Cloud"
              status="logged-out"
              onClick={() => {}}
            />
          </div>
        </div>
      </div>

      {/* Keyboard Shortcuts Footer */}
      <div className="welcome-shortcuts">
        <div className="welcome-shortcut-item">
          <KeyboardShortcut keys={["⌘", "K"]} />
          <span>Command Palette</span>
        </div>
        <div className="welcome-shortcut-item">
          <KeyboardShortcut keys={["⌘", "N"]} />
          <span>New Session</span>
        </div>
        <div className="welcome-shortcut-item">
          <KeyboardShortcut keys={["⌘", ","]} />
          <span>Settings</span>
        </div>
      </div>

      {/* Settings Button */}
      <button className="welcome-settings-btn" onClick={onOpenSettings}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
        <span>Settings</span>
      </button>

      {/* Clone Modal */}
      <CloneModal
        isOpen={showCloneModal}
        onClose={() => setShowCloneModal(false)}
        onClone={handleClone}
      />
    </div>
  );
}
