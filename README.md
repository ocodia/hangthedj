# HangTheDJ 🎧

**Your personal AI radio station**

HangTheDJ is a Spotify-first AI radio experience that runs entirely in your browser. An AI DJ delivers short spoken segments between tracks, responds to listener call-ins, and adapts to configurable personalities — all without any backend server.

## v1 — Pure JavaScript, no build step

HangTheDJ v1 is a **zero-dependency, zero-build** web app. No Node.js, no npm, no compilation required. Just serve the files and go.

---

## How to run

### Prerequisites

- A static HTTP server (any will do — see below)
- A Spotify Premium account
- A Spotify developer app (free to create)
- An OpenAI API key (with access to Chat Completions and Text-to-Speech)
- Optionally, an ElevenLabs API key (for premium voice quality)

### 1. Get the code

```bash
git clone https://github.com/ocodia/hangthedj.git
cd hangthedj
```

### 2. Serve the directory

```bash
# Option A: Python (built in)
python3 -m http.server 8080

# Option B: npx serve (no install needed)
npx serve .

# Option C: any other static server
```

Open `http://localhost:8080` in your browser.

### 3. First-time setup (in the browser)

On first launch, HangTheDJ will guide you through a two-step setup:

#### Step 1: Spotify Client ID

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Create a new app (any name)
3. In the app settings, add a **Redirect URI** that matches your app URL, e.g.:
   - `http://localhost:8080/` for local dev
   - `https://yourusername.github.io/hangthedj/` for GitHub Pages
4. Copy your **Client ID** and paste it into the HangTheDJ setup screen

#### Step 2: Connect with Spotify

Click "Connect with Spotify" and authorise the app.

#### Step 3: OpenAI key (in Settings)

In the Settings panel, enter your OpenAI API key (`sk-...`). This enables:

- **AI banter**: The DJ generates contextual commentary between tracks
- **Text-to-speech**: The DJ's words are spoken aloud

Optionally, add an **ElevenLabs API key** for higher-quality or custom voices.

---

## Deploy to GitHub Pages

1. Fork this repository
2. Go to Settings → Pages → Source: `main` branch, `/ (root)` folder
3. Your app will be live at `https://yourusername.github.io/hangthedj/`
4. Add `https://yourusername.github.io/hangthedj/` as a Redirect URI in your Spotify app settings

---

## Install as PWA

Once the app is running, use your browser's "Install" or "Add to Home Screen" option.  
The app works offline (UI only — Spotify and OpenAI require internet).

---

## Architecture

- **Pure JavaScript ES modules** — no TypeScript, no bundler, no framework
- **No backend** — all data stays in your browser (localStorage + IndexedDB)
- **Spotify PKCE auth** — no client secret required
- **OpenAI API** — direct `fetch()` calls, key stored only in your browser
- **ElevenLabs TTS** — optional premium voice provider, key stored locally
- **Service worker** — app shell cached for offline PWA support

### How it works

1. You authenticate with Spotify using PKCE OAuth (no server involved)
2. The Spotify Web Playback SDK streams music directly in your browser
3. You pick a DJ persona and optionally select a music context (artist, album, or playlist)
4. When a track is ~30s from ending, the app asks OpenAI to generate a short DJ comment
5. OpenAI TTS (or ElevenLabs) converts the comment to speech (~3–8s audio clip)
6. The app crossfades: music volume ducks to 20%, DJ clip plays, music volume restores
7. You can call in requests — the app searches Spotify and queues tracks

### Key files

```
hangthedj/
├── index.html              # Entry point — loads CSS + JS module
├── manifest.json           # PWA manifest
├── sw.js                   # Service worker
├── src/
│   ├── main.js             # Bootstrap
│   ├── app/app-shell.js    # App orchestration
│   ├── features/
│   │   ├── spotify/        # Spotify auth + playback SDK
│   │   ├── banter/         # OpenAI Chat Completions
│   │   ├── voice/          # OpenAI TTS
│   │   ├── storage/        # IndexedDB + localStorage
│   │   ├── personas/       # DJ personality management
│   │   ├── requests/       # Listener call-in queue
│   │   ├── scheduler/      # When and what the DJ says
│   │   └── playback/       # Crossfade state machine
│   ├── stores/app-store.js # Reactive state (event emitter)
│   └── ui/                 # Vanilla JS DOM components
└── src/styles/             # CSS (dark theme, Spotify green)
```

---

## Privacy & security

- **Nothing is stored on any server** — all data is local to your browser
- **Spotify tokens** are stored in localStorage and expire automatically
- **OpenAI API key** is stored in localStorage, never transmitted to any server other than `api.openai.com`
- **ElevenLabs API key** (if used) is stored in localStorage, never transmitted to any server other than `api.elevenlabs.io`
- **Spotify Client ID** is stored in localStorage — it is a public identifier (not a secret)

---

## Requirements

- **Spotify Premium** — required for in-browser playback via the Web Playback SDK
- **Modern browser** — Chrome, Edge, or Firefox (Safari has autoplay restrictions)
- **OpenAI API access** — pay-as-you-go, DJ features are optional

---

## Licence

MIT
