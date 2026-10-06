import { describe, expect, it } from "vitest";
import { COMMENT_MAX, STATUS_COUNT, Status } from "../src/schema.js";
import { APPROVED, REJECTED, editContext, normalizeDraft, validateEdit } from "../src/edit.js";
import { generateAll } from "../src/generator.js";
import { getComment, writeComment } from "../src/store.js";
import { pools as ru } from "../src/pools/ru.js";

const open = { status: 1, comment: "" };

describe("validateEdit: status", () => {
  it("accepts any known status that needs no comment", () => {
    for (let i = 0; i < STATUS_COUNT; i++) {
      if (i === APPROVED || i === REJECTED) continue;
      expect(validateEdit("status", String(i), open)).toBeNull();
    }
  });

  it("rejects values outside the enum", () => {
    const unknown = { code: "status-unknown" };
    expect(validateEdit("status", "-1", open)).toEqual(unknown);
    expect(validateEdit("status", String(STATUS_COUNT), open)).toEqual(unknown);
    expect(validateEdit("status", "не число", open)).toEqual(unknown);
    expect(validateEdit("status", "1.5", open)).toEqual(unknown);
  });

  it("requires a comment before approving", () => {
    expect(validateEdit("status", String(APPROVED), open)).toEqual({
      code: "approve-needs-comment",
    });
    expect(validateEdit("status", String(APPROVED), { status: 1, comment: "  " })).not.toBeNull();
    expect(
      validateEdit("status", String(APPROVED), { status: 1, comment: "проверено" }),
    ).toBeNull();
  });

  it("requires a comment before rejecting", () => {
    expect(validateEdit("status", String(REJECTED), open)).toEqual({
      code: "reject-needs-comment",
    });
    expect(validateEdit("status", String(REJECTED), { status: 1, comment: " \t " })).toEqual({
      code: "reject-needs-comment",
    });
    expect(
      validateEdit("status", String(REJECTED), { status: 1, comment: "нет документов" }),
    ).toBeNull();
  });
});

describe("validateEdit: comment", () => {
  it("accepts text up to the limit and trims before measuring", () => {
    expect(validateEdit("comment", "x".repeat(COMMENT_MAX), open)).toBeNull();
    expect(validateEdit("comment", ` ${"x".repeat(COMMENT_MAX)} `, open)).toBeNull();
    expect(validateEdit("comment", "x".repeat(COMMENT_MAX + 1), open)).toEqual({
      code: "comment-too-long",
      max: COMMENT_MAX,
      length: COMMENT_MAX + 1,
    });
  });

  it("keeps a rejected request explained", () => {
    expect(validateEdit("comment", "", { status: REJECTED, comment: "было" })).toEqual({
      code: "reject-needs-comment",
    });
    expect(
      validateEdit("comment", "не хватает документов", { status: REJECTED, comment: "" }),
    ).toBeNull();
    expect(validateEdit("comment", "", open)).toBeNull();
  });

  it("normalizes only comments", () => {
    expect(normalizeDraft("comment", "  текст  ")).toBe("текст");
    expect(normalizeDraft("status", "3")).toBe("3");
  });
});

describe("edit context", () => {
  it("reads status and the displayed comment from the store", () => {
    const store = generateAll(11, 100, 100);
    const row = Array.from({ length: 100 }, (_, i) => i).find((i) => store.comment[i] === 0)!;
    expect(editContext(store, ru, row)).toEqual({ status: store.status[row], comment: "" });
    writeComment(store, row, { kind: "pool", code: 2 }, 0);
    expect(editContext(store, ru, row).comment).toBe(ru.comments[1]);
    expect(getComment(store, row)).toEqual({ kind: "pool", code: 2 });
    expect(validateEdit("status", String(Status.Approved), editContext(store, ru, row))).toBeNull();
  });
});
