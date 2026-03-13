# ADR 003: Local API key storage

## Status
Accepted

## Context
HangTheDJ uses OpenAI APIs for banter script generation (Chat Completions) and voice rendering (Text-to-Speech). It also optionally supports ElevenLabs for premium TTS voices. Both services require API keys. Options for managing these keys are:

1. Hardcode a shared key in the app (unacceptable — cost abuse, security risk)
2. Store the key in a backend secrets manager (requires a backend — excluded in v1)
3. Ask the user to supply their own key and store it client-side
4. Use a proxy backend that holds a key (excluded in v1)

## Decision
The user supplies their own API keys. Keys are stored in browser localStorage and accessed only by the respective service modules.

## Rationale
- Consistent with the no-backend constraint
- The user controls their own keys and billing
- Appropriate for a self-hosted/hobby app
- Storage in localStorage is simple, universally available, and easy to clear
- Centralizing key access in a StorageService with explicit read/write/clear makes the boundary auditable

## Security posture
This approach is intentionally transparent about its limitations:
- Keys are accessible to any JavaScript running in the page
- They are not encrypted at rest in localStorage
- They are not shared or transmitted to any third party other than their intended API services (OpenAI at `api.openai.com`, ElevenLabs at `api.elevenlabs.io`)
- If the user's device is compromised, the keys are exposed — this is acceptable for the product's use case

**This is not suitable for multi-user deployments or apps where a shared key is needed.**

## User experience
- The app shows a clear key entry prompt in the Settings panel
- The key fields should be masked (type="password")
- The app should clearly state: "Your key is stored locally in your browser only"
- The app should provide a visible "Clear key" action for each key
- The app should warn the user that API usage is billed to their own accounts

## Implementation
- OpenAI key stored under `hangthedj:openai_key`
- ElevenLabs key stored under `hangthedj:elevenlabs_key`
- Key read/write is isolated in `StorageService` (e.g. `getOpenAIKey()` / `setOpenAIKey()` / `clearOpenAIKey()`, and equivalent ElevenLabs functions)
- No other module accesses localStorage for keys directly
- The banter engine receives the OpenAI key via dependency injection at initialization
- The voice engine receives both the OpenAI key and ElevenLabs key at initialization

## Assumptions
- OpenAI API is called directly from the browser; CORS headers on OpenAI's API must permit this
- ElevenLabs API is called directly from the browser; CORS headers must permit this
- localStorage is available and not blocked by the browser (e.g. private mode may clear on session end)
