import { canEditColumn, canSetStage, type Role } from "./roles.js";
import {
  ASSIGNEE_COUNT,
  EXTENSION_COUNT,
  Extension,
  GROUNDS,
  GROUND_COUNT,
  Ground,
  NOTE_MAX,
  OUTCOME_COUNT,
  Outcome,
  STAGE_COUNT,
  Stage,
  type EditColumn,
  type EnumField,
} from "./schema.js";
import { AS_OF_DAY, RulesFlag, type ColumnStore, type NoteValue } from "./store.js";

/*
  The rules of an edit. Errors are codes with the numbers a message needs;
  the interface writes the sentence. Two of them carry what ariadne-rules
  decided when the row was generated: an extension it refused (a money
  claim under 123-FZ) is refused here, and so is one asked for after the
  last day for its notice (the original reply date, a conservative reading
  the crate states).
*/

export type EditError =
  | { code: "value-unknown" }
  | { code: "role-cannot-edit"; column: EditColumn }
  | { code: "stage-not-for-role" }
  | { code: "reply-needs-outcome" }
  | { code: "refusal-needs-ground" }
  | { code: "ground-other-stream" }
  | { code: "send-needs-signature" }
  | { code: "reply-locked" }
  | { code: "extension-not-allowed" }
  | { code: "extension-too-late"; lastDay: number }
  | { code: "extension-after-reply" }
  | { code: "note-too-long"; max: number; length: number };

/* What the rules of an edit read from a row */
export type RowContext = {
  stage: number;
  outcome: number;
  ground: number;
  extension: number;
  stream: number;
  /* RulesFlag bits */
  rules: number;
  /* the last day for the extension notice, -1 when refused */
  extNotice: number;
};

export function editContext(store: ColumnStore, row: number): RowContext {
  return {
    stage: store.stage[row] ?? 0,
    outcome: store.outcome[row] ?? 0,
    ground: store.ground[row] ?? 0,
    extension: store.extension[row] ?? 0,
    stream: store.stream[row] ?? 0,
    rules: store.rules[row] ?? 0,
    extNotice: store.extNotice[row] ?? -1,
  };
}

const COUNTS: Record<EnumField, number> = {
  stage: STAGE_COUNT,
  outcome: OUTCOME_COUNT,
  ground: GROUND_COUNT,
  extension: EXTENSION_COUNT,
  assignee: ASSIGNEE_COUNT,
};

function known(field: EnumField, value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value < COUNTS[field];
}

/* A reply that names a refusal needs a legal ground */
function refusalWithoutGround(outcome: number, ground: number): boolean {
  return outcome === Outcome.Refused && ground === Ground.None;
}

/* Whether `value` may be set on a row, by a role. Null when it may. */
export function checkField(field: EnumField, value: number, row: RowContext, role: Role): EditError | null {
  if (!known(field, value)) return { code: "value-unknown" };
  if (!canEditColumn(role, field)) return { code: "role-cannot-edit", column: field };
  switch (field) {
    case "stage":
      return checkStage(value, row, role);
    case "outcome":
      if (row.stage >= Stage.AwaitingSignature) return { code: "reply-locked" };
      if (refusalWithoutGround(value, row.ground)) return { code: "refusal-needs-ground" };
      return null;
    case "ground": {
      if (row.stage >= Stage.AwaitingSignature) return { code: "reply-locked" };
      if (refusalWithoutGround(row.outcome, value)) return { code: "refusal-needs-ground" };
      const spec = GROUNDS[value];
      if (spec && !spec.streams.includes(row.stream)) return { code: "ground-other-stream" };
      return null;
    }
    case "extension":
      if (value === Extension.None) return null;
      if ((row.rules & RulesFlag.ExtensionAllowed) === 0) return { code: "extension-not-allowed" };
      if (row.stage >= Stage.Sent) return { code: "extension-after-reply" };
      if (AS_OF_DAY > row.extNotice) return { code: "extension-too-late", lastDay: row.extNotice };
      return null;
    case "assignee":
      return null;
  }
}

function checkStage(value: number, row: RowContext, role: Role): EditError | null {
  if (value === row.stage) return null;
  if (!canSetStage(role, value)) return { code: "stage-not-for-role" };
  if (value >= Stage.LegalReview && value <= Stage.Sent) {
    if (row.outcome === Outcome.Pending) return { code: "reply-needs-outcome" };
    if (refusalWithoutGround(row.outcome, row.ground)) return { code: "refusal-needs-ground" };
  }
  if (value === Stage.Sent && row.stage !== Stage.AwaitingSignature) return { code: "send-needs-signature" };
  return null;
}

/* Whether a note may be saved; trims first */
export function checkNote(draft: string, role: Role): EditError | null {
  if (!canEditColumn(role, "note")) return { code: "role-cannot-edit", column: "note" };
  const text = draft.trim();
  if (text.length > NOTE_MAX) return { code: "note-too-long", max: NOTE_MAX, length: text.length };
  return null;
}

/* The same rule for a note value of any kind */
export function checkNoteValue(value: NoteValue, role: Role): EditError | null {
  if (value.kind === "text") return checkNote(value.text, role);
  return checkNote("", role);
}

/* Returns an error code, or null when the draft may be saved. Enum
   drafts are the code as a string. */
export function validateEdit(col: EditColumn, draft: string, row: RowContext, role: Role): EditError | null {
  if (col === "note") return checkNote(draft, role);
  return checkField(col, Number(draft), row, role);
}

/* The value that actually goes into the store */
export function normalizeDraft(col: EditColumn, draft: string): string {
  return col === "note" ? draft.trim() : draft;
}
