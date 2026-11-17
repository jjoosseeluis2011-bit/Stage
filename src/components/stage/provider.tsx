import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { toggleMetro as toggleClick } from "@/lib/stage/audio";
import { resolvePreference, storeSymbol } from "@/lib/stage/chords";
import { coerceState, deleteFile, loadState, saveState } from "@/lib/stage/db";
import {
  connectMidi,
  onBindingLearned,
  onPadAction,
  panic,
  selectInput,
  selectOutput,
  sendBytesOut,
  setBindings,
  setSendVirtual,
  setShowClock,
} from "@/lib/stage/midi-runtime";
import {
  blankSong,
  defaultBindings,
  emptyBlock,
  emptyData,
  emptyLine,
  uid,
  type BlockKind,
  type MidiBinding,
  type MidiProfile,
  type PadAction,
  type Scene,
  type Setlist,
  type Settings,
  type Song,
  type SongBlock,
  type StageData,
  type Timbre,
} from "@/lib/stage/types";

type Session = {
  ensaio: boolean;
  scratchTranspose: number;
  scratchBpm: number | null;
  scrollOn: boolean;
  liveBpm: number | null;
  panicOpen: boolean;
};

type Backup = { app: string; version: number; data: StageData };

const Ctx = createContext<{
  ready: boolean;
  data: StageData;
  session: Session;
  api: StageApi;
} | null>(null);

