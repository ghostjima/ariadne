// The desk's dialogs: an edit conflict and saving a view.
import { useState } from "react";
import { Button, Callout, Dialog, TextField } from "@ghostjima/stoa-react";
import { validateViewName, type ViewNameError } from "@ariadne/grid";
import type { Strings } from "../i18n";

export type ConflictView = {
  id: string;
  column: string;
  theirs: string;
  mine: string;
  started: string;
  /** Why "use mine" could not be saved, if it was refused. */
  error: string | null;
  /** Escape or Close was pressed: the dialog says that nothing is decided. */
  dismissed: boolean;
};

export function ConflictDialog({
  conflict,
  t,
  onKeepTheirs,
  onUseMine,
  onDismiss,
}: {
  conflict: ConflictView | null;
  t: Strings;
  onKeepTheirs: () => void;
  onUseMine: () => void;
  /** Escape or Close: the dialog stays open, so the typed value is not
   * lost to a key that usually means "cancel". */
  onDismiss: () => void;
}) {
  return (
    <Dialog
      isOpen={conflict !== null}
      onOpenChange={(open) => {
        if (!open) onDismiss();
      }}
      isDismissable={false}
      title={t.conflictTitle}
      actions={
        <>
          <Button onPress={onKeepTheirs}>{t.keepTheirs}</Button>
          <Button variant="primary" onPress={onUseMine}>
            {t.useMine}
          </Button>
        </>
      }
    >
      {conflict && (
        <div className="conflict">
          <p>{t.conflictBody(conflict.id, conflict.column)}</p>
          <dl className="conflict__values">
            <dt>{t.theirs}</dt>
            <dd data-testid="conflict-theirs">{conflict.theirs}</dd>
            <dt>{t.yours}</dt>
            <dd data-testid="conflict-mine">{conflict.mine}</dd>
            <dt>{t.started}</dt>
            <dd>{conflict.started}</dd>
          </dl>
          {conflict.error && (
            <Callout tone="negative" role="alert">
              {conflict.error}
            </Callout>
          )}
          {conflict.dismissed && !conflict.error && (
            <Callout tone="warning" role="alert">
              {t.conflictUndecided}
            </Callout>
          )}
        </div>
      )}
    </Dialog>
  );
}

function nameError(t: Strings, error: ViewNameError, integer: (n: number) => string): string {
  switch (error.code) {
    case "name-empty":
      return t.viewNameErrors.empty;
    case "name-too-long":
      return t.viewNameErrors.tooLong(integer(error.max), integer(error.length));
    case "name-is-preset":
      return t.viewNameErrors.isPreset;
  }
}

export function SaveViewDialog({
  isOpen,
  initialName,
  t,
  integer,
  onClose,
  onSave,
}: {
  isOpen: boolean;
  initialName: string;
  t: Strings;
  integer: (n: number) => string;
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  return (
    <Dialog isOpen={isOpen} onOpenChange={(open) => !open && onClose()} title={t.saveViewTitle}>
      {/* Mounted per opening, so the field starts from the current name. */}
      {isOpen && <SaveViewForm initialName={initialName} t={t} integer={integer} onSave={onSave} />}
    </Dialog>
  );
}

function SaveViewForm({ initialName, t, integer, onSave }: { initialName: string; t: Strings; integer: (n: number) => string; onSave: (name: string) => void }) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    const problem = validateViewName(name);
    if (problem) setError(nameError(t, problem, integer));
    else onSave(name.trim());
  };
  return (
    <div className="save-view">
      <TextField
        label={t.viewName}
        value={name}
        onChange={(v) => {
          setName(v);
          setError(null);
        }}
        onEnter={submit}
        description={t.viewNameHint}
        autoFocus
        aria-describedby={error ? "save-view-error" : undefined}
      />
      {error && (
        <p id="save-view-error" role="alert" className="field-error">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <Button variant="primary" onPress={submit}>
          {t.save}
        </Button>
      </div>
    </div>
  );
}
