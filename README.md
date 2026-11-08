# VoiceMate AI — Gnani AI Internship Challenge Starter

A React + Express voice assistant starter integrating:
- **Prisma v3.0** for Speech-to-Text (STT)
- **Timbre v2.5** for Text-to-Speech (TTS)

The app records audio in the browser, sends it to your Express backend for transcription, displays the transcript, and can synthesize typed or transcribed text into a WAV file.

## Requirements
- Node.js 18.18+ (Node 20 LTS recommended)
- npm
- A Gnani AI API key with STT and TTS access/credits
- Chrome or Edge recommended for microphone recording

## 1. Extract and open
Extract `voicemate-ai.zip`, then open the `voicemate-ai` folder in VS Code.

## 2. Configure the backend
Open a terminal in VS Code:

```powershell
cd backend
npm install
Copy-Item .env.example .env
```

Open `backend/.env` and replace `PASTE_YOUR_GNANI_API_KEY_HERE` with your key. Never share this key or commit `.env`.

## 3. Start the backend
In the backend terminal:

```powershell
npm run dev
```

Expected: `VoiceMate API running at http://localhost:5000`

Check `http://localhost:5000/api/health` in your browser.

## 4. Start the frontend
Open a **second** VS Code terminal at the project root:

```powershell
cd frontend
npm install
npm run dev
```

Open the URL printed by Vite, usually `http://localhost:5173`.

## 5. Try the app
1. Select a language.
2. Click **Start recording**, allow microphone access, speak for a few seconds, then click **Stop & transcribe**.
3. The transcript appears in the text box.
4. Click **Generate speech** to create and play a WAV response.
5. You can also type text directly and generate speech.

## API routes
- `GET /api/health` — backend health
- `POST /api/stt` — multipart form-data; file field must be `audio`, optional `language_code`
- `POST /api/tts` — JSON `{ "text": "...", "language": "en-IN", "voice": "Kaveri" }`, returns WAV audio

## Gnani API references
- Prisma STT: https://docs.gnani.ai/api/STT/speech-to-text
- Timbre TTS: https://docs.gnani.ai/api/TTS/tts-inference

The integration uses the documented `X-API-Key-ID` header. Prisma v3.0 uses `POST https://api.vachana.ai/stt/v3`. Timbre v2.5 uses `POST https://api.vachana.ai/api/v1/tts/inference`.

## Troubleshooting
- **401**: verify the API key in `backend/.env`.
- **402**: account has insufficient credits.
- **403**: API key may not have STT/TTS permissions/scopes.
- **429**: wait for the current request to finish; account may allow one active request at a time.
- **Microphone blocked**: use localhost in Chrome/Edge and allow microphone permission.
- **No audio**: check that the selected voice belongs to the selected model and language. Default is Kaveri with English (India).
- **Port in use**: change `PORT` in `backend/.env`, and update `VITE_API_BASE_URL` in `frontend/.env` if needed.

This is a starter implementation, not a production deployment. Before public release, add authentication, rate limiting, usage limits, input validation, logging controls, and a privacy notice for recorded audio.
