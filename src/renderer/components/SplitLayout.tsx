import { useRef, useState, useCallback, useEffect, type ReactNode } from "react";
import { useAtom } from "jotai";
import { splitViewEnabledAtom, splitRatioAtom } from "../state/atoms/editor";

type SplitLayoutProps = {
  leftPanel: ReactNode;
  rightPanel: ReactNode;
  minLeftWidth?: number;
  minRightWidth?: number;
};

export function SplitLayout({
  leftPanel,
  rightPanel,
  minLeftWidth = 200,
  minRightWidth = 300,
}: SplitLayoutProps) {
  const [splitViewEnabled] = useAtom(splitViewEnabledAtom);
  const [splitRatio, setSplitRatio] = useAtom(splitRatioAtom);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);

  // Show split view when enabled
  const showSplit = splitViewEnabled;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newRatio = (e.clientX - containerRect.left) / containerRect.width;

      // Clamp ratio based on min widths
      const minRatio = minLeftWidth / containerRect.width;
      const maxRatio = 1 - minRightWidth / containerRect.width;
      setSplitRatio(Math.max(minRatio, Math.min(maxRatio, newRatio)));
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
  }, [isResizing, minLeftWidth, minRightWidth, setSplitRatio]);

  if (!showSplit) {
    // Just show right panel (chat) when split is disabled or no files open
    return <>{rightPanel}</>;
  }

  return (
    <div
      ref={containerRef}
      className={`split-layout ${isResizing ? "resizing" : ""}`}
      style={{
        "--split-ratio": splitRatio,
      } as React.CSSProperties}
    >
      <div className="split-left">{leftPanel}</div>
      <div className="split-divider" onMouseDown={handleMouseDown}>
        <div className="split-divider-handle" />
      </div>
      <div className="split-right">{rightPanel}</div>
    </div>
  );
}
