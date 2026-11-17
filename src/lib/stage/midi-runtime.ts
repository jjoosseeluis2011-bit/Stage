/**
 * MIDI real via Web MIDI, mais uma bancada de simulação explícita.
 * O runtime não afirma que um teclado carregou uma cena: só registra o que entrou e saiu.
 */
import { isIgnorableForLearn, parseMidiBytes, type MidiKind, type MidiMessage } from "./midi-parse.ts";
import type { Curve, MidiBinding, PadAction } from "./types.ts";

export type PortInfo = { id: string; name: string; state: string };

export type StatusSnap = {
  supported: boolean;
  secure: boolean;
  connected: boolean;
  error: string | null;
  inputs: PortInfo[];
  outputs: PortInfo[];
  inId: string | null;
  outId: string | null;
  lastInAt: number | null;
};

export type LearnChoice = {
  message: NonNullable<MidiBinding["message"]>;
  channel: number;
  number: number;
  values: number[];
};

export type LearnSnap = {
  slot: string;
  mode: "fader" | "pad";
  status: string;
  choices: LearnChoice[];
};

export type PerfSnap = {
  notes: { midi: number; vel: number }[];
  sustain: boolean;
  faders: number[];
  padAt: number[];
  learn: LearnSnap | null;
};

export type LogItem = {
  id: number;
  at: number;
  direction: "in" | "out";
  simulated: boolean;
  kind: MidiKind;
  channel: number | null;
  number: number | null;
  value: number | null;
  raw: number[];
};

type LearnGroup = LearnChoice;

const emptyStatus = (): StatusSnap => ({
  supported: false,
  secure: false,
  connected: false,
  error: null,
  inputs: [],
  outputs: [],
  inId: null,
  outId: null,
  lastInAt: null,
});

let status: StatusSnap = emptyStatus();
let perf: PerfSnap = {
  notes: [],
  sustain: false,
  faders: [96, 96, 96, 96],
  padAt: [0, 0, 0, 0, 0, 0, 0, 0],
  learn: null,
};
let logs: LogItem[] = [];
let showClock = false;
let logSeq = 1;
let access: MIDIAccess | null = null;
let running = 0;
const midiHeld = new Map<number, number>();
const virtualHeld = new Map<number, number>();
const sustained = new Set<number>();
let bindings: MidiBinding[] = [];
let sendVirtual = false;
let learnedHandler: ((slot: string, patch: Partial<MidiBinding>) => void) | null = null;
let actionHandler: ((action: PadAction) => void) | null = null;
let learnTimer = 0;
let learnDeadline = 0;
const learnGroups = new Map<string, LearnGroup>();

const statusListeners = new Set<() => void>();
const perfListeners = new Set<() => void>();
const logListeners = new Set<() => void>();

function emitStatus() {
  statusListeners.forEach((fn) => fn());
}
function emitPerf() {
  perfListeners.forEach((fn) => fn());
}
function emitLog() {
  logListeners.forEach((fn) => fn());
}

function publishNotes() {
  const map = new Map<number, number>();
  for (const [n, v] of midiHeld) map.set(n, v);
  for (const [n, v] of virtualHeld) map.set(n, Math.max(map.get(n) ?? 0, v));
  for (const n of sustained) if (!map.has(n)) map.set(n, 40);
  const notes = [...map.entries()]
    .map(([midi, vel]) => ({ midi, vel }))
    .sort((a, b) => a.midi - b.midi);
  perf = { ...perf, notes, sustain: sustained.size > 0 || perf.sustain };
  emitPerf();
}

export function getStatus(): StatusSnap {
  return status;
}
export function getPerf(): PerfSnap {
  return perf;
}
export function getLogs(): LogItem[] {
  return logs;
}
export function getServerStatus(): StatusSnap {
  return emptyStatus();
}
export function getServerPerf(): PerfSnap {
  return {
    notes: [],
    sustain: false,
    faders: [96, 96, 96, 96],
    padAt: [0, 0, 0, 0, 0, 0, 0, 0],
    learn: null,
  };
}
export function getServerLogs(): LogItem[] {
  return [];
}

export function subscribeStatus(fn: () => void) {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}
export function subscribePerf(fn: () => void) {
  perfListeners.add(fn);
  return () => perfListeners.delete(fn);
}
export function subscribeLog(fn: () => void) {
  logListeners.add(fn);
  return () => logListeners.delete(fn);
}

export function setShowClock(on: boolean) {
  showClock = on;
}
export function setBindings(next: MidiBinding[]) {
  bindings = next;
}
export function setSendVirtual(on: boolean) {
  sendVirtual = on;
}
export function onBindingLearned(fn: (slot: string, patch: Partial<MidiBinding>) => void) {
  learnedHandler = fn;
}
export function onPadAction(fn: (action: PadAction) => void) {
  actionHandler = fn;
}

