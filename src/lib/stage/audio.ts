/** Metrônomo e afinador locais. Não dependem de rede nem de MIDI. */

let ctx: AudioContext | null = null;
let timer = 0;
let nextAt = 0;
let beatIndex = 0;
let running = false;
let bpm = 100;
let beats = 4;
let subdivision = 1;
let volume = 0.5;
const listeners = new Set<() => void>();

export type MetroSnap = { running: boolean; bpm: number; beat: number; beats: number };

let snap: MetroSnap = { running: false, bpm: 100, beat: 0, beats: 4 };

function emit() {
  snap = { running, bpm, beat: beatIndex % Math.max(1, beats), beats };
  listeners.forEach((fn) => fn());
}

export function getMetro(): MetroSnap {
  return snap;
}
export function getServerMetro(): MetroSnap {
  return { running: false, bpm: 100, beat: 0, beats: 4 };
}
export function subscribeMetro(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function context(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

function click(time: number, accent: boolean) {
  const audio = context();
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = "square";
  osc.frequency.value = accent ? 1760 : 1046;
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(volume * (accent ? 0.35 : 0.18), time + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
  osc.connect(gain);
  gain.connect(audio.destination);
  osc.start(time);
  osc.stop(time + 0.06);
}

function scheduler() {
  const audio = context();
  const interval = 60 / bpm / Math.max(1, subdivision);
  while (nextAt < audio.currentTime + 0.12) {
    const accent = beatIndex % (beats * subdivision) === 0;
    click(nextAt, accent);
    if (beatIndex % subdivision === 0) emit();
    beatIndex += 1;
    nextAt += interval;
  }
}

export async function startMetro(next: { bpm: number; beats: number; subdivision: number; volume: number }) {
  bpm = Math.min(280, Math.max(40, next.bpm));
  beats = next.beats;
  subdivision = next.subdivision;
  volume = next.volume;
  const audio = context();
  if (audio.state === "suspended") await audio.resume();
  running = true;
  beatIndex = 0;
  nextAt = audio.currentTime + 0.05;
  window.clearInterval(timer);
  timer = window.setInterval(scheduler, 25);
  emit();
}

export function stopMetro() {
  running = false;
  window.clearInterval(timer);
  emit();
}

export function toggleMetro(next: { bpm: number; beats: number; subdivision: number; volume: number }) {
  if (running) stopMetro();
  else void startMetro(next);
}

export function isMetroRunning() {
  return running;
}

export type TunerFrame = { hz: number | null; name: string | null; cents: number | null; error: string | null };

function autoCorrelate(buf: Float32Array, sampleRate: number): number | null {
  let rms = 0;
  for (let i = 0; i < buf.length; i += 1) rms += buf[i]! * buf[i]!;
  rms = Math.sqrt(rms / buf.length);
  if (rms < 0.01) return null;
  const size = buf.length;
  const c = new Array<number>(size).fill(0);
  for (let lag = 0; lag < size; lag += 1) {
    let sum = 0;
    for (let i = 0; i < size - lag; i += 1) sum += buf[i]! * buf[i + lag]!;
    c[lag] = sum;
  }
  let peak = 0;
  while (peak < size - 1 && c[peak]! > c[peak + 1]!) peak += 1;
  let best = -1;
  let bestVal = 0;
  for (let i = peak; i < size; i += 1) {
    if (c[i]! > bestVal) {
      bestVal = c[i]!;
      best = i;
    }
  }
  if (best < 0) return null;
  const hz = sampleRate / best;
  if (hz < 40 || hz > 1200) return null;
  return hz;
}

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export async function startTuner(onFrame: (frame: TunerFrame) => void): Promise<() => void> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Este navegador não libera o microfone para o afinador.");
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false } });
  } catch {
    throw new Error("Permissão do microfone negada. O afinador precisa dela e não usa a câmera.");
  }
  const audio = context();
  const source = audio.createMediaStreamSource(stream);
  const analyser = audio.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  let alive = true;
  const tick = () => {
    if (!alive) return;
    analyser.getFloatTimeDomainData(buf);
    const hz = autoCorrelate(buf, audio.sampleRate);
    if (!hz) onFrame({ hz: null, name: null, cents: null, error: null });
    else {
      const midi = Math.round(69 + 12 * Math.log2(hz / 440));
      const ref = 440 * Math.pow(2, (midi - 69) / 12);
      const cents = Math.round(1200 * Math.log2(hz / ref));
      onFrame({ hz, name: `${NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`, cents, error: null });
    }
    requestAnimationFrame(tick);
  };
  tick();
  return () => {
    alive = false;
    source.disconnect();
    stream.getTracks().forEach((t) => t.stop());
  };
}
