import { formatSymbol, resolvePreference, type AccidentalPref } from "@/lib/stage/chords";
import type { ChordMark, Nomenclature, Song } from "@/lib/stage/types";
import { useStage } from "./provider";

export function spellFor(song: Song, accidental: "auto" | AccidentalPref, system: Nomenclature) {
  return resolvePreference(accidental, song.originalKey, system === "german");
}

export function showSymbol(
  symbol: string,
  semitones: number,
  pref: AccidentalPref,
  system: Nomenclature,
) {
  return formatSymbol(symbol, semitones, pref, system);
}

export function ChordLine({
  text,
  chords,
  semitones,
  pref,
  system,
}: {
  text: string;
  chords: ChordMark[];
  semitones: number;
  pref: AccidentalPref;
  system: Nomenclature;
}) {
  if (!text.trim() && chords.length) {
    return (
      <div className="flex flex-wrap gap-3 font-mono text-stage-accent">
        {chords.map((chord) => {
          const shown = showSymbol(chord.symbol, semitones, pref, system);
          return (
            <span key={chord.id} className={shown.parsed ? "" : "text-stage-warn"}>
              {shown.text}
            </span>
          );
        })}
      </div>
    );
  }
  const cuts = [...new Set([0, ...chords.map((c) => Math.max(0, Math.min(c.at, text.length))), text.length])].sort(
    (a, b) => a - b,
  );
  return (
    <p className="leading-tight">
      {cuts.slice(0, -1).map((start, index) => {
        const end = cuts[index + 1] ?? text.length;
        const slice = text.slice(start, end);
        const here = chords.filter((c) => Math.max(0, Math.min(c.at, text.length)) === start);
        const label = here
          .map((c) => showSymbol(c.symbol, semitones, pref, system))
          .map((c) => c.text)
          .join(" ");
        const warn = here.some((c) => !showSymbol(c.symbol, semitones, pref, system).parsed);
        return (
          <span key={`${start}-${end}`} className="mr-px inline-block align-bottom">
            <span className={`block min-h-[1.15em] font-mono text-stage-accent ${warn ? "text-stage-warn" : ""}`}>
              {label || "\u00a0"}
            </span>
            <span>{slice || "\u00a0"}</span>
          </span>
        );
      })}
    </p>
  );
}

export function useSongSpell(song: Song | null) {
  const { data, api } = useStage();
  if (!song) return { pref: "sharp" as const, system: data.settings.nomenclature, semitones: 0, key: "—" };
  const pref = spellFor(song, data.settings.accidental, data.settings.nomenclature);
  const semitones = api.effectiveTranspose(song);
  const key = showSymbol(song.originalKey || "C", semitones, pref, data.settings.nomenclature).text;
  return { pref, system: data.settings.nomenclature, semitones, key };
}
