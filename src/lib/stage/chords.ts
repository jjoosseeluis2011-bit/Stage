/**
 * Gramática de acordes do STAGE.
 * Interpreta o símbolo escrito, transpõe sem trocar a qualidade
 * e nomeia um conjunto de notas MIDI quando a evidência é suficiente.
 */
import type { Nomenclature } from "./types.ts";

export type AccidentalPref = "sharp" | "flat";

export type ChordKind =
  | "maj"
  | "m"
  | "7"
  | "maj7"
  | "m7"
  | "dim"
  | "dim7"
  | "m7b5"
  | "aug"
  | "sus2"
  | "sus4"
  | "7sus4"
  | "6"
  | "m6"
  | "69"
  | "add9"
  | "add11"
  | "add13"
  | "9"
  | "maj9"
  | "m9"
  | "11"
  | "maj11"
  | "m11"
  | "13"
  | "maj13"
  | "m13"
  | "7b9"
  | "7#9"
  | "7#11"
  | "7b13"
  | "7b5"
  | "maj7#11"
  | "7b9b13"
  | "7(13)"
  | "5"
  | "mmaj7";

export type ParsedChord = {
  root: number;
  bass: number | null;
  kind: ChordKind;
};

type Template = {
  kind: ChordKind;
  intervals: number[];
  /** Intervalos que precisam estar presentes para nomear. */
  required: number[];
  /** Usado no reconhecimento MIDI. Escrito sempre entra pela tabela de símbolos. */
  detect: boolean;
};

const T: Template[] = [
  { kind: "maj", intervals: [0, 4, 7], required: [0, 4], detect: true },
  { kind: "m", intervals: [0, 3, 7], required: [0, 3], detect: true },
  { kind: "5", intervals: [0, 7], required: [0, 7], detect: true },
  { kind: "dim", intervals: [0, 3, 6], required: [0, 3, 6], detect: true },
  { kind: "aug", intervals: [0, 4, 8], required: [0, 4, 8], detect: true },
  { kind: "sus2", intervals: [0, 2, 7], required: [0, 2], detect: true },
  { kind: "sus4", intervals: [0, 5, 7], required: [0, 5], detect: true },
  { kind: "6", intervals: [0, 4, 7, 9], required: [0, 4, 9], detect: true },
  { kind: "m6", intervals: [0, 3, 7, 9], required: [0, 3, 9], detect: true },
  { kind: "69", intervals: [0, 2, 4, 7, 9], required: [0, 2, 4, 9], detect: true },
  { kind: "maj7", intervals: [0, 4, 7, 11], required: [0, 4, 11], detect: true },
  { kind: "7", intervals: [0, 4, 7, 10], required: [0, 4, 10], detect: true },
  { kind: "m7", intervals: [0, 3, 7, 10], required: [0, 3, 10], detect: true },
  { kind: "mmaj7", intervals: [0, 3, 7, 11], required: [0, 3, 11], detect: true },
  { kind: "m7b5", intervals: [0, 3, 6, 10], required: [0, 3, 6, 10], detect: true },
  { kind: "dim7", intervals: [0, 3, 6, 9], required: [0, 3, 6, 9], detect: true },
  { kind: "7sus4", intervals: [0, 5, 7, 10], required: [0, 5, 10], detect: true },
  { kind: "add9", intervals: [0, 2, 4, 7], required: [0, 2, 4], detect: true },
  { kind: "add11", intervals: [0, 4, 5, 7], required: [0, 4, 5], detect: false },
  { kind: "add13", intervals: [0, 4, 7, 9], required: [0, 4, 9], detect: false },
  { kind: "9", intervals: [0, 2, 4, 7, 10], required: [0, 2, 4, 10], detect: true },
  { kind: "maj9", intervals: [0, 2, 4, 7, 11], required: [0, 2, 4, 11], detect: true },
  { kind: "m9", intervals: [0, 2, 3, 7, 10], required: [0, 2, 3, 10], detect: true },
  { kind: "11", intervals: [0, 2, 4, 5, 7, 10], required: [0, 4, 5, 10], detect: true },
  { kind: "maj11", intervals: [0, 2, 4, 5, 7, 11], required: [0, 4, 5, 11], detect: true },
  { kind: "m11", intervals: [0, 2, 3, 5, 7, 10], required: [0, 3, 5, 10], detect: true },
  { kind: "13", intervals: [0, 2, 4, 7, 9, 10], required: [0, 4, 9, 10], detect: true },
  { kind: "maj13", intervals: [0, 2, 4, 7, 9, 11], required: [0, 4, 9, 11], detect: true },
  { kind: "m13", intervals: [0, 2, 3, 7, 9, 10], required: [0, 3, 9, 10], detect: true },
  { kind: "7b9", intervals: [0, 1, 4, 7, 10], required: [0, 1, 4, 10], detect: true },
  { kind: "7#9", intervals: [0, 3, 4, 7, 10], required: [0, 3, 4, 10], detect: true },
  { kind: "7#11", intervals: [0, 4, 6, 7, 10], required: [0, 4, 6, 10], detect: true },
  { kind: "7b13", intervals: [0, 4, 7, 8, 10], required: [0, 4, 8, 10], detect: true },
  { kind: "7b5", intervals: [0, 4, 6, 10], required: [0, 4, 6, 10], detect: true },
  { kind: "maj7#11", intervals: [0, 4, 6, 7, 11], required: [0, 4, 6, 11], detect: true },
  { kind: "7b9b13", intervals: [0, 1, 4, 7, 8, 10], required: [0, 1, 4, 8, 10], detect: true },
  { kind: "7(13)", intervals: [0, 4, 7, 9, 10], required: [0, 4, 9, 10], detect: false },
];

