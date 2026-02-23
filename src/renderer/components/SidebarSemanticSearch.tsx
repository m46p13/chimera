import { useCallback, useEffect, useMemo, useState } from "react";

type SidebarSemanticSearchProps = {
  workspacePath?: string | null;
  onOpenFile?: (absolutePath: string, relativePath: string, line: number) => void;
  onPinContext?: (snippet: string) => void;
};

const formatAgo = (ts?: number) => {
  if (!ts) return "never";
  const seconds = Math.max(1, Math.floor(Date.now() / 1000 - ts));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

const truncate = (value: string, max = 220) => {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
};

export function SidebarSemanticSearch({ workspacePath, onOpenFile, onPinContext }: SidebarSemanticSearchProps) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"smart" | "semantic">("smart");
  const [status, setStatus] = useState<SemanticIndexStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SemanticSearchHit[]>([]);
  const [searchMeta, setSearchMeta] = useState<{ tookMs: number; mode: "smart" | "semantic"; autoRefreshed: boolean } | null>(null);
  const [lastIndexStats, setLastIndexStats] = useState<SemanticIndexStats | null>(null);

  const refreshStatus = useCallback(async () => {
    if (!workspacePath || !window.codex?.semantic) {
      setStatus(null);
      return;
    }

    setLoadingStatus(true);
    try {
      const response = await window.codex.semantic.getStatus(workspacePath);
      if (!response.success || !response.status) {
        setError(response.error || "Failed to fetch semantic status.");
        return;
      }
      setStatus(response.status);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingStatus(false);
    }
  }, [workspacePath]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const handleIndex = useCallback(async () => {
    if (!workspacePath || !window.codex?.semantic) return;
    setIndexing(true);
    setError(null);
    try {
      const response = await window.codex.semantic.indexWorkspace(workspacePath);
      if (!response.success || !response.stats) {
        setError(response.error || "Indexing failed.");
        return;
      }
      setLastIndexStats(response.stats);
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIndexing(false);
    }
  }, [workspacePath, refreshStatus]);

  const handleSearch = useCallback(async () => {
    if (!workspacePath || !window.codex?.semantic) return;
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }

    setSearching(true);
    setError(null);

    try {
      const response = await window.codex.semantic.search({
        workspacePath,
        query: trimmed,
        mode,
        limit: 8,
      });

      if (!response.success || !response.result) {
        setError(response.error || "Search failed.");
        return;
      }

      setResults(response.result.hits || []);
      setSearchMeta({
        tookMs: response.result.tookMs,
        mode: response.result.mode,
        autoRefreshed: Boolean(response.result.autoRefreshed),
      });
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSearching(false);
    }
  }, [mode, query, refreshStatus, workspacePath]);

  const hasWorkspace = Boolean(workspacePath);
  const indexedInfo = useMemo(() => {
    if (!status?.exists) return "No index yet";
    return `${status.totalChunks || 0} chunks · ${status.totalFiles || 0} files`;
  }, [status]);

  return (
    <div className="semantic-panel">
      <div className="semantic-header">
        <div>
          <div className="semantic-title">Semantic Search</div>
          <div className="semantic-subtitle">{indexedInfo}</div>
        </div>
        <button className="ghost" onClick={() => void refreshStatus()} disabled={!hasWorkspace || loadingStatus}>
          {loadingStatus ? "..." : "Refresh"}
        </button>
      </div>

      {!hasWorkspace ? (
        <div className="semantic-empty">Select a project workspace to enable indexing.</div>
      ) : (
        <>
          <div className="semantic-status-row">
            <span className={`semantic-dot ${status?.exists ? "ok" : "idle"}`} />
            <span>{status?.exists ? `Indexed ${formatAgo(status.indexedAt)}` : "Index not built"}</span>
            <button className="ghost semantic-index-btn" onClick={() => void handleIndex()} disabled={indexing}>
              {indexing ? "Indexing..." : status?.exists ? "Reindex" : "Index"}
            </button>
          </div>
          {lastIndexStats ? (
            <div className="semantic-meta">
              index {lastIndexStats.durationMs}ms · reused {lastIndexStats.reusedFiles} · updated {lastIndexStats.updatedFiles} · removed {lastIndexStats.removedFiles}
            </div>
          ) : null}

          <div className="semantic-controls">
            <input
              className="semantic-input"
              type="text"
              value={query}
              placeholder="Search code meaning..."
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleSearch();
                }
              }}
            />
            <div className="semantic-control-row">
              <select className="semantic-mode" value={mode} onChange={(event) => setMode(event.target.value as "smart" | "semantic")}> 
                <option value="smart">smart (rg + semantic)</option>
                <option value="semantic">semantic only</option>
              </select>
              <button className="primary semantic-search-btn" onClick={() => void handleSearch()} disabled={searching || !query.trim()}>
                {searching ? "Searching..." : "Search"}
              </button>
            </div>
          </div>

          {searchMeta ? (
            <div className="semantic-meta">
              {searchMeta.mode} · {searchMeta.tookMs}ms
              {searchMeta.autoRefreshed ? " · index auto-refreshed" : ""}
            </div>
          ) : null}
          {error ? <div className="semantic-error">{error}</div> : null}

          <div className="semantic-results">
            {results.length === 0 ? (
              <div className="semantic-empty">No results yet.</div>
            ) : (
              results.map((hit) => (
                <div key={hit.id} className="semantic-item">
                  <button
                    className="semantic-item-head"
                    onClick={() => onOpenFile?.(hit.absolutePath, hit.path, hit.startLine)}
                    title="Open in editor"
                  >
                    <span className="semantic-item-path">{hit.path}:{hit.startLine}</span>
                    <span className="semantic-item-score">{hit.source} · {hit.score.toFixed(2)}</span>
                  </button>
                  <div className="semantic-item-snippet">{truncate(hit.snippet)}</div>
                  {onPinContext ? (
                    <div className="semantic-item-actions">
                      <button
                        className="ghost"
                        onClick={() => onPinContext(`- ${hit.path}:${hit.startLine}-${hit.endLine}\n  ${truncate(hit.snippet, 360)}`)}
                      >
                        Add to prompt context
                      </button>
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default SidebarSemanticSearch;
