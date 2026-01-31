import { useAtomValue } from "jotai";
import { rateLimitsAtom, primaryLimitAtom, secondaryLimitAtom, creditsDisplayAtom } from "../state/atoms/rateLimits";

// Progress bar component with block characters (similar to Codex CLI)
function ProgressBar({ percentRemaining, size = 20 }: { percentRemaining: number; size?: number }) {
  const clamped = Math.max(0, Math.min(100, percentRemaining));
  const filled = Math.round((clamped / 100) * size);
  const empty = size - filled;

  // Color based on remaining percentage
  const getColor = () => {
    if (percentRemaining > 50) return "var(--success, #22c55e)";
    if (percentRemaining > 25) return "var(--warning, #f59e0b)";
    return "var(--error, #ef4444)";
  };

  return (
    <span className="rate-limit-bar" style={{ color: getColor() }}>
      <span className="rate-limit-bar-filled">{"█".repeat(filled)}</span>
      <span className="rate-limit-bar-empty">{"░".repeat(empty)}</span>
    </span>
  );
}

// Single rate limit row
function RateLimitRow({
  label,
  percentUsed,
  percentRemaining,
  resetsAt,
}: {
  label: string;
  percentUsed: number;
  percentRemaining: number;
  resetsAt?: string;
}) {
  return (
    <div className="rate-limit-row">
      <div className="rate-limit-row-header">
        <span className="rate-limit-label">{label}</span>
        <span className="rate-limit-value">{Math.round(percentRemaining)}% left</span>
      </div>
      <div className="rate-limit-row-body">
        <ProgressBar percentRemaining={percentRemaining} />
        {resetsAt && <span className="rate-limit-reset">{resetsAt}</span>}
      </div>
    </div>
  );
}

// Credits display row
function CreditsRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rate-limit-row">
      <div className="rate-limit-row-header">
        <span className="rate-limit-label">{label}</span>
        <span className="rate-limit-value rate-limit-credits">{value}</span>
      </div>
    </div>
  );
}

// Main Rate Limit Display component
export function RateLimitDisplay() {
  const rateLimitStatus = useAtomValue(rateLimitsAtom);
  const primaryLimit = useAtomValue(primaryLimitAtom);
  const secondaryLimit = useAtomValue(secondaryLimitAtom);
  const credits = useAtomValue(creditsDisplayAtom);

  // Don't show if no rate limit data available
  if (rateLimitStatus.type === "missing") {
    return null;
  }

  const isStale = rateLimitStatus.type === "stale";
  const data = rateLimitStatus.type !== "missing" ? rateLimitStatus.data : null;

  // Check if we have any data to display
  const hasPrimary = primaryLimit !== null;
  const hasSecondary = secondaryLimit !== null;
  const hasCredits = credits !== null;

  if (!hasPrimary && !hasSecondary && !hasCredits) {
    return null;
  }

  // Format the captured time
  const capturedTime = data?.captured_at
    ? new Date(data.captured_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className={`rate-limit-display ${isStale ? "rate-limit-stale" : ""}`}>
      <div className="rate-limit-header">
        <span className="rate-limit-title">API Limits</span>
        {isStale && <span className="rate-limit-stale-badge">stale</span>}
        {capturedTime && !isStale && (
          <span className="rate-limit-captured">Updated {capturedTime}</span>
        )}
      </div>

      <div className="rate-limit-list">
        {hasPrimary && (
          <RateLimitRow
            label={`${primaryLimit.label} limit`}
            percentUsed={primaryLimit.percentUsed}
            percentRemaining={primaryLimit.percentRemaining}
            resetsAt={primaryLimit.resetsAt}
          />
        )}

        {hasSecondary && (
          <RateLimitRow
            label={`${secondaryLimit.label} limit`}
            percentUsed={secondaryLimit.percentUsed}
            percentRemaining={secondaryLimit.percentRemaining}
            resetsAt={secondaryLimit.resetsAt}
          />
        )}

        {hasCredits && <CreditsRow label={credits.label} value={credits.value} />}
      </div>
    </div>
  );
}
