# Spotify Integration

## Overview

HangTheDJ uses two Spotify APIs:
1. **Spotify Web Playback SDK** — for in-browser playback and state
2. **Spotify Web API** — for metadata and auth token validation

---

## Authentication

### Flow: Authorization Code with PKCE

Spotify supports PKCE for public clients (no client secret required). This makes it suitable for browser SPAs.

Steps:
1. App generates a code verifier and code challenge (SHA-256)
2. App redirects user to Spotify's authorization endpoint with `code_challenge` and `response_type=code`
3. User approves
4. Spotify redirects back to the app's redirect URI with an authorization `code`
5. App exchanges the code for an access token and refresh token using the code verifier
6. Tokens are stored in localStorage via `StorageService`

### Required scopes

```
streaming
user-read-email
user-read-private
user-read-playback-state
user-modify-playback-state
```

### Token storage

- Access token: stored in localStorage
- Refresh token: stored in localStorage
- Expiry timestamp: stored in localStorage
- Key isolation: all stored under `hangthedj:spotify_*` prefix

### Token refresh

Spotify access tokens expire after 1 hour. The app should:
- Check token expiry before each API call
- Refresh using the refresh token if needed
- Store the new token
- TODO: Validate that Spotify's PKCE refresh token flow does not require a client secret (confirmed: it does not)

---

## Web Playback SDK

### Prerequisites

- User must have Spotify Premium
- `window.onSpotifyWebPlaybackSDKReady` callback must be set before loading the SDK script
- SDK is loaded dynamically by injecting a `<script>` tag

### SDK loading

The SDK script is loaded from:
```
https://sdk.scdn.co/spotify-player.js
```

### Player initialization

```ts
const player = new Spotify.Player({
  name: "HangTheDJ",
  getOAuthToken: (cb) => cb(accessToken),
  volume: 0.8,
});
```

### Key events

| Event               | Description                                      |
|---------------------|--------------------------------------------------|
| `ready`             | Player connected and device ID available          |
| `not_ready`         | Player disconnected                              |
| `player_state_changed` | Playback state updated (track, position, etc.) |
| `authentication_error` | Auth token issue                              |
| `account_error`     | Premium account required                         |

### Device activation

After SDK init, the player is a virtual device in the user's Spotify account. The user or the app must transfer playback to this device.

TODO: Determine whether automatic device transfer is acceptable UX or whether the user should be prompted.

### Pause / resume

```ts
await player.pause();   // pause playback
await player.resume();  // resume playback
```

### Track state

```ts
const state: Spotify.PlaybackState = await player.getCurrentState();
```

Key fields:
- `state.track_window.current_track` — current track metadata
- `state.paused` — whether playback is paused
- `state.position` — current position in ms
- `state.duration` — track duration in ms

### Known limitations

- The Web Playback SDK does not support queue introspection (you cannot see what track is coming next)
- Playback must be active on this device; if the user switches to another Spotify device, events may stop
- `player_state_changed` frequency is not guaranteed; poll if needed
- iOS Safari has autoplay restrictions that may require user gesture before audio can play

TODO: Add explicit handling for device transfer and iOS autoplay restrictions.

---

## Spotify Web API calls used in v1

Minimal Web API usage in v1 (most state comes from the SDK):

| Call                          | Purpose                             |
|-------------------------------|-------------------------------------|
| GET /me                       | Validate token, get user profile    |
| GET /me/player                | Fallback playback state polling     |

---

## Disconnect and cleanup

On logout or session end:
```ts
await player.disconnect();
```

Tokens should be cleared from localStorage.
