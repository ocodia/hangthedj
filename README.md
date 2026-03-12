# HangTheDJ 🎧

**Your personal AI radio station**

HangTheDJ is a Spotify-first AI radio experience that runs entirely in your browser. An AI DJ delivers short spoken segments between tracks, responds to listener call-ins, and adapts to configurable personalities — all without any backend server.

---

## How to run

### Prerequisites

- Node.js 18+
- A Spotify Premium account
- A Spotify developer app (see below)
- An OpenAI API key with access to Chat Completions and Text-to-Speech

### 1. Clone and install

```bash
git clone https://github.com/ocodia/hangthedj.git
cd hangthedj
npm install
```

### 2. Set up Spotify

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create a new app
3. In app settings, add a **Redirect URI**: `http://127.0.0.1:5175/`
4. Copy your **Client ID**

### 3. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```
VITE_SPOTIFY_CLIENT_ID=your_client_id_here
```

### 4. Run the development server

```bash
npm run dev
```

Open [http://127.0.0.1:5175](http://127.0.0.1:5175) in your browser.

### 5. Add your OpenAI key

1. Open HangTheDJ in your browser
2. Sign in with Spotify
3. Open **Settings** (⚙️)
4. Enter your OpenAI API key (starts with `sk-`)
5. Your key is saved locally in your browser — never sent to any server

---

## Required Spotify setup

| Setting | Value |
|---------|-------|
| App type | Web (no client secret used) |
| Redirect URI | `http://127.0.0.1:5175/` (dev) or your deployed URL |
| Scopes needed | `streaming`, `user-read-email`, `user-read-private`, `user-read-playback-state`, `user-modify-playback-state` |

**Note:** Spotify Premium is required for browser-based playback via the Web Playback SDK.

---

## Where to add your OpenAI API key

Your OpenAI API key is entered in the **Settings panel** inside the app.

- It is stored in your browser's `localStorage` only
- It is never sent to any server other than OpenAI directly
- You can clear it at any time from Settings
- OpenAI usage (Chat Completions + TTS) is billed to your own account

**Cost note:** DJ banter scripts are short (~30–50 words each). TTS clips are similarly brief. Costs are typically very low for personal use, but you control the frequency via the "DJ Frequency" setting.

---

## Build for production

```bash
npm run build
```

Output goes to `dist/`. Deploy as a static site to any host (Netlify, Vercel, GitHub Pages, Cloudflare Pages, etc.).

Update your Spotify app's redirect URI to match your deployed domain.

---

## Current limitations

- **Spotify Premium required** — browser playback via Web Playback SDK is a Premium feature
- **No queue introspection** — the Spotify SDK does not expose the upcoming track, so the DJ cannot preview what's next
- **No track skipping** — by design: this is a radio experience, not an on-demand player
- **iOS Safari** — autoplay restrictions may affect DJ clip playback; a user gesture may be required
- **Single device** — if you switch Spotify to another device mid-session, the app loses playback control
- **No offline AI** — banter and voice generation require an active internet connection to OpenAI

---

## Why there is no backend in v1

HangTheDJ is designed as a self-contained browser app for personal use.

- Spotify's PKCE flow works entirely client-side — no server is needed for auth
- The user supplies their own OpenAI key, which is used directly from the browser
- All session state, personas, and request history live in IndexedDB / localStorage
- This makes the app trivially deployable as a static site with zero server costs
- The architecture isolates all service boundaries so a backend can be added later if needed (e.g. for multi-user support, shared keys, or cross-device sync)

See [docs/decisions/002-no-backend-v1.md](docs/decisions/002-no-backend-v1.md) for the full decision record.

---

## Architecture overview

```
src/
  app/               — App shell (bootstrap + service wiring)
  features/
    spotify/         — Spotify auth (PKCE) + Web Playback SDK
    playback/        — Playback coordinator (pause/clip/resume state machine)
    scheduler/       — Station scheduler (editorial DJ decision engine)
    requests/        — Listener request line manager
    personas/        — DJ persona service + preset archetypes
    banter/          — OpenAI banter script generator
    voice/           — OpenAI TTS renderer + DJ audio player
    storage/         — IndexedDB wrapper + storage facade
  stores/            — Central reactive app state
  types/             — Shared TypeScript interfaces
  ui/
    components/      — Vanilla TypeScript DOM components
    styles/          — Global and component CSS
docs/
  product/           — PRD and architecture overview
  decisions/         — Architecture decision records (ADRs)
  architecture/      — Detailed architecture docs
```

---

## Next steps / known gaps

- [ ] Transfer playback to the HangTheDJ device automatically on session start
- [ ] Pre-generate DJ clips before track ends for seamless transitions
- [ ] Request acknowledgement passing into banter context
- [ ] Session memory persistence (IndexedDB) across reloads
- [ ] Anti-repetition phrase fingerprinting in scheduler
- [ ] Richer persona editor UI (custom persona creation)
- [ ] PWA icons (replace placeholder SVG)
- [ ] iOS Safari autoplay workaround
- [ ] Service worker offline shell testing
- [ ] OpenAI cost estimator in settings
