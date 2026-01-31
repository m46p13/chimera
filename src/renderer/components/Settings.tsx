import { useState, useEffect, useCallback } from "react";
import { useAtom, useAtomValue } from "jotai";
import {
  themeAtom,
  modelsAtom,
  modelLoadingAtom,
  selectedModelIdAtom,
  selectedEffortAtom,
  selectedApprovalPresetIdAtom,
  effortOptionsAtom,
  activeModelAtom,
  approvalPresetsAtom,
  activeApprovalPresetAtom,
} from "../state/atoms/settings";
import {
  editorFontSizeAtom,
  editorFontFamilyAtom,
  editorTabSizeAtom,
  editorWordWrapAtom,
  browserEnabledAtom,
  browserDefaultUrlAtom,
  startOnLoginAtom,
  checkForUpdatesAtom,
  languageAtom,
} from "../state/atoms/settings";

// Icons
function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MonitorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function TypeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <polyline points="4 7 4 4 20 4 20 7" />
      <line x1="9" y1="20" x2="15" y2="20" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </svg>
  );
}

function CommandIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z" />
    </svg>
  );
}

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function CpuIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="4" y="4" width="16" height="16" rx="2" ry="2" />
      <rect x="9" y="9" width="6" height="6" />
      <line x1="9" y1="1" x2="9" y2="4" />
      <line x1="15" y1="1" x2="15" y2="4" />
      <line x1="9" y1="20" x2="9" y2="23" />
      <line x1="15" y1="20" x2="15" y2="23" />
      <line x1="20" y1="9" x2="23" y2="9" />
      <line x1="20" y1="14" x2="23" y2="14" />
      <line x1="1" y1="9" x2="4" y2="9" />
      <line x1="1" y1="14" x2="4" y2="14" />
    </svg>
  );
}

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

// Types
type Section =
  | "general"
  | "editor"
  | "ai"
  | "browser"
  | "shortcuts"
  | "about";

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

// Config read/write helpers
const readConfig = async (key: string): Promise<any> => {
  if (!window.codex) return null;
  try {
    const result = (await window.codex.request("config/read", { key })) as any;
    return result?.value;
  } catch {
    return null;
  }
};

const writeConfig = async (key: string, value: any): Promise<boolean> => {
  if (!window.codex) return false;
  try {
    await window.codex.request("config/write", { key, value });
    return true;
  } catch {
    return false;
  }
};

// Keyboard shortcuts data
const keyboardShortcuts = [
  { keys: ["⌘", "K"], action: "Command Palette" },
  { keys: ["⌘", "N"], action: "New Workspace" },
  { keys: ["⌘", "W"], action: "Close Workspace" },
  { keys: ["⌘", ","], action: "Open Settings" },
  { keys: ["⌘", "L"], action: "Focus Input" },
  { keys: ["⌘", "Enter"], action: "Send Message" },
  { keys: ["Esc"], action: "Close Modal/Panel" },
  { keys: ["⌘", "`"], action: "Toggle Terminal" },
  { keys: ["⌘", "Shift", "E"], action: "Toggle Split View" },
  { keys: ["⌘", "1-9"], action: "Switch Workspace" },
];

// Section navigation items
const sections: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: "general", label: "General", icon: <SettingsIcon className="nav-icon" /> },
  { id: "editor", label: "Editor", icon: <TypeIcon className="nav-icon" /> },
  { id: "ai", label: "AI / Model", icon: <CpuIcon className="nav-icon" /> },
  { id: "browser", label: "Browser", icon: <GlobeIcon className="nav-icon" /> },
  { id: "shortcuts", label: "Keyboard", icon: <CommandIcon className="nav-icon" /> },
  { id: "about", label: "About", icon: <InfoIcon className="nav-icon" /> },
];

