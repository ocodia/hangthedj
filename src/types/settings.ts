import type { StationMood } from "./session";
import type { SchedulerConfig } from "./scheduler";

export interface AppSettings {
  /** ID of the last active persona */
  activePersonaId: string | null;
  /** Station mood for new sessions */
  defaultMood: StationMood;
  /** Scheduler configuration */
  schedulerConfig: SchedulerConfig;
  /** Whether the user has dismissed the key warning */
  keyWarningDismissed: boolean;
  /** Whether the PWA install prompt has been shown */
  installPromptShown: boolean;
  /** Debug mode — show all activity details in the DJ Activity log */
  debugMode: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  activePersonaId: null,
  defaultMood: "freestyle",
  schedulerConfig: {
    djFrequency: "every",
    requestBehaviour: "responsive",
    familySafe: true,
  },
  keyWarningDismissed: false,
  installPromptShown: false,
  debugMode: false,
};
