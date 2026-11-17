/** Modelo de dados do STAGE. Tudo que o músico cria fica no aparelho. */

export type BlockKind =
  | "intro"
  | "verse"
  | "pre"
  | "chorus"
  | "bridge"
  | "interlude"
  | "ending"
  | "custom";

export type ChordMark = {
  id: string;
  /** Índice do caractere da letra onde o acorde apoia. */
  at: number;
  /** Símbolo como escrito. A transposição é calculada na exibição. */
  symbol: string;
};

export type LyricLine = {
  id: string;
  text: string;
  chords: ChordMark[];
};

export type SongBlock = {
  id: string;
  kind: BlockKind;
  name: string;
  lines: LyricLine[];
};

export type Song = {
  id: string;
  title: string;
  artist: string;
  originalKey: string;
  /** Semitons aplicados sobre o tom original. */
  transpose: number;
  bpm: number | null;
  category: string;
  tags: string[];
  notes: string;
  sceneId: string | null;
  blocks: SongBlock[];
  favorite: boolean;
  pinnedBlockId: string | null;
  pdfFileId: string | null;
  pdfName: string | null;
  createdAt: number;
  updatedAt: number;
};

export type SetlistItem = {
  id: string;
  songId: string;
  note: string;
};

export type Setlist = {
  id: string;
  name: string;
  eventDate: string;
  items: SetlistItem[];
  createdAt: number;
  updatedAt: number;
};

export type Timbre = {
  id: string;
  name: string;
  category: string;
  bankMsb: number | null;
  bankLsb: number | null;
  program: number | null;
  channel: number;
  description: string;
  favorite: boolean;
  sceneId: string | null;
  notes: string;
  updatedAt: number;
};

export type Scene = {
  id: string;
  name: string;
  songName: string;
  key: string;
  bpm: number | null;
  bankMsb: number | null;
  bankLsb: number | null;
  /** Program Change 0–127. Vazio = não enviar. */
  program: number | null;
  /** Canal 0–15. */
  channel: number;
  timbreIds: string[];
  notes: string;
  favorite: boolean;
  updatedAt: number;
};

export type PadAction =
  | "none"
  | "next-section"
  | "prev-section"
  | "scroll-toggle"
  | "tap"
  | "panic"
  | "next-song"
  | "prev-song"
  | "metronome"
  | "scene-send";

export type Curve = "linear" | "log" | "exp";

export type MidiBinding = {
  slot: string;
  message: "cc" | "note" | "pitchbend" | "pressure" | null;
  channel: number | null;
  number: number | null;
  min: number;
  max: number;
  invert: boolean;
  curve: Curve;
  action: PadAction;
  updatedAt: number;
};

export type MidiProfile = {
  id: string;
  name: string;
  /** Dica opcional. O mapeamento não depende do nome da porta. */
  portHint: string;
  channel: number;
  bindings: MidiBinding[];
  updatedAt: number;
};

export type Nomenclature = "international" | "latin" | "german";
export type Density = "regular" | "compact";
export type PerformanceMode = "culto" | "ensaio" | "estudo" | "apresentacao" | "pessoal";

export type Settings = {
  nomenclature: Nomenclature;
  accidental: "auto" | "sharp" | "flat";
  fontScale: number;
  density: Density;
  stageFont: number;
  scrollSpeed: number;
  metronomeVolume: number;
  metroBeats: number;
  metroSubdivision: 1 | 2 | 3 | 4;
  midiInId: string | null;
  midiOutId: string | null;
  midiChannel: number;
  sendVirtualNotes: boolean;
  panicExplained: boolean;
  midiUnlocked: boolean;
  performanceMode: PerformanceMode;
  monitorShowClock: boolean;
};

export type ActiveState = {
  setlistId: string | null;
  setlistIndex: number;
  sceneId: string | null;
  profileId: string;
  songId: string | null;
  recentSongIds: string[];
  sectionIndex: number;
  pinnedBlockId: string | null;
};

export type StageData = {
  songs: Song[];
  setlists: Setlist[];
  scenes: Scene[];
  timbres: Timbre[];
  profiles: MidiProfile[];
  settings: Settings;
  active: ActiveState;
};

