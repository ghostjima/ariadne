// A letter to the applicant: its text, a line to a sentence, and the
// signatory named under it. The desk's own until Stoa has a Letter.
export type LetterViewProps = {
  text: string;
  lang: string;
  /** The signatory line under the text. */
  signatory: string;
  label: string;
};

export function LetterView({ text, lang, signatory, label }: LetterViewProps) {
  return (
    <figure className="letter" aria-label={label}>
      <blockquote lang={lang}>
        {text.split("\n").map((line, k) => (
          <p key={k}>{line}</p>
        ))}
      </blockquote>
      <figcaption className="letter__signatory">{signatory}</figcaption>
    </figure>
  );
}
