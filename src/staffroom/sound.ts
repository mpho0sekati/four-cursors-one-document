import { staffroom } from "./DocumentStore";
import type { AgentEvent } from "./types";

// Procedural Web Audio effects — every sound is synthesised, no audio files.
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = false;
let lastType = 0;

function audio() {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return { ctx, out: master! };
}

function noiseBurst(at: number, dur: number, freq: number, gain: number) {
  const { ctx, out } = audio();
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass"; bp.frequency.value = freq; bp.Q.value = 1.4;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(bp).connect(g).connect(out);
  src.start(at);
}

function tone(at: number, freq: number, dur: number, gain: number, type: OscillatorType = "sine") {
  const { ctx, out } = audio();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(out);
  o.start(at); o.stop(at + dur + 0.05);
}

export const sfx = {
  type() {
    const { ctx } = audio();
    const t = ctx.currentTime;
    noiseBurst(t, 0.03, 2600 + Math.random() * 1600, 0.5);
    tone(t, 180 + Math.random() * 40, 0.03, 0.05, "square");
  },
  click() {
    const { ctx } = audio();
    const t = ctx.currentTime;
    noiseBurst(t, 0.02, 1800, 0.6); // press
    noiseBurst(t + 0.07, 0.015, 3200, 0.35); // release
  },
  tick() {
    const { ctx } = audio();
    tone(ctx.currentTime, 1320, 0.12, 0.08, "triangle");
  },
  alert() {
    const { ctx } = audio();
    const t = ctx.currentTime;
    tone(t, 880, 0.22, 0.16, "triangle");
    tone(t + 0.16, 622, 0.35, 0.16, "triangle");
  },
  chord() {
    const { ctx } = audio();
    const t = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(t + i * 0.09, f, 1.1, 0.1, i % 2 ? "triangle" : "sine"));
  },
};

function onEvent(e: AgentEvent) {
  if (!enabled) return;
  if (e.action === "type_text" && e.status === "progress") {
    const now = performance.now();
    if (now - lastType > 55) { lastType = now; sfx.type(); }
  } else if (e.action === "focus_field") sfx.click();
  else if (e.action === "flag_issue" && e.status === "completed") sfx.alert();
  else if (e.action === "approve_field" && e.status === "completed") (e.agentId === "teacher" ? sfx.chord() : sfx.tick());
  else if (e.action === "generate_document" && e.status === "completed") sfx.chord();
}

let unsub: (() => void) | null = null;
export function setSoundEnabled(on: boolean) {
  enabled = on;
  if (on) { audio(); if (!unsub) unsub = staffroom.onEvent(onEvent); }
}
export const isSoundEnabled = () => enabled;