function pushLog(direction: "in" | "out", msg: MidiMessage, simulated: boolean) {
  if ((msg.kind === "clock" || msg.kind === "active") && !showClock) return;
  const item: LogItem = {
    id: logSeq++,
    at: Date.now(),
    direction,
    simulated,
    kind: msg.kind,
    channel: msg.channel,
    number: msg.number,
    value: msg.value,
    raw: msg.raw,
  };
  logs = [...logs, item].slice(-280);
  emitLog();
}

function signatureMessage(kind: MidiKind): MidiBinding["message"] | null {
  if (kind === "cc") return "cc";
  if (kind === "noteon" || kind === "noteoff") return "note";
  if (kind === "pitchbend") return "pitchbend";
  if (kind === "pressure") return "pressure";
  return null;
}

function findBinding(msg: MidiMessage): MidiBinding | undefined {
  const message = signatureMessage(msg.kind);
  if (!message || msg.channel == null) return undefined;
  return bindings.find(
    (b) => b.message === message && b.channel === msg.channel && (message === "pitchbend" || message === "pressure" || b.number === msg.number),
  );
}

export function shapeValue(raw: number, binding: MidiBinding): number {
  let x = Math.min(127, Math.max(0, raw)) / 127;
  if (binding.curve === "log") x = Math.log10(1 + 9 * x);
  if (binding.curve === "exp") x = (Math.pow(10, x) - 1) / 9;
  if (binding.invert) x = 1 - x;
  return Math.round(binding.min + x * (binding.max - binding.min));
}

export function releaseLocalNotes() {
  midiHeld.clear();
  virtualHeld.clear();
  sustained.clear();
  perf = { ...perf, sustain: false };
  publishNotes();
}

function handleMessage(msg: MidiMessage, simulated: boolean) {
  pushLog("in", msg, simulated);
  if (msg.kind !== "clock" && msg.kind !== "active") {
    status = { ...status, lastInAt: Date.now() };
    emitStatus();
  }
  if (perf.learn && !isIgnorableForLearn(msg.kind)) collectLearn(msg);
  if (msg.kind === "noteon" && msg.number != null) {
    sustained.delete(msg.number);
    midiHeld.set(msg.number, msg.value ?? 100);
    flashPad(msg);
    publishNotes();
    return;
  }
  if (msg.kind === "noteoff" && msg.number != null) {
    midiHeld.delete(msg.number);
    if (perf.sustain) sustained.add(msg.number);
    publishNotes();
    return;
  }
  if (msg.kind === "cc" && msg.number === 64) {
    const down = (msg.value ?? 0) >= 64;
    perf = { ...perf, sustain: down };
    if (!down) sustained.clear();
    publishNotes();
    return;
  }
  if (msg.kind === "cc" && (msg.number === 120 || msg.number === 123)) {
    midiHeld.clear();
    sustained.clear();
    perf = { ...perf, sustain: false };
    publishNotes();
    return;
  }
  if (msg.kind === "cc") {
    const binding = findBinding(msg);
    if (binding?.slot.startsWith("fader-")) {
      const index = Number(binding.slot.slice(6)) - 1;
      if (index >= 0 && index < 4) {
        const faders = perf.faders.slice();
        faders[index] = msg.value ?? 0;
        perf = { ...perf, faders };
        emitPerf();
      }
    }
    if (binding?.slot.startsWith("pad-") && (msg.value ?? 0) >= 64) flashPad(msg, true);
  }
}

function flashPad(msg: MidiMessage, force = false) {
  const binding = findBinding(msg);
  if (!binding?.slot.startsWith("pad-")) return;
  if (!force && msg.kind !== "noteon") return;
  const index = Number(binding.slot.slice(4)) - 1;
  if (index < 0 || index > 7) return;
  const padAt = perf.padAt.slice();
  padAt[index] = Date.now();
  perf = { ...perf, padAt };
  emitPerf();
  if (binding.action !== "none") actionHandler?.(binding.action);
}

function collectLearn(msg: MidiMessage) {
  const message = signatureMessage(msg.kind);
  if (!message || msg.channel == null) return;
  if ((message === "cc" || message === "note") && msg.number == null) return;
  if (msg.kind === "noteoff") return;
  const number = msg.number ?? 0;
  const key = `${message}:${msg.channel}:${number}`;
  const prev = learnGroups.get(key) ?? { message, channel: msg.channel, number, values: [] };
  prev.values = [...prev.values, msg.value ?? 0].slice(-12);
  learnGroups.set(key, prev);
  window.clearTimeout(learnTimer);
  learnTimer = window.setTimeout(evaluateLearn, perf.learn?.mode === "pad" ? 220 : 380);
}

