import { useEffect, useCallback } from "react";

export type Command = {
  id: string;
  label: string;
  shortcut?: string;
  action: () => void;
  category?: string;
};

// Parse shortcut string to key event matcher
const parseShortcut = (shortcut: string) => {
  const parts = shortcut.toLowerCase().split("+");
  const key = parts[parts.length - 1];
  const modifiers = {
    cmd: parts.includes("cmd") || parts.includes("meta"),
    ctrl: parts.includes("ctrl"),
    alt: parts.includes("alt") || parts.includes("option"),
    shift: parts.includes("shift"),
  };
  return { key, modifiers };
};

// Check if event matches shortcut
const matchesShortcut = (event: KeyboardEvent, shortcut: string): boolean => {
  const { key, modifiers } = parseShortcut(shortcut);

  // Check modifiers
  if (modifiers.cmd !== event.metaKey) return false;
  if (modifiers.ctrl !== event.ctrlKey) return false;
  if (modifiers.alt !== event.altKey) return false;
  if (modifiers.shift !== event.shiftKey) return false;

  // Check key
  const eventKey = event.key.toLowerCase();

  // Handle special keys
  if (key === "escape" && eventKey === "escape") return true;
  if (key === "enter" && eventKey === "enter") return true;
  if (key === "backspace" && eventKey === "backspace") return true;
  if (key === "[" && eventKey === "[") return true;
  if (key === "]" && eventKey === "]") return true;
  if (key === "," && eventKey === ",") return true;
  if (key === "`" && eventKey === "`") return true;

  // Handle number keys
  if (/^[0-9]$/.test(key) && eventKey === key) return true;

  // Handle letter keys
  if (/^[a-z]$/.test(key) && eventKey === key) return true;

  return false;
};

// Format shortcut for display
export const formatShortcut = (shortcut: string): string => {
  const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;

  return shortcut
    .split("+")
    .map((part) => {
      const lower = part.toLowerCase();
      if (lower === "cmd" || lower === "meta") return isMac ? "⌘" : "Ctrl";
      if (lower === "ctrl") return isMac ? "⌃" : "Ctrl";
      if (lower === "alt" || lower === "option") return isMac ? "⌥" : "Alt";
      if (lower === "shift") return isMac ? "⇧" : "Shift";
      if (lower === "escape") return "Esc";
      if (lower === "enter") return "↵";
      if (lower === "`") return "`";
      return part.toUpperCase();
    })
    .join(isMac ? "" : "+");
};

export function useKeyboardShortcuts(
  commands: Command[],
  options?: { enabled?: boolean }
) {
  const { enabled = true } = options ?? {};

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      // Don't trigger shortcuts when typing in inputs
      const target = event.target as HTMLElement;
      const isInputFocused =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      for (const command of commands) {
        if (!command.shortcut) continue;

        // Allow Escape to work even in inputs
        const isEscape = command.shortcut.toLowerCase() === "escape";
        if (isInputFocused && !isEscape) continue;

        if (matchesShortcut(event, command.shortcut)) {
          event.preventDefault();
          event.stopPropagation();
          command.action();
          return;
        }
      }
    },
    [commands, enabled]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}

export default useKeyboardShortcuts;
