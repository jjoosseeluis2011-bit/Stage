import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { parseChord } from "@/lib/stage/chords";
import { parseChart } from "@/lib/stage/import-text";
import { loadFile, saveFile } from "@/lib/stage/db";
import { BLOCK_PRESETS, type BlockKind, type Song } from "@/lib/stage/types";
import { ChordLine, useSongSpell } from "./chord-line";
import { useStage } from "./provider";
import { Btn, Field, Modal, TextInput, Area } from "./ui";

export function SongEditor({ id, onStage, onBack }: { id: string; onStage: () => void; onBack: () => void }) {
  const { data, api, session } = useStage();
  const song = data.songs.find((s) => s.id === id) ?? null;
  const spell = useSongSpell(song);
  const [dropId, setDropId] = useState<string | null>(null);
  if (!song) {
    return (
      <div className="grid gap-3">
        <p>Essa cifra não está mais neste aparelho.</p>
        <Btn onClick={onBack}>Voltar</Btn>
      </div>
    );
  }
  return (
    <div className="grid gap-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <Btn onClick={onBack}>Biblioteca</Btn>
        <div className="flex flex-wrap gap-2">
          <Btn onClick={() => api.editSong(song.id, (s) => { s.favorite = !s.favorite; })}>{song.favorite ? "Favorita" : "Favoritar"}</Btn>
          <Btn
            onClick={() => {
              const copy = api.duplicateSong(song.id);
              if (copy) toast.success("Cópia criada.");
            }}
          >
            Duplicar
          </Btn>
          <Btn tone="primary" onClick={onStage}>
            Modo palco
          </Btn>
        </div>
      </header>
      {session.ensaio ? <p className="text-sm text-stage-warn">Modo ensaio ligado. O tom na tela muda, a cifra guardada não.</p> : null}
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Nome">
          <TextInput value={song.title} onChange={(e) => api.editSong(song.id, (s) => { s.title = e.target.value; })} />
        </Field>
        <Field label="Artista">
          <TextInput value={song.artist} onChange={(e) => api.editSong(song.id, (s) => { s.artist = e.target.value; })} />
        </Field>
        <Field label="Tom original">
          <TextInput value={song.originalKey} onChange={(e) => api.editSong(song.id, (s) => { s.originalKey = e.target.value; })} />
        </Field>
        <Field label="Tom atual">
          <div className="flex gap-2">
            <Btn onClick={() => api.nudgeTranspose(song.id, -1)}>−</Btn>
            <p className="grid min-h-11 flex-1 place-items-center rounded-lg border border-stage-line font-mono text-lg">{spell.key}</p>
            <Btn onClick={() => api.nudgeTranspose(song.id, 1)}>+</Btn>
          </div>
        </Field>
        <Field label="BPM">
          <TextInput
            inputMode="numeric"
            value={song.bpm ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              api.editSong(song.id, (s) => {
                s.bpm = v === "" ? null : Math.max(40, Math.min(280, Number(v) || 0)) || null;
              });
            }}
          />
        </Field>
        <Field label="Categoria">
          <TextInput value={song.category} list="stage-cats" onChange={(e) => api.editSong(song.id, (s) => { s.category = e.target.value; })} />
          <datalist id="stage-cats">
            {["Adoração", "Celebração", "Ceia", "Comunhão", "Resposta"].map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Tags">
          <TextInput
            value={song.tags.join(", ")}
            onChange={(e) =>
              api.editSong(song.id, (s) => {
                s.tags = e.target.value.split(",").map((t) => t.trim()).filter(Boolean);
              })
            }
          />
        </Field>
        <Field label="Cena vinculada">
          <select
            className="h-11 rounded-lg border border-stage-line bg-stage-bg px-2"
            value={song.sceneId ?? ""}
            onChange={(e) => api.editSong(song.id, (s) => { s.sceneId = e.target.value || null; })}
          >
            <option value="">Nenhuma</option>
            {data.scenes.map((scene) => (
              <option key={scene.id} value={scene.id}>
                {scene.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Observações">
        <Area value={song.notes} onChange={(e) => api.editSong(song.id, (s) => { s.notes = e.target.value; })} />
      </Field>
      <div className="flex flex-wrap gap-2">
        {BLOCK_PRESETS.map((preset) => (
          <Btn key={preset.kind + preset.name} onClick={() => api.addBlock(song.id, preset.kind, preset.name)}>
            + {preset.name}
          </Btn>
        ))}
        <Btn
          onClick={() => {
            const idScene = api.createScene({
              name: song.title || "Cena",
              songName: song.title,
              key: spell.key,
              bpm: song.bpm,
            });
            api.editSong(song.id, (s) => {
              s.sceneId = idScene;
            });
            toast.success("Cena criada sem Program Change. Preencha o MIDI quando confirmar no manual.");
          }}
        >
          Criar cena desta música
        </Btn>
        {song.pdfFileId ? <PdfButton fileId={song.pdfFileId} name={song.pdfName} /> : null}
      </div>
      <p className="text-xs text-stage-muted">Salvo neste aparelho · {song.updatedAt ? new Date(song.updatedAt).toLocaleString() : ""}</p>
      <div className="grid gap-4">
        {song.blocks.map((block) => (
          <section key={block.id} className="grid gap-3 rounded-2xl border border-stage-line bg-stage-panel p-3">
            <div className="flex flex-wrap items-center gap-2">
              <TextInput
                className="max-w-xs"
                value={block.name}
                aria-label="Nome do bloco"
                onChange={(e) => api.updateBlock(song.id, block.id, { name: e.target.value })}
              />
              <Btn onClick={() => api.moveBlock(song.id, block.id, -1)}>Subir</Btn>
              <Btn onClick={() => api.moveBlock(song.id, block.id, 1)}>Descer</Btn>
              <Btn onClick={() => api.duplicateBlock(song.id, block.id)}>Duplicar</Btn>
              <Btn tone={song.pinnedBlockId === block.id ? "primary" : "ghost"} onClick={() => api.editSong(song.id, (s) => { s.pinnedBlockId = s.pinnedBlockId === block.id ? null : block.id; })}>
                {song.pinnedBlockId === block.id ? "Fixado" : "Fixar no palco"}
              </Btn>
              <Btn tone="danger" onClick={() => setDropId(block.id)}>
                Excluir bloco
              </Btn>
              <Modal open={dropId === block.id} title="Excluir bloco" onClose={() => setDropId(null)}>
                <p className="text-sm text-stage-muted">O bloco {block.name} sai desta cifra. A música continua salva.</p>
                <div className="flex gap-2">
                  <Btn
                    tone="danger"
                    onClick={() => {
                      api.deleteBlock(song.id, block.id);
                      setDropId(null);
                    }}
                  >
                    Excluir
                  </Btn>
                  <Btn onClick={() => setDropId(null)}>Cancelar</Btn>
                </div>
              </Modal>
            </div>
            {block.lines.map((line) => (
              <LineEditor key={line.id} song={song} blockId={block.id} lineId={line.id} />
            ))}
            <Btn onClick={() => api.addLine(song.id, block.id)}>+ Linha</Btn>
          </section>
        ))}
      </div>
      <Btn
        tone="danger"
        onClick={() => {
          if (window.confirm(`Excluir “${song.title || "esta cifra"}”?`)) {
            api.deleteSong(song.id);
            onBack();
          }
        }}
      >
        Excluir música
      </Btn>
    </div>
  );
}

function LineEditor({ song, blockId, lineId }: { song: Song; blockId: string; lineId: string }) {
  const { api, data } = useStage();
  const spell = useSongSpell(song);
  const line = song.blocks.find((b) => b.id === blockId)?.lines.find((l) => l.id === lineId);
  const ref = useRef<HTMLInputElement>(null);
  const [symbol, setSymbol] = useState("");
  if (!line) return null;
  return (
    <div className="grid gap-2 rounded-xl bg-stage-bg p-3">
      <div className="text-lg">
        <ChordLine text={line.text} chords={line.chords} semitones={spell.semitones} pref={spell.pref} system={spell.system} />
      </div>
      <input
        ref={ref}
        className="h-11 w-full rounded-lg border border-stage-line bg-stage-panel px-3"
        value={line.text}
        aria-label="Letra"
        onChange={(e) => api.updateLine(song.id, blockId, line.id, e.target.value)}
      />
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const at = ref.current?.selectionStart ?? line.text.length;
          const german = data.settings.nomenclature === "german";
          const known = parseChord(symbol, { german }) != null;
          const ok = api.addChord(song.id, blockId, line.id, at, symbol);
          if (!ok) toast.error("Digite um acorde.");
          else if (!known) toast.message("Guardei o texto, mas não interpretei o acorde. Ele não será transposto.");
          setSymbol("");
        }}
      >
        <TextInput className="max-w-40 font-mono" value={symbol} placeholder="Gmaj7" aria-label="Símbolo do acorde" onChange={(e) => setSymbol(e.target.value)} />
        <Btn type="submit">Acorde no cursor</Btn>
      </form>
      <div className="flex flex-wrap gap-2">
        {line.chords.map((chord) => (
          <button key={chord.id} className="font-mono text-sm text-stage-accent" onClick={() => api.removeChord(song.id, blockId, line.id, chord.id)}>
            {chord.symbol} ×
          </button>
        ))}
        <Btn className="ml-auto" onClick={() => api.deleteLine(song.id, blockId, line.id)}>
          Apagar linha
        </Btn>
      </div>
    </div>
  );
}

function PdfButton({ fileId, name }: { fileId: string; name: string | null }) {
  const [open, setOpen] = useState(false);
  const [pages, setPages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Btn
        onClick={() => {
          setOpen(true);
          setError(null);
          void (async () => {
            try {
              const blob = await loadFile(fileId);
              if (!blob) {
                setError("O PDF original não está mais no armazenamento.");
                return;
              }
              const { renderPdfPages } = await import("@/lib/stage/pdf-import");
              setPages(await renderPdfPages(await blob.arrayBuffer()));
            } catch (err) {
              setError(err instanceof Error ? err.message : "Não consegui abrir o PDF.");
            }
          })();
        }}
      >
        PDF original
      </Btn>
      <Modal open={open} title={name || "PDF original"} onClose={() => setOpen(false)}>
        {error ? <p className="text-stage-warn">{error}</p> : null}
        <div className="grid max-h-[60vh] gap-3 overflow-auto">
          {pages.map((src) => (
            <img key={src.slice(0, 32)} src={src} alt="Página do PDF original" className="w-full" />
          ))}
          {!pages.length && !error ? <p className="text-stage-muted">Abrindo…</p> : null}
        </div>
      </Modal>
    </>
  );
}

export function StageMode({ id, onExit }: { id: string; onExit: () => void }) {
  const { data, api, session } = useStage();
  const song = data.songs.find((s) => s.id === id) ?? null;
  const spell = useSongSpell(song);
  const scroller = useRef<HTMLDivElement>(null);
  const [font, setFont] = useState(data.settings.stageFont);
  const [pinHeight, setPinHeight] = useState(32);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!song) return;
    api.openSong(song.id);
  }, [song?.id]);

  useEffect(() => {
    const el = scroller.current;
    if (!el || !session.scrollOn) return;
    let y = el.scrollTop;
    let last = performance.now();
    let frame = 0;
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      y += data.settings.scrollSpeed * dt;
      el.scrollTop = y;
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [session.scrollOn, data.settings.scrollSpeed]);

  useEffect(() => {
    const node = song?.blocks[data.active.sectionIndex];
    if (!node) return;
    document.getElementById(`sec-${node.id}`)?.scrollIntoView({ block: "start" });
  }, [data.active.sectionIndex, song?.id]);

  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    void navigator.wakeLock?.request("screen").then((value) => {
      lock = value;
    }).catch(() => undefined);
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (["ArrowDown", "ArrowRight", "PageDown", "Enter"].includes(event.key)) {
        event.preventDefault();
        api.stepSection(1);
      }
      if (["ArrowUp", "ArrowLeft", "PageUp"].includes(event.key)) {
        event.preventDefault();
        api.stepSection(-1);
      }
      if (event.code === "Space") {
        event.preventDefault();
        api.toggleScroll();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      void lock?.release();
    };
  }, [api]);

  if (!song) return <Btn onClick={onExit}>Voltar</Btn>;
  const pinned = song.blocks.find((b) => b.id === song.pinnedBlockId) ?? null;
  const bpm = api.effectiveBpm(song);

  return (
    <div ref={root} className="fixed inset-0 z-40 flex flex-col bg-stage-bg text-stage-fg">
      <header className="flex flex-wrap items-center gap-2 border-b border-stage-line px-3 py-2" style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}>
        <Btn onClick={onExit}>Sair</Btn>
        <p className="min-w-0 flex-1 truncate font-medium">{song.title || "Sem título"}</p>
        <p className="font-mono">{spell.key}</p>
        <p className="font-mono">{bpm ? `${bpm}` : "BPM —"}</p>
        <Btn onClick={() => api.tap()}>TAP</Btn>
        <Btn onClick={() => api.nudgeTranspose(song.id, -1)}>−</Btn>
        <Btn onClick={() => api.nudgeTranspose(song.id, 1)}>+</Btn>
        <Btn tone={session.scrollOn ? "primary" : "ghost"} onClick={() => api.toggleScroll()}>
          {session.scrollOn ? "Pausar" : "Rolar"}
        </Btn>
        <Btn onClick={() => api.stepSection(-1)}>Seção −</Btn>
        <Btn onClick={() => api.stepSection(1)}>Seção +</Btn>
        <label className="flex items-center gap-2 text-xs text-stage-muted">
          Fonte
          <input type="range" min={16} max={48} value={font} onChange={(e) => setFont(Number(e.target.value))} />
        </label>
        <Btn
          onClick={() => {
            void root.current?.requestFullscreen?.().catch(() => toast.message("Tela cheia não disponível neste navegador. O palco já está sem a navegação."));
          }}
        >
          Tela cheia
        </Btn>
      </header>
      {pinned ? (
        <div className="overflow-auto border-b border-stage-line px-4 py-3" style={{ height: `${pinHeight}%` }}>
          <p className="text-xs tracking-widest text-stage-accent uppercase">{pinned.name} fixado</p>
          <div style={{ fontSize: font }}>
            {pinned.lines.map((line) => (
              <ChordLine key={line.id} text={line.text} chords={line.chords} semitones={spell.semitones} pref={spell.pref} system={spell.system} />
            ))}
          </div>
          <input className="mt-2 w-full" type="range" min={18} max={55} value={pinHeight} aria-label="Altura do bloco fixado" onChange={(e) => setPinHeight(Number(e.target.value))} />
        </div>
      ) : null}
      <div ref={scroller} className="min-h-0 flex-1 overflow-auto px-4 py-4" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
        {song.blocks.map((block, index) => (
          <section key={block.id} id={`sec-${block.id}`} className={`mb-8 ${index === data.active.sectionIndex ? "rounded-xl border border-stage-line p-3" : ""}`}>
            <h2 className="mb-2 text-xs tracking-widest text-stage-muted uppercase">{block.name}</h2>
            <div style={{ fontSize: font }} className="grid gap-3">
              {block.lines.map((line) => (
                <ChordLine key={line.id} text={line.text} chords={line.chords} semitones={spell.semitones} pref={spell.pref} system={spell.system} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export function ImportScreen({ onOpen }: { onOpen: (id: string) => void }) {
  const { data, api } = useStage();
  const [draftText, setDraftText] = useState("");
  const [issues, setIssues] = useState<{ line: number; token: string; reason: string }[]>([]);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [keyName, setKeyName] = useState("C");
  const [blocks, setBlocks] = useState<Song["blocks"]>([]);
  const [pdfName, setPdfName] = useState<string | null>(null);
  const [pdfBuffer, setPdfBuffer] = useState<ArrayBuffer | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("shared") !== "1" || !("caches" in window)) return;
    void caches.open("stage-share").then(async (cache) => {
      const metaRes = await cache.match("/__stage_share_meta");
      if (!metaRes) return;
      const meta = (await metaRes.json()) as { title?: string; text?: string; count?: number };
      if (meta.text) applyText(meta.text, meta.title || "Compartilhado");
      const fileRes = await cache.match("/__stage_share_file_0");
      if (fileRes) {
        const blob = await fileRes.blob();
        await ingest(blob, "compartilhado.pdf");
      }
    });
  }, []);

  function applyParsed(text: string, name?: string) {
    const german = data.settings.nomenclature === "german";
    const draft = parseChart(text, german);
    setDraftText(text);
    setIssues(draft.issues);
    setTitle(name || draft.title);
    setArtist(draft.artist);
    setKeyName(draft.originalKey || "C");
    setBlocks(draft.blocks);
    setReady(true);
  }

  function applyText(text: string, name?: string) {
    applyParsed(text, name);
  }

  async function ingest(file: File | Blob, name: string) {
    setBusy("Lendo arquivo…");
    setPdfName(null);
    setPdfBuffer(null);
    try {
      if (name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf") {
        const buffer = await file.arrayBuffer();
        setPdfBuffer(buffer);
        setPdfName(name);
        const { extractPdfText } = await import("@/lib/stage/pdf-import");
        const extracted = await extractPdfText(buffer);
        if (extracted.chars < 24) {
          setDraftText(extracted.text);
          setReady(true);
          setTitle(name.replace(/\.pdf$/i, ""));
          toast.message("Quase não há texto digital. Se for um PDF escaneado, rode o OCR.");
        } else applyParsed(extracted.text, name.replace(/\.pdf$/i, ""));
      } else {
        applyParsed(await file.text(), name.replace(/\.[^.]+$/, ""));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao ler o arquivo.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-4">
      <header>
        <h1 className="text-2xl font-semibold">Importar cifra</h1>
        <p className="text-sm text-stage-muted">PDF digital, texto ou ChordPro. Nada é salvo antes da revisão. OCR só roda se você pedir.</p>
      </header>
      <input
        className="block w-full text-sm"
        type="file"
        accept=".pdf,.txt,.cho,.chopro,.pro,application/pdf,text/plain"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void ingest(file, file.name);
        }}
      />
      <Field label="Ou cole a cifra">
        <Area value={draftText} onChange={(e) => setDraftText(e.target.value)} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Btn onClick={() => applyParsed(draftText)}>Revisar texto</Btn>
        <Btn
          disabled={!pdfBuffer || Boolean(busy)}
          onClick={() => {
            if (!pdfBuffer) return;
            setBusy("OCR em andamento. A primeira vez baixa o reconhecedor.");
            void import("@/lib/stage/pdf-import")
              .then(({ ocrPdf }) => ocrPdf(pdfBuffer))
              .then((text) => {
                applyParsed(text, title);
                toast.success("OCR concluído. Revise os acordes antes de salvar.");
              })
              .catch((err: unknown) => {
                toast.error(err instanceof Error ? err.message : "O OCR não rodou. Confira a rede na primeira execução ou digite a cifra.");
              })
              .finally(() => setBusy(null));
          }}
        >
          OCR do PDF
        </Btn>
      </div>
      {busy ? <p className="text-stage-info">{busy}</p> : null}
      {ready ? (
        <section className="grid gap-3 rounded-2xl border border-stage-line bg-stage-panel p-4">
          <h2 className="text-lg font-semibold">Revisão — ainda não foi salva</h2>
          <div className="grid gap-2 md:grid-cols-3">
            <TextInput value={title} aria-label="Título" onChange={(e) => setTitle(e.target.value)} />
            <TextInput value={artist} aria-label="Artista" onChange={(e) => setArtist(e.target.value)} />
            <TextInput value={keyName} aria-label="Tom" onChange={(e) => setKeyName(e.target.value)} />
          </div>
          {issues.length ? (
            <ul className="grid gap-1 text-sm text-stage-warn">
              {issues.map((issue, index) => (
                <li key={`${issue.line}-${issue.token}-${index}`}>
                  Linha {issue.line}: “{issue.token}” — {issue.reason}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-stage-ok">Nenhum token suspeito. Ainda assim, confira a prévia.</p>
          )}
          <div className="grid gap-3">
            {blocks.map((block) => (
              <div key={block.id}>
                <p className="text-xs tracking-widest text-stage-muted uppercase">{block.name}</p>
                {block.lines.map((line) => (
                  <p key={line.id} className="font-mono text-sm">
                    <span className="text-stage-accent">{line.chords.map((c) => c.symbol).join("  ")}</span> {line.text}
                  </p>
                ))}
              </div>
            ))}
          </div>
          <Btn
            tone="primary"
            onClick={() => {
              const id = api.createSong({
                title: title || "Sem título",
                artist,
                originalKey: keyName || "C",
                ...(blocks.length ? { blocks } : {}),
              });
              if (pdfBuffer && pdfName) {
                const blob = new Blob([pdfBuffer], { type: "application/pdf" });
                void saveFile(id, blob).then(() => {
                  api.editSong(id, (song) => {
                    song.pdfFileId = id;
                    song.pdfName = pdfName;
                  });
                });
              }
              toast.success("Cifra salva neste aparelho.");
              onOpen(id);
            }}
          >
            Salvar e editar
          </Btn>
        </section>
      ) : null}
    </div>
  );
}