function evaluateLearn() {
  const learn = perf.learn;
  if (!learn) return;
  const groups = [...learnGroups.values()];
  if (learn.mode === "fader") {
    const moving = groups.filter((g) => {
      const min = Math.min(...g.values);
      const max = Math.max(...g.values);
      return g.message === "cc" && (max - min >= 6 || new Set(g.values).size >= 3);
    });
    if (moving.length === 1) {
      commitLearn(moving[0]!);
      return;
    }
    if (moving.length > 1) {
      perf = { ...perf, learn: { ...learn, status: "Chegaram controles diferentes. Escolha o fader certo.", choices: moving } };
      emitPerf();
      return;
    }
    perf = {
      ...perf,
      learn: {
        ...learn,
        status: groups.length
          ? "Ainda não vi variação contínua. Mova o fader de ponta a ponta."
          : "Ouvindo. Mova o fader físico.",
        choices: [],
      },
    };
    emitPerf();
    return;
  }
  const triggers = groups.filter((g) => g.message === "note" || g.message === "cc");
  if (triggers.length === 1) {
    commitLearn(triggers[0]!);
    return;
  }
  if (triggers.length > 1) {
    perf = { ...perf, learn: { ...learn, status: "Mais de uma mensagem. Escolha a do pad.", choices: triggers } };
    emitPerf();
  }
}

function commitLearn(choice: LearnChoice) {
  const learn = perf.learn;
  if (!learn) return;
  learnedHandler?.(learn.slot, {
    message: choice.message,
    channel: choice.channel,
    number: choice.number,
    updatedAt: Date.now(),
  });
  window.clearTimeout(learnDeadline);
  learnGroups.clear();
  perf = { ...perf, learn: null };
  emitPerf();
}

export function chooseLearn(choice: LearnChoice) {
  commitLearn(choice);
}

export function startLearn(slot: string) {
  window.clearTimeout(learnTimer);
  window.clearTimeout(learnDeadline);
  learnGroups.clear();
  const mode = slot.startsWith("pad-") ? "pad" : "fader";
  perf = {
    ...perf,
    learn: {
      slot,
      mode,
      status: mode === "fader" ? "Mova o fader físico agora." : "Toque o pad físico agora.",
      choices: [],
    },
  };
  emitPerf();
  learnDeadline = window.setTimeout(() => cancelLearn("Tempo esgotado. Nada foi mapeado."), 20000);
}

export function cancelLearn(reason = "Mapeamento cancelado.") {
  window.clearTimeout(learnTimer);
  window.clearTimeout(learnDeadline);
  learnGroups.clear();
  if (!perf.learn) return reason;
  perf = { ...perf, learn: null };
  emitPerf();
  return reason;
}

export function virtualNote(midi: number, velocity: number) {
  if (velocity > 0) {
    virtualHeld.set(midi, velocity);
    if (sendVirtual) void sendBytes([0x90, midi, velocity], false);
  } else {
    virtualHeld.delete(midi);
    if (perf.sustain) sustained.add(midi);
    if (sendVirtual) void sendBytes([0x80, midi, 0], false);
  }
  publishNotes();
}

export function setFader(index: number, raw: number) {
  const faders = perf.faders.slice();
  faders[index] = raw;
  perf = { ...perf, faders };
  emitPerf();
  const binding = bindings.find((b) => b.slot === `fader-${index + 1}`);
  if (!binding?.message || binding.channel == null || binding.number == null) return { sent: false as const };
  const value = shapeValue(raw, binding);
  if (binding.message === "cc") {
    void sendBytes([0xb0 + binding.channel, binding.number, value], false);
    return { sent: true as const, value };
  }
  return { sent: false as const };
}

export function triggerPad(index: number) {
  const padAt = perf.padAt.slice();
  padAt[index] = Date.now();
  perf = { ...perf, padAt };
  emitPerf();
  const binding = bindings.find((b) => b.slot === `pad-${index + 1}`);
  if (binding && binding.action !== "none") actionHandler?.(binding.action);
  return binding;
}

export function simulateIncoming(bytes: number[]) {
  const parsed = parseMidiBytes(bytes, running);
  running = parsed.running;
  for (const msg of parsed.messages) handleMessage(msg, true);
}

