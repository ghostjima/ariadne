// The inbox writes the citation of a ground or a measure on the case sheet
// an assistant drafts from; the desk writes the same provisions in its
// derivations and letters. One act, one name: this test holds the two
// together, over every ground of the register and every provision of the
// inbox's cases.
import { describe, expect, it } from "vitest";
import { GROUNDS } from "@ariadne/grid";
import { INBOX_SETS, LANGS, caseSheet, citationText, inboxItem, openInbox } from "@ariadne/inbox";
import { amlReasons, clock, paymentGrounds, type Basis } from "@ariadne/rules";
import type { GroundCode } from "@ariadne/runner";
import { groundCitation, replyCites } from "../agent/reply";
import type { Text } from "../agent/text";
import { basisName } from "./sources";

const basis = (source: string, article: string, part: string): Basis => ({ source, act: "", article, part, revision: "", url: "", reading: "text" });

describe("the inbox cites a provision as the desk does", () => {
  it("every ground of the register, in both languages", () => {
    for (const lang of LANGS) {
      for (const spec of GROUNDS) {
        if (!spec || spec.act === "contract") continue;
        const source = (spec.act === "anti_money_laundering" ? amlReasons() : paymentGrounds()).find((g) => g.code === spec.id)!.source;
        expect(citationText(source, spec.article, spec.part, lang), `${spec.id} ${lang}`).toBe(groundCitation({ lang } as Text, spec.id));
      }
    }
  });

  it("the grounds and the measures of every inbox case", () => {
    const inbox = openInbox();
    let measures = 0;
    for (const set of INBOX_SETS) {
      for (const lang of LANGS) {
        for (let seed = 1; seed <= 20; seed++) {
          const item = inboxItem(inbox, set, seed, lang);
          const sheet = caseSheet(item.brief, item.facts, lang);
          for (const g of sheet.grounds) expect(g.citation, `${item.id} ${g.code}`).toBe(groundCitation({ lang } as Text, g.code as GroundCode));
          for (const m of sheet.measures) {
            const b = clock(item.facts).measures.find((x) => x.kind === m.code)!.basis;
            expect(m.citation, `${item.id} ${m.code}`).toBe(basisName(basis(b.source, b.article, b.part), lang));
            measures += 1;
          }
        }
      }
    }
    expect(measures).toBeGreaterThan(0);
  });

  it("the provision behind each option, deadline and next step of every inbox case, as the letter writes it", () => {
    const inbox = openInbox();
    let cited = 0;
    for (const set of INBOX_SETS) {
      for (const lang of LANGS) {
        for (let seed = 1; seed <= 20; seed++) {
          const item = inboxItem(inbox, set, seed, lang);
          const sheet = caseSheet(item.brief, item.facts, lang);
          const cites = replyCites({ lang } as Text, item.facts, item.brief.asOf);
          for (const option of item.brief.clientOptions) expect(sheet.cites.options[option], `${item.id} ${option}`).toBe(cites.option[option]);
          for (const d of item.brief.deadlines) expect(sheet.cites.deadlines[d.kind], `${item.id} ${d.kind}`).toBe(cites.deadline[d.kind]);
          expect(sheet.cites.nextSteps, item.id).toEqual(cites.next);
          cited += Object.keys(sheet.cites.options).length + Object.keys(sheet.cites.deadlines).length + Object.keys(sheet.cites.nextSteps).length;
        }
      }
    }
    expect(cited).toBeGreaterThan(100);
  });
});
