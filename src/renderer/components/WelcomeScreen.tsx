import { useState, useEffect } from "react";
import { useAtomValue } from "jotai";
import type { ThreadSummary } from "../state/types";
import { threadsArrayAtom } from "../state/atoms/threads";
import { codexStatusAtom } from "../state/atoms/settings";
import { dbStats, type UsageStats } from "../state/db";
import { RateLimitDisplay } from "./RateLimitDisplay";

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

function SessionIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function MessageIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
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

// Format minutes to hours and minutes
function formatTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
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

// Stat Card Component
function StatCard({
  icon,
  value,
  label,
  subtext,
}: {
  icon: React.ReactNode;
  value: string | number;
  label: string;
  subtext?: string;
}) {
  return (
    <div className="stat-card">
      <div className="stat-icon">{icon}</div>
      <div className="stat-content">
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
        {subtext && <div className="stat-subtext">{subtext}</div>}
      </div>
    </div>
  );
}

// Usage Stats Section Component
function UsageStatsSection() {
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const data = await dbStats.get();
        setStats(data);
      } catch (err) {
        console.error("Failed to load usage stats:", err);
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, []);

  if (loading) {
    return (
      <div className="welcome-section welcome-section--compact">
        <h2 className="welcome-section-title">This Week</h2>
        <div className="stats-grid stats-grid--loading">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="stat-card stat-card--skeleton" />
          ))}
        </div>
      </div>
    );
  }

  if (!stats || stats.totalSessions === 0) {
    return null;
  }

  return (
    <div className="welcome-section welcome-section--compact">
      <h2 className="welcome-section-title">This Week</h2>
      <div className="stats-grid">
        <StatCard
          icon={<SessionIcon className="stat-svg" />}
          value={stats.sessionsThisWeek}
          label="Sessions"
          subtext={`${stats.totalSessions} total`}
        />
        <StatCard
          icon={<MessageIcon className="stat-svg" />}
          value={stats.totalMessages}
          label="Messages"
          subtext={`${stats.userMessages} sent`}
        />
        <StatCard
          icon={<ClockIcon className="stat-svg" />}
          value={formatTime(stats.timeSpentThisWeekMinutes)}
          label="Coding time"
          subtext={stats.timeSpentMinutes > stats.timeSpentThisWeekMinutes ? `${formatTime(stats.timeSpentMinutes)} total` : undefined}
        />
        <StatCard
          icon={<FileIcon className="stat-svg" />}
          value={stats.totalFileChanges}
          label="Files changed"
        />
      </div>
    </div>
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
              <img src="./icon.png" alt="Chimera" className="welcome-logo" />
            </div>
            <h1 className="welcome-brand-title">CHIMERA</h1>
          </div>
        </div>

        {/* Rate Limits */}
        <RateLimitDisplay />

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

        {/* Usage Stats */}
        <UsageStatsSection />

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
