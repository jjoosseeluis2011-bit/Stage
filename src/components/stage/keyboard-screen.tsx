import { useSyncExternalStore, useState } from "react";
import { toast } from "sonner";
import { recognizeChord } from "@/lib/stage/chords";
import {
  bindingLabel,
  cancelLearn,
  chooseLearn,
  curveLabel,
  getPerf,
  getServerPerf,
  getStatus,
  getServerStatus,
  selectInput,
  selectOutput,
  setFader,
  simulateIncoming,
  startLearn,
  subscribePerf,
  subscribeStatus,
  triggerPad,
  connectMidi,
} from "@/lib/stage/midi-runtime";
import { getMetro, getServerMetro, subscribeMetro } from "@/lib/stage/audio";
import { PAD_ACTIONS, type Curve } from "@/lib/stage/types";
import { activeProfile, activeSong, useStage } from "./provider";
import { Piano } from "./piano";
import { Btn } from "./ui";
import { useSongSpell } from "./chord-line";

export function KeyboardScreen({ onOpenSong }: { onOpenSong: (id: string) => void }) {
  const { data, api, session } = useStage();
  const perf = useSyncExternalStore(subscribePerf, getPerf, getServerPerf);
  const status = useSyncExternalStore(subscribeStatus, getStatus, getServerStatus);
  const metro = useSyncExternalStore(subscribeMetro, getMetro, getServerMetro);
  const song = activeSong(data);
  const spell = useSongSpell(song);
  const profile = activeProfile(data);
  const scene = data.scenes.find((s) => s.id === (song?.sceneId ?? data.active.sceneId)) ?? null;
  const pref = spell.pref;
  const chord = recognizeChord(
    perf.notes.map((n) => n.midi),
    pref,
    data.settings.nomenclature,
  );
  const bpm = api.effectiveBpm(song);

  return (
    <div className="kb">
      <section className="kb-tools">
        <div className="grid grid-cols-4 gap-2">
          {profile.bindings
            .filter((b) => b.slot.startsWith("fader-"))
            .map((binding, index) => (
              <div key={binding.slot} className="grid gap-2 rounded-xl border border-stage-line bg-stage-panel p-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs tracking-widest text-stage-muted uppercase">Fader {index + 1}</p>
                  <span className="font-mono text-sm">{perf.faders[index] ?? 0}</span>
                </div>
                <input
                  className="fader"
                  type="range"
                  min={0}
                  max={127}
                  value={perf.faders[index] ?? 0}
                  aria-label={`Fader ${index + 1}`}
                  onChange={(event) => {
                    setFader(index, Number(event.target.value));
                  }}
                />
                <p className="truncate font-mono text-xs text-stage-info">{bindingLabel(binding)}</p>
                <div className="flex gap-1">
                  <Btn className="min-h-11 flex-1 px-2" onClick={() => startLearn(binding.slot)}>
                    Mapear
                  </Btn>
                  <Btn className="min-h-11 px-2" onClick={() => api.clearBinding(binding.slot)}>
                    Limpar
                  </Btn>
                </div>
                <details className="text-xs text-stage-muted">
                  <summary className="cursor-pointer">Curva e faixa</summary>
                  <div className="mt-2 grid gap-2">
                    <label className="flex items-center justify-between gap-2">
                      Inverter
                      <input
                        type="checkbox"
                        checked={binding.invert}
                        onChange={(event) => api.updateBinding(binding.slot, { invert: event.target.checked })}
                      />
                    </label>
                    <select
                      className="h-11 rounded-lg border border-stage-line bg-stage-bg px-2"
                      value={binding.curve}
                      onChange={(event) => api.updateBinding(binding.slot, { curve: event.target.value as Curve })}
                    >
                      <option value="linear">Linear</option>
                      <option value="log">Log</option>
                      <option value="exp">Exp</option>
                    </select>
                    <p>
                      {curveLabel(binding.curve)} · {binding.min}–{binding.max}
                    </p>
                    <div className="flex gap-2">
                      <input
                        className="h-11 w-full rounded-lg border border-stage-line bg-stage-bg px-2"
                        type="number"
                        min={0}
                        max={127}
                        value={binding.min}
                        aria-label="Mínimo"
                        onChange={(event) => api.updateBinding(binding.slot, { min: clamp127(event.target.value, 0) })}
                      />
                      <input
                        className="h-11 w-full rounded-lg border border-stage-line bg-stage-bg px-2"
                        type="number"
                        min={0}
                        max={127}
                        value={binding.max}
                        aria-label="Máximo"
                        onChange={(event) => api.updateBinding(binding.slot, { max: clamp127(event.target.value, 127) })}
                      />
                    </div>
                  </div>
                </details>
              </div>
            ))}
        </div>
        <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-8">
          {profile.bindings
            .filter((b) => b.slot.startsWith("pad-"))
            .map((binding, index) => {
              const hot = Date.now() - (perf.padAt[index] ?? 0) < 180;
              return (
                <button
                  key={binding.slot}
                  className={`grid min-h-16 place-items-center rounded-xl border px-1 text-center ${hot ? "border-stage-accent bg-stage-accent text-stage-fg" : "border-stage-line bg-stage-surface"}`}
                  onClick={() => triggerPad(index)}
                >
                  <span className="text-sm font-semibold">Pad {index + 1}</span>
                  <span className="max-w-full truncate font-mono text-xs text-stage-muted">{bindingLabel(binding)}</span>
                </button>
              );
            })}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {profile.bindings
            .filter((b) => b.slot.startsWith("pad-"))
            .map((binding, index) => (
              <div key={`${binding.slot}-cfg`} className="flex items-center gap-1">
                <Btn className="px-2" onClick={() => startLearn(binding.slot)}>
                  Mapear {index + 1}
                </Btn>
                <select
                  className="h-11 rounded-lg border border-stage-line bg-stage-bg px-2 text-sm"
                  value={binding.action}
                  aria-label={`Ação do pad ${index + 1}`}
                  onChange={(event) =>
                    api.updateBinding(binding.slot, { action: event.target.value as (typeof PAD_ACTIONS)[number]["id"] })
                  }
                >
                  {PAD_ACTIONS.map((action) => (
                    <option key={action.id} value={action.id}>
                      {action.label}
                    </option>
                  ))}
                </select>
                <Btn className="px-2" onClick={() => api.clearBinding(binding.slot)}>
                  Limpar
                </Btn>
              </div>
            ))}
        </div>
      </section>

      <section className="kb-chord rounded-2xl border border-stage-line bg-stage-panel p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs tracking-widest text-stage-muted uppercase">Acorde</p>
            <p className="font-mono text-4xl font-semibold sm:text-5xl">{chord.name ?? (chord.status === "empty" ? "—" : "Indefinido")}</p>
            <p className="mt-1 text-sm text-stage-muted">{chord.detail}</p>
          </div>
          <div className="text-right">
            <p className={`font-mono text-sm ${status.connected ? "text-stage-ok" : "text-stage-warn"}`}>
              {status.connected ? "MIDI ligado" : "Sem teclado MIDI"}
            </p>
            <p className="text-xs text-stage-muted">{status.inputs.length ? `${status.inputs.length} entrada(s)` : "Nenhuma porta"}</p>
          </div>
        </div>
        <p className="mt-3 font-mono text-stage-info">{chord.notes.length ? chord.notes.join("  ") : "Toque no teclado virtual ou no instrumento."}</p>
        {chord.root ? (
          <p className="mt-1 text-sm text-stage-muted">
            Fundamental {chord.root}
            {chord.bass && chord.bass !== chord.root ? ` · baixo ${chord.bass}` : ""}
          </p>
        ) : null}
        {chord.alternatives.length ? (
          <p className="mt-1 text-sm text-stage-warn">Hipóteses, não um nome confirmado: {chord.alternatives.join(" ou ")}</p>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <p className="font-mono text-2xl">{bpm ?? "BPM —"}</p>
          <Btn tone="primary" onClick={() => api.tap()}>
            TAP
          </Btn>
          <Btn tone={metro.running ? "ok" : "ghost"} onClick={() => api.toggleMetronome()}>
            {metro.running ? `Metrônomo ${metro.beat + 1}/${metro.beats}` : "Metrônomo"}
          </Btn>
          <Btn onClick={() => api.nudgeTranspose(song?.id ?? "", -1)} disabled={!song}>
            − tom
          </Btn>
          <Btn onClick={() => api.nudgeTranspose(song?.id ?? "", 1)} disabled={!song}>
            + tom
          </Btn>
          <Btn tone="danger" onClick={() => api.requestPanic()}>
            Pânico
          </Btn>
        </div>
        <div className="mt-3 grid gap-1 text-sm text-stage-muted">
          <p>{song ? `${song.title || "Sem título"} · tom ${spell.key}` : "Nenhuma cifra em foco."}</p>
          <p>
            {scene
              ? `Cena ${scene.name}. Enviar não significa que o teclado confirmou.`
              : "Sem cena vinculada. Nada será inventado."}
          </p>
          {session.ensaio ? <p className="text-stage-warn">Modo ensaio: tom e BPM daqui não gravam na cifra.</p> : null}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {song ? (
            <Btn onClick={() => onOpenSong(song.id)}>Abrir cifra</Btn>
          ) : null}
          {scene ? (
            <Btn
              tone="primary"
              onClick={() => {
                void api.sendScene(scene.id).then((message) => toast.message(message));
              }}
            >
              Enviar cena
            </Btn>
          ) : null}
          <Btn
            onClick={() => {
              void connectMidi().then((error) => {
                api.updateSettings({ midiUnlocked: true });
                if (error) toast.error(error);
                else toast.success("Portas MIDI atualizadas.");
              });
            }}
          >
            Conectar MIDI
          </Btn>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={session.ensaio}
              onChange={(event) => api.toggleEnsaio(event.target.checked)}
            />
            Ensaio
          </label>
        </div>
        {perf.learn ? (
          <div className="mt-3 rounded-xl border border-stage-info bg-stage-bg p-3">
            <p className="font-medium text-stage-info">
              Aprendendo {perf.learn.slot.replace("-", " ")}
            </p>
            <p className="text-sm text-stage-muted">{perf.learn.status}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {perf.learn.choices.map((choice) => (
                <Btn key={`${choice.message}-${choice.channel}-${choice.number}`} onClick={() => chooseLearn(choice)}>
                  {choice.message.toUpperCase()} {choice.number} · ch {choice.channel + 1}
                </Btn>
              ))}
              <Btn tone="danger" onClick={() => toast.message(cancelLearn())}>
                Cancelar
              </Btn>
            </div>
          </div>
        ) : null}
        <PortPick statusIn={status.inId} statusOut={status.outId} />
        {status.error ? <p className="mt-2 text-sm text-stage-warn">{status.error}</p> : null}
        <SimBox />
      </section>

      <section className="kb-keys">
        <Piano />
        {perf.sustain ? <p className="mt-1 text-center text-xs text-stage-warn">Sustain ativo</p> : null}
      </section>
    </div>
  );
}

function PortPick({ statusIn, statusOut }: { statusIn: string | null; statusOut: string | null }) {
  const status = useSyncExternalStore(subscribeStatus, getStatus, getServerStatus);
  const { api } = useStage();
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      <select
        className="h-11 rounded-lg border border-stage-line bg-stage-bg px-2"
        value={statusIn ?? ""}
        aria-label="Entrada MIDI"
        onChange={(event) => {
          const id = event.target.value || null;
          selectInput(id);
          api.updateSettings({ midiInId: id });
        }}
      >
        <option value="">Todas as entradas</option>
        {status.inputs.map((port) => (
          <option key={port.id} value={port.id}>
            {port.name}
          </option>
        ))}
      </select>
      <select
        className="h-11 rounded-lg border border-stage-line bg-stage-bg px-2"
        value={statusOut ?? ""}
        aria-label="Saída MIDI"
        onChange={(event) => {
          const id = event.target.value || null;
          selectOutput(id);
          api.updateSettings({ midiOutId: id });
        }}
      >
        <option value="">Saída automática</option>
        {status.outputs.map((port) => (
          <option key={port.id} value={port.id}>
            {port.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function SimBox() {
  const [note, setNote] = useState(60);
  const [cc, setCc] = useState(7);
  const [value, setValue] = useState(80);
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button className="mt-3 text-left text-sm text-stage-muted underline" onClick={() => setOpen(true)}>
        Bancada de simulação — não é o teclado físico
      </button>
    );
  }
  return (
    <div className="mt-3 grid gap-2 rounded-xl border border-dashed border-stage-warn p-3">
      <p className="text-sm text-stage-warn">Simulação local. O monitor marca estes eventos. Nenhum cabo está sendo fingido.</p>
      <div className="flex flex-wrap gap-2">
        <input className="h-11 w-20 rounded-lg border border-stage-line bg-stage-bg px-2" type="number" value={note} onChange={(e) => setNote(Number(e.target.value))} aria-label="Nota simulada" />
        <Btn onClick={() => simulateIncoming([0x90, note, 100])}>Note On</Btn>
        <Btn onClick={() => simulateIncoming([0x80, note, 0])}>Note Off</Btn>
        <input className="h-11 w-16 rounded-lg border border-stage-line bg-stage-bg px-2" type="number" value={cc} onChange={(e) => setCc(Number(e.target.value))} aria-label="CC simulado" />
        <input className="h-11 w-16 rounded-lg border border-stage-line bg-stage-bg px-2" type="number" value={value} onChange={(e) => setValue(Number(e.target.value))} aria-label="Valor simulado" />
        <Btn onClick={() => simulateIncoming([0xb0, cc, value])}>CC</Btn>
        <Btn onClick={() => simulateIncoming([0xb0, 64, 127])}>Sustain</Btn>
        <Btn onClick={() => simulateIncoming([0xb0, 64, 0])}>Sustain off</Btn>
      </div>
    </div>
  );
}

function clamp127(value: string, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(127, Math.round(n)));
}
