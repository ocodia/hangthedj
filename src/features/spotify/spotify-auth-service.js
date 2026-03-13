/**
 * SpotifyAuthService: Authorization Code with PKCE flow for Spotify.
 * No client secret required. Client ID stored in localStorage via StorageService.
 */

import {
  setSpotifyTokens,
  getSpotifyTokens,
  clearSpotifyTokens,
  getSpotifyClientId,
} from '../storage/storage-service.js';

const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
].join(' ');

const AUTH_ENDPOINT = 'https://accounts.spotify.com/authorize';
const TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token';

const LS_CODE_VERIFIER = 'hangthedj:spotify_code_verifier';

// ── PKCE helpers ──────────────────────────────────────────────────────────────

function generateRandomString(length) {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, length);
}

async function sha256(plain) {
  const encoder = new TextEncoder();
  return crypto.subtle.digest('SHA-256', encoder.encode(plain));
}

function base64UrlEncode(buffer) {
  const bytes = new Uint8Array(buffer);
  let str = '';
  bytes.forEach((b) => (str += String.fromCharCode(b)));
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// ── SpotifyAuthService ────────────────────────────────────────────────────────

class SpotifyAuthServiceImpl {
  async login() {
    const CLIENT_ID = getSpotifyClientId();
    if (!CLIENT_ID) {
      throw new Error('Spotify Client ID not set. Enter it in the setup screen.');
    }

    const REDIRECT_URI = `${window.location.origin}${window.location.pathname}`;
    const codeVerifier = generateRandomString(64);
    const codeChallenge = base64UrlEncode(await sha256(codeVerifier));

    localStorage.setItem(LS_CODE_VERIFIER, codeVerifier);

    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      scope: SCOPES,
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
    });

    window.location.href = `${AUTH_ENDPOINT}?${params.toString()}`;
  }

  logout() {
    clearSpotifyTokens();
    localStorage.removeItem(LS_CODE_VERIFIER);
  }

  async handleCallback(url) {
    const params = new URLSearchParams(new URL(url).search);
    const code = params.get('code');
    const error = params.get('error');

    if (error) {
      console.warn('[SpotifyAuth] OAuth error:', error);
      return false;
    }

    if (!code) return false;

    const codeVerifier = localStorage.getItem(LS_CODE_VERIFIER);
    if (!codeVerifier) {
      console.warn('[SpotifyAuth] No code verifier found — cannot exchange code');
      return false;
    }

    try {
      await this._exchangeCode(code, codeVerifier);
      localStorage.removeItem(LS_CODE_VERIFIER);
      window.history.replaceState({}, document.title, window.location.pathname);
      return true;
    } catch (err) {
      console.error('[SpotifyAuth] Token exchange failed:', err);
      return false;
    }
  }

  async getAccessToken() {
    const { accessToken, refreshToken, expiryMs } = getSpotifyTokens();
    if (!accessToken) return null;

    const isExpired = expiryMs !== null && Date.now() > expiryMs - 60_000;
    if (isExpired && refreshToken) {
      try {
        await this._refreshAccessToken(refreshToken);
        return getSpotifyTokens().accessToken;
      } catch (err) {
        console.error('[SpotifyAuth] Token refresh failed:', err);
        this.logout();
        return null;
      }
    }

    return accessToken;
  }

  isAuthenticated() {
    const { accessToken } = getSpotifyTokens();
    return accessToken !== null;
  }

  async _exchangeCode(code, codeVerifier) {
    const CLIENT_ID = getSpotifyClientId();
    if (!CLIENT_ID) throw new Error('Spotify Client ID not set');

    const REDIRECT_URI = `${window.location.origin}${window.location.pathname}`;

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: codeVerifier,
    });

    const res = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Token exchange failed: ${res.status} ${text}`);
    }

    const data = await res.json();
    if (
      typeof data.access_token !== 'string' ||
      typeof data.refresh_token !== 'string' ||
      typeof data.expires_in !== 'number'
    ) {
      throw new Error(`Unexpected token exchange response: ${JSON.stringify(data)}`);
    }

    const expiryMs = Date.now() + data.expires_in * 1000;
    setSpotifyTokens(data.access_token, data.refresh_token, expiryMs);
  }

  async _refreshAccessToken(refreshToken) {
    const CLIENT_ID = getSpotifyClientId();
    if (!CLIENT_ID) throw new Error('Spotify Client ID not set');

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
    });

    const res = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Token refresh failed: ${res.status} ${text}`);
    }

    const data = await res.json();
    if (typeof data.access_token !== 'string' || typeof data.expires_in !== 'number') {
      throw new Error(`Unexpected token refresh response: ${JSON.stringify(data)}`);
    }

    const { refreshToken: existingRefresh } = getSpotifyTokens();
    const expiryMs = Date.now() + data.expires_in * 1000;
    setSpotifyTokens(
      data.access_token,
      typeof data.refresh_token === 'string' ? data.refresh_token : existingRefresh ?? '',
      expiryMs,
    );
  }
}

export function createSpotifyAuthService() {
  return new SpotifyAuthServiceImpl();
}