const BY_KIND = new Map(T.map((t) => [t.kind, t]));

const DISPLAY: Record<ChordKind, string> = {
  maj: "",
  m: "m",
  "7": "7",
  maj7: "maj7",
  m7: "m7",
  dim: "°",
  dim7: "°7",
  m7b5: "m7(b5)",
  aug: "+",
  sus2: "sus2",
  sus4: "sus4",
  "7sus4": "7sus4",
  "6": "6",
  m6: "m6",
  "69": "6/9",
  add9: "add9",
  add11: "add11",
  add13: "add13",
  "9": "9",
  maj9: "maj9",
  m9: "m9",
  "11": "11",
  maj11: "maj11",
  m11: "m11",
  "13": "13",
  maj13: "maj13",
  m13: "m13",
  "7b9": "7(b9)",
  "7#9": "7(#9)",
  "7#11": "7(#11)",
  "7b13": "7(b13)",
  "7b5": "7(b5)",
  "maj7#11": "maj7(#11)",
  "7b9b13": "7(b9,b13)",
  "7(13)": "7(13)",
  "5": "5",
  mmaj7: "m(maj7)",
};

/** Da forma mais específica para a mais genérica. */
const QUALITY: [RegExp, ChordKind][] = [
  [/^maj7\(#11\)$/i, "maj7#11"],
  [/^M7\(#11\)$/i, "maj7#11"],
  [/^7M\(#11\)$/i, "maj7#11"],
  [/^maj7\(9\)$/i, "maj9"],
  [/^M7\(9\)$/i, "maj9"],
  [/^7M\(9\)$/i, "maj9"],
  [/^maj7\(13\)$/i, "maj13"],
  [/^7M\(13\)$/i, "maj13"],
  [/^M7\(13\)$/i, "maj13"],
  [/^m7\(b5\)$/i, "m7b5"],
  [/^m7b5$/i, "m7b5"],
  [/^min7\(b5\)$/i, "m7b5"],
  [/^min7b5$/i, "m7b5"],
  [/^m7\(9\)$/i, "m9"],
  [/^min7\(9\)$/i, "m9"],
  [/^7\(b9,b13\)$/i, "7b9b13"],
  [/^7\(b9b13\)$/i, "7b9b13"],
  [/^7b9b13$/i, "7b9b13"],
  [/^7\(b9\)$/i, "7b9"],
  [/^7b9$/i, "7b9"],
  [/^7\(#9\)$/i, "7#9"],
  [/^7#9$/i, "7#9"],
  [/^7\(#11\)$/i, "7#11"],
  [/^7#11$/i, "7#11"],
  [/^7\(b13\)$/i, "7b13"],
  [/^7b13$/i, "7b13"],
  [/^7\(b5\)$/i, "7b5"],
  [/^7b5$/i, "7b5"],
  [/^7\(9\)$/i, "9"],
  [/^7\(13\)$/i, "7(13)"],
  [/^7\(add13\)$/i, "7(13)"],
  [/^maj13$/i, "maj13"],
  [/^M13$/i, "maj13"],
  [/^13M$/i, "maj13"],
  [/^m13$/i, "m13"],
  [/^min13$/i, "m13"],
  [/^13$/i, "13"],
  [/^maj11$/i, "maj11"],
  [/^M11$/i, "maj11"],
  [/^11M$/i, "maj11"],
  [/^m11$/i, "m11"],
  [/^min11$/i, "m11"],
  [/^11$/i, "11"],
  [/^maj9$/i, "maj9"],
  [/^M9$/i, "maj9"],
  [/^9M$/i, "maj9"],
  [/^m9$/i, "m9"],
  [/^min9$/i, "m9"],
  [/^9$/i, "9"],
  [/^add13$/i, "add13"],
  [/^add11$/i, "add11"],
  [/^add9$/i, "add9"],
  [/^6\/9$/i, "69"],
  [/^69$/i, "69"],
  [/^m6$/i, "m6"],
  [/^min6$/i, "m6"],
  [/^-6$/i, "m6"],
  [/^6$/i, "6"],
  [/^7sus4$/i, "7sus4"],
  [/^sus4$/i, "sus4"],
  [/^sus2$/i, "sus2"],
  [/^sus$/i, "sus4"],
  [/^dim7$/i, "dim7"],
  [/^°7$/i, "dim7"],
  [/^o7$/i, "dim7"],
  [/^m\(maj7\)$/i, "mmaj7"],
  [/^mmaj7$/i, "mmaj7"],
  [/^mMaj7$/i, "mmaj7"],
  [/^m7$/i, "m7"],
  [/^min7$/i, "m7"],
  [/^-7$/i, "m7"],
  [/^maj7$/i, "maj7"],
  [/^M7$/i, "maj7"],
  [/^7M$/i, "maj7"],
  [/^Ma7$/i, "maj7"],
  [/^7$/i, "7"],
  [/^dim$/i, "dim"],
  [/^°$/i, "dim"],
  [/^o$/i, "dim"],
  [/^\+$/i, "aug"],
  [/^aug$/i, "aug"],
  [/^m$/i, "m"],
  [/^min$/i, "m"],
  [/^-$/i, "m"],
  [/^maj$/i, "maj"],
  [/^M$/i, "maj"],
  [/^5$/i, "5"],
  [/^$/i, "maj"],
];

const LATIN: [string, number][] = [
  ["Dó#", 1],
  ["Do#", 1],
  ["Réb", 1],
  ["Reb", 1],
  ["Ré#", 3],
  ["Re#", 3],
  ["Mib", 3],
  ["Fá#", 6],
  ["Fa#", 6],
  ["Solb", 6],
  ["Sol#", 8],
  ["Láb", 8],
  ["Lab", 8],
  ["Lá#", 10],
  ["La#", 10],
  ["Sib", 10],
  ["Dó", 0],
  ["Do", 0],
  ["Ré", 2],
  ["Re", 2],
  ["Mi", 4],
  ["Fá", 5],
  ["Fa", 5],
  ["Sol", 7],
  ["Lá", 9],
  ["La", 9],
  ["Si", 11],
].sort((a, b) => b[0].length - a[0].length);

const SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const LATIN_SHARP = ["Dó", "Dó#", "Ré", "Ré#", "Mi", "Fá", "Fá#", "Sol", "Sol#", "Lá", "Lá#", "Si"];
const LATIN_FLAT = ["Dó", "Réb", "Ré", "Mib", "Mi", "Fá", "Solb", "Sol", "Láb", "Lá", "Sib", "Si"];

export function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

function fold(s: string): string {
  return s.toLocaleLowerCase("pt-BR");
}

export type ParseOptions = { german?: boolean };

function parseRoot(input: string, german: boolean): { pc: number; rest: string } | null {
  const folded = fold(input);
  for (const [name, pc] of LATIN) {
    if (folded.startsWith(fold(name))) return { pc, rest: input.slice(name.length) };
  }
  const intl: [string, number][] = [
    ["C#", 1],
    ["Db", 1],
    ["D#", 3],
    ["Eb", 3],
    ["F#", 6],
    ["Gb", 6],
    ["G#", 8],
    ["Ab", 8],
    ["A#", 10],
    ["Bb", 10],
    ["C", 0],
    ["D", 2],
    ["E", 4],
    ["F", 5],
    ["G", 7],
    ["A", 9],
  ];
  if (german) {
    intl.push(["H", 11], ["B", 10]);
  } else {
    intl.push(["B", 11], ["H", 11]);
  }
  intl.sort((a, b) => b[0].length - a[0].length);
  for (const [name, pc] of intl) {
    if (folded.startsWith(fold(name))) return { pc, rest: input.slice(name.length) };
  }
  return null;
}

function normalizeQuality(raw: string): string {
  let q = raw.normalize("NFKC").replace(/\s+/g, "");
  q = q.replace(/[△Δ]/g, "maj");
  q = q.replace(/[º°]/g, "dim");
  q = q.replace(/ø/g, "m7b5");
  q = q.replace(/♭/g, "b").replace(/♯/g, "#");
  q = q.replace(/[−–—]/g, "-");
  q = q.replace(/minor/gi, "m");
  q = q.replace(/major/gi, "maj");
  q = q.replace(/min(?!or)/gi, "m");
  q = q.replace(/augmented/gi, "+");
  q = q.replace(/aug/gi, "+");
  q = q.replace(/diminished/gi, "dim");
  q = q.replace(/suspended/gi, "sus");
  return q;
}

function parseQuality(raw: string): ChordKind | null {
  const q = normalizeQuality(raw);
  for (const [re, kind] of QUALITY) {
    if (re.test(q)) return kind;
  }
  return null;
}

function splitBass(symbol: string): { head: string; bass: string | null } {
  const masked = symbol.replace(/6\/9/gi, "6\u00009");
  const idx = masked.lastIndexOf("/");
  if (idx < 0) return { head: symbol, bass: null };
  const restore = (s: string) => s.replace(/\u0000/g, "/");
  return { head: restore(masked.slice(0, idx)), bass: restore(masked.slice(idx + 1)) };
}

export function parseChord(symbol: string, options: ParseOptions = {}): ParsedChord | null {
  const clean = symbol.normalize("NFKC").trim().replace(/\s+/g, "");
  if (!clean || clean.length > 24) return null;
  const german = options.german ?? false;
  const { head, bass } = splitBass(clean);
  const root = parseRoot(head, german);
  if (!root) return null;
  const kind = parseQuality(root.rest);
  if (!kind) return null;
  let bassPc: number | null = null;
  if (bass) {
    const b = parseRoot(bass, german);
    if (!b || b.rest.length > 0) return null;
    bassPc = b.pc;
  }
  return { root: root.pc, bass: bassPc, kind };
}

const MINORISH = new Set<ChordKind>(["m", "m7", "m6", "m9", "m11", "m13", "m7b5", "mmaj7"]);

export function preferredAccidental(keySymbol: string, german = false): AccidentalPref {
  const parsed = parseChord(keySymbol, { german });
  if (!parsed) return "sharp";
  const head = keySymbol.split("/")[0] ?? keySymbol;
  if (/#|♯/.test(head)) return "sharp";
  if (/(^|[^a-z])[A-G]b|♭/i.test(head) || /^(Réb|Reb|Mib|Solb|Láb|Lab|Sib)/i.test(head)) return "flat";
  const majorRoot = MINORISH.has(parsed.kind) ? mod12(parsed.root + 3) : parsed.root;
  const flatMajors = new Set([5, 10, 3, 8, 1, 6]);
  return flatMajors.has(majorRoot) ? "flat" : "sharp";
}

export function spell(
  pc: number,
  pref: AccidentalPref,
  system: Nomenclature,
): string {
  const n = mod12(pc);
  if (system === "latin") return (pref === "flat" ? LATIN_FLAT : LATIN_SHARP)[n] ?? "Dó";
  if (system === "german") {
    if (n === 11) return "H";
    if (n === 10) return pref === "sharp" ? "A#" : "B";
    return (pref === "flat" ? FLAT : SHARP)[n] ?? "C";
  }
  return (pref === "flat" ? FLAT : SHARP)[n] ?? "C";
}

export function formatChord(
  chord: ParsedChord,
  pref: AccidentalPref,
  system: Nomenclature,
): string {
  const suffix = DISPLAY[chord.kind];
  const head = spell(chord.root, pref, system) + suffix;
  if (chord.bass == null) return head;
  return `${head}/${spell(chord.bass, pref, system)}`;
}

export function formatSymbol(
  symbol: string,
  semitones: number,
  pref: AccidentalPref,
  system: Nomenclature,
): { text: string; parsed: boolean } {
  const parsed = parseChord(symbol, { german: false });
  if (!parsed) return { text: symbol, parsed: false };
  return {
    text: formatChord(
      {
        root: mod12(parsed.root + semitones),
        bass: parsed.bass == null ? null : mod12(parsed.bass + semitones),
        kind: parsed.kind,
      },
      pref,
      system,
    ),
    parsed: true,
  };
}

/** Converte o que o músico digitou para o símbolo armazenado, já descontado o transpose da tela. */
export function storeSymbol(
  typed: string,
  transpose: number,
  pref: AccidentalPref,
  system: Nomenclature,
): string {
  const parsed = parseChord(typed, { german: system === "german" });
  if (!parsed) return typed.trim();
  return formatChord(
    {
      root: mod12(parsed.root - transpose),
      bass: parsed.bass == null ? null : mod12(parsed.bass - transpose),
      kind: parsed.kind,
    },
    pref,
    "international",
  );
}

export function transposeSymbol(
  symbol: string,
  semitones: number,
  pref: AccidentalPref,
  system: Nomenclature,
): string {
  return formatSymbol(symbol, semitones, pref, system).text;
}

export function resolvePreference(
  mode: "auto" | AccidentalPref,
  keySymbol: string,
  german: boolean,
): AccidentalPref {
  if (mode === "sharp" || mode === "flat") return mode;
  return preferredAccidental(keySymbol, german);
}

export type RecognizeStatus = "empty" | "note" | "chord" | "incomplete" | "ambiguous";

export type RecognizeResult = {
  status: RecognizeStatus;
  name: string | null;
  notes: string[];
  root: string | null;
  bass: string | null;
  alternatives: string[];
  detail: string;
};

export function midiToName(note: number, pref: AccidentalPref, system: Nomenclature): string {
  const pc = mod12(note);
  const oct = Math.floor(note / 12) - 1;
  return `${spell(pc, pref, system)}${oct}`;
}

export function recognizeChord(
  midis: number[],
  pref: AccidentalPref,
  system: Nomenclature,
): RecognizeResult {
  const unique = [...new Set(midis)].sort((a, b) => a - b);
  const notes = unique.map((n) => midiToName(n, pref, system));
  if (unique.length === 0) {
    return {
      status: "empty",
      name: null,
      notes: [],
      root: null,
      bass: null,
      alternatives: [],
      detail: "Nenhuma nota",
    };
  }
  const pcs = [...new Set(unique.map((n) => mod12(n)))];
  const bassPc = mod12(unique[0]!);
  if (pcs.length === 1) {
    const name = spell(pcs[0]!, pref, system);
    return {
      status: "note",
      name,
      notes,
      root: name,
      bass: name,
      alternatives: [],
      detail: "Nota isolada",
    };
  }

  type Hit = {
    score: number;
    root: number;
    kind: ChordKind;
    missing: number;
    extra: number;
  };
  const hits: Hit[] = [];
  const pcSet = new Set(pcs);
  for (const root of pcs) {
    for (const tpl of T) {
      if (!tpl.detect) continue;
      const missing = tpl.required.filter((i) => !pcSet.has(mod12(root + i)));
      if (missing.length) continue;
      const optionalMissing = tpl.intervals.filter(
        (i) => !tpl.required.includes(i) && !pcSet.has(mod12(root + i)),
      );
      const extraPcs = pcs.filter(
        (pc) => !tpl.intervals.some((i) => mod12(root + i) === pc),
      );
      if (extraPcs.length > 0 && tpl.kind !== "5") continue;
      let score = tpl.intervals.length * 10 - optionalMissing.length * 3 - extraPcs.length * 5;
      if (bassPc === root) score += 3;
      if (optionalMissing.length === 0 && extraPcs.length === 0) score += 6;
      if (tpl.kind === "5" && pcs.length > 2) score -= 20;
      hits.push({
        score,
        root,
        kind: tpl.kind,
        missing: optionalMissing.length,
        extra: extraPcs.length,
      });
    }
  }
  hits.sort((a, b) => b.score - a.score || a.missing - b.missing);
  if (!hits.length) {
    return {
      status: "ambiguous",
      name: null,
      notes,
      root: null,
      bass: spell(bassPc, pref, system),
      alternatives: [],
      detail: "Combinação sem nome seguro",
    };
  }
  const complete = hits.filter((h) => h.missing === 0 && h.extra === 0);
  const pool = complete.length ? complete : hits;
  pool.sort((a, b) => b.score - a.score);
  const nameOf = (h: Hit) =>
    formatChord(
      {
        root: h.root,
        bass: bassPc === h.root ? null : bassPc,
        kind: h.kind,
      },
      pref,
      system,
    );
  const top = pool[0]!;
  const rival = pool.find((h) => nameOf(h) !== nameOf(top));
  const bassDecides = rival && bassPc === top.root && bassPc !== rival.root && top.score >= rival.score - 2;
  if (rival && !bassDecides && top.score - rival.score < 4) {
    return {
      status: "ambiguous",
      name: null,
      notes,
      root: null,
      bass: spell(bassPc, pref, system),
      alternatives: [nameOf(top), nameOf(rival)],
      detail: "Ambíguo",
    };
  }
  const incomplete = top.missing > 0 || top.kind === "5";
  return {
    status: incomplete ? "incomplete" : "chord",
    name: nameOf(top),
    notes,
    root: spell(top.root, pref, system),
    bass: spell(bassPc, pref, system),
    alternatives: [],
    detail: incomplete ? "Incompleto" : "Reconhecido",
  };
}

export function intervalsOf(kind: ChordKind): number[] {
  return BY_KIND.get(kind)?.intervals ?? [];
}
