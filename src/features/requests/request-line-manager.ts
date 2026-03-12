/**
 * RequestLineManager: manages listener call-in requests.
 *
 * Accepts, validates, and stores requests locally.
 * Provides filtered views for the scheduler and UI.
 */

import { v4 as uuidv4 } from "uuid";
import { saveRequest, getRequestsBySession, updateRequestStatus } from "@/features/storage/storage-service";
import type { ListenerRequest, RequestSubmission, RequestStatus } from "@/types/request";

// Rate limit: one request per minute per session (client-side enforcement)
const REQUEST_COOLDOWN_MS = 60_000;
// Max pending requests
const MAX_PENDING = 10;

export interface RequestLineManager {
  submit(sessionId: string, submission: RequestSubmission): Promise<ListenerRequest>;
  getPending(sessionId: string): Promise<ListenerRequest[]>;
  getAll(sessionId: string): Promise<ListenerRequest[]>;
  updateStatus(id: string, status: RequestStatus, spokenAcknowledgement?: boolean, promisedForLater?: boolean): Promise<void>;
  clearSession(): void;
}

class RequestLineManagerImpl implements RequestLineManager {
  private lastSubmitTime = 0;

  async submit(sessionId: string, submission: RequestSubmission): Promise<ListenerRequest> {
    // Rate limiting
    const now = Date.now();
    if (now - this.lastSubmitTime < REQUEST_COOLDOWN_MS) {
      throw new Error("Please wait a moment before submitting another request.");
    }

    // Check pending count
    const pending = await this.getPending(sessionId);
    if (pending.length >= MAX_PENDING) {
      throw new Error("The request queue is full. Try again after the DJ catches up.");
    }

    // Sanitize inputs (strip HTML-like tags)
    const sanitize = (s?: string) =>
      s
        ?.replace(/<[^>]*>/g, "")
        .trim()
        .slice(0, 200);

    const request: ListenerRequest = {
      id: uuidv4(),
      sessionId,
      callerName: sanitize(submission.callerName)?.slice(0, 50),
      artistName: sanitize(submission.artistName)?.slice(0, 100) ?? "",
      trackName: sanitize(submission.trackName)?.slice(0, 100),
      moodSuggestion: sanitize(submission.moodSuggestion)?.slice(0, 100),
      message: sanitize(submission.message)?.slice(0, 200),
      submittedAt: new Date().toISOString(),
      status: "pending",
      spokenAcknowledgement: false,
      promisedForLater: false,
      playNow: submission.playNow ?? false,
    };

    if (!request.artistName) {
      throw new Error("Artist name is required.");
    }

    await saveRequest(request);
    this.lastSubmitTime = now;
    return request;
  }

  async getPending(sessionId: string): Promise<ListenerRequest[]> {
    const all = await getRequestsBySession(sessionId);
    return all.filter((r) => r.status === "pending" || r.status === "accepted");
  }

  async getAll(sessionId: string): Promise<ListenerRequest[]> {
    return getRequestsBySession(sessionId);
  }

  async updateStatus(id: string, status: RequestStatus, spokenAcknowledgement?: boolean, promisedForLater?: boolean): Promise<void> {
    await updateRequestStatus(id, status, spokenAcknowledgement, promisedForLater);
  }

  clearSession(): void {
    this.lastSubmitTime = 0;
  }
}

export function createRequestLineManager(): RequestLineManager {
  return new RequestLineManagerImpl();
}
