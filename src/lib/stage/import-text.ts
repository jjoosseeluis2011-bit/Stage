/**
 * Converte texto de cifra (acordes acima da letra ou ChordPro) em blocos.
 * O índice do acorde é um caractere da letra, não uma coluna de espaços.
 */
import { parseChord } from "./chords.ts";
import { emptyBlock, uid, type BlockKind, type Song, type SongBlock } from "./types.ts";

export type ImportIssue = {
  line: number;
  token: string;
  reason: string;
};

export type ImportDraft = {
  title: string;
  artist: string;
  originalKey: string;
  blocks: SongBlock[];
  issues: ImportIssue[];
};

const HEADERS: [RegExp, BlockKind, string][] = [
  [/^(intro|introdução|introducao)$/i, "intro", "Introdução"],
  [/^(verso|estrofe|verse|strophe)$/i, "verse", "Estrofe"],
  [/^(pré-refrão|pre-refrão|pre-refrao|pre refrão|pre-chorus|prechorus)$/i, "pre", "Pré-refrão"],
  [/^(refrão|refrao|coro|chorus)$/i, "chorus", "Refrão"],
  [/^(ponte|bridge)$/i, "bridge", "Ponte"],
  [/^(interlúdio|interludio|interlude|solo|riff)$/i, "interlude", "Interlúdio"],
  [/^(final|fim|outro|ending|coda)$/i, "ending", "Final"],
];

function headerOf(line: string): { kind: BlockKind; name: string } | null {
  const trimmed = line.trim();
  const bracket = trimmed.match(/^\[(.+)]$/);
  const label = (bracket?.[1] ?? trimmed).replace(/:$/, "").trim();
  if (!label || label.length > 40) return null;
  if (!bracket && label !== trimmed.replace(/:$/, "").trim()) return null;
  if (!bracket && /\s/.test(label) && !HEADERS.some(([re]) => re.test(label))) return null;
  for (const [re, kind, name] of HEADERS) {
    if (re.test(label)) return { kind, name };
  }
  if (bracket) return { kind: "custom", name: label };
  if (HEADERS.some(([re]) => re.test(label))) return null;
  return null;
}

function tokensOf(line: string): { token: string; col: number }[] {
  const out: { token: string; col: number }[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) out.push({ token: m[0], col: m.index });
  return out;
}

function isAnnotation(token: string): boolean {
  return /^(n\.?c\.?|%|×|x)$/i.test(token);
}

export function isChordToken(token: string, german: boolean): boolean {
  if (isAnnotation(token)) return true;
  return parseChord(token, { german }) != null;
}

function looksChordy(token: string): boolean {
  return /^[A-GH][#b♯♭]?/i.test(token) && /[0-9#♯b♭°ø+/]/.test(token);
}

export function parseChart(text: string, german = false): ImportDraft {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const issues: ImportIssue[] = [];
  let title = "";
  let artist = "";
  let originalKey = "";
  const blocks: SongBlock[] = [];
  let current: SongBlock | null = null;
  let pending: { token: string; col: number }[] | null = null;

  const ensure = () => {
    if (!current) {
      current = { id: uid(), kind: "verse", name: "Estrofe", lines: [] };
      blocks.push(current);
    }
    return current;
  };

  const flushPending = () => {
    if (!pending?.length) {
      pending = null;
      return;
    }
    const block = ensure();
    block.lines.push({
      id: uid(),
      text: "",
      chords: pending.map((t) => ({
        id: uid(),
        at: 0,
        symbol: isAnnotation(t.token) ? t.token : t.token,
      })),
    });
    const instrumental = block.lines[block.lines.length - 1];
    if (instrumental) {
      instrumental.chords = pending.map((t, index) => ({
        id: uid(),
        at: index,
        symbol: t.token,
      }));
    }
    pending = null;
  };

  lines.forEach((raw, index) => {
    const lineNo = index + 1;
    const trimmed = raw.trim();
    if (!trimmed) {
      flushPending();
      return;
    }
    const meta = trimmed.match(/^\{(?:title|t):\s*(.+)\}$/i);
    if (meta?.[1]) {
      title = meta[1].trim();
      return;
    }
    const artistMeta = trimmed.match(/^\{(?:artist|a):\s*(.+)\}$/i);
    if (artistMeta?.[1]) {
      artist = artistMeta[1].trim();
      return;
    }
    const keyMeta = trimmed.match(/^\{(?:key|k):\s*(.+)\}$/i);
    if (keyMeta?.[1]) {
      originalKey = keyMeta[1].trim();
      return;
    }
    const header = headerOf(trimmed);
    if (header) {
      flushPending();
      current = { id: uid(), kind: header.kind, name: header.name, lines: [] };
      blocks.push(current);
      return;
    }
    const tokens = tokensOf(raw);
    const chordLine = tokens.length > 0 && tokens.every((t) => isChordToken(t.token, german));
    if (chordLine) {
      if (pending) flushPending();
      pending = tokens;
      tokens.forEach((t) => {
        if (!isAnnotation(t.token) && !parseChord(t.token, { german })) {
          issues.push({ line: lineNo, token: t.token, reason: "Acorde não interpretado" });
        }
      });
      return;
    }
    tokens.forEach((t) => {
      if (looksChordy(t.token) && !parseChord(t.token, { german }) && !isAnnotation(t.token)) {
        issues.push({
          line: lineNo,
          token: t.token,
          reason: "Parece um acorde, mas não entrou na gramática. Revise antes de salvar.",
        });
      }
    });
    const block = ensure();
    if (pending) {
      block.lines.push({
        id: uid(),
        text: raw.trimEnd(),
        chords: pending.map((t) => ({
          id: uid(),
          at: Math.min(t.col, raw.trimEnd().length),
          symbol: t.token,
        })),
      });
      pending = null;
    } else {
      block.lines.push({ id: uid(), text: raw.trimEnd(), chords: [] });
    }
  });
  flushPending();

  const usable = blocks.filter((b) => b.lines.length > 0);
  if (!title) {
    const first = lines.map((l) => l.trim()).find((l) => l && !headerOf(l) && !tokensOf(l).every((t) => isChordToken(t.token, german)));
    title = first && first.length < 80 ? first : "";
  }
  return {
    title,
    artist,
    originalKey: originalKey || "C",
    blocks: usable.length ? usable : [emptyBlock()],
    issues,
  };
}

export function draftToSong(draft: ImportDraft, base: Song): Song {
  return {
    ...base,
    title: draft.title || base.title,
    artist: draft.artist || base.artist,
    originalKey: draft.originalKey || base.originalKey,
    blocks: draft.blocks,
    updatedAt: Date.now(),
  };
}
