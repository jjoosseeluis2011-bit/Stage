import { useSyncExternalStore } from "react";
import { midiToName, resolvePreference } from "@/lib/stage/chords";
import { getPerf, getServerPerf, subscribePerf, virtualNote } from "@/lib/stage/midi-runtime";
import { PIANO } from "@/lib/stage/piano-layout";
import { useStage } from "./provider";

export function Piano() {
  const { data } = useStage();
  const perf = useSyncExternalStore(subscribePerf, getPerf, getServerPerf);
  const active = new Map(perf.notes.map((n) => [n.midi, n.vel]));
  const songKey = data.songs.find((s) => s.id === data.active.songId)?.originalKey ?? "C";
  const pref = resolvePreference(data.settings.accidental, songKey, data.settings.nomenclature === "german");
  return (
    <div className="piano-well">
      <svg
        viewBox={`0 0 ${PIANO.width} ${PIANO.height}`}
        className="h-full w-full touch-none"
        role="group"
        aria-label="Teclado virtual de 61 teclas"
      >
        <defs>
          <linearGradient id="ivory" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#f7f1e6" />
            <stop offset="0.72" stopColor="#e4dccf" />
            <stop offset="1" stopColor="#cfc5b6" />
          </linearGradient>
          <linearGradient id="ebony" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#3a3a40" />
            <stop offset="0.4" stopColor="#121216" />
            <stop offset="1" stopColor="#050506" />
          </linearGradient>
        </defs>
        {PIANO.keys
          .filter((key) => !key.black)
          .map((key) => {
            const vel = active.get(key.midi) ?? 0;
            const name = midiToName(key.midi, pref, data.settings.nomenclature);
            return (
              <g
                key={key.midi}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  virtualNote(key.midi, 104);
                }}
                onPointerUp={() => virtualNote(key.midi, 0)}
                onPointerCancel={() => virtualNote(key.midi, 0)}
              >
                <rect x={key.x} y={0} width={key.w} height={key.h} rx={8} fill="url(#ivory)" />
                <rect x={key.x} y={0} width={key.w} height={18} fill="#ffffff" opacity={0.35} />
                {vel > 0 ? (
                  <rect x={key.x + 6} y={key.h - 78} width={key.w - 12} height={62} rx={8} fill="#FF3038" opacity={0.35 + (vel / 127) * 0.65} />
                ) : null}
                <circle cx={key.x + key.w / 2} cy={key.h - 18} r={7} fill={vel ? "#FF3038" : "#2a2a30"} opacity={vel ? 0.45 + vel / 200 : 0.45} />
                {key.midi % 12 === 0 ? (
                  <text x={key.x + key.w / 2} y={key.h - 36} textAnchor="middle" fontSize={22} fill="#5c564e" fontFamily="IBM Plex Mono, monospace">
                    {name}
                  </text>
                ) : null}
              </g>
            );
          })}
        {PIANO.keys
          .filter((key) => key.black)
          .map((key) => {
            const vel = active.get(key.midi) ?? 0;
            return (
              <g
                key={key.midi}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  event.stopPropagation();
                  virtualNote(key.midi, 108);
                }}
                onPointerUp={() => virtualNote(key.midi, 0)}
                onPointerCancel={() => virtualNote(key.midi, 0)}
              >
                <rect x={key.x} y={0} width={key.w} height={key.h} rx={6} fill="url(#ebony)" />
                <rect x={key.x + 4} y={4} width={key.w - 8} height={10} rx={4} fill="#ffffff" opacity={0.18} />
                {vel > 0 ? <rect x={key.x + 4} y={key.h - 46} width={key.w - 8} height={34} rx={5} fill="#FF3038" opacity={0.55 + vel / 300} /> : null}
              </g>
            );
          })}
      </svg>
    </div>
  );
}
