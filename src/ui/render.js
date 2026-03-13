/**
 * render.js: mounts the HangTheDJ UI into the #app container.
 *
 * AppCallbacks: { onLogin, onLogout, onOpenAIKeySet, onOpenAIKeyClear,
 *                 onSpotifyClientIdSave, onSpotifyClientIdClear }
 */

import { AppLayout } from './components/app-layout.js';

export function renderApp(container, services, callbacks) {
  const layout = new AppLayout(services, callbacks);
  container.appendChild(layout.element);
}
