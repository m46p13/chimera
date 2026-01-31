import { useMemo } from "react";
import { useAtomValue } from "jotai";
import { activeTurnDiffAtom } from "../state/atoms/threadDetails";
import { DiffView, type FileDiff } from "./DiffView";

/**
 * Parse a unified diff string into FileDiff objects for the DiffView component.
 * Handles standard unified diff format with --- and +++ headers.
 */
function parseUnifiedDiff(diffText: string): FileDiff[] {
  if (!diffText || !diffText.trim()) return [];

  const files: FileDiff[] = [];
  const lines = diffText.split("\n");
  let currentFile: FileDiff | null = null;
  let oldLines: string[] = [];
  let newLines: string[] = [];
  let inHunk = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect file header: --- a/path or --- /dev/null
    if (line.startsWith("--- ")) {
      // Save previous file if exists
      if (currentFile) {
        currentFile.oldContent = oldLines.join("\n");
        currentFile.newContent = newLines.join("\n");
        files.push(currentFile);
      }

      oldLines = [];
      newLines = [];
      inHunk = false;

      // Get the old file path
      const oldPath = line.slice(4).replace(/^a\//, "").replace(/\t.*$/, "");

      // Look for +++ line
      const nextLine = lines[i + 1];
      if (nextLine && nextLine.startsWith("+++ ")) {
        const newPath = nextLine.slice(4).replace(/^b\//, "").replace(/\t.*$/, "");
        i++; // Skip the +++ line

        // Determine kind
        let kind: "create" | "modify" | "delete" = "modify";
        if (oldPath === "/dev/null") {
          kind = "create";
        } else if (newPath === "/dev/null") {
          kind = "delete";
        }

        currentFile = {
          path: kind === "create" ? newPath : oldPath,
          oldContent: "",
          newContent: "",
          kind,
        };
      }
      continue;
    }

    // Detect hunk header: @@ -1,4 +1,5 @@
    if (line.startsWith("@@") && currentFile) {
      inHunk = true;
      continue;
    }

    // Process diff lines within a hunk
    if (inHunk && currentFile) {
      if (line.startsWith("-")) {
        oldLines.push(line.slice(1));
      } else if (line.startsWith("+")) {
        newLines.push(line.slice(1));
      } else if (line.startsWith(" ")) {
        // Context line - add to both
        oldLines.push(line.slice(1));
        newLines.push(line.slice(1));
      } else if (line === "\\ No newline at end of file") {
        // Ignore this marker
        continue;
      }
    }
  }

  // Don't forget the last file
  if (currentFile) {
    currentFile.oldContent = oldLines.join("\n");
    currentFile.newContent = newLines.join("\n");
    files.push(currentFile);
  }

  return files;
}

export function DiffPanel() {
  const turnDiff = useAtomValue(activeTurnDiffAtom);

  const fileDiffs = useMemo(() => parseUnifiedDiff(turnDiff), [turnDiff]);

  if (!turnDiff || fileDiffs.length === 0) {
    return (
      <div className="diff-panel-empty">
        <div className="diff-panel-empty-content">
          <span className="diff-panel-empty-icon">📝</span>
          <h3>No changes yet</h3>
          <p>File changes will appear here as the agent works.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="diff-panel">
      <DiffView files={fileDiffs} />
    </div>
  );
}

export default DiffPanel;