export const TIMBRE_CATEGORIES = [
  "Piano",
  "Piano elétrico",
  "Órgão",
  "Strings",
  "Pads",
  "Synth",
  "Brass",
  "Guitarra",
  "Baixo",
  "Acordeon",
  "Outros",
] as const;

export const BLOCK_PRESETS: { kind: BlockKind; name: string }[] = [
  { kind: "intro", name: "Introdução" },
  { kind: "verse", name: "Estrofe" },
  { kind: "pre", name: "Pré-refrão" },
  { kind: "chorus", name: "Refrão" },
  { kind: "bridge", name: "Ponte" },
  { kind: "interlude", name: "Interlúdio" },
  { kind: "ending", name: "Final" },
  { kind: "custom", name: "Bloco" },
];

export const PAD_ACTIONS: { id: PadAction; label: string }[] = [
  { id: "none", label: "Nenhuma" },
  { id: "next-section", label: "Próxima seção" },
  { id: "prev-section", label: "Seção anterior" },
  { id: "scroll-toggle", label: "Pausar rolagem" },
  { id: "tap", label: "TAP tempo" },
  { id: "next-song", label: "Próxima música" },
  { id: "prev-song", label: "Música anterior" },
  { id: "metronome", label: "Metrônomo" },
  { id: "scene-send", label: "Enviar cena" },
  { id: "panic", label: "Pânico MIDI" },
];

export const APP_VERSION = "1.0.0";

export function uid(): string {
  return crypto.randomUUID();
}

export function emptyBinding(slot: string, action: PadAction = "none"): MidiBinding {
  return {
    slot,
    message: null,
    channel: null,
    number: null,
    min: 0,
    max: 127,
    invert: false,
    curve: "linear",
    action,
    updatedAt: 0,
  };
}

export function defaultBindings(): MidiBinding[] {
  return [
    ...[1, 2, 3, 4].map((n) => emptyBinding(`fader-${n}`)),
    ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => emptyBinding(`pad-${n}`)),
  ];
}

export function defaultSettings(): Settings {
  return {
    nomenclature: "international",
    accidental: "auto",
    fontScale: 1,
    density: "regular",
    stageFont: 22,
    scrollSpeed: 28,
    metronomeVolume: 0.6,
    metroBeats: 4,
    metroSubdivision: 1,
    midiInId: null,
    midiOutId: null,
    midiChannel: 0,
    sendVirtualNotes: false,
    panicExplained: false,
    midiUnlocked: false,
    performanceMode: "culto",
    monitorShowClock: false,
  };
}

export function defaultProfile(): MidiProfile {
  return {
    id: "profile-main",
    name: "Perfil principal",
    portHint: "",
    channel: 0,
    bindings: defaultBindings(),
    updatedAt: 0,
  };
}

export function emptyData(): StageData {
  const profile = defaultProfile();
  return {
    songs: [],
    setlists: [],
    scenes: [],
    timbres: [],
    profiles: [profile],
    settings: defaultSettings(),
    active: {
      setlistId: null,
      setlistIndex: 0,
      sceneId: null,
      profileId: profile.id,
      songId: null,
      recentSongIds: [],
      sectionIndex: 0,
      pinnedBlockId: null,
    },
  };
}

export function emptyLine(): LyricLine {
  return { id: uid(), text: "", chords: [] };
}

export function emptyBlock(preset?: { kind: BlockKind; name: string }): SongBlock {
  const p = preset ?? { kind: "verse", name: "Estrofe" };
  return { id: uid(), kind: p.kind, name: p.name, lines: [emptyLine()] };
}

export function blankSong(): Song {
  const now = Date.now();
  return {
    id: uid(),
    title: "",
    artist: "",
    originalKey: "C",
    transpose: 0,
    bpm: null,
    category: "",
    tags: [],
    notes: "",
    sceneId: null,
    blocks: [emptyBlock({ kind: "verse", name: "Estrofe" })],
    favorite: false,
    pinnedBlockId: null,
    pdfFileId: null,
    pdfName: null,
    createdAt: now,
    updatedAt: now,
  };
}
