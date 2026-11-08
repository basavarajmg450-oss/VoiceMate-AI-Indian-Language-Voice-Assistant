import { useEffect, useRef, useState } from "react";
import {
  AudioLines, Mic, MicOff, Play, Square, Sparkles, Volume2,
  Languages, Headphones, LoaderCircle, Copy, Check, AlertCircle
} from "lucide-react";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

const LANGUAGES = [
  { label: "Auto detect (Prisma)", stt: "indic-auto", tts: "auto", voice: "Kaveri" },
  { label: "English", stt: "en-IN", tts: "en-IN", voice: "Kaveri" },
  { label: "Kannada", stt: "kn-IN", tts: "kn-IN", voice: "Kaveri" },
  { label: "Hindi", stt: "hi-IN", tts: "hi-IN", voice: "Nalini" },
  { label: "Tamil", stt: "ta-IN", tts: "ta-IN", voice: "Kaveri" },
  { label: "Telugu", stt: "te-IN", tts: "te-IN", voice: "Kaveri" },
  { label: "Malayalam", stt: "ml-IN", tts: "ml-IN", voice: "Kaveri" },
  { label: "Marathi", stt: "mr-IN", tts: "mr-IN", voice: "Kaveri" },
  { label: "Punjabi", stt: "pa-IN", tts: "pa-IN", voice: "Kaveri" },
  { label: "Bengali", stt: "bn-IN", tts: "bn-IN", voice: "Kaveri" },
  { label: "Gujarati", stt: "gu-IN", tts: "gu-IN", voice: "Kaveri" }
];


