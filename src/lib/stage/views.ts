export const VIEW_IDS = [
  "home",
  "library",
  "song",
  "stage",
  "setlists",
  "keyboard",
  "timbres",
  "scenes",
  "monitor",
  "settings",
  "culto",
  "import",
] as const;

export type ViewId = (typeof VIEW_IDS)[number];

export function isView(value: unknown): value is ViewId {
  return typeof value === "string" && (VIEW_IDS as readonly string[]).includes(value);
}
