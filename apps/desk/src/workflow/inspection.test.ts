// The export of a case for an inspection: every section in the text, one
// row a line in the CSV through the register's CSV code, and a person's
// words that a spreadsheet would run as a formula written as text.
import { describe, expect, it } from "vitest";
import { inspectionCsv, inspectionText, type Inspection } from "./inspection";

const inspection: Inspection = {
  title: "Case C-000001: export for an inspection",
  notes: ["Deadlines as of Oct 6, 2026."],
  header: [
    ["Case", "C-000001"],
    ["Applicant", "Pavel Ivanov; Jr."],
  ],
  derivation: {
    caption: "How the reply's last day was worked out",
    steps: [{ id: "reply", label: "Reply term", formula: "Sep 4, 2026 + 15 working days", value: "Sep 25, 2026", source: { name: "Banking Law No. 395-1, art. 30.1, part 7", revision: "2026-08-04", href: "https://example.test" } }],
  },
  journal: {
    caption: "Journal",
    lines: [
      { when: "Oct 6, 2026, 10:00 AM", who: "Reviewer K. Saburova", what: "Returned for rework", detail: '=HYPERLINK("http://x.test","click")' },
      { when: "Oct 6, 2026, 11:00 AM", who: "Signatory V. Izotova", what: "Letter signed", detail: "Decision: Approve" },
    ],
  },
  letter: { caption: "Letter", text: "Dear client,\n@SUM(1+1) is not a formula here.", signatory: "Signed by V. Izotova", none: "No letter" },
  copies: { caption: "Copies", lines: [{ when: "Oct 6, 2026", who: "", what: "Copy of the reply to the Bank of Russia", detail: "due Oct 6, 2026" }] },
  columns: { section: "Section", when: "When", who: "Who", what: "What", detail: "Detail" },
};

describe("the export for an inspection", () => {
  it("has every section in the text: the header, the derivation with its source, the journal, the letter, the copies", () => {
    const text = inspectionText(inspection);
    for (const part of [
      "Case C-000001: export for an inspection",
      "Applicant: Pavel Ivanov; Jr.",
      "- Reply term: Sep 4, 2026 + 15 working days; Sep 25, 2026; Banking Law No. 395-1, art. 30.1, part 7, 2026-08-04",
      "- Oct 6, 2026, 10:00 AM. Returned for rework. Reviewer K. Saburova.",
      "Signed by V. Izotova",
      "- Copy of the reply to the Bank of Russia: due Oct 6, 2026",
    ])
      expect(text).toContain(part);
  });

  it("writes CSV through the register's code: separators quoted, formulas written as text", () => {
    const lines = inspectionCsv(inspection).split("\r\n");
    expect(lines[0]).toBe("Section;When;Who;What;Detail");
    expect(lines).toContain('Case C-000001: export for an inspection;;;Applicant;"Pavel Ivanov; Jr."');
    const journal = lines.find((l) => l.includes("Returned for rework"))!;
    expect(journal.endsWith(`;"'=HYPERLINK(""http://x.test"",""click"")"`)).toBe(true);
    // The letter cell starts with its first line, not a formula; it keeps its line break, quoted.
    expect(lines.join("\r\n")).toContain('"Dear client,\n@SUM(1+1) is not a formula here."');
    expect(lines.filter((l) => l.startsWith("Journal;"))).toHaveLength(2);
  });
});
