/**
 * AppLayout: top-level UI component.
 *
 * Renders:
 * - AuthPanel (if not authenticated)
 * - MainPanel (if authenticated)
 *   - NowPlaying bar
 *   - StationControls
 *   - RequestLine
 *   - PersonaPanel
 *   - SettingsPanel
 */

import type { AppServices } from "@/app/app-shell";
import type { AppCallbacks } from "@/ui/render";
import { AuthPanel } from "./auth-panel";
import { MainPanel } from "./main-panel";
import { appStore } from "@/stores/app-store";

export class AppLayout {
  element: HTMLElement;
  private authPanel: AuthPanel | null = null;
  private mainPanel: MainPanel | null = null;

  constructor(
    private services: AppServices,
    private callbacks: AppCallbacks
  ) {
    this.element = document.createElement("div");
    this.element.className = "app-layout";

    this.render();

    // Subscribe to auth changes
    appStore.subscribe("auth", (auth) => {
      if (auth.isAuthenticated) {
        this.showMain();
      } else {
        this.showAuth();
      }
    });
  }

  private render(): void {
    const auth = appStore.get("auth");
    if (auth.isAuthenticated) {
      this.showMain();
    } else {
      this.showAuth();
    }
  }

  private showAuth(): void {
    this.element.innerHTML = "";
    this.mainPanel = null;
    this.authPanel = new AuthPanel(this.callbacks);
    this.element.appendChild(this.authPanel.element);
  }

  private showMain(): void {
    this.element.innerHTML = "";
    this.authPanel = null;
    this.mainPanel = new MainPanel(this.services, this.callbacks);
    this.element.appendChild(this.mainPanel.element);
  }
}
