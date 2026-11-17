/** Geometria de um teclado real de 61 teclas, de C2 (36) a C7 (96). */

export const PIANO_START = 36;
export const PIANO_END = 96;
export const WHITE_W = 100;
export const BLACK_W = 58;
export const WHITE_H = 230;
export const BLACK_H = 146;

const BLACK_PC = new Set([1, 3, 6, 8, 10]);

/** Deslocamento da borda esquerda da tecla preta, em larguras de tecla branca, a partir do Dó da oitava. */
const BLACK_LEFT: Record<number, number> = {
  1: 0.6,
  3: 1.68,
  6: 3.52,
  8: 4.58,
  10: 5.66,
};

export type KeyGeom = {
  midi: number;
  black: boolean;
  x: number;
  w: number;
  h: number;
};

export function isBlackKey(midi: number): boolean {
  return BLACK_PC.has(((midi % 12) + 12) % 12);
}

export function buildPiano(): { keys: KeyGeom[]; width: number; height: number; whiteCount: number } {
  const whites: KeyGeom[] = [];
  const blacks: KeyGeom[] = [];
  const whiteAtC = new Map<number, number>();
  let whiteIndex = 0;
  for (let midi = PIANO_START; midi <= PIANO_END; midi += 1) {
    if (isBlackKey(midi)) continue;
    if (midi % 12 === 0) whiteAtC.set(midi, whiteIndex);
    whites.push({
      midi,
      black: false,
      x: whiteIndex * WHITE_W,
      w: WHITE_W - 3,
      h: WHITE_H,
    });
    whiteIndex += 1;
  }
  for (let midi = PIANO_START; midi <= PIANO_END; midi += 1) {
    if (!isBlackKey(midi)) continue;
    const pc = midi % 12;
    const c = midi - pc;
    const origin = whiteAtC.get(c);
    if (origin == null || BLACK_LEFT[pc] == null) continue;
    blacks.push({
      midi,
      black: true,
      x: (origin + BLACK_LEFT[pc]!) * WHITE_W,
      w: BLACK_W,
      h: BLACK_H,
    });
  }
  return {
    keys: [...whites, ...blacks],
    width: whiteIndex * WHITE_W,
    height: WHITE_H,
    whiteCount: whiteIndex,
  };
}

export const PIANO = buildPiano();
