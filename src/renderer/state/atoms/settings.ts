import { atom } from "jotai";
import { atomFamily, atomWithStorage } from "jotai/utils";
import type { ModelOption, ApprovalPresetId, ThreadSettings, CodexStatus } from "../types";
import { activeThreadIdAtom } from "./threads";

// Theme (persisted to localStorage, default to 'dark')
export type Theme = "light" | "dark";
export const themeAtom = atomWithStorage<Theme>("chimera-theme", "light");

// Codex server status
export const codexStatusAtom = atom<CodexStatus>({ state: "starting" });

// Available models
export const modelsAtom = atom<ModelOption[]>([]);
export const modelLoadingAtom = atom<boolean>(false);
export const modelErrorAtom = atom<string | null>(null);

// Last used model (persisted globally)
export const lastUsedModelIdAtom = atomWithStorage<string>("chimera-last-used-model", "");

// Per-thread settings (persisted to localStorage)
export const threadSettingsAtomFamily = atomFamily((threadId: string) =>
  atomWithStorage<ThreadSettings>(`chimera-thread-settings-${threadId}`, {})
);

// Global fallback settings
export const globalModelIdAtom = atom<string>("");
export const globalEffortAtom = atom<string>("");
export const globalApprovalPresetIdAtom = atom<ApprovalPresetId>("agent");

// Derived atom: current thread's model ID (or global fallback)
export const selectedModelIdAtom = atom(
  (get) => {
    const activeId = get(activeThreadIdAtom);
    if (activeId) {
      const settings = get(threadSettingsAtomFamily(activeId));
      if (settings.modelId) return settings.modelId;
    }
    return get(globalModelIdAtom) || get(lastUsedModelIdAtom);
  },
  (get, set, newValue: string) => {
    const activeId = get(activeThreadIdAtom);
    if (activeId) {
      const current = get(threadSettingsAtomFamily(activeId));
      set(threadSettingsAtomFamily(activeId), { ...current, modelId: newValue });
    }
    set(globalModelIdAtom, newValue);
    set(lastUsedModelIdAtom, newValue);
  }
);

// Derived atom: current thread's effort (or global fallback)
export const selectedEffortAtom = atom(
  (get) => {
    const activeId = get(activeThreadIdAtom);
    if (activeId) {
      const settings = get(threadSettingsAtomFamily(activeId));
      if (settings.effort !== undefined && settings.effort !== null) {
        return settings.effort;
      }
    }
    return get(globalEffortAtom);
  },
  (get, set, newValue: string) => {
    const activeId = get(activeThreadIdAtom);
    if (activeId) {
      const current = get(threadSettingsAtomFamily(activeId));
      set(threadSettingsAtomFamily(activeId), { ...current, effort: newValue });
    }
    set(globalEffortAtom, newValue);
  }
);

// Derived atom: current thread's approval preset (or global fallback)
export const selectedApprovalPresetIdAtom = atom(
  (get) => {
    const activeId = get(activeThreadIdAtom);
    if (activeId) {
      const settings = get(threadSettingsAtomFamily(activeId));
      if (settings.approvalPresetId) return settings.approvalPresetId;
    }
    return get(globalApprovalPresetIdAtom);
  },
  (get, set, newValue: ApprovalPresetId) => {
    const activeId = get(activeThreadIdAtom);
    if (activeId) {
      const current = get(threadSettingsAtomFamily(activeId));
      set(threadSettingsAtomFamily(activeId), { ...current, approvalPresetId: newValue });
    }
    set(globalApprovalPresetIdAtom, newValue);
  }
);

// Derived atom: active model object
export const activeModelAtom = atom((get) => {
  const models = get(modelsAtom);
  const selectedId = get(selectedModelIdAtom);
  return models.find((m) => m.id === selectedId) || null;
});

// Derived atom: effort options for current model
export const effortOptionsAtom = atom((get) => {
  const model = get(activeModelAtom);
  const efforts = model?.supportedReasoningEfforts ?? [];
  return efforts.map((effort: any) => ({
    value: effort.reasoningEffort ?? effort.reasoning_effort,
    label: effort.description || effort.reasoningEffort || effort.reasoning_effort,
  }));
});

// Approval presets
export const approvalPresetsAtom = atom([
  { id: "read-only" as const, label: "read-only", approvalPolicy: "on-request", sandboxMode: "readOnly" },
  { id: "agent" as const, label: "agent", approvalPolicy: "on-request", sandboxMode: "workspaceWrite" },
  { id: "full-access" as const, label: "full-access", approvalPolicy: "never", sandboxMode: "dangerFullAccess" },
]);

// Derived atom: active approval preset
export const activeApprovalPresetAtom = atom((get) => {
  const presets = get(approvalPresetsAtom);
  const selectedId = get(selectedApprovalPresetIdAtom);
  return presets.find((p) => p.id === selectedId) ?? presets[1];
});

// ============================================
// Editor Settings
// ============================================

// Editor font size (persisted)
export const editorFontSizeAtom = atomWithStorage<number>("chimera-editor-font-size", 14);

// Editor font family (persisted)
export const editorFontFamilyAtom = atomWithStorage<string>("chimera-editor-font-family", "Geist Mono");

// Editor tab size (persisted)
export const editorTabSizeAtom = atomWithStorage<number>("chimera-editor-tab-size", 2);

// Editor word wrap (persisted)
export const editorWordWrapAtom = atomWithStorage<boolean>("chimera-editor-word-wrap", true);

// ============================================
// Browser Panel Settings
// ============================================

// Browser panel enabled (persisted)
export const browserEnabledAtom = atomWithStorage<boolean>("chimera-browser-enabled", true);

// Browser default URL (persisted)
export const browserDefaultUrlAtom = atomWithStorage<string>("chimera-browser-url", "https://www.google.com");

// ============================================
// General Application Settings
// ============================================

// Start on login (persisted)
export const startOnLoginAtom = atomWithStorage<boolean>("chimera-start-on-login", false);

// Check for updates automatically (persisted)
export const checkForUpdatesAtom = atomWithStorage<boolean>("chimera-check-updates", true);

// Language (persisted)
export const languageAtom = atomWithStorage<string>("chimera-language", "en");
