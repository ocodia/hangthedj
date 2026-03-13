/**
 * AppLayout: top-level UI component.
 * Renders AuthPanel (unauthenticated) or MainPanel (authenticated).
 */

import { AuthPanel } from './auth-panel.js';
import { MainPanel } from './main-panel.js';
import { appStore } from '../../stores/app-store.js';

export class AppLayout {
  constructor(services, callbacks) {
    this.services = services;
    this.callbacks = callbacks;
    this.authPanel = null;
    this.mainPanel = null;

    this.element = document.createElement('div');
    this.element.className = 'app-layout';

    this._render();

    appStore.subscribe('auth', (auth) => {
      if (auth.isAuthenticated) {
        this._showMain();
      } else {
        this._showAuth();
      }
    });
  }

  _render() {
    const auth = appStore.get('auth');
    if (auth.isAuthenticated) {
      this._showMain();
    } else {
      this._showAuth();
    }
  }

  _showAuth() {
    this.element.innerHTML = '';
    this.mainPanel = null;
    this.authPanel = new AuthPanel(this.callbacks);
    this.element.appendChild(this.authPanel.element);
  }

  _showMain() {
    this.element.innerHTML = '';
    this.authPanel = null;
    this.mainPanel = new MainPanel(this.services, this.callbacks);
    this.element.appendChild(this.mainPanel.element);
  }
}