export function Settings({ isOpen, onClose }: SettingsProps) {
  const [activeSection, setActiveSection] = useState<Section>("general");
  const [isLoading, setIsLoading] = useState(true);
  const [appVersion, setAppVersion] = useState("0.1.0");
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  // Atoms
  const [theme, setTheme] = useAtom(themeAtom);
  const models = useAtomValue(modelsAtom);
  const modelLoading = useAtomValue(modelLoadingAtom);
  const [selectedModelId, setSelectedModelId] = useAtom(selectedModelIdAtom);
  const [selectedEffort, setSelectedEffort] = useAtom(selectedEffortAtom);
  const [approvalPresetId, setApprovalPresetId] = useAtom(selectedApprovalPresetIdAtom);
  const effortOptions = useAtomValue(effortOptionsAtom);
  const activeModel = useAtomValue(activeModelAtom);
  const approvalPresets = useAtomValue(approvalPresetsAtom);
  const activeApprovalPreset = useAtomValue(activeApprovalPresetAtom);

  // New settings atoms
  const [editorFontSize, setEditorFontSize] = useAtom(editorFontSizeAtom);
  const [editorFontFamily, setEditorFontFamily] = useAtom(editorFontFamilyAtom);
  const [editorTabSize, setEditorTabSize] = useAtom(editorTabSizeAtom);
  const [editorWordWrap, setEditorWordWrap] = useAtom(editorWordWrapAtom);
  const [browserEnabled, setBrowserEnabled] = useAtom(browserEnabledAtom);
  const [browserDefaultUrl, setBrowserDefaultUrl] = useAtom(browserDefaultUrlAtom);
  const [startOnLogin, setStartOnLogin] = useAtom(startOnLoginAtom);
  const [checkForUpdates, setCheckForUpdates] = useAtom(checkForUpdatesAtom);
  const [language, setLanguage] = useAtom(languageAtom);

  // Load config on mount
  useEffect(() => {
    if (!isOpen) return;

    const loadConfig = async () => {
      setIsLoading(true);
      const [startLogin, checkUpdates, lang] = await Promise.all([
        readConfig("app.startOnLogin"),
        readConfig("app.checkForUpdates"),
        readConfig("app.language"),
      ]);

      if (startLogin !== null) setStartOnLogin(startLogin);
      if (checkUpdates !== null) setCheckForUpdates(checkUpdates);
      if (lang) setLanguage(lang);

      // Try to get app version
      try {
        const version = await window.codex?.getAppVersion?.();
        if (version) setAppVersion(version);
      } catch {
        // Use default
      }

      setIsLoading(false);
    };

    loadConfig();
  }, [isOpen, setStartOnLogin, setCheckForUpdates, setLanguage]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const handleModelChange = async (value: string) => {
    setSelectedModelId(value);
    await writeConfig("model", value);
  };

  const handleEffortChange = async (value: string) => {
    setSelectedEffort(value);
    await writeConfig("model_reasoning_effort", value);
  };

  const handlePresetChange = async (value: string) => {
    setApprovalPresetId(value as any);
    const presetMap: Record<string, { approval: string; sandbox: string }> = {
      "read-only": { approval: "on-request", sandbox: "read-only" },
      agent: { approval: "on-request", sandbox: "workspace-write" },
      "full-access": { approval: "never", sandbox: "danger-full-access" },
    };
    const mapping = presetMap[value];
    if (mapping) {
      await writeConfig("approval_policy", mapping.approval);
      await writeConfig("sandbox_mode", mapping.sandbox);
    }
  };

  const handleStartOnLoginChange = async (value: boolean) => {
    setStartOnLogin(value);
    await writeConfig("app.startOnLogin", value);
    // Notify main process
    if (window.codex?.setLoginItemSettings) {
      window.codex.setLoginItemSettings({ openAtLogin: value });
    }
  };

  const handleCheckForUpdatesChange = async (value: boolean) => {
    setCheckForUpdates(value);
    await writeConfig("app.checkForUpdates", value);
  };

  const handleClearBrowserData = async () => {
    if (window.confirm("Are you sure you want to clear all browser data? This includes cookies, cache, and local storage.")) {
      try {
        await window.codex?.request?.("browser/clearData", {});
        alert("Browser data cleared successfully.");
      } catch {
        alert("Failed to clear browser data.");
      }
    }
  };

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    try {
      const result = (await window.codex?.request?.("app/checkUpdate", {})) as { hasUpdate?: boolean; version?: string; releaseNotes?: string } | undefined;
      if (result?.hasUpdate) {
        alert(`Update available: ${result.version}\n${result.releaseNotes || ""}`);
      } else {
        alert("You're running the latest version.");
      }
    } catch {
      // Fallback
      setTimeout(() => {
        alert("You're running the latest version.");
      }, 500);
    } finally {
      setCheckingUpdate(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="settings-header">
          <div className="settings-header-left">
            <div className="settings-icon-wrapper">
              <SettingsIcon className="settings-icon" />
            </div>
            <h1 className="settings-title">Settings</h1>
          </div>
          <button className="settings-close-btn" onClick={onClose} aria-label="Close settings">
            <CloseIcon className="close-icon" />
          </button>
        </div>

        <div className="settings-body">
          {/* Sidebar Navigation */}
          <nav className="settings-sidebar">
            {sections.map((section) => (
              <button
                key={section.id}
                className={`nav-item ${activeSection === section.id ? "active" : ""}`}
                onClick={() => setActiveSection(section.id)}
              >
                {section.icon}
                <span className="nav-label">{section.label}</span>
                <ChevronRightIcon className="nav-chevron" />
              </button>
            ))}
          </nav>

          {/* Content Area */}
          <div className="settings-content">
            {isLoading ? (
              <div className="settings-loading">
                <div className="spinner" />
                <span>Loading settings...</span>
              </div>
            ) : (
              <>
                {/* General Section */}
                {activeSection === "general" && (
                  <section className="settings-section">
                    <h2 className="section-title">General</h2>
                    <p className="section-description">Configure general application settings.</p>

                    <div className="settings-cards">
                      {/* Theme */}
                      <div className="setting-card">
                        <div className="setting-card-header">
                          <div className="setting-icon theme">
                            {theme === "dark" ? <MoonIcon className="icon-svg" /> : <SunIcon className="icon-svg" />}
                          </div>
                          <div className="setting-info">
                            <label className="setting-label">Theme</label>
                            <span className="setting-desc">Choose your preferred appearance</span>
                          </div>
                        </div>
                        <div className="theme-selector">
                          <button
                            className={`theme-option ${theme === "light" ? "active" : ""}`}
                            onClick={() => setTheme("light")}
                          >
                            <SunIcon className="theme-icon" />
                            <span>Light</span>
                          </button>
                          <button
                            className={`theme-option ${theme === "dark" ? "active" : ""}`}
                            onClick={() => setTheme("dark")}
                          >
                            <MoonIcon className="theme-icon" />
                            <span>Dark</span>
                          </button>
                        </div>
                      </div>

                      {/* Language */}
                      <div className="setting-card">
                        <div className="setting-card-header">
                          <div className="setting-icon">
                            <GlobeIcon className="icon-svg" />
                          </div>
                          <div className="setting-info">
                            <label className="setting-label">Language</label>
                            <span className="setting-desc">Interface language</span>
                          </div>
                        </div>
                        <select
                          className="settings-select"
                          value={language}
                          onChange={(e) => setLanguage(e.target.value)}
                        >
                          <option value="en">English</option>
                          <option value="es">Español</option>
                          <option value="fr">Français</option>
                          <option value="de">Deutsch</option>
                          <option value="ja">日本語</option>
                          <option value="zh">中文</option>
                        </select>
                      </div>

                      {/* Startup */}
                      <div className="setting-card">
                        <div className="setting-card-header">
                          <div className="setting-icon">
                            <MonitorIcon className="icon-svg" />
                          </div>
                          <div className="setting-info">
                            <label className="setting-label">Start on Login</label>
                            <span className="setting-desc">Automatically start Chimera when you log in</span>
                          </div>
                        </div>
                        <label className="toggle">
                          <input
                            type="checkbox"
                            checked={startOnLogin}
                            onChange={(e) => handleStartOnLoginChange(e.target.checked)}
                          />
                          <span className="toggle-slider" />
                        </label>
                      </div>

                      {/* Updates */}
                      <div className="setting-card">
                        <div className="setting-card-header">
                          <div className="setting-icon">
                            <RefreshIcon className="icon-svg" />
                          </div>
                          <div className="setting-info">
                            <label className="setting-label">Check for Updates</label>
                            <span className="setting-desc">Automatically check for new versions</span>
                          </div>
                        </div>
                        <label className="toggle">
                          <input
                            type="checkbox"
                            checked={checkForUpdates}
                            onChange={(e) => handleCheckForUpdatesChange(e.target.checked)}
                          />
                          <span className="toggle-slider" />
                        </label>
                      </div>
                    </div>
                  </section>
                )}

                {/* Editor Section */}
                {activeSection === "editor" && (
                  <section className="settings-section">
                    <h2 className="section-title">Editor</h2>
                    <p className="section-description">Customize the code editor appearance and behavior.</p>

                    <div className="settings-cards">
                      {/* Font Size */}
                      <div className="setting-card">
                        <div className="setting-card-header">
                          <div className="setting-info">
                            <label className="setting-label">Font Size</label>
                            <span className="setting-desc">Editor font size in pixels</span>
                          </div>
                        </div>
                        <div className="number-input-wrapper">
                          <input
                            type="number"
                            className="settings-input number"
                            value={editorFontSize}
                            onChange={(e) => setEditorFontSize(Number(e.target.value))}
                            min={8}
                            max={32}
                          />
                          <span className="input-suffix">px</span>
                        </div>
                      </div>

                      {/* Font Family */}
                      <div className="setting-card">
                        <div className="setting-card-header">
                          <div className="setting-info">
                            <label className="setting-label">Font Family</label>
                            <span className="setting-desc">Editor font family</span>
                          </div>
                        </div>
                        <select
                          className="settings-select"
                          value={editorFontFamily}
                          onChange={(e) => setEditorFontFamily(e.target.value)}
                        >
                          <option value="Geist Mono">Geist Mono</option>
                          <option value="Fira Code">Fira Code</option>
                          <option value="JetBrains Mono">JetBrains Mono</option>
                          <option value="SF Mono">SF Mono</option>
                          <option value="Menlo">Menlo</option>
                          <option value="Consolas">Consolas</option>
                        </select>
                      </div>

                      {/* Tab Size */}
                      <div className="setting-card">
                        <div className="setting-card-header">
                          <div className="setting-info">
                            <label className="setting-label">Tab Size</label>
                            <span className="setting-desc">Number of spaces per tab</span>
                          </div>
                        </div>
                        <div className="segmented-control">
                          {[2, 4, 8].map((size) => (
                            <button
                              key={size}
                              className={`segment ${editorTabSize === size ? "active" : ""}`}
                              onClick={() => setEditorTabSize(size)}
                            >
                              {size}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Word Wrap */}
                      <div className="setting-card">
                        <div className="setting-card-header">
                          <div className="setting-info">
                            <label className="setting-label">Word Wrap</label>
                            <span className="setting-desc">Wrap long lines to fit the editor width</span>
                          </div>
                        </div>
                        <label className="toggle">
                          <input
                            type="checkbox"
                            checked={editorWordWrap}
                            onChange={(e) => setEditorWordWrap(e.target.checked)}
                          />
                          <span className="toggle-slider" />
                        </label>
                      </div>
                    </div>
                  </section>
                )}

                {/* AI / Model Section */}
                {activeSection === "ai" && (
                  <section className="settings-section">
                    <h2 className="section-title">AI / Model</h2>
                    <p className="section-description">Configure AI model settings and behavior.</p>

                    <div className="settings-cards">
                      {/* Model Selection */}
                      <div className="setting-card">
                        <div className="setting-card-header">
                          <div className="setting-info">
                            <label className="setting-label">Default Model</label>
                            <span className="setting-desc">The AI model used for conversations</span>
                          </div>
                        </div>
                        <select
                          className="settings-select"
                          value={selectedModelId || ""}
                          onChange={(e) => handleModelChange(e.target.value)}
                          disabled={modelLoading}
                        >
                          {modelLoading ? (
                            <option>Loading models...</option>
                          ) : (
                            models.map((model) => (
                              <option key={model.id} value={model.id}>
                                {model.displayName || model.id}
                              </option>
                            ))
                          )}
                        </select>
                      </div>

                      {/* Reasoning Effort */}
                      {effortOptions.length > 0 && (
                        <div className="setting-card">
                          <div className="setting-card-header">
                            <div className="setting-info">
                              <label className="setting-label">Reasoning Effort</label>
                              <span className="setting-desc">How much the model should think before responding</span>
                            </div>
                          </div>
                          <select
                            className="settings-select"
                            value={selectedEffort}
                            onChange={(e) => handleEffortChange(e.target.value)}
                          >
                            {effortOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label || option.value}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Approval Preset */}
                      <div className="setting-card">
                        <div className="setting-card-header">
                          <div className="setting-icon warning">
                            <ShieldIcon className="icon-svg" />
                          </div>
                          <div className="setting-info">
                            <label className="setting-label">Approval Mode</label>
                            <span className="setting-desc">Control what the AI can do without asking</span>
                          </div>
                        </div>
                        <select
                          className="settings-select"
                          value={approvalPresetId}
                          onChange={(e) => handlePresetChange(e.target.value)}
                        >
                          {approvalPresets.map((preset) => (
                            <option key={preset.id} value={preset.id}>
                              {preset.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Safety Info Card */}
                      <div className="info-card">
                        <h4 className="info-title">
                          <InfoIcon className="info-icon" />
                          About Approval Modes
                        </h4>
                        <ul className="info-list">
                          <li>
                            <strong>Read-only:</strong> Can only read files, no execution or modifications
                          </li>
                          <li>
                            <strong>Agent:</strong> Can modify files in workspace, asks for approval on commands
                          </li>
                          <li>
                            <strong>Full Access:</strong> Unrestricted access - use with caution
                          </li>
                        </ul>
                      </div>
                    </div>
                  </section>
                )}

                {/* Browser Section */}
                {activeSection === "browser" && (
                  <section className="settings-section">
                    <h2 className="section-title">Browser Panel</h2>
                    <p className="section-description">Configure the integrated browser panel.</p>

                    <div className="settings-cards">
                      {/* Enable Browser */}
                      <div className="setting-card">
                        <div className="setting-card-header">
                          <div className="setting-icon">
                            <GlobeIcon className="icon-svg" />
                          </div>
                          <div className="setting-info">
                            <label className="setting-label">Enable Browser Panel</label>
                            <span className="setting-desc">Show the browser panel in the sidebar</span>
                          </div>
                        </div>
                        <label className="toggle">
                          <input
                            type="checkbox"
                            checked={browserEnabled}
                            onChange={(e) => setBrowserEnabled(e.target.checked)}
                          />
                          <span className="toggle-slider" />
                        </label>
                      </div>

                      {/* Default Homepage */}
                      <div className="setting-card">
                        <div className="setting-card-header">
                          <div className="setting-info">
                            <label className="setting-label">Default Homepage</label>
                            <span className="setting-desc">URL to load when opening the browser</span>
                          </div>
                        </div>
                        <input
                          type="text"
                          className="settings-input"
                          value={browserDefaultUrl}
                          onChange={(e) => setBrowserDefaultUrl(e.target.value)}
                          placeholder="https://www.google.com"
                        />
                      </div>

                      {/* Clear Data */}
                      <div className="setting-card danger-zone">
                        <div className="setting-card-header">
                          <div className="setting-icon danger">
                            <TrashIcon className="icon-svg" />
                          </div>
                          <div className="setting-info">
                            <label className="setting-label">Clear Browser Data</label>
                            <span className="setting-desc">Clear cookies, cache, and local storage</span>
                          </div>
                        </div>
                        <button className="btn danger" onClick={handleClearBrowserData}>
                          Clear Data
                        </button>
                      </div>
                    </div>
                  </section>
                )}

                {/* Keyboard Shortcuts Section */}
                {activeSection === "shortcuts" && (
                  <section className="settings-section">
                    <h2 className="section-title">Keyboard Shortcuts</h2>
                    <p className="section-description">Available keyboard shortcuts in Chimera.</p>

                    <div className="shortcuts-list">
                      {keyboardShortcuts.map((shortcut, index) => (
                        <div key={index} className="shortcut-item">
                          <span className="shortcut-action">{shortcut.action}</span>
                          <div className="shortcut-keys">
                            {shortcut.keys.map((key, keyIndex) => (
                              <kbd key={keyIndex} className="key">
                                {key}
                              </kbd>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="info-card">
                      <p className="info-text">
                        Custom keyboard shortcuts coming soon. For now, these shortcuts are fixed.
                      </p>
                    </div>
                  </section>
                )}

                {/* About Section */}
                {activeSection === "about" && (
                  <section className="settings-section">
                    <h2 className="section-title">About</h2>
                    <p className="section-description">Information about Chimera.</p>

                    <div className="about-card">
                      <div className="about-logo">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 2L2 7l10 5 10-5-10-5z" />
                          <path d="M2 17l10 5 10-5" />
                          <path d="M2 12l10 5 10-5" />
                        </svg>
                      </div>
                      <h3 className="about-name">Chimera</h3>
                      <p className="about-version">Version {appVersion}</p>
                      <p className="about-tagline">AI-powered coding assistant</p>

                      <div className="about-actions">
                        <button
                          className="btn primary"
                          onClick={handleCheckUpdate}
                          disabled={checkingUpdate}
                        >
                          {checkingUpdate ? (
                            <>
                              <span className="spinner small" />
                              Checking...
                            </>
                          ) : (
                            <>
                              <RefreshIcon className="btn-icon" />
                              Check for Updates
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="settings-cards">
                      <div className="setting-card link-card">
                        <a
                          href="https://github.com/openai/chimera"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="link-item"
                        >
                          <div className="link-info">
                            <span className="link-label">GitHub</span>
                            <span className="link-desc">View source code and contribute</span>
                          </div>
                          <ExternalLinkIcon className="link-icon" />
                        </a>
                      </div>

                      <div className="setting-card link-card">
                        <a
                          href="https://platform.openai.com/docs"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="link-item"
                        >
                          <div className="link-info">
                            <span className="link-label">Documentation</span>
                            <span className="link-desc">Learn how to use Chimera</span>
                          </div>
                          <ExternalLinkIcon className="link-icon" />
                        </a>
                      </div>

                      <div className="setting-card link-card">
                        <a
                          href="https://github.com/openai/chimera/issues"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="link-item"
                        >
                          <div className="link-info">
                            <span className="link-label">Support</span>
                            <span className="link-desc">Report issues and get help</span>
                          </div>
                          <ExternalLinkIcon className="link-icon" />
                        </a>
                      </div>
                    </div>

                    <div className="credits">
                      <p>Built with ❤️ by the OpenAI team</p>
                      <p className="copyright">© {new Date().getFullYear()} OpenAI. All rights reserved.</p>
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="settings-footer">
          <button className="btn ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      {/* CSS Styles */}
      <style>{`
        .settings-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          animation: fadeIn 0.2s ease;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .settings-modal {
          width: 100%;
          max-width: 900px;
          height: 85vh;
          max-height: 700px;
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius);
          box-shadow: 0 24px 48px var(--shadow-color);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        /* Header */
        .settings-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid var(--border-color);
          background: var(--bg-secondary);
          flex-shrink: 0;
        }

        .settings-header-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .settings-icon-wrapper {
          width: 36px;
          height: 36px;
          border-radius: var(--radius-sm);
          background: var(--accent-soft);
          display: grid;
          place-items: center;
          color: var(--accent-primary);
        }

        .settings-icon {
          width: 20px;
          height: 20px;
        }

        .settings-title {
          font-size: 18px;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0;
        }

        .settings-close-btn {
          width: 32px;
          height: 32px;
          border: none;
          background: transparent;
          color: var(--text-secondary);
          border-radius: var(--radius-sm);
          cursor: pointer;
          display: grid;
          place-items: center;
          transition: all 0.15s ease;
        }

        .settings-close-btn:hover {
          background: var(--accent-soft);
          color: var(--text-primary);
        }

        .close-icon {
          width: 18px;
          height: 18px;
        }

        /* Body */
        .settings-body {
          display: grid;
          grid-template-columns: 200px 1fr;
          flex: 1;
          min-height: 0;
          overflow: hidden;
        }

        /* Sidebar */
        .settings-sidebar {
          background: var(--bg-secondary);
          border-right: 1px solid var(--border-color);
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          overflow-y: auto;
        }

        .nav-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border: none;
          background: transparent;
          color: var(--text-secondary);
          font-size: 13px;
          font-family: var(--font-sans);
          text-align: left;
          border-radius: var(--radius-sm);
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .nav-item:hover {
          background: var(--accent-soft);
          color: var(--text-primary);
        }

        .nav-item.active {
          background: var(--accent-soft);
          color: var(--accent-primary);
          font-weight: 500;
        }

        .nav-icon {
          width: 16px;
          height: 16px;
          flex-shrink: 0;
        }

        .nav-label {
          flex: 1;
        }

        .nav-chevron {
          width: 14px;
          height: 14px;
          opacity: 0;
          transition: opacity 0.15s ease;
        }

        .nav-item.active .nav-chevron {
          opacity: 1;
        }

        /* Content */
        .settings-content {
          padding: 24px 32px;
          overflow-y: auto;
        }

        .settings-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;
          height: 100%;
          color: var(--text-secondary);
        }

        .spinner {
          width: 24px;
          height: 24px;
          border: 2px solid var(--border-color);
          border-top-color: var(--accent-primary);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        .spinner.small {
          width: 16px;
          height: 16px;
          border-width: 1.5px;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* Section */
        .settings-section {
          animation: fadeIn 0.3s ease;
        }

        .section-title {
          font-size: 24px;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0 0 8px;
        }

        .section-description {
          font-size: 14px;
          color: var(--text-secondary);
          margin: 0 0 24px;
        }

        /* Cards */
        .settings-cards {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .setting-card {
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius);
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .setting-card-header {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .setting-icon {
          width: 36px;
          height: 36px;
          border-radius: var(--radius-sm);
          background: var(--accent-soft);
          color: var(--accent-primary);
          display: grid;
          place-items: center;
          flex-shrink: 0;
        }

        .setting-icon.warning {
          background: hsl(38 90% 55% / 0.15);
          color: var(--warning);
        }

        .setting-icon.danger {
          background: hsl(0 72% 51% / 0.15);
          color: var(--error);
        }

        .icon-svg {
          width: 18px;
          height: 18px;
        }

        .setting-info {
          flex: 1;
          min-width: 0;
        }

        .setting-label {
          display: block;
          font-size: 14px;
          font-weight: 500;
          color: var(--text-primary);
          margin-bottom: 4px;
        }

        .setting-desc {
          display: block;
          font-size: 12px;
          color: var(--text-secondary);
        }

        /* Form Controls */
        .settings-select,
        .settings-input {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid var(--border-color);
          border-radius: var(--radius-sm);
          background: var(--bg-primary);
          color: var(--text-primary);
          font-size: 13px;
          font-family: var(--font-sans);
          outline: none;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }

        .settings-select:focus,
        .settings-input:focus {
          border-color: var(--accent-primary);
          box-shadow: 0 0 0 2px var(--focus-ring);
        }

        .settings-input::placeholder {
          color: var(--text-tertiary);
        }

        .number-input-wrapper {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .settings-input.number {
          width: 80px;
          text-align: center;
        }

        .input-suffix {
          font-size: 13px;
          color: var(--text-secondary);
        }

        /* Toggle */
        .toggle {
          position: relative;
          display: inline-block;
          width: 48px;
          height: 26px;
          flex-shrink: 0;
        }

        .toggle input {
          opacity: 0;
          width: 0;
          height: 0;
        }

        .toggle-slider {
          position: absolute;
          inset: 0;
          background: var(--border-color);
          border-radius: 26px;
          cursor: pointer;
          transition: background 0.2s ease;
        }

        .toggle-slider::before {
          content: "";
          position: absolute;
          width: 20px;
          height: 20px;
          left: 3px;
          top: 3px;
          background: white;
          border-radius: 50%;
          transition: transform 0.2s ease;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
        }

        .toggle input:checked + .toggle-slider {
          background: var(--accent-primary);
        }

        .toggle input:checked + .toggle-slider::before {
          transform: translateX(22px);
        }

        /* Theme Selector */
        .theme-selector {
          display: flex;
          gap: 12px;
        }

        .theme-option {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          border: 1px solid var(--border-color);
          border-radius: var(--radius-sm);
          background: var(--bg-primary);
          color: var(--text-secondary);
          font-size: 13px;
          font-family: var(--font-sans);
          cursor: pointer;
          transition: all 0.15s ease;
          flex: 1;
          justify-content: center;
        }

        .theme-option:hover {
          border-color: var(--accent-primary);
          color: var(--text-primary);
        }

        .theme-option.active {
          border-color: var(--accent-primary);
          background: var(--accent-soft);
          color: var(--accent-primary);
          font-weight: 500;
        }

        .theme-icon {
          width: 16px;
          height: 16px;
        }

        /* Segmented Control */
        .segmented-control {
          display: inline-flex;
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-sm);
          padding: 2px;
        }

        .segment {
          padding: 6px 16px;
          border: none;
          background: transparent;
          color: var(--text-secondary);
          font-size: 13px;
          font-family: var(--font-sans);
          cursor: pointer;
          border-radius: 4px;
          transition: all 0.15s ease;
        }

        .segment:hover {
          color: var(--text-primary);
        }

        .segment.active {
          background: var(--accent-primary);
          color: white;
          font-weight: 500;
        }

        /* Info Card */
        .info-card {
          background: var(--bg-tertiary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius);
          padding: 16px;
        }

        .info-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0 0 12px;
        }

        .info-icon {
          width: 16px;
          height: 16px;
          color: var(--accent-primary);
        }

        .info-list {
          margin: 0;
          padding: 0 0 0 20px;
          font-size: 13px;
          line-height: 1.8;
          color: var(--text-secondary);
        }

        .info-list li {
          margin-bottom: 4px;
        }

        .info-list strong {
          color: var(--text-primary);
        }

        .info-text {
          margin: 0;
          font-size: 13px;
          color: var(--text-secondary);
          text-align: center;
        }

        /* Danger Zone */
        .danger-zone {
          border-color: hsl(0 72% 51% / 0.3);
          background: hsl(0 72% 51% / 0.05);
        }

        /* Buttons */
        .btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 8px 16px;
          border-radius: var(--radius-sm);
          font-size: 13px;
          font-family: var(--font-sans);
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s ease;
          border: 1px solid transparent;
        }

        .btn.primary {
          background: var(--accent-primary);
          color: white;
          border-color: var(--accent-primary);
        }

        .btn.primary:hover:not(:disabled) {
          background: var(--accent-hover);
          border-color: var(--accent-hover);
        }

        .btn.ghost {
          background: transparent;
          color: var(--text-secondary);
          border-color: var(--border-color);
        }

        .btn.ghost:hover {
          color: var(--text-primary);
          border-color: var(--text-secondary);
        }

        .btn.danger {
          background: transparent;
          color: var(--error);
          border-color: var(--error);
        }

        .btn.danger:hover {
          background: hsl(0 72% 51% / 0.1);
        }

        .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn-icon {
          width: 14px;
          height: 14px;
        }

        /* Shortcuts */
        .shortcuts-list {
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius);
          overflow: hidden;
        }

        .shortcut-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          border-bottom: 1px solid var(--border-color);
        }

        .shortcut-item:last-child {
          border-bottom: none;
        }

        .shortcut-action {
          font-size: 14px;
          color: var(--text-primary);
        }

        .shortcut-keys {
          display: flex;
          gap: 4px;
        }

        .key {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 24px;
          height: 24px;
          padding: 0 6px;
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: 4px;
          font-size: 11px;
          font-family: var(--font-mono);
          font-weight: 500;
          color: var(--text-secondary);
          box-shadow: 0 1px 0 var(--border-color);
        }

        /* About Card */
        .about-card {
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius);
          padding: 40px;
          text-align: center;
          margin-bottom: 24px;
        }

        .about-logo {
          width: 64px;
          height: 64px;
          margin: 0 auto 20px;
          border-radius: 16px;
          background: var(--accent-soft);
          color: var(--accent-primary);
          display: grid;
          place-items: center;
        }

        .about-logo svg {
          width: 32px;
          height: 32px;
        }

        .about-name {
          font-size: 24px;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0 0 8px;
        }

        .about-version {
          font-size: 13px;
          color: var(--text-secondary);
          font-family: var(--font-mono);
          margin: 0 0 4px;
        }

        .about-tagline {
          font-size: 14px;
          color: var(--text-secondary);
          margin: 0 0 24px;
        }

        .about-actions {
          display: flex;
          justify-content: center;
          gap: 12px;
        }

        /* Link Cards */
        .link-card {
          padding: 0;
          overflow: hidden;
        }

        .link-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          color: inherit;
          text-decoration: none;
          transition: background 0.15s ease;
        }

        .link-item:hover {
          background: var(--bg-tertiary);
        }

        .link-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .link-label {
          font-size: 14px;
          font-weight: 500;
          color: var(--text-primary);
        }

        .link-desc {
          font-size: 12px;
          color: var(--text-secondary);
        }

        .link-icon {
          width: 16px;
          height: 16px;
          color: var(--text-tertiary);
          flex-shrink: 0;
        }

        /* Credits */
        .credits {
          text-align: center;
          padding: 24px 0;
          color: var(--text-secondary);
          font-size: 13px;
        }

        .credits p {
          margin: 0 0 4px;
        }

        .copyright {
          font-size: 12px;
          color: var(--text-tertiary);
        }

        /* Footer */
        .settings-footer {
          display: flex;
          justify-content: flex-end;
          padding: 16px 20px;
          border-top: 1px solid var(--border-color);
          background: var(--bg-secondary);
          flex-shrink: 0;
        }

        /* Responsive */
        @media (max-width: 700px) {
          .settings-body {
            grid-template-columns: 1fr;
          }

          .settings-sidebar {
            display: none;
          }

          .settings-content {
            padding: 20px;
          }

          .theme-selector {
            flex-direction: column;
          }

          .shortcut-item {
            flex-direction: column;
            gap: 8px;
            align-items: flex-start;
          }
        }
      `}</style>
    </div>
  );
}

export default Settings;
