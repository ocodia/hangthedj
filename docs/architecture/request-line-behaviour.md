# Request Line Behaviour

## Overview

The request line allows users to "call in" to the station to suggest artists, tracks, or moods. This is a core differentiator from a standard playlist controller.

---

## Request model

```ts
interface ListenerRequest {
  id: string;
  sessionId: string;
  callerName?: string;       // Optional handle or name
  artistName: string;        // Required: who they want to hear
  trackName?: string;        // Optional: specific track
  moodSuggestion?: string;   // Optional: e.g. "something chill"
  message?: string;          // Optional: short message to the DJ
  submittedAt: string;       // ISO 8601
  status: RequestStatus;
  spokenAcknowledgement: boolean; // Has the DJ spoken about this?
  promisedForLater: boolean;      // Did the DJ imply it's coming?
}

type RequestStatus = "pending" | "accepted" | "deferred" | "rejected" | "fulfilled";
```

---

## Request lifecycle

```
submitted → pending
pending → accepted   (DJ will play this artist / acknowledge the request)
pending → deferred   (DJ acknowledges but doesn't commit)
pending → rejected   (DJ declines in character)
accepted → fulfilled (Artist/track has been introduced or played)
```

---

## UI behaviour

1. User opens the "Call in" panel
2. User fills in: caller name (optional), artist name (required), track name (optional), mood (optional), message (optional)
3. On submit:
   - Request is saved to IndexedDB with status `pending`
   - UI shows: "Your request is in the queue — the DJ will get to it"
   - No spinner or blocking wait
4. On DJ acknowledgement:
   - Status updates to accepted/deferred/rejected
   - UI can reflect this with a subtle badge or status indicator
5. On fulfilment:
   - Status updates to fulfilled
   - Optionally shown in a "played" history

---

## DJ response behaviour

### Accepted request

Banter example:
> "We've got [CallerName] on the line asking for [Artist]. Coming up soon — great shout."

### Deferred request

Banter example:
> "Someone's asking for [Artist]. Not quite the vibe right now, but let's see where the night goes."

### Rejected request

Banter example:
> "Appreciate the request for [Artist], but we're keeping it [current mood] tonight. Maybe next time."

### Fulfilled introduction

Banter example:
> "This one goes out to [CallerName] who asked for [Artist] earlier — here they are."

---

## Station rules for requests

- Requests are advisory, not commands
- The DJ retains editorial control
- Requests can influence mood/artist selection without guaranteeing specific tracks
- The scheduler decides whether to honour a request based on station flow
- The user cannot skip tracks directly; requests are the interaction mechanism

---

## Queue management

- Maximum 10 pending requests at a time (configurable)
- Duplicate artist requests within the same session are merged or one is rejected
- Old unfulfilled requests from prior sessions are not carried forward
- The request queue is shown to the user in the request panel

---

## Consistency requirement

If the DJ says a request "is coming up", the system must:
- Set `promisedForLater = true`
- Ensure the scheduler prioritises that request
- If for any reason it cannot be fulfilled (e.g. session ends), the promise is silently dropped

Do not have the DJ make promises the system cannot keep. Prefer "we'll see" over "definitely up next".

---

## Anti-spam

- Rate limit: one request per minute per session (client-side)
- Max message length: 200 characters
- Artist name: max 100 characters
- Track name: max 100 characters
- Caller name: max 50 characters
- Basic sanitization: strip HTML tags from all inputs before storage
