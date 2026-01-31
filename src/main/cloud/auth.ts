/**
 * Codex Cloud Auth Manager
 * Handles reading tokens from ~/.codex/auth.json and token refresh
 */

import fs from "fs/promises";
import path from "path";
import os from "os";
import type { TokenData, AuthState } from "./types";
import { CloudTaskError } from "./types";

// Constants from Rust implementation
const AUTH_FILE_PATH = path.join(os.homedir(), ".codex", "auth.json");
const TOKEN_REFRESH_URL = "https://auth.openai.com/oauth/token";
// OpenAI client ID for Codex CLI (from Rust source)
const CLIENT_ID = "codex_cli";
const REFRESH_THRESHOLD_DAYS = 8;

export interface AuthHeaders {
  Authorization: string;
  "ChatGPT-Account-Id"?: string;
  "User-Agent": string;
}

class CodexAuthManager {
  private userAgent: string;

  constructor(userAgent = "chimera/1.0") {
    this.userAgent = userAgent;
  }

  /**
   * Read the auth file from ~/.codex/auth.json
   */
  async readAuthFile(): Promise<AuthState | null> {
    try {
      const content = await fs.readFile(AUTH_FILE_PATH, "utf-8");
      const data = JSON.parse(content);
      
      if (!data.tokens) {
        return null;
      }

      return {
        tokens: data.tokens as TokenData,
        last_refresh: data.last_refresh,
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw new CloudTaskError(
        `Failed to read auth file: ${err instanceof Error ? err.message : String(err)}`,
        "auth"
      );
    }
  }

  /**
   * Write updated auth data back to the file
   */
  private async writeAuthFile(tokens: TokenData): Promise<void> {
    try {
      const data = {
        tokens,
        last_refresh: new Date().toISOString(),
      };
      await fs.mkdir(path.dirname(AUTH_FILE_PATH), { recursive: true });
      await fs.writeFile(AUTH_FILE_PATH, JSON.stringify(data, null, 2), "utf-8");
    } catch (err) {
      throw new CloudTaskError(
        `Failed to write auth file: ${err instanceof Error ? err.message : String(err)}`,
        "auth"
      );
    }
  }

  /**
   * Check if token needs refresh (> 8 days old)
   */
  private needsRefresh(lastRefresh?: string): boolean {
    if (!lastRefresh) return true;
    
    const last = new Date(lastRefresh);
    const now = new Date();
    const diffMs = now.getTime() - last.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    
    return diffDays > REFRESH_THRESHOLD_DAYS;
  }

  /**
   * Refresh the access token using the refresh token
   */
  private async refreshToken(refreshToken: string): Promise<TokenData> {
    const response = await fetch(TOKEN_REFRESH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: CLIENT_ID,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new CloudTaskError(
        `Token refresh failed: ${response.status} ${errorText}`,
        "auth"
      );
    }

    const data = await response.json() as {
      id_token: string;
      access_token: string;
      refresh_token: string;
      account_id?: string;
    };
    
    return {
      id_token: data.id_token,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      account_id: data.account_id,
    };
  }

  /**
   * Get a valid access token, refreshing if necessary
   */
  async getValidToken(): Promise<string> {
    const auth = await this.readAuthFile();
    
    if (!auth || !auth.tokens) {
      throw new CloudTaskError(
        "Not authenticated. Please run 'codex login' first.",
        "auth"
      );
    }

    // Check if we need to refresh
    if (this.needsRefresh(auth.last_refresh)) {
      try {
        const newTokens = await this.refreshToken(auth.tokens.refresh_token);
        await this.writeAuthFile(newTokens);
        return newTokens.access_token;
      } catch (err) {
        // If refresh fails, try using existing token anyway
        console.warn("Token refresh failed, using existing token:", err);
      }
    }

    return auth.tokens.access_token;
  }

  /**
   * Get the account ID from auth file
   */
  async getAccountId(): Promise<string | undefined> {
    const auth = await this.readAuthFile();
    return auth?.tokens?.account_id;
  }

  /**
   * Get all headers needed for API requests
   */
  async getAuthHeaders(): Promise<AuthHeaders> {
    const token = await this.getValidToken();
    const accountId = await this.getAccountId();
    
    const headers: AuthHeaders = {
      Authorization: `Bearer ${token}`,
      "User-Agent": this.userAgent,
    };

    if (accountId) {
      headers["ChatGPT-Account-Id"] = accountId;
    }

    return headers;
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    try {
      const auth = await this.readAuthFile();
      return auth?.tokens?.access_token != null;
    } catch {
      return false;
    }
  }
}

// Singleton instance
let authManager: CodexAuthManager | null = null;

export function getAuthManager(userAgent?: string): CodexAuthManager {
  if (!authManager) {
    authManager = new CodexAuthManager(userAgent);
  }
  return authManager;
}

/**
 * Get auth headers for API requests
 * Convenience function that uses the singleton auth manager
 */
export async function getAuthHeaders(userAgent?: string): Promise<AuthHeaders> {
  const manager = getAuthManager(userAgent);
  return manager.getAuthHeaders();
}

export { CodexAuthManager };
export default CodexAuthManager;
