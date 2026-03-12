/**
 * render.ts: mounts the HangTheDJ UI into the #app container.
 *
 * This is a vanilla TypeScript DOM-based UI — no framework dependency.
 * Components are plain classes that manage their own DOM elements.
 */

import type { AppServices } from "@/app/app-shell";
import { AppLayout } from "./components/app-layout";

export interface AppCallbacks {
  onLogin: () => void;
  onLogout: () => void;
  onOpenAIKeySet: (key: string) => void;
  onOpenAIKeyClear: () => void;
}

export function renderApp(
  container: HTMLElement,
  services: AppServices,
  callbacks: AppCallbacks
): void {
  const layout = new AppLayout(services, callbacks);
  container.appendChild(layout.element);
}
