import type { ColumnStore } from "../src/store.js";

/* FNV-1a over every generated buffer of a store, as hex */
export function storeDigest(store: ColumnStore): string {
  const buffers = [
    store.date,
    store.amount,
    store.currency,
    store.status,
    store.client,
    store.owner,
    store.region,
    store.priority,
    store.sla,
    store.slaBreached,
    store.tags,
    store.metrics,
    store.comment,
    store.channel,
    store.updatedAt,
    store.createdBy,
  ];
  let h = 0x811c9dc5;
  for (const b of buffers) {
    const bytes = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
    for (const x of bytes) h = Math.imul(h ^ x, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
