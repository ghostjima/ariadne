// The letter's editor: a text field of several lines, as Stoa draws a
// field, on React Aria's TextField with a textarea. The desk's own, not
// Stoa's TextArea: the letter is often in the other language than the
// page, and Stoa's TextArea takes no lang for its text.
import { FieldError, Label, Text, TextArea as AriaTextArea, TextField as AriaTextField } from "react-aria-components";

export type TextAreaProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  description?: string;
  rows?: number;
  lang?: string;
  autoFocus?: boolean;
  isInvalid?: boolean;
  errorMessage?: string;
};

export function TextArea({ label, value, onChange, description, rows = 12, lang, autoFocus, isInvalid = false, errorMessage }: TextAreaProps) {
  return (
    <AriaTextField className="stoa-field text-area" value={value} onChange={onChange} autoFocus={autoFocus} isInvalid={isInvalid} validationBehavior="aria">
      <Label className="stoa-field__label">{label}</Label>
      <AriaTextArea className="stoa-field__input text-area__input" rows={rows} lang={lang} spellCheck={false} />
      {description && (
        <Text slot="description" className="stoa-field__description">
          {description}
        </Text>
      )}
      <FieldError className="stoa-field__error">{errorMessage}</FieldError>
    </AriaTextField>
  );
}
