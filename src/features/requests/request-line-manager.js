/**
 * RequestLineManager: manages listener call-in requests.
 */

import { saveRequest, getRequestsBySession, updateRequestStatus } from '../storage/storage-service.js';
import { generateUUID } from '../../utils.js';

class RequestLineManagerImpl {
  constructor() {}

  async submit(sessionId, submission) {

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
