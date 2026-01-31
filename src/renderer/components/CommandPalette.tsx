import { useState, useEffect, useRef, useMemo } from "react";
import type { Command } from "../hooks/useKeyboardShortcuts";
import { formatShortcut } from "../hooks/useKeyboardShortcuts";

type CommandPaletteProps = {
  commands: Command[];
  isOpen: boolean;
  onClose: () => void;
};

export function CommandPalette({ commands, isOpen, onClose }: CommandPaletteProps) {
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter commands based on search
  const filteredCommands = useMemo(() => {
    if (!search.trim()) return commands;
    const query = search.toLowerCase();
    return commands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(query) ||
        cmd.category?.toLowerCase().includes(query)
    );
  }, [commands, search]);

  // Group commands by category
  const groupedCommands = useMemo(() => {
    const groups: Record<string, Command[]> = {};
    for (const cmd of filteredCommands) {
      const category = cmd.category || "General";
      if (!groups[category]) groups[category] = [];
      groups[category].push(cmd);
    }
    return groups;
  }, [filteredCommands]);

  // Flat list for navigation
  const flatList = useMemo(() => filteredCommands, [filteredCommands]);

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setSearch("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [isOpen]);

  // Reset selected index when filtered list changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.querySelector('[data-selected="true"]');
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, flatList.length - 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        break;
      case "Enter":
        event.preventDefault();
        if (flatList[selectedIndex]) {
          flatList[selectedIndex].action();
          onClose();
        }
        break;
      case "Escape":
        event.preventDefault();
        onClose();
        break;
    }
  };

  const handleItemClick = (command: Command) => {
    command.action();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="command-palette-overlay" onClick={onClose}>
      <div className="command-palette" onClick={(e) => e.stopPropagation()}>
        <div className="command-palette-header">
          <input
            ref={inputRef}
            type="text"
            className="command-palette-input"
            placeholder="Type a command or search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
        <div className="command-palette-list" ref={listRef}>
          {flatList.length === 0 ? (
            <div className="command-palette-empty">No commands found</div>
          ) : (
            Object.entries(groupedCommands).map(([category, cmds]) => (
              <div key={category} className="command-palette-group">
                <div className="command-palette-category">{category}</div>
                {cmds.map((cmd) => {
                  const index = flatList.indexOf(cmd);
                  const isSelected = index === selectedIndex;
                  return (
                    <button
                      key={cmd.id}
                      className={`command-palette-item ${isSelected ? "selected" : ""}`}
                      data-selected={isSelected}
                      onClick={() => handleItemClick(cmd)}
                      onMouseEnter={() => setSelectedIndex(index)}
                    >
                      <span className="command-palette-label">{cmd.label}</span>
                      {cmd.shortcut && (
                        <span className="command-palette-shortcut">
                          {formatShortcut(cmd.shortcut)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default CommandPalette;
