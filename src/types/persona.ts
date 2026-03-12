export type VoiceId = "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";
export type HumourLevel = "low" | "medium" | "high";
export type EnergyLevel = "low" | "medium" | "high";
export type VerbosityLevel = "brief" | "moderate" | "verbose";
export type FactualityMode = "playful" | "balanced" | "grounded";
export type ProfanityPolicy = "none" | "mild" | "moderate";

export interface Persona {
  id: string;
  name: string;
  /** Short description used in the system prompt */
  summary: string;
  tone: string;
  humourLevel: HumourLevel;
  energyLevel: EnergyLevel;
  verbosity: VerbosityLevel;
  factuality: FactualityMode;
  /** Style hint only — TTS does not support accent natively */
  accent?: string;
  voice: VoiceId;
  /** 0.5–2.0, default 1.0 */
  speechRate?: number;
  expressiveness?: string;
  catchphrases?: string[];
  allowedTopics?: string[];
  disallowedTopics?: string[];
  profanityPolicy: ProfanityPolicy;
  familySafe: boolean;
  isPreset: boolean;
  createdAt: string;
  updatedAt: string;
}
