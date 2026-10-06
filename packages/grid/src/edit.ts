import { COMMENT_MAX, STATUS_COUNT, Status } from "./schema.js";
import { getComment, type ColumnStore, type CommentValue } from "./store.js";
import { commentText, type TextPools } from "./text.js";

/*
  Inline editing rules for the two editable columns. Errors are codes with
  the numbers a message needs; the interface writes the sentence.
*/

export type EditColumn = "status" | "comment";

export type RowContext = { status: number; comment: string };

export const APPROVED = Status.Approved;
export const REJECTED = Status.Rejected;

export type EditError =
  | { code: "status-unknown" }
  | { code: "approve-needs-comment" }
  | { code: "comment-too-long"; max: number; length: number }
  | { code: "reject-needs-comment" };

/* Whether `value` may be set on a row whose comment is (or is not) blank */
export function checkStatus(value: number, commentBlank: boolean): EditError | null {
  if (!Number.isInteger(value) || value < 0 || value >= STATUS_COUNT) {
    return { code: "status-unknown" };
  }
  if (value === APPROVED && commentBlank) return { code: "approve-needs-comment" };
  if (value === REJECTED && commentBlank) return { code: "reject-needs-comment" };
  return null;
}

/* Whether a comment may be set on a row with status `status`; trims first */
export function checkComment(draft: string, status: number): EditError | null {
  const text = draft.trim();
  if (text.length > COMMENT_MAX) {
    return { code: "comment-too-long", max: COMMENT_MAX, length: text.length };
  }
  if (status === REJECTED && text === "") return { code: "reject-needs-comment" };
  return null;
}

/* The same rule for a comment value of any kind */
export function checkCommentValue(value: CommentValue, status: number): EditError | null {
  if (value.kind === "text") return checkComment(value.text, status);
  if (value.kind === "pool" && value.code === 0) return checkComment("", status);
  return null;
}

/* Returns an error code, or null when the draft may be saved */
export function validateEdit(col: EditColumn, draft: string, row: RowContext): EditError | null {
  if (col === "status") return checkStatus(Number(draft), row.comment.trim() === "");
  return checkComment(draft, row.status);
}

/* The value that actually goes into the store */
export function normalizeDraft(col: EditColumn, draft: string): string {
  return col === "comment" ? draft.trim() : draft;
}

/* The context validateEdit needs, read from the store in one language */
export function editContext(store: ColumnStore, pools: TextPools, row: number): RowContext {
  return { status: store.status[row] ?? 0, comment: commentText(getComment(store, row), pools) };
}