export type StageApi = {
  editSong: (id: string, fn: (song: Song) => void) => void;
  createSong: (partial?: Partial<Song>) => string;
  deleteSong: (id: string) => void;
  duplicateSong: (id: string) => string | null;
  openSong: (id: string) => void;
  addBlock: (songId: string, kind: BlockKind, name: string) => void;
  updateBlock: (songId: string, blockId: string, patch: Partial<SongBlock>) => void;
  moveBlock: (songId: string, blockId: string, dir: -1 | 1) => void;
  deleteBlock: (songId: string, blockId: string) => void;
  duplicateBlock: (songId: string, blockId: string) => void;
  addLine: (songId: string, blockId: string) => void;
  updateLine: (songId: string, blockId: string, lineId: string, text: string) => void;
  deleteLine: (songId: string, blockId: string, lineId: string) => void;
  addChord: (songId: string, blockId: string, lineId: string, at: number, typed: string) => boolean;
  removeChord: (songId: string, blockId: string, lineId: string, chordId: string) => void;
  nudgeTranspose: (songId: string, delta: number) => void;
  createSetlist: (name: string) => string;
  updateSetlist: (id: string, fn: (list: Setlist) => void) => void;
  deleteSetlist: (id: string) => void;
  createScene: (partial?: Partial<Scene>) => string;
  updateScene: (id: string, patch: Partial<Scene>) => void;
  deleteScene: (id: string) => void;
  duplicateScene: (id: string) => void;
  createTimbre: (partial?: Partial<Timbre>) => string;
  updateTimbre: (id: string, patch: Partial<Timbre>) => void;
  deleteTimbre: (id: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  setActive: (patch: Partial<StageData["active"]>) => void;
  updateBinding: (slot: string, patch: Partial<MidiBinding>) => void;
  clearBinding: (slot: string) => void;
  createProfile: (name: string) => void;
  renameProfile: (id: string, name: string) => void;
  deleteProfile: (id: string) => void;
  useProfile: (id: string) => void;
  toggleEnsaio: (on: boolean) => void;
  toggleScroll: () => void;
  tap: () => number | null;
  toggleMetronome: () => void;
  requestPanic: () => void;
  confirmPanic: (allChannels: boolean) => Promise<void>;
  closePanic: () => void;
  sendScene: (id: string) => Promise<string>;
  stepSong: (dir: -1 | 1) => void;
  stepSection: (dir: -1 | 1) => void;
  effectiveTranspose: (song: Song) => number;
  effectiveBpm: (song: Song | null) => number | null;
  exportBackup: () => string;
  importBackup: (raw: string, mode: "merge" | "replace") => { songs: number; replaced: boolean };
  resetAll: () => void;
};

function move<T>(list: T[], index: number, dir: -1 | 1): T[] {
  const next = index + dir;
  if (next < 0 || next >= list.length) return list;
  const copy = list.slice();
  const [item] = copy.splice(index, 1);
  if (item === undefined) return list;
  copy.splice(next, 0, item);
  return copy;
}

export function StageProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<StageData>(emptyData);
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session>({
    ensaio: false,
    scratchTranspose: 0,
    scratchBpm: null,
    scrollOn: false,
    liveBpm: null,
    panicOpen: false,
  });
  const dataRef = useRef(data);
  const sessionRef = useRef(session);
  dataRef.current = data;
  sessionRef.current = session;
  const taps = useRef<number[]>([]);

  const edit = useCallback((fn: (draft: StageData) => void) => {
    setData((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
  }, []);

  useEffect(() => {
    let cancel = false;
    loadState()
      .then((stored) => {
        if (cancel) return;
        if (stored) setData(stored);
        setReady(true);
      })
      .catch(() => {
        if (!cancel) setReady(true);
      });
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const t = window.setTimeout(() => {
      void saveState(data).catch(() => {
        toast.error("Não consegui gravar no armazenamento deste aparelho.");
      });
    }, 180);
    return () => window.clearTimeout(t);
  }, [data, ready]);

  const effectiveTranspose = useCallback(
    (song: Song) => song.transpose + (session.ensaio ? session.scratchTranspose : 0),
    [session.ensaio, session.scratchTranspose],
  );

  const effectiveBpm = useCallback(
    (song: Song | null) => {
      if (session.ensaio && session.scratchBpm != null) return session.scratchBpm;
      return song?.bpm ?? session.liveBpm;
    },
    [session.ensaio, session.scratchBpm, session.liveBpm],
  );

  const setBpm = useCallback(
    (value: number) => {
      const songId = dataRef.current.active.songId;
      if (sessionRef.current.ensaio || !songId) {
        setSession((s) => ({ ...s, scratchBpm: sessionRef.current.ensaio ? value : s.scratchBpm, liveBpm: value }));
        return;
      }
      edit((d) => {
        const song = d.songs.find((s) => s.id === songId);
        if (!song) return;
        song.bpm = value;
        song.updatedAt = Date.now();
      });
    },
    [edit],
  );

  const stepSection = useCallback(
    (dir: -1 | 1) => {
      edit((d) => {
        const song = d.songs.find((s) => s.id === d.active.songId);
        if (!song?.blocks.length) return;
        const count = song.blocks.length;
        d.active.sectionIndex = (d.active.sectionIndex + dir + count) % count;
      });
    },
    [edit],
  );

  const stepSong = useCallback(
    (dir: -1 | 1) => {
      edit((d) => {
        const list = d.setlists.find((s) => s.id === d.active.setlistId);
        if (!list?.items.length) return;
        const count = list.items.length;
        d.active.setlistIndex = (d.active.setlistIndex + dir + count) % count;
        const item = list.items[d.active.setlistIndex];
        if (!item) return;
        d.active.songId = item.songId;
        d.active.sectionIndex = 0;
        d.active.recentSongIds = [item.songId, ...d.active.recentSongIds.filter((id) => id !== item.songId)].slice(0, 8);
      });
    },
    [edit],
  );

  const tap = useCallback(() => {
    const now = performance.now();
    taps.current = [...taps.current.filter((t) => now - t < 2800), now];
    if (taps.current.length < 2) return null;
    const gaps = taps.current.slice(1).map((t, i) => t - taps.current[i]!);
    const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const bpm = Math.round(Math.min(280, Math.max(40, 60000 / avg)));
    setBpm(bpm);
    return bpm;
  }, [setBpm]);

  const toggleMetronome = useCallback(() => {
    const song = dataRef.current.songs.find((s) => s.id === dataRef.current.active.songId) ?? null;
    const bpm = effectiveBpm(song) ?? sessionRef.current.liveBpm;
    if (!bpm) {
      toast.error("Defina um BPM ou use o TAP antes de ligar o metrônomo.");
      return;
    }
    const settings = dataRef.current.settings;
    toggleClick({
      bpm,
      beats: settings.metroBeats,
      subdivision: settings.metroSubdivision,
      volume: settings.metronomeVolume,
    });
  }, [effectiveBpm]);

  const sendScene = useCallback(async (id: string) => {
    const scene = dataRef.current.scenes.find((s) => s.id === id);
    if (!scene) return "Cena não encontrada.";
    const packets: number[][] = [];
    if (scene.bankMsb != null) packets.push([0xb0 + scene.channel, 0, scene.bankMsb]);
    if (scene.bankLsb != null) packets.push([0xb0 + scene.channel, 32, scene.bankLsb]);
    if (scene.program != null) packets.push([0xc0 + scene.channel, scene.program]);
    if (!packets.length) {
      return "Nada foi enviado. Esta cena não tem MSB, LSB nem Program Change.";
    }
    for (const packet of packets) await sendBytesOut(packet);
    return "Mensagens enviadas. O instrumento não confirmou a troca — confira no teclado ou no monitor.";
  }, []);

  const confirmPanic = useCallback(
    async (allChannels: boolean) => {
      edit((d) => {
        d.settings.panicExplained = true;
      });
      setSession((s) => ({ ...s, panicOpen: false }));
      await panic(allChannels ? "all" : dataRef.current.settings.midiChannel);
      toast.success(allChannels ? "Pânico enviado em todos os canais." : "Pânico enviado no canal selecionado.");
    },
    [edit],
  );

  useEffect(() => {
    onBindingLearned((slot, patch) => {
      edit((d) => {
        const profile = d.profiles.find((p) => p.id === d.active.profileId);
        const binding = profile?.bindings.find((b) => b.slot === slot);
        if (!binding || !profile) return;
        Object.assign(binding, patch);
        profile.updatedAt = Date.now();
      });
      const kind = patch.message === "cc" ? `CC ${patch.number}` : patch.message === "note" ? `nota ${patch.number}` : "mensagem";
      toast.success(`${slot.replace("-", " ")} mapeado: ${kind}, canal ${(patch.channel ?? 0) + 1}.`);
    });
    onPadAction((action) => {
      const run = async () => {
        if (action === "next-section") stepSection(1);
        if (action === "prev-section") stepSection(-1);
        if (action === "next-song") stepSong(1);
        if (action === "prev-song") stepSong(-1);
        if (action === "scroll-toggle") setSession((s) => ({ ...s, scrollOn: !s.scrollOn }));
        if (action === "tap") tap();
        if (action === "metronome") toggleMetronome();
        if (action === "scene-send") {
          const sceneId = dataRef.current.active.sceneId;
          if (!sceneId) toast.error("Nenhuma cena selecionada para enviar.");
          else toast.message(await sendScene(sceneId));
        }
        if (action === "panic") {
          if (!dataRef.current.settings.panicExplained) setSession((s) => ({ ...s, panicOpen: true }));
          else await panic(dataRef.current.settings.midiChannel);
        }
      };
      void run();
    });
  }, [edit, sendScene, stepSection, stepSong, tap, toggleMetronome]);

  useEffect(() => {
    const profile = data.profiles.find((p) => p.id === data.active.profileId) ?? data.profiles[0];
    if (profile) setBindings(profile.bindings);
    setSendVirtual(data.settings.sendVirtualNotes);
    setShowClock(data.settings.monitorShowClock);
  }, [data.profiles, data.active.profileId, data.settings.sendVirtualNotes, data.settings.monitorShowClock]);

  useEffect(() => {
    if (!ready || !data.settings.midiUnlocked) return;
    let cancel = false;
    void connectMidi().then(() => {
      if (cancel) return;
      selectInput(dataRef.current.settings.midiInId);
      selectOutput(dataRef.current.settings.midiOutId);
    });
    return () => {
      cancel = true;
    };
  }, [ready, data.settings.midiUnlocked]);

  const api = useMemo<StageApi>(() => {
    const touch = (song: Song) => {
      song.updatedAt = Date.now();
    };
    return {
      editSong: (id, fn) =>
        edit((d) => {
          const song = d.songs.find((s) => s.id === id);
          if (!song) return;
          fn(song);
          touch(song);
        }),
      createSong: (partial) => {
        const song = { ...blankSong(), ...partial, id: uid(), createdAt: Date.now(), updatedAt: Date.now() };
        if (!song.blocks?.length) song.blocks = [emptyBlock()];
        edit((d) => {
          d.songs.unshift(song);
          d.active.songId = song.id;
          d.active.sectionIndex = 0;
          d.active.recentSongIds = [song.id, ...d.active.recentSongIds.filter((x) => x !== song.id)].slice(0, 8);
        });
        return song.id;
      },
      deleteSong: (id) => {
        const song = dataRef.current.songs.find((s) => s.id === id);
        if (song?.pdfFileId) void deleteFile(song.pdfFileId);
        edit((d) => {
          d.songs = d.songs.filter((s) => s.id !== id);
          d.setlists.forEach((list) => {
            list.items = list.items.filter((item) => item.songId !== id);
          });
          if (d.active.songId === id) d.active.songId = d.songs[0]?.id ?? null;
          d.active.recentSongIds = d.active.recentSongIds.filter((x) => x !== id);
        });
      },
      duplicateSong: (id) => {
        const source = dataRef.current.songs.find((s) => s.id === id);
        if (!source) return null;
        const copy = structuredClone(source);
        copy.id = uid();
        copy.title = `${source.title || "Sem título"} (cópia)`;
        copy.pdfFileId = null;
        copy.pdfName = null;
        copy.favorite = false;
        copy.createdAt = Date.now();
        copy.updatedAt = Date.now();
        edit((d) => d.songs.unshift(copy));
        return copy.id;
      },
      openSong: (id) =>
        edit((d) => {
          d.active.songId = id;
          d.active.sectionIndex = 0;
          d.active.recentSongIds = [id, ...d.active.recentSongIds.filter((x) => x !== id)].slice(0, 8);
          const song = d.songs.find((s) => s.id === id);
          if (song?.sceneId) d.active.sceneId = song.sceneId;
        }),
      addBlock: (songId, kind, name) =>
        edit((d) => {
          const song = d.songs.find((s) => s.id === songId);
          if (!song) return;
          song.blocks.push(emptyBlock({ kind, name }));
          touch(song);
        }),
      updateBlock: (songId, blockId, patch) =>
        edit((d) => {
          const song = d.songs.find((s) => s.id === songId);
          const block = song?.blocks.find((b) => b.id === blockId);
          if (!song || !block) return;
          Object.assign(block, patch);
          touch(song);
        }),
      moveBlock: (songId, blockId, dir) =>
        edit((d) => {
          const song = d.songs.find((s) => s.id === songId);
          if (!song) return;
          const index = song.blocks.findIndex((b) => b.id === blockId);
          song.blocks = move(song.blocks, index, dir);
          touch(song);
        }),
      deleteBlock: (songId, blockId) =>
        edit((d) => {
          const song = d.songs.find((s) => s.id === songId);
          if (!song) return;
          song.blocks = song.blocks.filter((b) => b.id !== blockId);
          if (!song.blocks.length) song.blocks.push(emptyBlock());
          if (song.pinnedBlockId === blockId) song.pinnedBlockId = null;
          touch(song);
        }),
      duplicateBlock: (songId, blockId) =>
        edit((d) => {
          const song = d.songs.find((s) => s.id === songId);
          const block = song?.blocks.find((b) => b.id === blockId);
          if (!song || !block) return;
          const copy = structuredClone(block);
          copy.id = uid();
          copy.name = `${block.name} cópia`;
          copy.lines.forEach((line) => {
            line.id = uid();
            line.chords.forEach((chord) => {
              chord.id = uid();
            });
          });
          const index = song.blocks.findIndex((b) => b.id === blockId);
          song.blocks.splice(index + 1, 0, copy);
          touch(song);
        }),
      addLine: (songId, blockId) =>
        edit((d) => {
          const song = d.songs.find((s) => s.id === songId);
          const block = song?.blocks.find((b) => b.id === blockId);
          if (!song || !block) return;
          block.lines.push(emptyLine());
          touch(song);
        }),
      updateLine: (songId, blockId, lineId, text) =>
        edit((d) => {
          const song = d.songs.find((s) => s.id === songId);
          const line = song?.blocks.find((b) => b.id === blockId)?.lines.find((l) => l.id === lineId);
          if (!song || !line) return;
          line.text = text;
          line.chords = line.chords.map((c) => ({ ...c, at: Math.min(c.at, text.length) }));
          touch(song);
        }),
      deleteLine: (songId, blockId, lineId) =>
        edit((d) => {
          const song = d.songs.find((s) => s.id === songId);
          const block = song?.blocks.find((b) => b.id === blockId);
          if (!song || !block) return;
          block.lines = block.lines.filter((l) => l.id !== lineId);
          if (!block.lines.length) block.lines.push(emptyLine());
          touch(song);
        }),
      addChord: (songId, blockId, lineId, at, typed) => {
        let ok = false;
        edit((d) => {
          const song = d.songs.find((s) => s.id === songId);
          const line = song?.blocks.find((b) => b.id === blockId)?.lines.find((l) => l.id === lineId);
          if (!song || !line) return;
          const pref = resolvePreference(d.settings.accidental, song.originalKey, d.settings.nomenclature === "german");
          const transpose = song.transpose + (sessionRef.current.ensaio ? sessionRef.current.scratchTranspose : 0);
          const symbol = storeSymbol(typed, transpose, pref, d.settings.nomenclature);
          ok = symbol.trim().length > 0;
          if (!ok) return;
          line.chords = [
            ...line.chords.filter((c) => c.at !== at),
            { id: uid(), at: Math.max(0, Math.min(at, line.text.length)), symbol },
          ].sort((a, b) => a.at - b.at);
          touch(song);
        });
        return ok;
      },
      removeChord: (songId, blockId, lineId, chordId) =>
        edit((d) => {
          const song = d.songs.find((s) => s.id === songId);
          const line = song?.blocks.find((b) => b.id === blockId)?.lines.find((l) => l.id === lineId);
          if (!song || !line) return;
          line.chords = line.chords.filter((c) => c.id !== chordId);
          touch(song);
        }),
      nudgeTranspose: (songId, delta) => {
        if (sessionRef.current.ensaio) {
          setSession((s) => ({ ...s, scratchTranspose: Math.max(-12, Math.min(12, s.scratchTranspose + delta)) }));
          return;
        }
        edit((d) => {
          const song = d.songs.find((s) => s.id === songId);
          if (!song) return;
          song.transpose = Math.max(-12, Math.min(12, song.transpose + delta));
          touch(song);
        });
      },
      createSetlist: (name) => {
        const id = uid();
        const now = Date.now();
        edit((d) => {
          d.setlists.unshift({ id, name: name || "Novo repertório", eventDate: "", items: [], createdAt: now, updatedAt: now });
          d.active.setlistId = id;
          d.active.setlistIndex = 0;
        });
        return id;
      },
      updateSetlist: (id, fn) =>
        edit((d) => {
          const list = d.setlists.find((s) => s.id === id);
          if (!list) return;
          fn(list);
          list.updatedAt = Date.now();
        }),
      deleteSetlist: (id) =>
        edit((d) => {
          d.setlists = d.setlists.filter((s) => s.id !== id);
          if (d.active.setlistId === id) d.active.setlistId = null;
        }),
      createScene: (partial) => {
        const id = uid();
        edit((d) => {
          d.scenes.unshift({
            id,
            name: partial?.name || "Nova cena",
            songName: partial?.songName ?? "",
            key: partial?.key ?? "",
            bpm: partial?.bpm ?? null,
            bankMsb: partial?.bankMsb ?? null,
            bankLsb: partial?.bankLsb ?? null,
            program: partial?.program ?? null,
            channel: partial?.channel ?? d.settings.midiChannel,
            timbreIds: partial?.timbreIds ?? [],
            notes: partial?.notes ?? "",
            favorite: false,
            updatedAt: Date.now(),
          });
          d.active.sceneId = id;
        });
        return id;
      },
      updateScene: (id, patch) =>
        edit((d) => {
          const scene = d.scenes.find((s) => s.id === id);
          if (!scene) return;
          Object.assign(scene, patch, { updatedAt: Date.now() });
        }),
      deleteScene: (id) =>
        edit((d) => {
          d.scenes = d.scenes.filter((s) => s.id !== id);
          d.songs.forEach((song) => {
            if (song.sceneId === id) song.sceneId = null;
          });
          if (d.active.sceneId === id) d.active.sceneId = null;
        }),
      duplicateScene: (id) =>
        edit((d) => {
          const scene = d.scenes.find((s) => s.id === id);
          if (!scene) return;
          d.scenes.unshift({ ...structuredClone(scene), id: uid(), name: `${scene.name} (cópia)`, updatedAt: Date.now() });
        }),
      createTimbre: (partial) => {
        const id = uid();
        edit((d) => {
          d.timbres.unshift({
            id,
            name: partial?.name || "Novo timbre",
            category: partial?.category || "Outros",
            bankMsb: partial?.bankMsb ?? null,
            bankLsb: partial?.bankLsb ?? null,
            program: partial?.program ?? null,
            channel: partial?.channel ?? d.settings.midiChannel,
            description: partial?.description ?? "",
            favorite: false,
            sceneId: partial?.sceneId ?? null,
            notes: partial?.notes ?? "",
            updatedAt: Date.now(),
          });
        });
        return id;
      },
      updateTimbre: (id, patch) =>
        edit((d) => {
          const timbre = d.timbres.find((t) => t.id === id);
          if (!timbre) return;
          Object.assign(timbre, patch, { updatedAt: Date.now() });
        }),
      deleteTimbre: (id) =>
        edit((d) => {
          d.timbres = d.timbres.filter((t) => t.id !== id);
          d.scenes.forEach((scene) => {
            scene.timbreIds = scene.timbreIds.filter((x) => x !== id);
          });
        }),
      updateSettings: (patch) =>
        edit((d) => {
          d.settings = { ...d.settings, ...patch };
        }),
      setActive: (patch) =>
        edit((d) => {
          d.active = { ...d.active, ...patch };
        }),
      updateBinding: (slot, patch) =>
        edit((d) => {
          const profile = d.profiles.find((p) => p.id === d.active.profileId);
          const binding = profile?.bindings.find((b) => b.slot === slot);
          if (!profile || !binding) return;
          Object.assign(binding, patch, { updatedAt: Date.now() });
          profile.updatedAt = Date.now();
        }),
      clearBinding: (slot) =>
        edit((d) => {
          const profile = d.profiles.find((p) => p.id === d.active.profileId);
          const binding = profile?.bindings.find((b) => b.slot === slot);
          if (!binding || !profile) return;
          binding.message = null;
          binding.channel = null;
          binding.number = null;
          binding.updatedAt = Date.now();
          profile.updatedAt = Date.now();
        }),
      createProfile: (name) =>
        edit((d) => {
          const id = uid();
          d.profiles.push({
            id,
            name: name || "Novo perfil",
            portHint: "",
            channel: d.settings.midiChannel,
            bindings: defaultBindings(),
            updatedAt: Date.now(),
          });
          d.active.profileId = id;
        }),
      renameProfile: (id, name) =>
        edit((d) => {
          const profile = d.profiles.find((p) => p.id === id);
          if (!profile) return;
          profile.name = name;
          profile.updatedAt = Date.now();
        }),
      deleteProfile: (id) =>
        edit((d) => {
          if (d.profiles.length < 2) return;
          d.profiles = d.profiles.filter((p) => p.id !== id);
          if (d.active.profileId === id) d.active.profileId = d.profiles[0]!.id;
        }),
      useProfile: (id) =>
        edit((d) => {
          d.active.profileId = id;
        }),
      toggleEnsaio: (on) =>
        setSession((s) => ({
          ...s,
          ensaio: on,
          scratchTranspose: 0,
          scratchBpm: null,
        })),
      toggleScroll: () => setSession((s) => ({ ...s, scrollOn: !s.scrollOn })),
      tap,
      toggleMetronome,
      requestPanic: () => setSession((s) => ({ ...s, panicOpen: true })),
      confirmPanic,
      closePanic: () => setSession((s) => ({ ...s, panicOpen: false })),
      sendScene,
      stepSong,
      stepSection,
      effectiveTranspose,
      effectiveBpm,
      exportBackup: () =>
        JSON.stringify(
          { app: "STAGE", version: 1, exportedAt: new Date().toISOString(), data: dataRef.current },
          null,
          2,
        ),
      importBackup: (raw, mode) => {
        const parsed = JSON.parse(raw) as Backup;
        if (parsed.app !== "STAGE" || !parsed.data?.songs || !parsed.data.settings) {
          throw new Error("Arquivo inválido. Esperado um backup JSON do STAGE.");
        }
        if (mode === "replace") {
          setData(coerceState(parsed.data));
          return { songs: parsed.data.songs.length, replaced: true };
        }
        edit((d) => {
          const ids = new Set(d.songs.map((s) => s.id));
          parsed.data.songs.forEach((song) => {
            if (!ids.has(song.id)) d.songs.push(song);
            else d.songs.push({ ...song, id: uid(), title: `${song.title} (backup)` });
          });
          parsed.data.setlists?.forEach((list) => d.setlists.push({ ...list, id: uid(), name: `${list.name} (backup)` }));
          parsed.data.scenes?.forEach((scene) => d.scenes.push({ ...scene, id: uid(), name: `${scene.name} (backup)` }));
          parsed.data.timbres?.forEach((timbre) => d.timbres.push({ ...timbre, id: uid(), name: `${timbre.name} (backup)` }));
          parsed.data.profiles?.forEach((profile) =>
            d.profiles.push({ ...profile, id: uid(), name: `${profile.name} (backup)` }),
          );
        });
        return { songs: parsed.data.songs.length, replaced: false };
      },
      resetAll: () => {
        const fresh = emptyData();
        setData(fresh);
      },
    };
  }, [confirmPanic, edit, effectiveBpm, effectiveTranspose, sendScene, stepSection, stepSong, tap, toggleMetronome]);

  const value = useMemo(() => ({ ready, data, session, api }), [ready, data, session, api]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStage() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("STAGE fora do provedor.");
  return ctx;
}

export function activeProfile(data: StageData): MidiProfile {
  return data.profiles.find((p) => p.id === data.active.profileId) ?? data.profiles[0]!;
}

export function activeSong(data: StageData): Song | null {
  return data.songs.find((s) => s.id === data.active.songId) ?? null;
}
