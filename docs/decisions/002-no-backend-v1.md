# ADR 002: No backend in v1

## Status
Accepted

## Context
HangTheDJ requires orchestration of Spotify playback, OpenAI generation calls, local state, and request handling. A traditional web app would often delegate some of these to a backend. The question is whether v1 needs one.

## Decision
Build v1 entirely client-side with no backend.

## Rationale
- Reduces infrastructure complexity and cost for a hobby/self-hosted product
- Makes the app trivially deployable to any static file host (GitHub Pages, Netlify, Vercel, CDN)
- Eliminates backend latency for most operations (only Spotify and OpenAI API calls leave the browser)
- A backend adds complexity that is not required for the core user experience in v1
- The user supplies their own OpenAI API key, removing the need for a secrets proxy
- All session state, persona config, and request memory fits comfortably in browser storage

## Consequences
- The user must supply their own OpenAI API key
- The OpenAI key is stored in the browser — acceptable for self-hosted/hobby use, not suitable for multi-user deployments
- There is no shared request history, cross-device sync, or cloud backup in v1
- Certain Spotify API calls (e.g. refresh token rotation with client secret) are not possible without a backend; the PKCE flow avoids this requirement

## Extension path
The architecture isolates all service calls behind typed interfaces. A future backend would:
1. Implement the same interfaces server-side
2. Expose an API for auth, generation, or request handling
3. Be injected via dependency inversion at the service boundary

No refactoring of business logic, state management, or UI is required to add a backend later.

## Assumptions
- PKCE flow with public client is Spotify-approved for browser SPAs (confirmed)
- OpenAI API supports cross-origin requests from the browser with a CORS-compliant approach — TODO: validate CORS behaviour from browser context
- IndexedDB + localStorage is sufficient for all state in v1
