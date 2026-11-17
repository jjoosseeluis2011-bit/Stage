import { useMemo, useState, useSyncExternalStore } from "react";
import { getServerStatus, getStatus, subscribeStatus } from "@/lib/stage/midi-runtime";
import { activeSong, useStage } from "./provider";
import { useSongSpell } from "./chord-line";
import { Btn, Empty, Readout, TextInput } from "./ui";

export function HomeScreen({
  go,
}: {
  go: (view: "library" | "keyboard" | "setlists" | "scenes" | "culto" | "song" | "import" | "monitor", id?: string) => void;
}) {
  const { data, ready } = useStage();
  const status = useSyncExternalStore(subscribeStatus, getStatus, getServerStatus);
  const song = activeSong(data);
  const spell = useSongSpell(song);
  const setlist = data.setlists.find((s) => s.id === data.active.setlistId) ?? null;
  const scene = data.scenes.find((s) => s.id === data.active.sceneId) ?? null;
  const recent = data.songs.find((s) => s.id === data.active.recentSongIds[0]) ?? null;

  return (
    <div className="grid gap-5">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs tracking-widest text-stage-accent uppercase">Central de palco</p>
          <h1 className="text-4xl font-semibold tracking-wide">STAGE</h1>
          <p className="mt-1 max-w-xl text-stage-muted">Cifras, repertório e controle MIDI no mesmo aparelho. Os dados ficam aqui.</p>
        </div>
        <span className={`led ${status.connected ? "led-on" : ""}`} aria-hidden />
      </header>
      {!ready ? <p className="text-stage-muted">Lendo a biblioteca deste aparelho…</p> : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Readout label="Música recente" value={recent?.title || "Nenhuma"} hint={recent?.artist || "Abra ou crie uma cifra"} />
        <Readout label="Repertório" value={setlist?.name || "Nenhum"} hint={setlist ? `${setlist.items.length} músicas` : "Monte a ordem do culto"} />
        <Readout
          label="MIDI"
          value={status.connected ? status.inputs[0]?.name || "Porta aberta" : "Desconectado"}
          hint={status.error || (status.supported ? "Nenhum teclado até você conectar" : "Web MIDI indisponível neste navegador")}
        />
        <Readout label="Cena" value={scene?.name || "Nenhuma"} hint={scene ? "Selecionada no app, sem confirmação do instrumento" : "Cadastre quando souber o Program Change"} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <article className="grid gap-3 rounded-2xl border border-stage-line bg-stage-panel p-4">
          <h2 className="text-lg font-semibold">Stage Cifras</h2>
          <p className="text-sm text-stage-muted">
            {song ? `${song.title || "Sem título"} está em foco, tom ${spell.key}.` : "A biblioteca começa vazia de propósito. Nada aqui é cifra de exemplo."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Btn tone="primary" onClick={() => go("library")}>
              Abrir cifras
            </Btn>
            <Btn onClick={() => go("import")}>Importar</Btn>
            {song ? (
              <Btn onClick={() => go("song", song.id)}>Continuar</Btn>
            ) : null}
          </div>
        </article>
        <article className="grid gap-3 rounded-2xl border border-stage-line bg-stage-panel p-4">
          <h2 className="text-lg font-semibold">Stage Keyboard</h2>
          <p className="text-sm text-stage-muted">Quatro faders, oito pads, acorde ao vivo e as 61 teclas. O mapeamento nasce do MIDI Learn, não de um mapa inventado.</p>
          <div className="flex flex-wrap gap-2">
            <Btn tone="primary" onClick={() => go("keyboard")}>
              Abrir keyboard
            </Btn>
            <Btn onClick={() => go("monitor")}>Monitor</Btn>
            <Btn onClick={() => go("culto")}>Modo culto</Btn>
          </div>
        </article>
      </div>
      <p className="text-sm text-stage-muted">Sincronização: somente neste aparelho. Não há conta nem nuvem configurada, então nada é sobrescrito por um servidor.</p>
    </div>
  );
}

export function LibraryScreen({
  go,
}: {
  go: (view: "song" | "stage" | "import", id?: string) => void;
}) {
  const { data, api, ready } = useStage();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"updated" | "title" | "artist">("updated");
  const [fav, setFav] = useState(false);
  const [category, setCategory] = useState("");
  const categories = useMemo(() => [...new Set(data.songs.map((s) => s.category).filter(Boolean))], [data.songs]);
  const songs = data.songs
    .filter((song) => {
      if (fav && !song.favorite) return false;
      if (category && song.category !== category) return false;
      const blob = [song.title, song.artist, song.category, song.tags.join(" "), ...song.blocks.flatMap((b) => b.lines.flatMap((l) => [l.text, ...l.chords.map((c) => c.symbol)]))].join(" ").toLocaleLowerCase("pt-BR");
      return blob.includes(q.trim().toLocaleLowerCase("pt-BR"));
    })
    .sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title, "pt-BR");
      if (sort === "artist") return a.artist.localeCompare(b.artist, "pt-BR");
      return b.updatedAt - a.updatedAt;
    });

  if (ready && data.songs.length === 0) {
    return (
      <Empty
        title="Nenhuma cifra ainda"
        body="Importe um PDF ou um texto, ou escreva a primeira música. O Stage não vem com repertório falso."
        action={
          <div className="flex gap-2">
            <Btn tone="primary" onClick={() => go("import")}>
              Importar
            </Btn>
            <Btn
              onClick={() => {
                const id = api.createSong();
                go("song", id);
              }}
            >
              Criar música
            </Btn>
          </div>
        }
      />
    );
  }

  return (
    <div className="grid gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Cifras</h1>
        <div className="flex gap-2">
          <Btn onClick={() => go("import")}>Importar</Btn>
          <Btn
            tone="primary"
            onClick={() => {
              const id = api.createSong();
              go("song", id);
            }}
          >
            Nova
          </Btn>
        </div>
      </header>
      <div className="grid gap-2 md:grid-cols-[1fr_auto_auto_auto]">
        <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar título, artista ou letra" aria-label="Buscar cifras" />
        <select className="h-11 rounded-lg border border-stage-line bg-stage-bg px-2" value={sort} aria-label="Ordenar" onChange={(e) => setSort(e.target.value as typeof sort)}>
          <option value="updated">Recentes</option>
          <option value="title">Título</option>
          <option value="artist">Artista</option>
        </select>
        <select className="h-11 rounded-lg border border-stage-line bg-stage-bg px-2" value={category} aria-label="Categoria" onChange={(e) => setCategory(e.target.value)}>
          <option value="">Todas as categorias</option>
          {categories.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <Btn tone={fav ? "primary" : "ghost"} onClick={() => setFav((v) => !v)}>
          Favoritas
        </Btn>
      </div>
      <ul className="grid gap-2">
        {songs.length === 0 ? <li className="text-stage-muted">Nada encontrado com esse filtro.</li> : null}
        {songs.map((song) => (
          <li key={song.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stage-line bg-stage-panel px-3 py-3">
            <button className="min-w-0 flex-1 text-left" onClick={() => { api.openSong(song.id); go("song", song.id); }}>
              <p className="truncate font-medium">{song.title || "Sem título"}</p>
              <p className="truncate text-sm text-stage-muted">
                {song.artist || "Artista não informado"} · {song.originalKey || "tom livre"}
                {song.bpm ? ` · ${song.bpm} bpm` : ""}
                {song.category ? ` · ${song.category}` : ""}
              </p>
            </button>
            <div className="flex gap-2">
              <Btn onClick={() => api.editSong(song.id, (s) => { s.favorite = !s.favorite; })}>{song.favorite ? "Favorita" : "Favoritar"}</Btn>
              <Btn onClick={() => { api.openSong(song.id); go("stage", song.id); }}>Palco</Btn>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
