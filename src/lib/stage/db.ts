import { emptyData, type StageData } from "./types.ts";

const DB_NAME = "stage";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      if (!db.objectStoreNames.contains("files")) db.createObjectStore("files");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Não foi possível abrir o armazenamento local."));
  });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Falha ao ler dados locais."));
  });
}

export async function loadState(): Promise<StageData | null> {
  if (typeof indexedDB === "undefined") return null;
  const db = await openDb();
  try {
    const tx = db.transaction("kv", "readonly");
    const stored = await request<StageData | undefined>(tx.objectStore("kv").get("state"));
    if (!stored?.settings || !stored.profiles?.length) return null;
    return coerceState(stored);
  } finally {
    db.close();
  }
}

export async function saveState(data: StageData): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  try {
    const tx = db.transaction("kv", "readwrite");
    tx.objectStore("kv").put(data, "state");
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Falha ao salvar."));
    });
  } finally {
    db.close();
  }
}

export async function saveFile(id: string, blob: Blob): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction("files", "readwrite");
    tx.objectStore("files").put(blob, id);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Falha ao guardar o arquivo."));
    });
  } finally {
    db.close();
  }
}

export async function loadFile(id: string): Promise<Blob | null> {
  const db = await openDb();
  try {
    const tx = db.transaction("files", "readonly");
    const blob = await request<Blob | undefined>(tx.objectStore("files").get(id));
    return blob ?? null;
  } finally {
    db.close();
  }
}

export async function deleteFile(id: string): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction("files", "readwrite");
    tx.objectStore("files").delete(id);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Falha ao apagar o arquivo."));
    });
  } finally {
    db.close();
  }
}

/** Preenche campos de versões anteriores sem apagar o que o músico já salvou. */
export function coerceState(stored: StageData): StageData {
  const base = emptyData();
  const profiles = stored.profiles?.length ? stored.profiles : base.profiles;
  const profileId = profiles.some((p) => p.id === stored.active?.profileId)
    ? stored.active.profileId
    : profiles[0]!.id;
  return {
    songs: (stored.songs ?? []).map((song) => ({
      ...song,
      pinnedBlockId: song.pinnedBlockId ?? null,
      tags: song.tags ?? [],
      blocks: song.blocks ?? [],
    })),
    setlists: stored.setlists ?? [],
    scenes: stored.scenes ?? [],
    timbres: stored.timbres ?? [],
    profiles: profiles.map((profile) => ({
      ...profile,
      bindings: profile.bindings?.length ? profile.bindings : base.profiles[0]!.bindings,
    })),
    settings: { ...base.settings, ...stored.settings },
    active: { ...base.active, ...stored.active, profileId },
  };
}
