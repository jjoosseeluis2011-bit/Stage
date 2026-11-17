import { useMemo, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { midiToName } from "@/lib/stage/chords";
import { ccName, kindLabel, type MidiKind } from "@/lib/stage/midi-parse";
import {
  connectMidi,
  getLogs,
  getServerLogs,
  getStatus,
  getServerStatus,
  releaseLocalNotes,
  subscribeLog,
  subscribeStatus,
} from "@/lib/stage/midi-runtime";
import { useStage } from "./provider";
import { Btn, Readout } from "./ui";

const FILTERS: { id: "all" | "notes" | "cc" | "system"; label: string }[] = [
  { id: "all", label: "Tudo" },
  { id: "notes", label: "Notas" },
  { id: "cc", label: "CC" },
  { id: "system", label: "Sistema" },
];

export function MonitorScreen() {
  const { data, api } = useStage();
  const logs = useSyncExternalStore(subscribeLog, getLogs, getServerLogs);
  const status = useSyncExternalStore(subscribeStatus, getStatus, getServerStatus);
  const [paused, setPaused] = useState(false);
  const [frozen, setFrozen] = useState(logs);
  const [dir, setDir] = useState<"all" | "in" | "out">("all");
  const [kind, setKind] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [channel, setChannel] = useState<number | "all">("all");
  const view = paused ? frozen : logs;
  const rows = useMemo(
    () =>
      view.filter((item) => {
        if (dir !== "all" && item.direction !== dir) return false;
        if (channel !== "all" && item.channel !== channel) return false;
        if (kind === "notes" && item.kind !== "noteon" && item.kind !== "noteoff") return false;
        if (kind === "cc" && item.kind !== "cc" && item.kind !== "pc") return false;
        if (kind === "system" && item.channel != null) return false;
        return true;
      }),
    [view, dir, kind, channel],
  );

  return (
    <div className="grid gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs tracking-widest text-stage-muted uppercase">Diagnóstico</p>
          <h1 className="text-2xl font-semibold">Monitor MIDI</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn
            onClick={() => {
              if (!paused) setFrozen(logs);
              setPaused((v) => !v);
            }}
          >
            {paused ? "Continuar" : "Pausar"}
          </Btn>
          <Btn
            onClick={() => {
              setFrozen([]);
              toast.message("A tela foi limpa. O aparelho continua recebendo.");
            }}
          >
            Limpar tela
          </Btn>
          <Btn onClick={() => download("stage-midi-log.json", JSON.stringify(rows, null, 2))}>Exportar</Btn>
          <Btn tone="danger" onClick={() => releaseLocalNotes()}>
            Apagar LEDs presos
          </Btn>
        </div>
      </header>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Readout label="API" value={status.supported ? "Web MIDI" : "Indisponível"} hint={status.secure ? "Contexto seguro" : "Precisa de HTTPS"} />
        <Readout label="Entradas" value={String(status.inputs.length)} hint={status.inId ? "Uma porta filtrada" : "Todas, se conectado"} />
        <Readout label="Saídas" value={String(status.outputs.length)} hint={status.outputs[0]?.name ?? "Nenhuma"} />
        <Readout
          label="Último IN"
          value={status.lastInAt ? new Date(status.lastInAt).toLocaleTimeString() : "—"}
          hint={status.connected ? "Acesso concedido" : "Ainda sem conexão"}
        />
      </div>
      <ul className="grid gap-1 text-sm text-stage-muted">
        <li>{status.supported ? "O navegador oferece MIDI." : "Sem Web MIDI neste navegador. Chrome ou Edge no Android e no Windows."}</li>
        <li>{status.inputs.length ? "Há porta de entrada. Se nada chega, teste o cabo, o canal e se outro app segurou o dispositivo." : "Nenhuma entrada. O cabo, o modo USB ou o Bluetooth podem estar desligados."}</li>
        <li>{status.outputs.length ? "Há saída para Program Change e para os faders mapeados." : "Sem saída: o Stage ouve, mas não envia."}</li>
        <li>Mapeamento atual: {data.profiles.find((p) => p.id === data.active.profileId)?.name}. Relógio MIDI fica oculto até você pedir.</li>
      </ul>
      <div className="flex flex-wrap gap-2">
        <Btn
          tone="primary"
          onClick={() => {
            void connectMidi().then((error) => {
              api.updateSettings({ midiUnlocked: true });
              if (error) toast.error(error);
            });
          }}
        >
          Conectar e diagnosticar
        </Btn>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={data.settings.monitorShowClock}
            onChange={(event) => api.updateSettings({ monitorShowClock: event.target.checked })}
          />
          Mostrar clock e active sensing
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <Btn key={item.id} tone={kind === item.id ? "primary" : "ghost"} onClick={() => setKind(item.id)}>
            {item.label}
          </Btn>
        ))}
        <Btn tone={dir === "in" ? "primary" : "ghost"} onClick={() => setDir(dir === "in" ? "all" : "in")}>
          Só IN
        </Btn>
        <Btn tone={dir === "out" ? "primary" : "ghost"} onClick={() => setDir(dir === "out" ? "all" : "out")}>
          Só OUT
        </Btn>
        <select
          className="h-11 rounded-lg border border-stage-line bg-stage-bg px-2"
          value={channel === "all" ? "" : String(channel)}
          aria-label="Filtrar canal"
          onChange={(event) => setChannel(event.target.value === "" ? "all" : Number(event.target.value))}
        >
          <option value="">Todos os canais</option>
          {Array.from({ length: 16 }, (_, i) => (
            <option key={i} value={i}>
              Canal {i + 1}
            </option>
          ))}
        </select>
      </div>
      <div className="overflow-auto rounded-xl border border-stage-line">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="bg-stage-panel text-stage-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Hora</th>
              <th className="px-3 py-2 font-medium">Dir</th>
              <th className="px-3 py-2 font-medium">Canal</th>
              <th className="px-3 py-2 font-medium">Tipo</th>
              <th className="px-3 py-2 font-medium">Nº</th>
              <th className="px-3 py-2 font-medium">Valor</th>
              <th className="px-3 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-stage-muted" colSpan={7}>
                  Nenhuma mensagem com esse filtro. Mova um controle ou use a bancada de simulação no Keyboard.
                </td>
              </tr>
            ) : (
              rows
                .slice()
                .reverse()
                .map((item) => (
                  <tr key={item.id} className="border-t border-stage-line font-mono">
                    <td className="px-3 py-2">{new Date(item.at).toLocaleTimeString()}</td>
                    <td className="px-3 py-2">{item.simulated ? `${item.direction} sim` : item.direction.toUpperCase()}</td>
                    <td className="px-3 py-2">{item.channel == null ? "—" : item.channel + 1}</td>
                    <td className="px-3 py-2">{kindLabel(item.kind)}</td>
                    <td className="px-3 py-2">{describeNumber(item.kind, item.number)}</td>
                    <td className="px-3 py-2">{describeValue(item.kind, item.number, item.value)}</td>
                    <td className="px-3 py-2">
                      <button
                        className="text-stage-info"
                        onClick={() => {
                          void navigator.clipboard?.writeText(JSON.stringify(item));
                          toast.success("Evento copiado.");
                        }}
                      >
                        Copiar
                      </button>
                    </td>
                  </tr>
                ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function describeNumber(kind: MidiKind, number: number | null) {
  if (number == null) return "—";
  if (kind === "noteon" || kind === "noteoff" || kind === "poly") return `${number} ${midiToName(number, "sharp", "international")}`;
  if (kind === "cc") return `${number}${ccName(number) ? ` ${ccName(number)}` : ""}`;
  return String(number);
}

function describeValue(kind: MidiKind, number: number | null, value: number | null) {
  if (value == null) return "—";
  if (kind === "cc" && number === 64) return value >= 64 ? `${value} ligado` : `${value} desligado`;
  if (kind === "pitchbend") return `${value} (${value - 8192})`;
  return String(value);
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
