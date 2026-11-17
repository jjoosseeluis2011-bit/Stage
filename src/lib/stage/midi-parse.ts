/** Leitura de mensagens MIDI de canal, com running status. Sem SysEx inventado. */

export type MidiKind =
  | "noteon"
  | "noteoff"
  | "cc"
  | "pc"
  | "pitchbend"
  | "pressure"
  | "poly"
  | "clock"
  | "active"
  | "start"
  | "stop"
  | "continue"
  | "sysex"
  | "other";

export type MidiMessage = {
  kind: MidiKind;
  channel: number | null;
  number: number | null;
  value: number | null;
  raw: number[];
};

const KIND_NAME: Record<MidiKind, string> = {
  noteon: "Note On",
  noteoff: "Note Off",
  cc: "Control Change",
  pc: "Program Change",
  pitchbend: "Pitch Bend",
  pressure: "Channel Pressure",
  poly: "Poly Aftertouch",
  clock: "MIDI Clock",
  active: "Active Sensing",
  start: "Start",
  stop: "Stop",
  continue: "Continue",
  sysex: "SysEx",
  other: "Outra",
};

export function kindLabel(kind: MidiKind): string {
  return KIND_NAME[kind];
}

export function isIgnorableForLearn(kind: MidiKind): boolean {
  return kind === "clock" || kind === "active" || kind === "start" || kind === "continue" || kind === "stop" || kind === "sysex";
}

export function parseMidiBytes(input: ArrayLike<number>, runningStatus = 0): { messages: MidiMessage[]; running: number } {
  const data = Array.from(input);
  const messages: MidiMessage[] = [];
  let i = 0;
  let running = runningStatus;
  while (i < data.length) {
    let status = data[i] ?? 0;
    if (status >= 0x80) {
      running = status;
      i += 1;
    } else if (running >= 0x80) {
      status = running;
    } else {
      i += 1;
      continue;
    }
    if (status === 0xf0) {
      const start = i - 1;
      while (i < data.length && data[i] !== 0xf7) i += 1;
      if (i < data.length) i += 1;
      messages.push({ kind: "sysex", channel: null, number: null, value: null, raw: data.slice(start, i) });
      running = 0;
      continue;
    }
    if (status === 0xf8) {
      messages.push({ kind: "clock", channel: null, number: null, value: null, raw: [0xf8] });
      continue;
    }
    if (status === 0xfe) {
      messages.push({ kind: "active", channel: null, number: null, value: null, raw: [0xfe] });
      continue;
    }
    if (status === 0xfa || status === 0xfb || status === 0xfc) {
      const kind = status === 0xfa ? "start" : status === 0xfb ? "continue" : "stop";
      messages.push({ kind, channel: null, number: null, value: null, raw: [status] });
      continue;
    }
    const hi = status & 0xf0;
    const channel = status & 0x0f;
    const take = (n: number) => {
      const slice = data.slice(i, i + n);
      i += n;
      return slice;
    };
    if (hi === 0x80 || hi === 0x90 || hi === 0xa0 || hi === 0xb0 || hi === 0xe0) {
      const [a = 0, b = 0] = take(2);
      if (hi === 0x80 || (hi === 0x90 && b === 0)) {
        messages.push({ kind: "noteoff", channel, number: a, value: hi === 0x90 ? 0 : b, raw: [status, a, b] });
      } else if (hi === 0x90) {
        messages.push({ kind: "noteon", channel, number: a, value: b, raw: [status, a, b] });
      } else if (hi === 0xa0) {
        messages.push({ kind: "poly", channel, number: a, value: b, raw: [status, a, b] });
      } else if (hi === 0xb0) {
        messages.push({ kind: "cc", channel, number: a, value: b, raw: [status, a, b] });
      } else {
        const bend = ((b & 0x7f) << 7) | (a & 0x7f);
        messages.push({ kind: "pitchbend", channel, number: null, value: bend, raw: [status, a, b] });
      }
      continue;
    }
    if (hi === 0xc0) {
      const [a = 0] = take(1);
      messages.push({ kind: "pc", channel, number: a, value: a, raw: [status, a] });
      continue;
    }
    if (hi === 0xd0) {
      const [a = 0] = take(1);
      messages.push({ kind: "pressure", channel, number: null, value: a, raw: [status, a] });
      continue;
    }
    messages.push({ kind: "other", channel: null, number: null, value: null, raw: [status] });
  }
  return { messages, running };
}

export function ccName(n: number): string | null {
  if (n === 0) return "Bank Select MSB";
  if (n === 32) return "Bank Select LSB";
  if (n === 1) return "Modulation";
  if (n === 7) return "Volume";
  if (n === 11) return "Expression";
  if (n === 64) return "Sustain";
  if (n === 120) return "All Sound Off";
  if (n === 123) return "All Notes Off";
  return null;
}
