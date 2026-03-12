export type RequestStatus = "pending" | "accepted" | "deferred" | "rejected" | "fulfilled";

export interface ListenerRequest {
  id: string;
  sessionId: string;
  callerName?: string;
  /** Required */
  artistName: string;
  trackName?: string;
  moodSuggestion?: string;
  /** Max 200 chars */
  message?: string;
  submittedAt: string;
  status: RequestStatus;
  /** Has the DJ spoken about this request? */
  spokenAcknowledgement: boolean;
  /** Did the DJ imply it would come later? */
  promisedForLater: boolean;
  /** Spotify URI of the matched track (set after search) */
  spotifyUri?: string;
  /** Title of the matched Spotify track */
  spotifyTrackTitle?: string;
  /** Whether the caller wants the track played immediately */
  playNow?: boolean;
}

export interface RequestSubmission {
  callerName?: string;
  artistName: string;
  trackName?: string;
  moodSuggestion?: string;
  message?: string;
  /** Play this track right now (interrupts current track) */
  playNow?: boolean;
}
