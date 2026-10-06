import {
  AUTHOR_COUNT,
  CHANNEL_COUNT,
  CLIENT_COUNT,
  COLUMN_IDS,
  COMMENT_COUNT,
  OWNER_COUNT,
  PRESET_IDS,
  PRIORITY_COUNT,
  REGION_COUNT,
  STATUS_COUNT,
  TAG_COUNT,
  type PresetId,
} from "./schema.js";
import { getComment, rowId, type ColumnStore, type CommentValue } from "./store.js";

/*
  Displayed strings. The store holds codes; a language module supplies the
  free text the codes point at (TextPools) and the words of the interface
  (Labels). Switching language rebuilds the search index and nothing else.
*/

export type TextPools = {
  /* BCP 47 tag, used for collation when sorting text columns and for the
     digits of numbers in generated text ("ar-u-nu-arab": Arabic-Indic) */
  locale: string;
  clients: readonly string[];
  regions: readonly string[];
  owners: readonly string[];
  authors: readonly string[];
  /* Non-empty comments; code k > 0 in the store is comments[k - 1] */
  comments: readonly string[];
  tags: readonly string[];
  /* The colleague's note; "{n}" is replaced with its number */
  colleagueComment: string;
};

export type Labels = {
  /* Header text for every column id of the catalogue */
  columns: Readonly<Record<string, string>>;
  status: readonly string[];
  priority: readonly string[];
  channel: readonly string[];
  presets: Readonly<Record<PresetId, string>>;
};

export type TextIssue =
  | { code: "size"; field: string; expected: number; actual: number }
  | { code: "empty-entry"; field: string; index: number }
  | { code: "missing-label"; field: string; key: string }
  | { code: "template"; field: string };

function checkList(
  issues: TextIssue[],
  field: string,
  list: readonly string[],
  expected: number,
): void {
  if (list.length !== expected) issues.push({ code: "size", field, expected, actual: list.length });
  list.forEach((s, index) => {
    if (s.trim() === "") issues.push({ code: "empty-entry", field, index });
  });
}

/* Checks that a pool fits the generator's code ranges. Empty means usable. */
export function validatePools(pools: TextPools): TextIssue[] {
  const issues: TextIssue[] = [];
  checkList(issues, "clients", pools.clients, CLIENT_COUNT);
  checkList(issues, "regions", pools.regions, REGION_COUNT);
  checkList(issues, "owners", pools.owners, OWNER_COUNT);
  checkList(issues, "authors", pools.authors, AUTHOR_COUNT);
  checkList(issues, "comments", pools.comments, COMMENT_COUNT);
  checkList(issues, "tags", pools.tags, TAG_COUNT);
  if (!pools.colleagueComment.includes("{n}")) {
    issues.push({ code: "template", field: "colleagueComment" });
  }
  return issues;
}

export function validateLabels(labels: Labels): TextIssue[] {
  const issues: TextIssue[] = [];
  for (const id of COLUMN_IDS) {
    const s = labels.columns[id];
    if (s === undefined || s.trim() === "") {
      issues.push({ code: "missing-label", field: "columns", key: id });
    }
  }
  checkList(issues, "status", labels.status, STATUS_COUNT);
  checkList(issues, "priority", labels.priority, PRIORITY_COUNT);
  checkList(issues, "channel", labels.channel, CHANNEL_COUNT);
  for (const id of PRESET_IDS) {
    const s = labels.presets[id];
    if (s === undefined || s.trim() === "") {
      issues.push({ code: "missing-label", field: "presets", key: id });
    }
  }
  return issues;
}

const numberFormats = new Map<string, Intl.NumberFormat>();

/* A whole number in the pool's digits, without grouping */
function poolNumber(n: number, pools: TextPools): string {
  let format = numberFormats.get(pools.locale);
  if (!format) {
    format = new Intl.NumberFormat(pools.locale, { useGrouping: false, maximumFractionDigits: 0 });
    numberFormats.set(pools.locale, format);
  }
  return format.format(n);
}

export function commentText(value: CommentValue, pools: TextPools): string {
  switch (value.kind) {
    case "pool":
      return value.code === 0 ? "" : (pools.comments[value.code - 1] ?? "");
    case "text":
      return value.text;
    case "colleague":
      return pools.colleagueComment.replace("{n}", poolNumber(value.n, pools));
  }
}

/* Tag labels of a bit mask, in bit order */
export function tagsText(mask: number, pools: TextPools, separator = ", "): string {
  if (mask === 0) return "";
  const out: string[] = [];
  for (let k = 0; k < TAG_COUNT; k++) if (mask & (1 << k)) out.push(pools.tags[k] ?? "");
  return out.join(separator);
}

/* The displayed text of a row's free-text fields */
export type RowText = {
  id: string;
  client: string;
  owner: string;
  region: string;
  tags: string;
  comment: string;
  createdBy: string;
};

export function rowText(store: ColumnStore, pools: TextPools, i: number): RowText {
  return {
    id: rowId(i),
    client: pools.clients[store.client[i] ?? 0] ?? "",
    owner: pools.owners[store.owner[i] ?? 0] ?? "",
    region: pools.regions[store.region[i] ?? 0] ?? "",
    tags: tagsText(store.tags[i] ?? 0, pools),
    comment: commentText(getComment(store, i), pools),
    createdBy: pools.authors[store.createdBy[i] ?? 0] ?? "",
  };
}

/* Lowercase search string per row, in one language */
export type SearchIndex = string[];

export function buildSearch(parts: {
  id: string;
  client: string;
  owner: string;
  tags: string;
  comment: string;
  createdBy: string;
}): string {
  return `${parts.id} ${parts.client} ${parts.owner} ${parts.tags} ${parts.comment} ${parts.createdBy}`.toLowerCase();
}

/* Search strings for every loaded row; rows not loaded get "" */
export function buildSearchIndex(store: ColumnStore, pools: TextPools): SearchIndex {
  const out = new Array<string>(store.size).fill("");
  /* Lowercase the pools once instead of once per row */
  const lower = (list: readonly string[]) => list.map((s) => s.toLowerCase());
  const clients = lower(pools.clients);
  const owners = lower(pools.owners);
  const authors = lower(pools.authors);
  const comments = ["", ...lower(pools.comments)];
  const tagCache = new Array<string | undefined>(256);
  for (let i = 0; i < store.size; i++) {
    if (store.loaded[i] === 0) continue;
    const mask = store.tags[i] ?? 0;
    let tags = tagCache[mask];
    if (tags === undefined) {
      tags = tagsText(mask, pools).toLowerCase();
      tagCache[mask] = tags;
    }
    const edit = store.commentEdits.get(i);
    const comment =
      edit === undefined ? comments[store.comment[i] ?? 0] : commentText(edit, pools).toLowerCase();
    out[i] = `${rowId(i).toLowerCase()} ${clients[store.client[i] ?? 0]} ${owners[store.owner[i] ?? 0]} ${tags} ${comment} ${authors[store.createdBy[i] ?? 0]}`;
  }
  return out;
}

/* Refreshes one row after an edit of a text field, or after its chunk loads */
export function refreshSearch(
  search: SearchIndex,
  store: ColumnStore,
  pools: TextPools,
  i: number,
): void {
  search[i] = store.loaded[i] === 0 ? "" : buildSearch(rowText(store, pools, i));
}
