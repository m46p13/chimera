import React, { useEffect, useState, useCallback } from "react";

interface UpdateNotificationProps {
  position?: "top-right" | "top-left" | "bottom-right" | "bottom-left" | "top-center";
}

export function UpdateNotification({ position = "top-right" }: UpdateNotificationProps) {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    if (!window.codex?.updater) return;

    const unsubscribe = window.codex.updater.onStatus((newStatus) => {
      setStatus(newStatus);
      
      // Show notification for available, ready, and error states
      if (newStatus.status === "available" || newStatus.status === "ready" || newStatus.status === "error") {
        setIsVisible(true);
      } else if (newStatus.status === "downloading") {
        setIsVisible(true);
      } else if (newStatus.status === "up-to-date" || newStatus.status === "checking") {
        // Don't show for these states unless already visible
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleDownload = useCallback(async () => {
    if (!window.codex?.updater) return;
    try {
      await window.codex.updater.download();
    } catch (err) {
      console.error("Failed to download update:", err);
    }
  }, []);

  const handleInstall = useCallback(async () => {
    if (!window.codex?.updater) return;
    try {
      await window.codex.updater.install();
    } catch (err) {
      console.error("Failed to install update:", err);
    }
  }, []);

  const handleDismiss = useCallback(() => {
    setIsDismissed(true);
    setIsVisible(false);
  }, []);

  const handleCheck = useCallback(async () => {
    if (!window.codex?.updater) return;
    try {
      await window.codex.updater.check();
    } catch (err) {
      console.error("Failed to check for updates:", err);
    }
  }, []);

  if (!isVisible || isDismissed || !status) return null;

  const positionClasses = {
    "top-right": "top-4 right-4",
    "top-left": "top-4 left-4",
    "bottom-right": "bottom-4 right-4",
    "bottom-left": "bottom-4 left-4",
    "top-center": "top-4 left-1/2 -translate-x-1/2",
  };

  const getStatusContent = () => {
    switch (status.status) {
      case "checking":
        return (
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-t-transparent border-[var(--accent)] rounded-full animate-spin" />
            <span className="text-sm text-[var(--text-primary)]">Checking for updates...</span>
          </div>
        );

      case "available":
        return (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-medium text-[var(--text-primary)]">
                Update available: v{status.version}
              </span>
            </div>
            {status.releaseNotes && (
              <p className="text-xs text-[var(--text-secondary)] max-w-xs line-clamp-2">
                {status.releaseNotes}
              </p>
            )}
            <div className="flex gap-2 mt-1">
              <button
                onClick={handleDownload}
                className="px-3 py-1.5 text-xs font-medium bg-[var(--accent)] text-white rounded hover:bg-[var(--accent-hover)] transition-colors"
              >
                Download
              </button>
              <button
                onClick={handleDismiss}
                className="px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                Later
              </button>
            </div>
          </div>
        );

      case "downloading":
        return (
          <div className="flex flex-col gap-2 min-w-[200px]">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--text-primary)]">Downloading update...</span>
              <span className="text-xs text-[var(--text-secondary)]">{Math.round(status.percent || 0)}%</span>
            </div>
            <div className="w-full h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--accent)] transition-all duration-300"
                style={{ width: `${status.percent || 0}%` }}
              />
            </div>
          </div>
        );

      case "ready":
        return (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-sm font-medium text-[var(--text-primary)]">
                Update ready to install
              </span>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              Version {status.version} will be installed when you restart.
            </p>
            <div className="flex gap-2 mt-1">
              <button
                onClick={handleInstall}
                className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
              >
                Restart Now
              </button>
              <button
                onClick={handleDismiss}
                className="px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                Later
              </button>
            </div>
          </div>
        );

      case "error":
        return (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-medium text-[var(--text-primary)]">
                Update check failed
              </span>
            </div>
            {status.error && (
              <p className="text-xs text-[var(--text-secondary)] max-w-xs line-clamp-2">
                {status.error}
              </p>
            )}
            <div className="flex gap-2 mt-1">
              <button
                onClick={handleCheck}
                className="px-3 py-1.5 text-xs font-medium bg-[var(--accent)] text-white rounded hover:bg-[var(--accent-hover)] transition-colors"
              >
                Retry
              </button>
              <button
                onClick={handleDismiss}
                className="px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div
      className={`fixed ${positionClasses[position]} z-50 p-4 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg shadow-lg animate-in fade-in slide-in-from-top-2 duration-200`}
    >
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        aria-label="Dismiss"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      {getStatusContent()}
    </div>
  );
}

export default UpdateNotification;
