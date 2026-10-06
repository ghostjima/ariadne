import { inScope, type Scope } from "./filter.js";
import { COLUMN_BY_ID, PINNED_COLUMNS, SELF_ASSIGNEE, SELF_SIGNATORY, Stage, type EditColumn } from "./schema.js";
import type { ColumnStore } from "./store.js";

/*
  Role rules. The operator works the cases assigned to them: drafts, asks
  for facts, decides the outcome and names the ground, and hands the reply
  to legal review and then to signature. The signatory signs and sends the
  replies assigned to them, or returns one to drafting. The supervisor
  sees every case, approves extensions, reassigns cases in bulk and
  exports. A column that would show the same name in every row the role
  sees (the operator's own name as assignee) is hidden for that role. The
  rules are data, so the interface and the engine read the same answer.
*/

export type Role = "operator" | "signatory" | "supervisor";
export const ROLES: readonly Role[] = ["operator", "signatory", "supervisor"];

export type RoleRules = {
  /* Column ids the role does not see */
  hiddenColumns: readonly string[];
  /* The rows the role sees */
  scope: Scope;
  /* Columns the role edits inline */
  editable: readonly EditColumn[];
  /* The stages the role may move a case to */
  stages: readonly number[];
  canBulk: boolean;
  canExport: boolean;
};

const RULES: Readonly<Record<Role, RoleRules>> = {
  operator: {
    hiddenColumns: ["assignee"],
    scope: { assignees: [SELF_ASSIGNEE], signatories: null },
    editable: ["stage", "outcome", "ground", "note"],
    stages: [Stage.Registered, Stage.WaitingForFacts, Stage.Drafting, Stage.LegalReview, Stage.AwaitingSignature],
    canBulk: false,
    canExport: false,
  },
  signatory: {
    hiddenColumns: ["signatory"],
    scope: { assignees: null, signatories: [SELF_SIGNATORY] },
    editable: ["stage", "note"],
    stages: [Stage.Drafting, Stage.Sent],
    canBulk: false,
    canExport: false,
  },
  supervisor: {
    hiddenColumns: [],
    scope: { assignees: null, signatories: null },
    editable: ["stage", "outcome", "ground", "extension", "assignee", "note"],
    stages: [
      Stage.Registered,
      Stage.WaitingForFacts,
      Stage.Drafting,
      Stage.LegalReview,
      Stage.AwaitingSignature,
      Stage.Sent,
      Stage.Closed,
    ],
    canBulk: true,
    canExport: true,
  },
};

export function roleRules(role: Role): RoleRules {
  return RULES[role];
}

/* Column ids the role does not see */
export function forbiddenColumns(role: Role): readonly string[] {
  return RULES[role].hiddenColumns;
}

/* The rows the role sees */
export function roleScope(role: Role): Scope {
  return RULES[role].scope;
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

export function canEditColumn(role: Role, column: EditColumn): boolean {
  return RULES[role].editable.includes(column);
}

/* Whether the role may move a case to `stage` */
export function canSetStage(role: Role, stage: number): boolean {
  return RULES[role].stages.includes(stage);
}

export function canBulk(role: Role): boolean {
  return RULES[role].canBulk;
}

export function canExport(role: Role): boolean {
  return RULES[role].canExport;
}

/* Whether the role may see (and so act on) a row */
export function canSeeRow(store: ColumnStore, row: number, role: Role): boolean {
  return inScope(store, row, RULES[role].scope);
}
