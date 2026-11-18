// UI sounds synthesised with the Web Audio API — no audio files. Browser-only.
type Kind = "click" | "pop" | "close" | "nav" | "success" | "error" | "day" | "night";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const KEY = "filoi-sound";

export const soundEnabled = () => {
  try { return localStorage.getItem(KEY) !== "off"; } catch { return true; }
};
export function setSoundEnabled(on: boolean) {
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* storage blocked */ }
  window.dispatchEvent(new CustomEvent("filoi-sound", { detail: on }));
}

function audio() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(freq: number, start: number, dur: number, opts: { type?: OscillatorType; gain?: number; to?: number } = {}) {
  const a = ctx!, t0 = a.currentTime + start;
  const osc = a.createOscillator(), g = a.createGain();
  osc.type = opts.type ?? "sine";
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.08, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master!);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function whoosh(start = 0, dur = 0.22, gain = 0.05) {
  const a = ctx!, t0 = a.currentTime + start;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  src.buffer = buf;
  f.type = "bandpass";
  f.Q.value = 0.9;
  f.frequency.setValueAtTime(500, t0);
  f.frequency.exponentialRampToValueAtTime(2400, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + dur * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(master!);
  src.start(t0);
}

let last = 0;
export function play(kind: Kind) {
  if (!soundEnabled()) return;
  const a = audio();
  if (!a) return;
  const now = performance.now();
  if (kind === "click" && now - last < 45) return; // avoid machine-gun ticks
  last = now;
  switch (kind) {
    case "click": tone(1250, 0, 0.045, { gain: 0.05, to: 900 }); break;
    case "pop": tone(520, 0, 0.09, { gain: 0.07, to: 980 }); break;
    case "close": tone(900, 0, 0.08, { gain: 0.05, to: 480 }); break;
    case "nav": whoosh(0, 0.2, 0.035); break;
    case "success": [523.25, 659.25, 783.99].forEach((f, i) => tone(f, i * 0.07, 0.22, { type: "triangle", gain: 0.07 })); break;
    case "error": tone(220, 0, 0.16, { type: "triangle", gain: 0.09 }); tone(174.6, 0.13, 0.22, { type: "triangle", gain: 0.09 }); break;
    case "day": whoosh(0, 0.25, 0.03); [392, 523.25, 659.25, 1046.5].forEach((f, i) => tone(f, 0.04 + i * 0.065, 0.32, { type: "sine", gain: 0.06 })); break;
    case "night": whoosh(0, 0.3, 0.03); [783.99, 587.33, 440, 293.66].forEach((f, i) => tone(f, 0.04 + i * 0.075, 0.36, { type: "triangle", gain: 0.055 })); break;
  }
}
