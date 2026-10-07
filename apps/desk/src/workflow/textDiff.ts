// A word-level diff between two texts, and how much of the first changed.
// The desk's own, kept apart so that a diff from Stoa can take its place:
// nothing outside this file knows how it works. Tokens are words, numbers,
// runs of white space and single marks; the alignment is the longest
// common subsequence of tokens, so a moved sentence reads as removed and
// added.

export type DiffPart = { kind: "same" | "removed" | "added"; text: string };

const TOKEN = /\s+|[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu;

export function tokenize(text: string): string[] {
  return text.match(TOKEN) ?? [];
}

/** The parts of `before` kept, removed and added to make `after`, in
 * order; neighbouring parts of one kind are joined. */
export function diffText(before: string, after: string): DiffPart[] {
  const a = tokenize(before);
  const b = tokenize(after);
  // Common prefix and suffix first: most edits touch a small part.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const n = endA - start;
  const m = endB - start;
  // lcs[i][j]: the longest common subsequence of a[start+i..] and b[start+j..]
  const lcs = new Uint32Array((n + 1) * (m + 1));
  const at = (i: number, j: number) => i * (m + 1) + j;
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      lcs[at(i, j)] = a[start + i] === b[start + j] ? (lcs[at(i + 1, j + 1)] ?? 0) + 1 : Math.max(lcs[at(i + 1, j)] ?? 0, lcs[at(i, j + 1)] ?? 0);
  const out: DiffPart[] = [];
  const push = (kind: DiffPart["kind"], text: string) => {
    const last = out[out.length - 1];
    if (last && last.kind === kind) last.text += text;
    else out.push({ kind, text });
  };
  for (let k = 0; k < start; k++) push("same", a[k]!);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[start + i] === b[start + j]) {
      push("same", a[start + i]!);
      i++;
      j++;
    } else if ((lcs[at(i + 1, j)] ?? 0) >= (lcs[at(i, j + 1)] ?? 0)) {
      push("removed", a[start + i]!);
      i++;
    } else {
      push("added", b[start + j]!);
      j++;
    }
  }
  for (; i < n; i++) push("removed", a[start + i]!);
  for (; j < m; j++) push("added", b[start + j]!);
  for (let k = endA; k < a.length; k++) push("same", a[k]!);
  return out;
}

export type ChangeStats = {
  /** Characters of the first text. */
  base: number;
  removed: number;
  added: number;
  /** For each changed passage (removed and added parts between two kept
   * ones), the longer of what was removed and what was added, summed:
   * a word replaced by another of the same length counts once. */
  changed: number;
  /** `changed` over `base`; 0 for two empty texts. */
  share: number;
};

export function changeStats(parts: readonly DiffPart[]): ChangeStats {
  let base = 0;
  let removed = 0;
  let added = 0;
  let changed = 0;
  let passage = { removed: 0, added: 0 };
  const close = () => {
    changed += Math.max(passage.removed, passage.added);
    passage = { removed: 0, added: 0 };
  };
  for (const p of parts) {
    const n = [...p.text].length;
    if (p.kind === "same") {
      close();
      base += n;
    } else if (p.kind === "removed") {
      base += n;
      removed += n;
      passage.removed += n;
    } else {
      added += n;
      passage.added += n;
    }
  }
  close();
  return { base, removed, added, changed, share: base === 0 ? (changed === 0 ? 0 : 1) : changed / base };
}
