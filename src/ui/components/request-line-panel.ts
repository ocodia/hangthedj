/**
 * RequestLinePanel: the listener call-in UI.
 */

import type { AppServices } from "@/app/app-shell";
import { appStore } from "@/stores/app-store";
import type { RequestSubmission } from "@/types/request";

export class RequestLinePanel {
  element: HTMLElement;

  constructor(private services: AppServices) {
    this.element = document.createElement("div");
    this.element.className = "request-line-panel panel";
    this.render();
  }

  private render(): void {
    this.element.innerHTML = `
      <h3>📞 Call In</h3>
      <p class="muted" style="font-size:0.85rem;margin-bottom:1rem">
        Request an artist, track, or mood for the DJ.
      </p>
      <form id="request-form">
        <div class="field">
          <label for="caller-name">Your name (optional)</label>
          <input type="text" id="caller-name" placeholder="e.g. Alex" maxlength="50" />
        </div>
        <div class="field">
          <label for="artist-name">Artist *</label>
          <input type="text" id="artist-name" placeholder="e.g. Radiohead" maxlength="100" required />
        </div>
        <div class="field">
          <label for="track-name">Track (optional)</label>
          <input type="text" id="track-name" placeholder="e.g. Karma Police" maxlength="100" />
        </div>
        <div class="field">
          <label for="message">Message (optional)</label>
          <textarea id="message" placeholder="Say something to the DJ..." maxlength="200" rows="2"></textarea>
        </div>
        <div class="field" style="display:flex;align-items:center;gap:0.5rem">
          <input type="checkbox" id="play-now" />
          <label for="play-now" style="margin:0;font-size:0.85rem;cursor:pointer">Play right now</label>
          <span class="muted" style="font-size:0.75rem">(DJ will interrupt and announce it)</span>
        </div>
        <div id="request-feedback" class="request-feedback" style="display:none"></div>
        <button type="submit" id="btn-submit-request">Send Request</button>
      </form>
      <div class="request-history" id="request-history"></div>
    `;

    const form = this.element.querySelector<HTMLFormElement>("#request-form")!;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      void this.submitRequest();
    });

    appStore.subscribe("requests", () => this.renderHistory());
  }

  private async submitRequest(): Promise<void> {
    const session = appStore.get("session");
    const feedback = this.element.querySelector<HTMLElement>("#request-feedback")!;

    if (!session.activeSession) {
      feedback.style.display = "block";
      feedback.className = "request-feedback error-text";
      feedback.textContent = "Start a session first before calling in.";
      return;
    }

    const submission: RequestSubmission = {
      callerName: this.getValue("caller-name"),
      artistName: this.getValue("artist-name") ?? "",
      trackName: this.getValue("track-name"),
      message: this.getValue("message"),
      playNow: this.element.querySelector<HTMLInputElement>("#play-now")?.checked ?? false,
    };

    const btn = this.element.querySelector<HTMLButtonElement>("#btn-submit-request")!;
    btn.disabled = true;

    try {
      const request = await this.services.requestManager.submit(session.activeSession.id, submission);

      feedback.style.display = "block";
      feedback.className = "request-feedback";
      feedback.style.color = "var(--color-accent)";
      feedback.textContent = `Request for ${request.artistName} is in the queue!`;

      (this.element.querySelector<HTMLFormElement>("#request-form") as HTMLFormElement).reset();

      const all = await this.services.requestManager.getAll(session.activeSession.id);
      appStore.update("requests", {
        requests: all,
        pendingCount: all.filter((r) => r.status === "pending").length,
      });
    } catch (err) {
      feedback.style.display = "block";
      feedback.className = "request-feedback error-text";
      feedback.textContent = err instanceof Error ? err.message : "Request failed.";
    } finally {
      btn.disabled = false;
      setTimeout(() => {
        feedback.style.display = "none";
      }, 4000);
    }
  }

  private renderHistory(): void {
    const history = this.element.querySelector<HTMLElement>("#request-history");
    if (!history) return;

    const requests = appStore.get("requests").requests;
    if (requests.length === 0) {
      history.innerHTML = "";
      return;
    }

    const recent = [...requests].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)).slice(0, 5);

    history.innerHTML = `
      <h4 style="margin-top:1rem;margin-bottom:0.5rem;font-size:0.9rem">Recent requests</h4>
      <ul class="request-list">
        ${recent
          .map(
            (r) => `
          <li class="request-item status-${r.status}">
            <span class="request-artist">${escapeHtml(r.artistName)}</span>
            <span class="request-status muted">${r.status}</span>
          </li>`,
          )
          .join("")}
      </ul>
    `;
  }

  private getValue(id: string): string | undefined {
    const val = this.element.querySelector<HTMLInputElement>(`#${id}`)?.value?.trim();
    return val || undefined;
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
