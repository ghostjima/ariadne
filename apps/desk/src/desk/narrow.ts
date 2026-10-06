// Whether the screen is narrow: below 40rem the pinned ID and client
// columns (360 px with the selection column) would take the whole grid,
// so nothing is pinned and the filters fold away.
import { useSyncExternalStore } from "react";

export const NARROW_QUERY = "(max-width: 40rem)";

const media = () => (typeof matchMedia === "function" ? matchMedia(NARROW_QUERY) : null);

function subscribe(onChange: () => void): () => void {
  const m = media();
  m?.addEventListener("change", onChange);
  return () => m?.removeEventListener("change", onChange);
}

export function useNarrow(): boolean {
  return useSyncExternalStore(subscribe, () => media()?.matches ?? false, () => false);
}