async function sendBytes(bytes: number[], simulated: boolean) {
  const msg = parseMidiBytes(bytes).messages[0];
  if (msg) pushLog("out", msg, simulated);
  if (simulated || !access) return;
  const outs = [...access.outputs.values()];
  const out = status.outId ? outs.find((p) => p.id === status.outId) : outs[0];
  if (!out) {
    status = { ...status, error: "Nenhuma saída MIDI selecionada. A mensagem ficou só no monitor." };
    emitStatus();
    return;
  }
  try {
    out.send(bytes);
    if (status.error) {
      status = { ...status, error: null };
      emitStatus();
    }
  } catch (err) {
    status = { ...status, error: err instanceof Error ? err.message : "O navegador recusou o envio MIDI." };
    emitStatus();
  }
}

export async function sendBytesOut(bytes: number[]) {
  await sendBytes(bytes, false);
}

export async function panic(channel: number | "all") {
  const channels = channel === "all" ? [...Array(16).keys()] : [channel];
  for (const ch of channels) {
    await sendBytes([0xb0 + ch, 120, 0], false);
    await sendBytes([0xb0 + ch, 123, 0], false);
    await sendBytes([0xb0 + ch, 64, 0], false);
  }
  releaseLocalNotes();
}

function wireInputs() {
  if (!access) return;
  for (const input of access.inputs.values()) {
    input.onmidimessage = (event) => {
      if (status.inId && input.id !== status.inId) return;
      const data = event.data;
      if (!data) return;
      const parsed = parseMidiBytes(data, running);
      running = parsed.running;
      for (const msg of parsed.messages) handleMessage(msg, false);
    };
  }
}

function readPorts() {
  if (!access) return;
  const inputs = [...access.inputs.values()].map((p) => ({ id: p.id, name: p.name || "Entrada sem nome", state: p.state }));
  const outputs = [...access.outputs.values()].map((p) => ({ id: p.id, name: p.name || "Saída sem nome", state: p.state }));
  let inId = status.inId;
  let outId = status.outId;
  if (inId && !inputs.some((p) => p.id === inId)) inId = null;
  if (outId && !outputs.some((p) => p.id === outId)) outId = null;
  if (!outId && outputs.length === 1) outId = outputs[0]!.id;
  status = { ...status, inputs, outputs, inId, outId, connected: true, error: null };
  emitStatus();
  wireInputs();
}

export async function connectMidi(): Promise<string | null> {
  if (typeof navigator === "undefined" || !navigator.requestMIDIAccess) {
    status = {
      ...status,
      supported: false,
      secure: typeof window !== "undefined" ? window.isSecureContext : false,
      error: "Este navegador não oferece Web MIDI. Use Chrome ou Edge no computador ou no Android. Firefox e Safari não expõem MIDI.",
    };
    emitStatus();
    return status.error;
  }
  try {
    access = await navigator.requestMIDIAccess({ sysex: false });
    status = { ...status, supported: true, secure: window.isSecureContext, connected: true, error: null };
    access.onstatechange = () => {
      readPorts();
      if (access && access.inputs.size === 0 && access.outputs.size === 0) {
        status = { ...status, error: "Nenhuma porta MIDI apareceu. Confira o cabo, o modo USB/Bluetooth do teclado e se outro aplicativo não segurou a porta." };
        emitStatus();
      }
    };
    readPorts();
    if (status.inputs.length === 0 && status.outputs.length === 0) {
      status = { ...status, error: "MIDI liberado, mas nenhuma porta foi encontrada." };
      emitStatus();
      return status.error;
    }
    return null;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Permissão MIDI negada.";
    status = { ...status, supported: true, connected: false, error: message };
    emitStatus();
    return message;
  }
}

export function selectInput(id: string | null) {
  status = { ...status, inId: id };
  emitStatus();
  wireInputs();
}
export function selectOutput(id: string | null) {
  status = { ...status, outId: id };
  emitStatus();
}

export function markSupported() {
  const supported = typeof navigator !== "undefined" && "requestMIDIAccess" in navigator;
  const secure = typeof window !== "undefined" ? window.isSecureContext : false;
  status = { ...status, supported, secure };
  emitStatus();
}

export function bindingLabel(binding: MidiBinding | undefined): string {
  if (!binding?.message || binding.channel == null) return "Sem mapeamento";
  const ch = binding.channel + 1;
  if (binding.message === "cc") return `CC ${binding.number} · canal ${ch}`;
  if (binding.message === "note") return `Nota ${binding.number} · canal ${ch}`;
  if (binding.message === "pitchbend") return `Pitch bend · canal ${ch}`;
  return `Pressure · canal ${ch}`;
}

export function curveLabel(curve: Curve): string {
  if (curve === "log") return "Log";
  if (curve === "exp") return "Exp";
  return "Linear";
}
