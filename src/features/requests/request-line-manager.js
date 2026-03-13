/**
 * RequestLineManager: manages listener call-in requests.
 */

import { saveRequest, getRequestsBySession, updateRequestStatus } from '../storage/storage-service.js';
import { generateUUID } from '../../utils.js';

const REQUEST_COOLDOWN_MS = 60_000;
const MAX_PENDING = 10;

class RequestLineManagerImpl {
  constructor() {
    this.lastSubmitTime = 0;
  }

  async submit(sessionId, submission) {
    const now = Date.now();
    if (!submission.playNow && now - this.lastSubmitTime < REQUEST_COOLDOWN_MS) {
      throw new Error('Please wait a moment before submitting another request.');
    }

    const pending = await this.getPending(sessionId);
    if (pending.length >= MAX_PENDING) {
      throw new Error('The request queue is full. Try again after the DJ catches up.');
    }

    // Strip all angle bracket characters to prevent HTML injection.
    // This removes both complete tags (<script>) and stray < or > characters.
    const sanitize = (s) =>
      s
        ?.replace(/[<>]/g, '')
        .trim()
        .slice(0, 200);

    const request = {
      id: generateUUID(),
      sessionId,
      callerName: sanitize(submission.callerName)?.slice(0, 50),
      artistName: sanitize(submission.artistName)?.slice(0, 100) ?? '',
      trackName: sanitize(submission.trackName)?.slice(0, 100),
      moodSuggestion: sanitize(submission.moodSuggestion)?.slice(0, 100),
      message: sanitize(submission.message)?.slice(0, 200),
      submittedAt: new Date().toISOString(),
      status: 'pending',
      spokenAcknowledgement: false,
      promisedForLater: false,
      playNow: submission.playNow ?? false,
    };

    if (!request.artistName) {
      throw new Error('Artist name is required.');
    }

    await saveRequest(request);
    this.lastSubmitTime = now;
    return request;
  }

  async getPending(sessionId) {
    const all = await getRequestsBySession(sessionId);
    return all.filter((r) => r.status === 'pending' || r.status === 'accepted');
  }

  async getAll(sessionId) {
    return getRequestsBySession(sessionId);
  }

  async updateStatus(id, status, spokenAcknowledgement, promisedForLater) {
    await updateRequestStatus(id, status, spokenAcknowledgement, promisedForLater);
  }

  clearSession() {
    this.lastSubmitTime = 0;
  }
}

export function createRequestLineManager() {
  return new RequestLineManagerImpl();
}
