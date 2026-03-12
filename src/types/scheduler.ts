import type { SegmentType } from "./banter";

export type DjFrequency = "rarely" | "sometimes" | "often";
export type RequestBehaviour = "responsive" | "editorial";

export interface SchedulerConfig {
  djFrequency: DjFrequency;
  requestBehaviour: RequestBehaviour;
  familySafe: boolean;
}

export interface SchedulerDecision {
  shouldInsert: boolean;
  segmentType: SegmentType | null;
  urgency: "low" | "normal" | "high";
  /** Request ID to acknowledge, if applicable */
  requestToAcknowledge: string | null;
  /** Human-readable reason for logging/debugging */
  reason: string;
}
