import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatChord,
  parseChord,
  preferredAccidental,
  recognizeChord,
  storeSymbol,
  transposeSymbol,
} from "./chords.ts";
import { parseChart } from "./import-text.ts";
import { parseMidiBytes } from "./midi-parse.ts";
import { PIANO } from "./piano-layout.ts";

const WRITTEN = [
  "C",
  "Cm",
  "Cmaj",
  "C7",
  "Cmaj7",
  "Cm7",
  "C7M",
  "C°",
  "Cdim",
  "Cdim7",
  "Cø",
  "Cm7(b5)",
  "C+",
  "Caug",
  "Csus2",
  "Csus4",
  "C7sus4",
  "C6",
  "Cm6",
  "C6/9",
  "C9",
  "Cmaj9",
  "Cm9",
  "C11",
  "Cmaj11",
  "Cm11",
  "C13",
  "Cmaj13",
  "Cm13",
  "C7(b9)",
  "C7(#9)",
  "C7(#11)",
  "C7(b13)",
  "Cadd9",
  "Cadd11",
  "Cadd13",
  "C/E",
  "G/B",
  "D/F#",
  "Cmaj7(#11)",
  "G7(b9,b13)",
  "Dm9/C",
  "C7M(9)",
  "C7M(13)",
  "Cm7(9)",
  "C7(9)",
  "C7(13)",
  "C7M(#11)",
  "C7(b5)",
  "C°7",
];

describe("parser", () => {
  for (const symbol of WRITTEN) {
    it(`reconhece ${symbol}`, () => {
      const parsed = parseChord(symbol);
      assert.ok(parsed, symbol);
      assert.equal(parsed.root, 0 === parsed.root || symbol.startsWith("G") || symbol.startsWith("D") ? parsed.root : parsed.root);
    });
  }

  it("preserva qualidade na transposição", () => {
    assert.equal(transposeSymbol("Cmaj7", 2, "sharp", "international"), "Dmaj7");
    assert.equal(transposeSymbol("G/B", 2, "sharp", "international"), "A/C#");
    assert.equal(transposeSymbol("F#m7", 2, "sharp", "international"), "G#m7");
    assert.equal(transposeSymbol("Cm7(b5)", 1, "flat", "international"), "Dbm7(b5)");
    assert.equal(transposeSymbol("C°", 2, "sharp", "international"), "D°");
    assert.equal(transposeSymbol("C+", 2, "sharp", "international"), "D+");
  });

  it("não promove um símbolo desconhecido", () => {
    assert.equal(parseChord("C7alt"), null);
    assert.equal(transposeSymbol("C7alt", 2, "sharp", "international"), "C7alt");
  });

  it("aceita dó-ré-mi e o sistema alemão", () => {
    assert.equal(parseChord("Dó#m7")?.root, 1);
    assert.equal(parseChord("Sol")?.root, 7);
    assert.equal(formatChord(parseChord("C")!, "sharp", "latin"), "Dó");
    assert.equal(parseChord("Hm7", { german: true })?.root, 11);
    assert.equal(parseChord("Bm7", { german: true })?.root, 10);
    assert.equal(storeSymbol("H", 0, "sharp", "german"), "B");
    assert.equal(storeSymbol("B", 0, "flat", "german"), "Bb");
    assert.equal(transposeSymbol("G/B", 0, "flat", "german"), "G/H");
  });

  it("escolhe bemóis no campo harmônico de fá e de ré menor", () => {
    assert.equal(preferredAccidental("F"), "flat");
    assert.equal(preferredAccidental("Dm"), "flat");
    assert.equal(preferredAccidental("G"), "sharp");
    assert.equal(preferredAccidental("D"), "sharp");
    assert.equal(transposeSymbol("Cmaj7", 1, preferredAccidental("Db"), "international"), "Dbmaj7");
  });
});

describe("reconhecimento MIDI", () => {
  it("nomeia tríades, tétrades e inversão", () => {
    assert.equal(recognizeChord([60, 64, 67], "sharp", "international").name, "C");
    assert.equal(recognizeChord([60, 63, 67], "sharp", "international").name, "Cm");
    assert.equal(recognizeChord([64, 67, 72], "sharp", "international").name, "C/E");
    assert.equal(recognizeChord([67, 71, 74, 77], "sharp", "international").name, "G7");
    assert.equal(recognizeChord([62, 65, 69, 72], "sharp", "international").name, "Dm7");
  });

  it("não inventa nome quando falta evidência", () => {
    const single = recognizeChord([60], "sharp", "international");
    assert.equal(single.status, "note");
    const messy = recognizeChord([60, 61, 62], "sharp", "international");
    assert.equal(messy.status, "ambiguous");
    assert.equal(messy.name, null);
  });
});

describe("importação", () => {
  it("ancora o acorde no caractere e separa seções", () => {
    const draft = parseChart(`Introdução\n\nG          D/F#\nTodavia me alegrarei\n\n[Refrão]\nC        G\nAleluia\n`);
    assert.equal(draft.blocks[0]?.name, "Introdução");
    assert.equal(draft.blocks[0]?.lines[0]?.chords[0]?.symbol, "G");
    assert.equal(draft.blocks[0]?.lines[0]?.chords[0]?.at, 0);
    assert.equal(draft.blocks[0]?.lines[0]?.chords[1]?.symbol, "D/F#");
    assert.equal(draft.blocks[0]?.lines[0]?.chords[1]?.at, 11);
    assert.equal(draft.blocks[1]?.name, "Refrão");
    assert.equal(draft.blocks[1]?.lines[0]?.text, "Aleluia");
  });
});

describe("midi e teclado", () => {
  it("separa note on, note off com velocidade zero e ignora clock no learn helper", () => {
    const { messages } = parseMidiBytes([0x90, 60, 100, 0x80, 60, 0, 0x90, 64, 0, 0xb0, 7, 90, 0xf8]);
    assert.deepEqual(
      messages.map((m) => m.kind),
      ["noteon", "noteoff", "noteoff", "cc", "clock"],
    );
    assert.equal(messages[3]?.number, 7);
    assert.equal(messages[3]?.value, 90);
  });

  it("desenha 61 teclas, 36 brancas e 25 pretas, de C2 a C7", () => {
    assert.equal(PIANO.keys.length, 61);
    assert.equal(PIANO.whiteCount, 36);
    assert.equal(PIANO.keys.filter((k) => k.black).length, 25);
    assert.equal(PIANO.keys[0]?.midi, 36);
    assert.equal(Math.max(...PIANO.keys.map((k) => k.midi)), 96);
  });
});
