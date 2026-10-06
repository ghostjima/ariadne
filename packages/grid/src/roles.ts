import { COLUMN_BY_ID, MARGIN_COLUMNS, OPERATOR_REGIONS, PINNED_COLUMNS } from "./schema.js";
import type { ColumnStore } from "./store.js";

/*
  Role rules. An operator works a subset of regions and does not see
  margins; a manager sees everything and may bulk-edit and export. The
  rules are data, so a UI and the engine read the same answer.
*/

export type Role = "operator" | "manager";
export const ROLES: readonly Role[] = ["operator", "manager"];

export type RoleRules = {
  /* Column ids the role may not see */
  hiddenColumns: readonly string[];
  /* Region codes the role may see, or null for all */
  visibleRegions: readonly number[] | null;
  canEdit: boolean;
  canBulk: boolean;
  canExport: boolean;
};

const RULES: Readonly<Record<Role, RoleRules>> = {
  operator: {
    hiddenColumns: MARGIN_COLUMNS,
    visibleRegions: OPERATOR_REGIONS,
    canEdit: true,
    canBulk: false,
    canExport: false,
  },
  manager: {
    hiddenColumns: [],
    visibleRegions: null,
    canEdit: true,
    canBulk: true,
    canExport: true,
  },
};

export function roleRules(role: Role): RoleRules {
  return RULES[role];
}

/* Column ids the role may not see */
export function forbiddenColumns(role: Role): readonly string[] {
  return RULES[role].hiddenColumns;
}

/* Region codes the role may see, or null for all */
export function allowedRegions(role: Role): readonly number[] | null {
  return RULES[role].visibleRegions;
}

/* Columns of the view that are hidden because of the role, in view order */
export function hiddenForRole(view: { columns: readonly string[] }, role: Role): string[] {
  const forbidden = new Set(forbiddenColumns(role));
  return view.columns.filter((id) => forbidden.has(id));
}

/* Columns actually shown: pinned first, then the view order minus forbidden */
export function visibleColumns(view: { columns: readonly string[] }, role: Role): string[] {
  const forbidden = new Set(forbiddenColumns(role));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of PINNED_COLUMNS) {
    out.push(id);
    seen.add(id);
  }
  for (const id of view.columns) {
    if (seen.has(id) || forbidden.has(id) || !COLUMN_BY_ID.has(id)) continue;
    out.push(id);
    seen.add(id);
  }
  return out;
}

/* Both roles edit status and comment; managers additionally get bulk actions */
export function canEdit(role: Role): boolean {
  return RULES[role].canEdit;
}

export function canBulk(role: Role): boolean {
  return RULES[role].canBulk;
}

export function canExport(role: Role): boolean {
  return RULES[role].canExport;
}

/* Whether the role may see (and so act on) a row */
export function canSeeRow(store: ColumnStore, row: number, role: Role): boolean {
  const regions = RULES[role].visibleRegions;
  return regions === null || regions.includes(store.region[row] ?? -1);
}