async function convertBlobToWav(blob) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const audioContext = new AudioContextClass();
  try {
    const decoded = await audioContext.decodeAudioData(await blob.arrayBuffer());
    const channels = decoded.numberOfChannels;
    const sampleRate = decoded.sampleRate;
    const frames = decoded.length;
    const bytesPerSample = 2;
    const dataSize = frames * channels * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    const writeText = (offset, value) => {
      for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
    };
    writeText(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeText(8, "WAVE");
    writeText(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * channels * bytesPerSample, true);
    view.setUint16(32, channels * bytesPerSample, true);
    view.setUint16(34, 16, true);
    writeText(36, "data");
    view.setUint32(40, dataSize, true);
    const channelData = Array.from({ length: channels }, (_, index) => decoded.getChannelData(index));
    let offset = 44;
    for (let frame = 0; frame < frames; frame++) {
      for (let channel = 0; channel < channels; channel++) {
        const sample = Math.max(-1, Math.min(1, channelData[channel][frame]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      }
    }
    return new Blob([buffer], { type: "audio/wav" });
  } finally {
    await audioContext.close();
  }
}

export default function App() {
  const [languageIndex, setLanguageIndex] = useState(0);
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState("");
  const [status, setStatus] = useState({ type: "info", message: "Ready. Record a short message or type text below." });
  const [audioUrl, setAudioUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);

  const language = LANGUAGES[languageIndex];

  useEffect(() => () => {
    if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  async function startRecording() {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Microphone recording is unavailable. Open the app on localhost using Chrome or Edge.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const preferred = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(type => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined);
      recorderRef.current = recorder;
      recorder.ondataavailable = event => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        const recordedBlob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        stream.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        if (!recordedBlob.size) {
          setStatus({ type: "error", message: "No audio was captured. Please try again." });
          return;
        }
        try {
          const wavBlob = await convertBlobToWav(recordedBlob);
          await transcribe(wavBlob);
        } catch (conversionError) {
          setBusy("");
          setStatus({ type: "error", message: `Could not process this recording: ${conversionError.message}` });
        }
      };
      recorder.start();
      setRecording(true);
      setStatus({ type: "info", message: "Recording… speak clearly, then press Stop & transcribe." });
    } catch (error) {
      setStatus({ type: "error", message: error.message || "Could not access microphone." });
    }
  }

  function stopRecording() {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
      setRecording(false);
      setBusy("stt");
      setStatus({ type: "info", message: "Uploading audio to Prisma…" });
    }
  }

  async function transcribe(blob) {
    setBusy("stt");
    try {
      const form = new FormData();
      form.append("audio", blob, "recording.wav");
      form.append("language_code", language.stt);
      const response = await fetch(`${API_BASE}/api/stt`, { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.details?.message || result.error || "Prisma request failed");
      setText(result.transcript || "");
      setStatus({
        type: "success",
        message: `Transcription complete · ${result.detected_language_code || language.stt} · ${result.model || "Prisma"}`
      });
    } catch (error) {
      setStatus({ type: "error", message: `${error.message}. Check that the backend is running and your API key has STT access.` });
    } finally {
      setBusy("");
    }
  }

  async function generateSpeech() {
    if (!text.trim()) {
      setStatus({ type: "error", message: "Enter or transcribe some text first." });
      return;
    }
    setBusy("tts");
    setStatus({ type: "info", message: "Sending text to Timbre…" });
    try {
      const response = await fetch(`${API_BASE}/api/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          language: language.tts,
          voice: language.voice
        })
      });
      if (!response.ok) {
        let message = "Timbre request failed";
        try {
          const result = await response.json();
          message = result.details?.message || result.error || message;
        } catch { /* response was not JSON */ }
        throw new Error(message);
      }
      const blob = await response.blob();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      const nextUrl = URL.createObjectURL(blob);
      setAudioUrl(nextUrl);
      setStatus({ type: "success", message: "Speech generated successfully. Press Play to listen." });
    } catch (error) {
      setStatus({ type: "error", message: `${error.message}. Check your Timbre voice, language, credits and TTS access.` });
    } finally {
      setBusy("");
    }
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      setStatus({ type: "error", message: "Clipboard access was blocked by your browser." });
    }
  }

  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand-mark"><AudioLines size={22} /></span>
          <span>VoiceMate<span className="brand-ai">AI</span></span>
        </a>
        <div className="powered"><span className="pulse" /> Powered by Gnani AI</div>
      </header>

      <section className="hero">
        <div className="eyebrow"><Sparkles size={14} /> YOUR INDIAN LANGUAGE VOICE ASSISTANT</div>
        <h1>Speak naturally.<br /><span>Be understood.</span></h1>
        <p>Record your voice, get an instant transcript, and hear it spoken back. Built with Gnani AI Prisma and Timbre.</p>
      </section>

      <section className="workspace">
        <div className="panel panel-record">
          <div className="panel-heading">
            <div className="step-icon"><Mic size={18} /></div>
            <div><div className="panel-kicker">STEP 01</div><h2>Voice input</h2></div>
          </div>
          <label className="field-label" htmlFor="language"><Languages size={15} /> Language</label>
          <select id="language" value={languageIndex} onChange={e => setLanguageIndex(Number(e.target.value))} disabled={recording || !!busy}>
            {LANGUAGES.map((item, index) => <option value={index} key={item.label}>{item.label}</option>)}
          </select>
          <div className={`record-orb ${recording ? "is-recording" : ""}`}>
            <div className="orb-ring ring-one" /><div className="orb-ring ring-two" />
            <div className="orb-core"><AudioLines size={34} /></div>
          </div>
          <div className="record-label">{recording ? "Listening to you…" : "Ready when you are"}</div>
          <p className="helper">Use a quiet environment. Keep your test recording short (under 30 seconds).</p>
          {!recording ? (
            <button className="button button-primary" onClick={startRecording} disabled={!!busy}>
              <Mic size={17} /> Start recording
            </button>
          ) : (
            <button className="button button-stop" onClick={stopRecording}>
              <Square size={16} fill="currentColor" /> Stop & transcribe
            </button>
          )}
          <div className="model-chip"><span className="chip-dot" /> Prisma v3.0 <span>·</span> Speech to Text</div>
        </div>

        <div className="panel panel-transcript">
          <div className="panel-heading">
            <div className="step-icon violet"><Sparkles size={18} /></div>
            <div><div className="panel-kicker">STEP 02</div><h2>Your transcript</h2></div>
            <button className="icon-button" title="Copy transcript" onClick={copyText} disabled={!text.trim()}>
              {copied ? <Check size={17} /> : <Copy size={17} />}
            </button>
          </div>
          <label className="field-label" htmlFor="transcript">Transcript / editable text</label>
          <textarea id="transcript" value={text} onChange={e => setText(e.target.value)} placeholder="Your spoken words will appear here. You can also type or edit text manually…" />
          <div className="text-meta">{text.length} characters <span>·</span> Edit before generating speech</div>
          <button className="button button-secondary" onClick={generateSpeech} disabled={!!busy || !text.trim()}>
            {busy === "tts" ? <LoaderCircle className="spin" size={17} /> : <Volume2 size={17} />}
            {busy === "tts" ? "Generating speech…" : "Generate speech"}
          </button>
          <div className="model-chip"><span className="chip-dot violet-dot" /> Timbre v2.5 <span>·</span> Text to Speech</div>
        </div>
      </section>

      <section className={`status-bar ${status.type}`}>
        {status.type === "error" ? <AlertCircle size={17} /> : busy ? <LoaderCircle className="spin" size={17} /> : <span className="status-check"><Check size={13} /></span>}
        <span>{status.message}</span>
      </section>

      {audioUrl && (
        <section className="audio-result">
          <div className="audio-icon"><Headphones size={20} /></div>
          <div className="audio-info"><strong>Your generated voice is ready</strong><span>Timbre v2.5 · WAV audio</span></div>
          <audio controls src={audioUrl} />
          <a className="download-link" href={audioUrl} download="voicemate-speech.wav">Download</a>
        </section>
      )}

      <footer>
        <span>VoiceMate AI</span><span>Prisma STT + Timbre TTS</span><span>API key stays on your backend</span>
      </footer>
    </main>
  );
}
