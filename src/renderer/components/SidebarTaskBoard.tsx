import { useMemo } from "react";
import type { TaskBoardCard, TaskBoardColumn } from "../state/types";

const formatTimeAgo = (value: number) => {
  const seconds = Math.max(1, Math.floor(Date.now() / 1000 - value));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

type SidebarTaskBoardProps = {
  cards: TaskBoardCard[];
  onOpenBoard: () => void;
};

export function SidebarTaskBoard({ cards, onOpenBoard }: SidebarTaskBoardProps) {
  const doneSet = useMemo(() => new Set(cards.filter((card) => card.column === "done").map((card) => card.id)), [cards]);

  const derived = useMemo(() => {
    return cards
      .map((card) => {
        const blocked = card.deps.some((depId) => !doneSet.has(depId));
        const effectiveColumn: TaskBoardColumn = blocked
          ? "blocked"
          : card.column === "blocked"
            ? "ready"
            : card.column;
        return { ...card, effectiveColumn };
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [cards, doneSet]);

  const counts = useMemo(() => {
    const initial: Record<TaskBoardColumn, number> = {
      backlog: 0,
      ready: 0,
      running: 0,
      blocked: 0,
      review: 0,
      done: 0,
    };
    for (const card of derived) {
      initial[card.effectiveColumn] += 1;
    }
    return initial;
  }, [derived]);

  return (
    <div className="taskboard-sidebar">
      <div className="taskboard-sidebar-head">
        <div>
          <div className="taskboard-sidebar-title">Task Board</div>
          <div className="taskboard-sidebar-subtitle">{cards.length} tasks</div>
        </div>
        <button className="ghost" onClick={onOpenBoard}>
          Open
        </button>
      </div>

      <div className="taskboard-sidebar-stats">
        <span className="taskboard-stat">Ready {counts.ready}</span>
        <span className="taskboard-stat">Running {counts.running}</span>
        <span className="taskboard-stat">Blocked {counts.blocked}</span>
        <span className="taskboard-stat">Review {counts.review}</span>
      </div>

      <div className="taskboard-sidebar-list">
        {derived.slice(0, 5).map((card) => (
          <div key={card.id} className={`taskboard-sidebar-item column-${card.effectiveColumn}`}>
            <div className="taskboard-sidebar-item-title">{card.title}</div>
            <div className="taskboard-sidebar-item-meta">
              <span>{card.kind}</span>
              <span>{card.effectiveColumn}</span>
              <span>{formatTimeAgo(card.updatedAt)}</span>
            </div>
          </div>
        ))}
        {cards.length === 0 ? <div className="taskboard-sidebar-empty">No tasks yet.</div> : null}
      </div>
    </div>
  );
}

export default SidebarTaskBoard;
