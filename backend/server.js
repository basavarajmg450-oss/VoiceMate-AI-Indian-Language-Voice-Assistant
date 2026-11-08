require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");

const app = express();

const parsedPort = Number.parseInt(process.env.PORT ?? "", 10);
const PORT = Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : 5000;
// Render (and most PaaS runtimes) inject PORT and expect a 0.0.0.0 bind.
const HOST = process.env.HOST || "0.0.0.0";

const API_KEY = process.env.GNANI_API_KEY;
const isApiKeyConfigured = Boolean(API_KEY) && API_KEY !== "PASTE_YOUR_GNANI_API_KEY_HERE";

const parsedTimeout = Number.parseInt(process.env.GNANI_TIMEOUT_MS ?? "", 10);
const GNANI_TIMEOUT_MS = Number.isInteger(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 90000;

const LOCAL_ORIGINS = [
  "http://localhost:5173", "http://127.0.0.1:5173",
  "http://localhost:4173", "http://127.0.0.1:4173"
];
// FRONTEND_ORIGIN accepts a comma-separated list so production plus preview URLs can coexist.
const configuredOrigins = (process.env.FRONTEND_ORIGIN || "")
  .split(",")
  .map(origin => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);
const ALLOWED_ORIGINS = new Set([...LOCAL_ORIGINS, ...configuredOrigins]);

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(cors({
  origin(origin, callback) {
    // Requests without an Origin header (curl, Render health checks, server-to-server) are allowed.
    if (!origin || ALLOWED_ORIGINS.has(origin)) return callback(null, true);
    return callback(null, false);
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
  maxAge: 86400
}));
app.use(express.json({ limit: "1mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const allowed = new Set([
      "audio/wav", "audio/wave", "audio/x-wav", "audio/mpeg",
      "audio/mp3", "audio/ogg", "audio/flac", "audio/aac",
      "audio/mp4", "audio/x-m4a", "audio/webm"
    ]);
    if (allowed.has(file.mimetype) || file.originalname.match(/\.(wav|mp3|ogg|flac|aac|m4a|webm)$/i)) {
      callback(null, true);
    } else {
      callback(new Error("Unsupported audio format. Use WAV, MP3, OGG, FLAC, AAC, M4A or WebM."));
    }
  }
});

function requireApiKey(_req, res, next) {
  if (!isApiKeyConfigured) {
    return res.status(500).json({
      error: "Gnani API key is not configured. Add GNANI_API_KEY to the backend environment and restart the service."
    });
  }
  next();
}

async function readError(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try { return await response.json(); } catch { /* fall through */ }
  }
  try { return { message: await response.text() }; } catch { return {}; }
}

/**
 * Calls Gnani with a hard timeout so a stalled upstream cannot hold the request open.
 * Throws an Error with code "GNANI_TIMEOUT" when the deadline is exceeded.
 */
async function callGnani(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GNANI_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") {
      const label = GNANI_TIMEOUT_MS >= 1000 ? `${Math.round(GNANI_TIMEOUT_MS / 1000)}s` : `${GNANI_TIMEOUT_MS}ms`;
      const timeoutError = new Error(`Gnani did not respond within ${label}.`);
      timeoutError.code = "GNANI_TIMEOUT";
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** Maps common Gnani status codes to messages that are safe to show in the UI. */
function upstreamMessage(status, service) {
  const messages = {
    400: `${service} rejected the request. Check the audio format or text length.`,
    401: `Gnani API key was rejected while calling ${service}. Verify GNANI_API_KEY on the server.`,
    402: `Gnani account has insufficient credits for ${service}.`,
    403: `The Gnani API key is not allowed to use ${service}. Check its permissions or scopes.`,
    404: `${service} endpoint was not found.`,
    429: `Gnani is rate limiting ${service}. The account may allow only one active request at a time.`,
    500: `${service} had an internal error. Please retry.`,
    503: `${service} is temporarily unavailable. Please retry.`
  };
  return messages[status] || `${service} request failed upstream.`;
}

app.get("/", (_req, res) => {
  res.json({
    service: "VoiceMate AI API",
    status: "running",
    health: "/api/health",
    endpoints: { stt: "POST /api/stt", tts: "POST /api/tts" }
  });
});

app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    service: "VoiceMate AI API",
    status: "running",
    gnani_configured: isApiKeyConfigured,
    uptime_seconds: Math.round(process.uptime())
  });
});

