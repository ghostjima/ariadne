// Changes between two texts, in order: removed text struck through,
// added text underlined, each also named for a screen reader. The desk's
// own until Stoa has a diff; it draws what textDiff.ts computes.
import { VisuallyHidden } from "@ghostjima/stoa-react";
import type { DiffPart } from "./textDiff";

export type DiffViewProps = {
  parts: readonly DiffPart[];
  label: string;
  removed: string;
  added: string;
  lang?: string;
};

export function DiffView({ parts, label, removed, added, lang }: DiffViewProps) {
  return (
    <div className="diff" role="group" aria-label={label} lang={lang}>
      {parts.map((p, k) =>
        p.kind === "same" ? (
          <span key={k}>{p.text}</span>
        ) : p.kind === "removed" ? (
          <del key={k} className="diff__removed">
            <VisuallyHidden>{`[${removed}: `}</VisuallyHidden>
            {p.text}
            <VisuallyHidden>]</VisuallyHidden>
          </del>
        ) : (
          <ins key={k} className="diff__added">
            <VisuallyHidden>{`[${added}: `}</VisuallyHidden>
            {p.text}
            <VisuallyHidden>]</VisuallyHidden>
          </ins>
        ),
      )}
    </div>
  );
}
