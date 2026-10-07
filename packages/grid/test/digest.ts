import { COLUMN_KEYS, type ColumnStore } from "../src/store.js";

/* FNV-1a over every generated buffer of a store (or over `keys`, in their
   order), as hex */
export function storeDigest(store: ColumnStore, keys: readonly (typeof COLUMN_KEYS)[number][] = COLUMN_KEYS): string {
  let h = 0x811c9dc5;
  for (const key of keys) {
    const b = store[key];
    const bytes = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
    for (const x of bytes) h = Math.imul(h ^ x, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
