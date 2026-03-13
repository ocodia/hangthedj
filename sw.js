const CACHE_NAME = 'hangthedj-v1';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './favicon.svg',
  './src/styles/global.css',
  './src/styles/components.css',
  './src/main.js',
  './src/app/app-shell.js',
  './src/stores/app-store.js',
  './src/features/storage/indexeddb.js',
  './src/features/storage/storage-service.js',
  './src/features/banter/banter-engine.js',
  './src/features/personas/persona-service.js',
  './src/features/playback/playback-coordinator.js',
  './src/features/requests/request-line-manager.js',
  './src/features/scheduler/station-scheduler.js',
  './src/features/spotify/spotify-auth-service.js',
  './src/features/spotify/spotify-player-service.js',
  './src/features/voice/dj-audio-player.js',
  './src/features/voice/voice-engine.js',
  './src/ui/render.js',
  './src/ui/components/app-layout.js',
  './src/ui/components/auth-panel.js',
  './src/ui/components/dj-activity-log.js',
  './src/ui/components/main-panel.js',
  './src/ui/components/now-playing-bar.js',
  './src/ui/components/request-line-panel.js',
  './src/ui/components/settings-panel.js',
  './src/ui/components/station-controls.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Never cache API calls (OpenAI, Spotify)
  if (url.hostname === 'api.openai.com' || url.hostname === 'accounts.spotify.com' || url.hostname === 'api.spotify.com') {
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
