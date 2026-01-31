import React, { useEffect, useState, useCallback } from "react";

interface UpdateNotificationProps {
  position?: "top-right" | "top-left" | "bottom-right" | "bottom-left" | "top-center";
}

export function UpdateNotification({ position = "top-right" }: UpdateNotificationProps) {
  const [isReady, setIsReady] = useState(false);
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    if (!window.codex?.updater) return;

    const unsubscribe = window.codex.updater.onStatus((status) => {
      // Only show notification when update is ready to install
      // Download happens silently in the background
      if (status.status === "ready") {
        setIsReady(true);
        setVersion(status.version || null);
      }
    });

    return () => {
      unsubscribe?.();
    };
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
    setIsReady(false);
  }, []);

  // Only render when update is ready
  if (!isReady) return null;

  const positionClasses = {
    "top-right": "top-4 right-4",
    "top-left": "top-4 left-4",
    "bottom-right": "bottom-4 right-4",
    "bottom-left": "bottom-4 left-4",
    "top-center": "top-4 left-1/2 -translate-x-1/2",
  };

  return (
    <div
      className={`fixed ${positionClasses[position]} z-50 p-4 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg shadow-lg animate-in fade-in slide-in-from-top-2 duration-200 max-w-sm`}
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
      
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-sm font-medium text-[var(--text-primary)]">
            Restart to Update
          </span>
        </div>
        <p className="text-xs text-[var(--text-secondary)]">
          {version ? `Version ${version} is ready to install.` : "An update is ready to install."}
          {" "}The app will restart automatically.
        </p>
        <button
          onClick={handleInstall}
          className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
        >
          Restart Now
        </button>
      </div>
    </div>
  );
}

export default UpdateNotification;
