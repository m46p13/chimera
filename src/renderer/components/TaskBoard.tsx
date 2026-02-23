import { useMemo, useState } from "react";
import type { TaskBoardCard, TaskBoardColumn, TaskBoardKind, ThreadSummary } from "../state/types";

const COLUMNS: Array<{ id: TaskBoardColumn; label: string }> = [
  { id: "backlog", label: "Backlog" },
  { id: "ready", label: "Ready" },
  { id: "running", label: "Running" },
  { id: "blocked", label: "Blocked" },
  { id: "review", label: "Review" },
  { id: "done", label: "Done" },
];

const formatTimeAgo = (value: number) => {
  const seconds = Math.max(1, Math.floor(Date.now() / 1000 - value));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

type TaskBoardProps = {
  workspacePath: string;
  cards: TaskBoardCard[];
  threads: ThreadSummary[];
  activeThreadId: string | null;
  importingCloud: boolean;
  onCreateCard: (kind: TaskBoardKind, title: string) => void;
  onMoveCard: (id: string, column: TaskBoardColumn) => void;
  onDeleteCard: (id: string) => void;
  onSetDependencies: (id: string, deps: string[]) => void;
  onLinkActiveThread: (id: string) => void;
  onLinkThread: (id: string, threadId: string | null) => void;
  onOpenThread: (threadId: string) => void;
  onImportCloudTasks: () => void;
};

export function TaskBoard({
  workspacePath,
  cards,
  threads,
  activeThreadId,
  importingCloud,
  onCreateCard,
  onMoveCard,
  onDeleteCard,
  onSetDependencies,
  onLinkActiveThread,
  onLinkThread,
  onOpenThread,
  onImportCloudTasks,
}: TaskBoardProps) {
  const [newTitle, setNewTitle] = useState("");
  const [newKind, setNewKind] = useState<TaskBoardKind>("local");
  const [editingDepsFor, setEditingDepsFor] = useState<string | null>(null);

  const doneSet = useMemo(() => new Set(cards.filter((card) => card.column === "done").map((card) => card.id)), [cards]);
  const cardsById = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards]);
  const threadById = useMemo(() => new Map(threads.map((thread) => [thread.id, thread])), [threads]);

  const cardsWithDerived = useMemo(() => {
    return cards.map((card) => {
      const unresolvedDeps = card.deps.filter((depId) => !doneSet.has(depId) && cardsById.has(depId));
      const effectiveColumn: TaskBoardColumn =
        unresolvedDeps.length > 0 ? "blocked" : card.column === "blocked" ? "ready" : card.column;
      return { ...card, unresolvedDeps, effectiveColumn };
    });
  }, [cards, cardsById, doneSet]);

  const columns = useMemo(() => {
    const grouped = new Map<TaskBoardColumn, typeof cardsWithDerived>();
    for (const column of COLUMNS) {
      grouped.set(column.id, []);
    }
    for (const card of cardsWithDerived) {
      const list = grouped.get(card.effectiveColumn);
      if (list) list.push(card);
    }
    for (const [, list] of grouped) {
      list.sort((a, b) => b.updatedAt - a.updatedAt);
    }
    return grouped;
  }, [cardsWithDerived]);

  const handleCreate = () => {
    const title = newTitle.trim();
    if (!title) return;
    onCreateCard(newKind, title);
    setNewTitle("");
  };

  return (
    <div className="taskboard-page">
      <div className="taskboard-header">
        <div>
          <div className="taskboard-title">Task Board</div>
          <div className="taskboard-subtitle">{workspacePath}</div>
        </div>
        <div className="taskboard-header-actions">
          <button className="ghost" onClick={onImportCloudTasks} disabled={importingCloud}>
            {importingCloud ? "Importing..." : "Import Cloud Tasks"}
          </button>
        </div>
      </div>

      <div className="taskboard-create">
        <input
          className="taskboard-create-input"
          type="text"
          value={newTitle}
          onChange={(event) => setNewTitle(event.target.value)}
          placeholder="Create a new task card..."
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              handleCreate();
            }
          }}
        />
        <select
          className="taskboard-create-kind"
          value={newKind}
          onChange={(event) => setNewKind(event.target.value as TaskBoardKind)}
        >
          <option value="local">Local</option>
          <option value="cloud">Cloud</option>
        </select>
        <button className="primary" onClick={handleCreate} disabled={!newTitle.trim()}>
          Add Task
        </button>
      </div>

      <div className="taskboard-columns">
        {COLUMNS.map((column) => {
          const columnCards = columns.get(column.id) ?? [];
          return (
            <div key={column.id} className="taskboard-column">
              <div className="taskboard-column-head">
                <span className="taskboard-column-title">{column.label}</span>
                <span className="taskboard-column-count">{columnCards.length}</span>
              </div>

              <div className="taskboard-column-cards">
                {columnCards.length === 0 ? (
                  <div className="taskboard-empty">No tasks</div>
                ) : (
                  columnCards.map((card) => {
                    const linkedThread = card.threadId ? threadById.get(card.threadId) : null;
                    return (
                      <div key={card.id} className="taskboard-card">
                        <div className="taskboard-card-head">
                          <div className="taskboard-card-title">{card.title}</div>
                          <span className={`taskboard-card-kind kind-${card.kind}`}>{card.kind}</span>
                        </div>

                        <div className="taskboard-card-meta">
                          <span>{formatTimeAgo(card.updatedAt)}</span>
                          {card.unresolvedDeps.length > 0 ? (
                            <span className="taskboard-card-blocked">
                              blocked by {card.unresolvedDeps.length}
                            </span>
                          ) : null}
                        </div>

                        <div className="taskboard-card-controls">
                          <label className="taskboard-control">
                            <span>Stage</span>
                            <select
                              value={card.column}
                              onChange={(event) => onMoveCard(card.id, event.target.value as TaskBoardColumn)}
                            >
                              {COLUMNS.map((option) => (
                                <option key={option.id} value={option.id}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>

                          {card.kind === "local" ? (
                            <label className="taskboard-control">
                              <span>Thread</span>
                              <select
                                value={card.threadId ?? ""}
                                onChange={(event) => onLinkThread(card.id, event.target.value || null)}
                              >
                                <option value="">Unlinked</option>
                                {threads.map((thread) => (
                                  <option key={thread.id} value={thread.id}>
                                    {thread.cwd?.split("/").pop() || thread.preview}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : null}
                        </div>

                        <div className="taskboard-card-actions">
                          {card.kind === "local" ? (
                            <>
                              <button className="ghost" onClick={() => onLinkActiveThread(card.id)} disabled={!activeThreadId}>
                                Link Active Thread
                              </button>
                              <button
                                className="ghost"
                                onClick={() => card.threadId && onOpenThread(card.threadId)}
                                disabled={!card.threadId}
                              >
                                Open Thread
                              </button>
                            </>
                          ) : null}
                          <button className="ghost danger" onClick={() => onDeleteCard(card.id)}>
                            Remove
                          </button>
                        </div>

                        <div className="taskboard-deps">
                          <button
                            className="ghost"
                            onClick={() => setEditingDepsFor((prev) => (prev === card.id ? null : card.id))}
                          >
                            Dependencies ({card.deps.length})
                          </button>
                          {editingDepsFor === card.id ? (
                            <div className="taskboard-deps-list">
                              {cards
                                .filter((candidate) => candidate.id !== card.id)
                                .map((candidate) => {
                                  const checked = card.deps.includes(candidate.id);
                                  return (
                                    <label key={candidate.id} className="taskboard-deps-item">
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={(event) => {
                                          const next = event.target.checked
                                            ? [...card.deps, candidate.id]
                                            : card.deps.filter((depId) => depId !== candidate.id);
                                          onSetDependencies(card.id, next);
                                        }}
                                      />
                                      <span>{candidate.title}</span>
                                    </label>
                                  );
                                })}
                            </div>
                          ) : null}
                        </div>

                        {linkedThread ? (
                          <div className="taskboard-thread-preview">
                            Linked: {linkedThread.cwd?.split("/").pop() || linkedThread.preview}
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default TaskBoard;