// Prisma v3.0 — Speech-to-Text
app.post("/api/stt", requireApiKey, upload.single("audio"), async (req, res) => {
  try {
    if (!req.file || !req.file.size) {
      return res.status(400).json({ error: 'A non-empty audio file is required. Send it as multipart field "audio".' });
    }

    const languageCode = String(req.body.language_code || "indic-auto");
    const form = new FormData();
    const audioBlob = new Blob([req.file.buffer], {
      type: req.file.mimetype || "application/octet-stream"
    });

    form.append("audio_file", audioBlob, req.file.originalname || "recording.webm");
    form.append("model", "prisma-v3.0");
    form.append("language_code", languageCode);
    form.append("format", "transcribe");

    const response = await callGnani("https://api.vachana.ai/stt/v3", {
      method: "POST",
      headers: { "X-API-Key-ID": API_KEY },
      body: form
    });

    if (!response.ok) {
      const details = await readError(response);
      return res.status(response.status).json({
        error: upstreamMessage(response.status, "Prisma"),
        upstream_status: response.status,
        details
      });
    }

    const result = await response.json();
    return res.json({
      success: true,
      model: result.model,
      transcript: result.transcript,
      detected_language_code: result.detected_language_code,
      request_id: result.request_id,
      processing_time: result.processing_time
    });
  } catch (error) {
    if (error.code === "GNANI_TIMEOUT") {
      return res.status(504).json({ error: error.message, details: { message: "Upstream timeout while transcribing." } });
    }
    console.error("STT error:", error.message);
    return res.status(502).json({ error: "Could not reach the Prisma transcription service.", details: { message: error.message } });
  }
});

// Timbre v2.5 — Text-to-Speech
app.post("/api/tts", requireApiKey, async (req, res) => {
  try {
    const { text, language = "en-IN", voice = "Kaveri" } = req.body || {};

    if (typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "Please provide non-empty text." });
    }
    if (text.length > 3000) {
      return res.status(400).json({ error: "For this demo, keep text under 3,000 characters." });
    }

    const response = await callGnani("https://api.vachana.ai/api/v1/tts/inference", {
      method: "POST",
      headers: {
        "X-API-Key-ID": API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: text.trim(),
        model: "timbre-v2.5",
        voice,
        language,
        speed: 1.0,
        audio_config: {
          encoding: "linear_pcm",
          container: "wav",
          num_channels: 1,
          sample_rate: 48000,
          sample_width: 2
        }
      })
    });

    if (!response.ok) {
      const details = await readError(response);
      return res.status(response.status).json({
        error: upstreamMessage(response.status, "Timbre"),
        upstream_status: response.status,
        details
      });
    }

    const audio = Buffer.from(await response.arrayBuffer());
    res.setHeader("Content-Type", response.headers.get("content-type") || "audio/wav");
    res.setHeader("Content-Disposition", 'inline; filename="voicemate-speech.wav"');
    res.setHeader("Content-Length", audio.length);
    res.setHeader("Cache-Control", "no-store");
    return res.send(audio);
  } catch (error) {
    if (error.code === "GNANI_TIMEOUT") {
      return res.status(504).json({ error: error.message, details: { message: "Upstream timeout while generating speech." } });
    }
    console.error("TTS error:", error.message);
    return res.status(502).json({ error: "Could not reach the Timbre speech service.", details: { message: error.message } });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: `Unknown route: ${req.method} ${req.path}` });
});

app.use((err, req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "Audio file is too large. Maximum upload size is 15 MB." });
    }
    if (err.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({ error: 'Unexpected file field. Send exactly one file as "audio".' });
    }
    return res.status(400).json({ error: err.message || "Invalid upload" });
  }
  if (err.type === "entity.too.large") {
    return res.status(413).json({ error: "Request body is too large." });
  }
  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({ error: "Invalid JSON body." });
  }
  const status = err.status || err.statusCode || 400;
  return res.status(status).json({ error: err.message || "Invalid request" });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`VoiceMate API running at http://${HOST}:${PORT} (upstream timeout ${GNANI_TIMEOUT_MS}ms)`);
  console.log(`Allowed browser origins: ${[...ALLOWED_ORIGINS].join(", ")}`);
  if (!isApiKeyConfigured) {
    console.warn("GNANI_API_KEY is not configured; /api/stt and /api/tts will return 500 until it is set.");
  }
});

process.on("SIGTERM", () => {
  // Render sends SIGTERM on redeploy; stop accepting connections before exiting.
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
});
