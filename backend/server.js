require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");

const app = express();
const parsedPort = Number.parseInt(process.env.PORT ?? "", 10);
const PORT = Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : 5000;
const API_KEY = process.env.GNANI_API_KEY;

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173" }));
app.use(express.json({ limit: "1mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const allowed = new Set([
      "audio/wav", "audio/wave", "audio/x-wav", "audio/mpeg",
      "audio/mp3", "audio/ogg", "audio/flac", "audio/aac",
      "audio/mp4", "audio/x-m4a"
    ]);
    if (allowed.has(file.mimetype) || file.originalname.match(/\.(wav|mp3|ogg|flac|aac|m4a)$/i)) {
      callback(null, true);
    } else {
      callback(new Error("Unsupported audio format. Use WAV, MP3, OGG, FLAC, AAC, M4A or WebM."));
    }
  }
});

function requireApiKey(_req, res, next) {
  if (!API_KEY || API_KEY === "PASTE_YOUR_GNANI_API_KEY_HERE") {
    return res.status(500).json({
      error: "Gnani API key is not configured. Add GNANI_API_KEY to backend/.env and restart the server."
    });
  }
  next();
}

async function readError(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try { return await response.json(); } catch { /* fall through */ }
  }
  return { message: await response.text() };
}

app.get("/api/health", (_req, res) => {
  res.json({ success: true, service: "VoiceMate AI API", status: "running" });
});

// Prisma v3.0 — Speech-to-Text
app.post("/api/stt", requireApiKey, upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Audio file is required. Send it as multipart field "audio".' });
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

    const response = await fetch("https://api.vachana.ai/stt/v3", {
      method: "POST",
      headers: { "X-API-Key-ID": API_KEY },
      body: form
    });

    if (!response.ok) {
      const details = await readError(response);
      return res.status(response.status).json({
        error: "Prisma transcription request failed",
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
    console.error("STT error:", error.message);
    return res.status(500).json({ error: "Could not transcribe audio", details: error.message });
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

    const response = await fetch("https://api.vachana.ai/api/v1/tts/inference", {
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
        error: "Timbre speech generation failed",
        details
      });
    }

    const audio = Buffer.from(await response.arrayBuffer());
    res.setHeader("Content-Type", response.headers.get("content-type") || "audio/wav");
    res.setHeader("Content-Disposition", 'inline; filename="voicemate-speech.wav"');
    res.setHeader("Content-Length", audio.length);
    return res.send(audio);
  } catch (error) {
    console.error("TTS error:", error.message);
    return res.status(500).json({ error: "Could not generate speech", details: error.message });
  }
});

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "Audio file is too large. Maximum upload size is 15 MB." });
  }
  return res.status(400).json({ error: err.message || "Invalid request" });
});

app.listen(PORT, () => {
  console.log(`VoiceMate API running at http://localhost:${PORT}`);
});
