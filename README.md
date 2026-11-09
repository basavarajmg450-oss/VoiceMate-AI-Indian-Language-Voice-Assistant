# VoiceMate AI — Indian Language Voice Assistant

A voice assistant for Indian languages built for the **Great Indian AI Internship Challenge by Gnani AI**. Record speech in the browser, get an instant transcript from **Gnani Prisma**, then hear any text spoken back by **Gnani Timbre**.

- **Frontend:** React 18 + Vite 6
- **Backend:** Node.js 20+ + Express 4
- **Speech-to-Text:** Gnani Prisma v3.0
- **Text-to-Speech:** Gnani Timbre v2.5
- **Deployment:** Vercel (frontend) + Render (backend)

Live demo: _add your Vercel URL here after deploying_
API: <https://voicemate-ai-api.onrender.com> (verified live)

---

## Features

- Browser microphone recording with automatic WAV conversion before upload
- Prisma speech-to-text with auto language detection and 11 Indian language presets
- Timbre text-to-speech producing downloadable WAV audio with inline playback
- Editable transcript with copy-to-clipboard
- Clear status feedback for recording, transcription, synthesis and errors
- Responsive layout for desktop, tablet and mobile
- Gnani API key stays on the server; the browser never sees it

## Architecture

```
┌──────────────────────────┐        HTTPS/JSON + multipart      ┌───────────────────────────┐
│  Vercel                  │  ───────────────────────────────▶  │  Render                   │
│  React + Vite (static)   │  ◀───────────────────────────────  │  Express API              │
│  VITE_API_BASE_URL ──────┼──▶ https://<api>.onrender.com      │  X-API-Key-ID: GNANI key  │
└──────────────────────────┘                                    └─────────────┬─────────────┘
                                                                              │ HTTPS
                                                                ┌─────────────▼─────────────┐
                                                                │  Gnani AI                 │
                                                                │  Prisma STT · Timbre TTS  │
                                                                └───────────────────────────┘
```

The frontend is fully static. All Gnani calls happen on the backend, so the API key is never bundled into JavaScript.

## Project structure

```
.
├── backend/
│   ├── server.js            # Express API: /api/health, /api/stt, /api/tts
│   ├── package.json
│   └── .env.example         # documented backend environment
├── frontend/
│   ├── src/App.jsx          # recorder, transcript, TTS player
│   ├── src/styles.css
│   ├── vite.config.js       # React plugin (automatic JSX runtime + HMR)
│   ├── vercel.json          # SPA fallback + asset caching
│   └── .env.example         # documented frontend environment
├── render.yaml              # optional Render blueprint
└── README.md
```

## Local development

Requirements: Node.js 20+ and npm. Chrome or Edge recommended for microphone capture.

**1. Backend**

```bash
cd backend
npm install
cp .env.example .env        # Windows: copy .env.example .env
```

Set `GNANI_API_KEY` in `backend/.env`, then:

```bash
npm run dev
```

The API starts at `http://localhost:5000`. Verify with `curl http://localhost:5000/api/health`.

**2. Frontend**

```bash
cd frontend
npm install
cp .env.example .env        # Windows: copy .env.example .env
npm run dev
```

Open `http://localhost:5173`.

> **Windows note:** if your shell exports `PORT=0` (some sandboxes do), the backend ignores it and uses 5000. Override with `PORT=5000` in `backend/.env`.

## API

### `GET /api/health`

```json
{ "success": true, "service": "VoiceMate AI API", "status": "running", "gnani_configured": true, "uptime_seconds": 12 }
```

`gnani_configured: false` means `GNANI_API_KEY` is missing or still the placeholder; `/api/stt` and `/api/tts` will return 500 until it is set.

### `POST /api/stt`

Multipart form data. Field `audio` holds the file (WAV, MP3, OGG, FLAC, AAC, M4A, WebM; max 15 MB). Optional `language_code` (default `indic-auto`).

```bash
curl -X POST https://<api>.onrender.com/api/stt \
  -F "audio=@sample.wav" \
  -F "language_code=en-IN"
```

Response:

```json
{ "success": true, "model": "prisma-v3.0", "transcript": "…", "detected_language_code": "en-IN", "request_id": "…", "processing_time": 1.2 }
```

### `POST /api/tts`

JSON body `{ "text": "…", "language": "en-IN", "voice": "Kaveri" }`. Returns `audio/wav` binary.

```bash
curl -X POST https://<api>.onrender.com/api/tts \
  -H "Content-Type: application/json" \
  -d '{"text":"Namaskara","language":"kn-IN","voice":"Kaveri"}' \
  --output speech.wav
```

Supported language/voice presets live in [`frontend/src/App.jsx`](frontend/src/App.jsx). Auto-detect uses `language: "auto"` with the `Kaveri` voice.

### Error contract

