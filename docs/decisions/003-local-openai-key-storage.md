# ADR 003: Local OpenAI API key storage

## Status
Accepted

## Context
HangTheDJ uses OpenAI APIs for banter script generation (Chat Completions) and voice rendering (Text-to-Speech). The OpenAI API requires an API key. Options for managing this key are:

1. Hardcode a shared key in the app (unacceptable — cost abuse, security risk)
2. Store the key in a backend secrets manager (requires a backend — excluded in v1)
3. Ask the user to supply their own key and store it client-side
4. Use a proxy backend that holds a key (excluded in v1)

## Decision
The user supplies their own OpenAI API key. The key is stored in browser localStorage and accessed only by the OpenAI service modules.

## Rationale
- Consistent with the no-backend constraint
- The user controls their own key and billing
- Appropriate for a self-hosted/hobby app
- Storage in localStorage is simple, universally available, and easy to clear
- Centralizing key access in a StorageService with explicit read/write/clear makes the boundary auditable

## Security posture
This approach is intentionally transparent about its limitations:
- The key is accessible to any JavaScript running in the page
- It is not encrypted at rest in localStorage
- It is not shared or transmitted to any third party other than OpenAI directly
- If the user's device is compromised, the key is exposed — this is acceptable for the product's use case

**This is not suitable for multi-user deployments or apps where a shared key is needed.**

## User experience
- The app shows a clear key entry prompt on first use
- The key field should be masked (type="password")
- The app should clearly state: "Your key is stored locally in your browser only"
- The app should provide a visible "Clear key" action
- The app should warn the user that OpenAI usage is billed to their own account

## Implementation
- Key is stored under a dedicated localStorage key (e.g. `hangthedj:openai_key`)
- Key read/write is isolated in `StorageService.getOpenAIKey()` / `StorageService.setOpenAIKey()` / `StorageService.clearOpenAIKey()`
- No other module accesses localStorage for the key directly
- The banter engine and voice engine receive the key via dependency injection at initialization

## Assumptions
- OpenAI API is called directly from the browser; CORS headers on OpenAI's API must permit this — TODO: verify and add fallback error messaging if CORS blocks browser requests
- localStorage is available and not blocked by the browser (e.g. private mode may clear on session end)
