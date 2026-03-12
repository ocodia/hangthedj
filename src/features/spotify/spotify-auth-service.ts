/**
 * SpotifyAuthService: Authorization Code with PKCE flow for Spotify.
 *
 * No client secret is required (PKCE is designed for public clients).
 * Tokens are stored in localStorage via StorageService.
 *
 * Required Spotify app scopes:
 *   streaming user-read-email user-read-private
 *   user-read-playback-state user-modify-playback-state
 *
 * TODO: Register your Spotify app at https://developer.spotify.com/dashboard
 *       and set VITE_SPOTIFY_CLIENT_ID in your .env.local file.
 *       Set the redirect URI in your Spotify app settings to match VITE_SPOTIFY_REDIRECT_URI.
 */

import {
  setSpotifyTokens,
  getSpotifyTokens,
  clearSpotifyTokens,
} from "@/features/storage/storage-service";

// ──────────────────────────────────────────────────────────────────────────────
// Config — set via environment variables
// ──────────────────────────────────────────────────────────────────────────────

const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined;
const REDIRECT_URI =
  (import.meta.env.VITE_SPOTIFY_REDIRECT_URI as string | undefined) ??
  `${window.location.origin}/`;

const SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-read-playback-state",
  "user-modify-playback-state",
].join(" ");

const AUTH_ENDPOINT = "https://accounts.spotify.com/authorize";
const TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";

// localStorage keys for PKCE verifier (needed across redirect)
const LS_CODE_VERIFIER = "hangthedj:spotify_code_verifier";

// ──────────────────────────────────────────────────────────────────────────────
// PKCE helpers
// ──────────────────────────────────────────────────────────────────────────────

function generateRandomString(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, length);
}

async function sha256(plain: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  return crypto.subtle.digest("SHA-256", encoder.encode(plain));
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let str = "";
  bytes.forEach((b) => (str += String.fromCharCode(b)));
  return btoa(str)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// ──────────────────────────────────────────────────────────────────────────────
// SpotifyAuthService
// ──────────────────────────────────────────────────────────────────────────────

export interface SpotifyAuthService {
  login(): Promise<void>;
  logout(): void;
  handleCallback(url: string): Promise<boolean>;
  getAccessToken(): Promise<string | null>;
  isAuthenticated(): boolean;
}

class SpotifyAuthServiceImpl implements SpotifyAuthService {
  /**
   * Initiates the PKCE login flow. Redirects the browser to Spotify.
   * After auth, Spotify redirects back to REDIRECT_URI with ?code=...
   */
  async login(): Promise<void> {
    if (!CLIENT_ID) {
      throw new Error(
        "VITE_SPOTIFY_CLIENT_ID is not set. Add it to your .env.local file."
      );
    }

    const codeVerifier = generateRandomString(64);
    const codeChallenge = base64UrlEncode(await sha256(codeVerifier));

    // Store verifier so we can use it after the redirect
    localStorage.setItem(LS_CODE_VERIFIER, codeVerifier);

    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: "code",
      redirect_uri: REDIRECT_URI,
      scope: SCOPES,
      code_challenge_method: "S256",
      code_challenge: codeChallenge,
    });

    window.location.href = `${AUTH_ENDPOINT}?${params.toString()}`;
  }

  /** Clear all Spotify tokens and local state. */
  logout(): void {
    clearSpotifyTokens();
    localStorage.removeItem(LS_CODE_VERIFIER);
  }

  /**
   * Call this on app load to handle the Spotify callback redirect.
   * Returns true if a code was present and exchanged successfully.
   */
  async handleCallback(url: string): Promise<boolean> {
    const params = new URLSearchParams(new URL(url).search);
    const code = params.get("code");
    const error = params.get("error");

    if (error) {
      console.warn("[SpotifyAuth] OAuth error:", error);
      return false;
    }

    if (!code) return false;

    const codeVerifier = localStorage.getItem(LS_CODE_VERIFIER);
    if (!codeVerifier) {
      console.warn("[SpotifyAuth] No code verifier found — cannot exchange code");
      return false;
    }

    try {
      await this.exchangeCode(code, codeVerifier);
      localStorage.removeItem(LS_CODE_VERIFIER);
      // Clean the code from the URL without reloading
      window.history.replaceState({}, document.title, window.location.pathname);
      return true;
    } catch (err) {
      console.error("[SpotifyAuth] Token exchange failed:", err);
      return false;
    }
  }

  /**
   * Returns a valid access token, refreshing if needed.
   * Returns null if not authenticated.
   */
  async getAccessToken(): Promise<string | null> {
    const { accessToken, refreshToken, expiryMs } = getSpotifyTokens();
    if (!accessToken) return null;

    // Refresh if within 60 seconds of expiry
    const isExpired = expiryMs !== null && Date.now() > expiryMs - 60_000;
    if (isExpired && refreshToken) {
      try {
        await this.refreshAccessToken(refreshToken);
        return getSpotifyTokens().accessToken;
      } catch (err) {
        console.error("[SpotifyAuth] Token refresh failed:", err);
        this.logout();
        return null;
      }
    }

    return accessToken;
  }

  isAuthenticated(): boolean {
    const { accessToken } = getSpotifyTokens();
    return accessToken !== null;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Private: token exchange and refresh
  // ──────────────────────────────────────────────────────────────────────────

  private async exchangeCode(code: string, codeVerifier: string): Promise<void> {
    if (!CLIENT_ID) throw new Error("VITE_SPOTIFY_CLIENT_ID not set");

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: codeVerifier,
    });

    const res = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Token exchange failed: ${res.status} ${text}`);
    }

    const data = await res.json() as Record<string, unknown>;
    if (
      typeof data.access_token !== "string" ||
      typeof data.refresh_token !== "string" ||
      typeof data.expires_in !== "number"
    ) {
      throw new Error(`Unexpected token exchange response: ${JSON.stringify(data)}`);
    }

    const expiryMs = Date.now() + data.expires_in * 1000;
    setSpotifyTokens(data.access_token, data.refresh_token, expiryMs);
  }

  private async refreshAccessToken(refreshToken: string): Promise<void> {
    if (!CLIENT_ID) throw new Error("VITE_SPOTIFY_CLIENT_ID not set");

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
    });

    const res = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Token refresh failed: ${res.status} ${text}`);
    }

    const data = await res.json() as Record<string, unknown>;
    if (
      typeof data.access_token !== "string" ||
      typeof data.expires_in !== "number"
    ) {
      throw new Error(`Unexpected token refresh response: ${JSON.stringify(data)}`);
    }

    const { refreshToken: existingRefresh } = getSpotifyTokens();
    const expiryMs = Date.now() + data.expires_in * 1000;
    setSpotifyTokens(
      data.access_token,
      typeof data.refresh_token === "string"
        ? data.refresh_token
        : existingRefresh ?? "",
      expiryMs
    );
  }
}

export function createSpotifyAuthService(): SpotifyAuthService {
  return new SpotifyAuthServiceImpl();
}
