import { atom } from "jotai";

// Rate limit types matching Codex CLI structure
export interface RateLimitWindow {
  /** Percentage of quota used (0-100) */
  used_percent: number;
  /** Unix timestamp when the window resets */
  resets_at?: number;
  /** Window duration in minutes */
  window_minutes?: number;
}

export interface CreditsSnapshot {
  /** Whether the account has credit tracking enabled */
  has_credits: boolean;
  /** Whether the account has unlimited credits */
  unlimited: boolean;
  /** Credit balance as a string (may contain decimals) */
  balance?: string;
}

export interface RateLimitSnapshot {
  /** When this snapshot was captured */
  captured_at: number;
  /** Primary limit window (typically 5h) */
  primary?: RateLimitWindow;
  /** Secondary limit window (typically weekly) */
  secondary?: RateLimitWindow;
  /** Credits information */
  credits?: CreditsSnapshot;
}

/** Raw rate limit headers from OpenAI API response */
export interface RateLimitHeaders {
  "x-ratelimit-limit-requests"?: string;
  "x-ratelimit-remaining-requests"?: string;
  "x-ratelimit-reset-requests"?: string;
  "x-ratelimit-limit-tokens"?: string;
  "x-ratelimit-remaining-tokens"?: string;
  "x-ratelimit-reset-tokens"?: string;
  "x-request-id"?: string;
}

/** Derived display data for rate limits */
export interface RateLimitDisplay {
  label: string;
  percentUsed: number;
  percentRemaining: number;
  resetsAt?: string;
  windowMinutes?: number;
}

/** Rate limit data with stale status */
export type RateLimitStatus =
  | { type: "available"; data: RateLimitSnapshot }
  | { type: "stale"; data: RateLimitSnapshot }
  | { type: "missing" };

// Atom to store the current rate limit snapshot
export const rateLimitsAtom = atom<RateLimitStatus>({ type: "missing" });

// Derived atom for the primary (5h) limit display
export const primaryLimitAtom = atom<RateLimitDisplay | null>((get) => {
  const status = get(rateLimitsAtom);
  if (status.type === "missing") return null;
  if (!status.data.primary) return null;

  const primary = status.data.primary;
  const windowMinutes = primary.window_minutes ?? 300; // Default 5h = 300 min
  const windowLabel = windowMinutes >= 300 && windowMinutes <= 360 ? "5h" : `${Math.round(windowMinutes / 60)}h`;

  return {
    label: windowLabel,
    percentUsed: primary.used_percent,
    percentRemaining: 100 - primary.used_percent,
    resetsAt: primary.resets_at ? formatResetTime(primary.resets_at) : undefined,
    windowMinutes,
  };
});

// Derived atom for the secondary (weekly) limit display
export const secondaryLimitAtom = atom<RateLimitDisplay | null>((get) => {
  const status = get(rateLimitsAtom);
  if (status.type === "missing") return null;
  if (!status.data.secondary) return null;

  const secondary = status.data.secondary;
  const windowMinutes = secondary.window_minutes ?? 10080; // Default weekly = 7 days
  const windowLabel = windowMinutes >= 10000 ? "Weekly" : `${Math.round(windowMinutes / 1440)}d`;

  return {
    label: windowLabel,
    percentUsed: secondary.used_percent,
    percentRemaining: 100 - secondary.used_percent,
    resetsAt: secondary.resets_at ? formatResetTime(secondary.resets_at) : undefined,
    windowMinutes,
  };
});

// Derived atom for credits display
export const creditsDisplayAtom = atom<{ label: string; value: string } | null>((get) => {
  const status = get(rateLimitsAtom);
  if (status.type === "missing") return null;
  if (!status.data.credits) return null;

  const credits = status.data.credits;

  if (!credits.has_credits) return null;

  if (credits.unlimited) {
    return { label: "Credits", value: "Unlimited" };
  }

  if (!credits.balance) return null;

  // Parse and format the balance
  const balance = parseCreditBalance(credits.balance);
  if (balance === null) return null;

  return { label: "Credits", value: `${balance} credits` };
});

// Helper to format reset timestamp
function formatResetTime(unixTimestamp: number): string {
  const resetDate = new Date(unixTimestamp * 1000);
  const now = new Date();
  const diffMs = resetDate.getTime() - now.getTime();
  const diffMins = Math.round(diffMs / 60000);

  if (diffMins < 1) return "Resets now";
  if (diffMins < 60) return `Resets in ${diffMins}m`;
  if (diffMins < 1440) return `Resets in ${Math.round(diffMins / 60)}h`;
  return `Resets in ${Math.round(diffMins / 1440)}d`;
}

// Helper to parse credit balance
function parseCreditBalance(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Try integer first
  const intValue = parseInt(trimmed, 10);
  if (!isNaN(intValue) && intValue > 0) {
    return intValue.toString();
  }

  // Try float
  const floatValue = parseFloat(trimmed);
  if (!isNaN(floatValue) && floatValue > 0) {
    return Math.round(floatValue).toString();
  }

  return null;
}
