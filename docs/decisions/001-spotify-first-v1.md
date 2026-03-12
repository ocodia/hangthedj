# ADR 001: Spotify as sole music provider in v1

## Status
Accepted

## Context
HangTheDJ needs a music playback provider. The alternatives considered were:
- Spotify Web Playback SDK
- Apple Music MusicKit JS
- YouTube IFrame API
- Tidal Web SDK (beta/limited)
- Custom audio upload

The core requirement is browser-based playback with track metadata for contextual DJ banter.

## Decision
Use Spotify as the sole music provider in v1.

## Rationale
- Spotify Web Playback SDK is the most mature, documented, and widely supported option for browser-based playback
- Spotify has well-documented OAuth 2.0 PKCE support suitable for client-side SPAs
- Track metadata (title, artist, album, artwork) is readily available via the SDK state
- User familiarity: Spotify is the largest streaming platform globally
- The SDK exposes playback state events well enough for interstitial insertion logic

## Consequences
- Spotify Premium is required — free accounts cannot use browser playback
- The user must have an existing Spotify account
- Queue manipulation is limited via the Web Playback SDK; we work around this by pausing/resuming rather than injecting into the Spotify queue directly
- If Spotify changes or deprecates the Web Playback SDK, the app must migrate

## Isolation strategy
All Spotify interactions are isolated behind:
- `SpotifyAuthService` (auth and token lifecycle)
- `SpotifyPlayerService` (playback state and controls)

This means adding a second provider later requires only implementing these two interfaces, not refactoring the app broadly.

## Assumptions
- The Web Playback SDK will remain available and policy-compliant for this use case
- PKCE flow without a redirect proxy is supported (verified: Spotify supports client-side PKCE)
- TODO: Validate SDK availability and behaviour in iOS Safari and Firefox (known edge cases)