| Status | Meaning |
| --- | --- |
| 400 | Invalid text, missing/empty audio, unsupported format, invalid JSON |
| 401 / 402 / 403 / 429 | Gnani rejected the key, out of credits, missing scope, or rate limited |
| 413 | Upload larger than 15 MB |
| 500 | `GNANI_API_KEY` not configured |
| 502 | Network failure reaching Gnani |
| 504 | Gnani did not answer within `GNANI_TIMEOUT_MS` |

Errors are JSON: `{ "error": "human readable message", "upstream_status": 401, "details": { … } }`.

## Environment variables

### Backend (Render)

| Variable | Required | Example | Notes |
| --- | --- | --- | --- |
| `GNANI_API_KEY` | yes | `…` | Secret. Backend only. |
| `FRONTEND_ORIGIN` | yes in production | `https://voicemate-ai.vercel.app` | Comma-separated allowlist of browser origins. Localhost is always allowed. |
| `PORT` | injected | `10000` | Render sets this; do not hardcode. |
| `HOST` | no | `0.0.0.0` | Default is `0.0.0.0`. |
| `GNANI_TIMEOUT_MS` | no | `90000` | Upstream timeout before returning 504. |

### Frontend (Vercel)

| Variable | Required | Example | Notes |
| --- | --- | --- | --- |
| `VITE_API_BASE_URL` | yes | `https://voicemate-ai-api.onrender.com` | No trailing slash. Inlined at build time — redeploy after changing. |

`VITE_*` values are public. Never put a Gnani key in a Vercel variable.

## Deployment

### 1. Backend on Render

1. Push this repository to GitHub (already done if you are reading it there).
2. Render Dashboard → **New → Web Service** → connect the repo.
3. Set **Root Directory** to `backend`.
4. Runtime **Node**, plan **Free**.
5. **Build Command:** `npm ci` — **Start Command:** `npm start`.
6. **Health Check Path:** `/api/health`.
7. Add environment variables: `GNANI_API_KEY`, `FRONTEND_ORIGIN` (fill after the frontend deploy), `NODE_ENV=production`.
8. Deploy and open `https://<service>.onrender.com/api/health`.

Alternatively use the included [`render.yaml`](render.yaml) blueprint: **New → Blueprint**, select the repo, and fill in the two secrets it prompts for.

Free instance behaviour: the service sleeps after ~15 minutes without traffic and the next request takes up to a minute to wake, so an evaluator's first click can feel slow. Warm it with a request to `/api/health` before judging.

### 2. Frontend on Vercel

1. Vercel Dashboard → **Add New → Project** → import the same repository.
2. **Root Directory:** `frontend`. Framework preset: **Vite**.
3. Build command `npm run build`, output directory `dist`.
4. Add **Environment Variable** `VITE_API_BASE_URL=https://<service>.onrender.com` for Production (and Preview if you want preview deploys to work).
5. Deploy, then copy the production URL.
6. Return to Render and set `FRONTEND_ORIGIN` to that URL (comma-separated if you add a custom domain), which triggers a redeploy.
7. Reload the Vercel site and test recording → transcript → speech.

`frontend/vercel.json` adds the SPA fallback and immutable caching for hashed assets.

## Production checklist

```bash
curl https://<api>.onrender.com/api/health          # 200 + gnani_configured:true
curl -I https://<app>.vercel.app                    # 200, https
curl -X POST https://<api>.onrender.com/api/tts -H "Content-Type: application/json" -d '{"text":"test"}' -o out.wav
```

In the browser: record a short clip, confirm the transcript appears, generate speech, play and download it, and verify DevTools → Network shows only the Render host (no `localhost`) and no `X-API-Key-ID` request header.

## Security notes

- `.env` files, `node_modules`, build output and platform state are git-ignored; only `.env.example` files are committed.
- The Gnani key is read from `process.env` and attached only to server-to-server requests; it is never returned in a response or logged.
- Uploads are capped at 15 MB and restricted to audio MIME types/extensions.
- CORS is an explicit allowlist; unknown origins receive no CORS headers.
- This is a demo. Before wider release add authentication, per-user rate limiting, usage quotas, request logging with retention controls, and a privacy notice for recorded audio.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `gnani_configured:false` | Set `GNANI_API_KEY` on Render and redeploy. |
| Browser shows a CORS error | `FRONTEND_ORIGIN` on Render must exactly match the Vercel origin (scheme + host, no path, no trailing slash). Redeploy after editing. |
| Requests still hit `localhost:5000` | `VITE_API_BASE_URL` was missing at build time. Add it on Vercel and **redeploy**. |
| Microphone blocked | The page must be HTTPS (Vercel is) and the browser needs microphone permission. |
| 402 / 403 / 429 | Gnani credits, key scopes, or the one-active-request limit. |
| 504 | Raise `GNANI_TIMEOUT_MS` or retry; the free Gnani tier can be slow on long text. |
| No audio returned | Voice/model mismatch: pick `Kaveri` for most languages, `Nalini` for Hindi. |

## Gnani references

- Prisma STT: <https://docs.gnani.ai/api/STT/speech-to-text>
- Timbre TTS: <https://docs.gnani.ai/api/TTS/tts-inference>
