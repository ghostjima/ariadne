// The desk's dialogs: an edit conflict, saving a view, and the columns.
import { useState } from "react";
import {
  Button,
  Callout,
  Checkbox,
  CheckboxGroup,
  Dialog,
  ReorderableList,
  Sheet,
  TextField,
} from "@ghostjima/stoa-react";
import { COLUMNS, PINNED_COLUMNS, forbiddenColumns, validateViewName, type Role, type ViewNameError } from "@ariadne/grid";
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

export function ColumnsSheet({
  isOpen,
  onClose,
  columns,
  onChange,
  role,
  pinStart,
  headers,
  t,
}: {
  isOpen: boolean;
  onClose: () => void;
  /** The view's columns in order, pinned ones included. */
  columns: readonly string[];
  onChange: (columns: string[]) => void;
  role: Role;
  /** Whether ID and client are pinned (not on a narrow screen). */
  pinStart: boolean;
  headers: Readonly<Record<string, string>>;
  t: Strings;
}) {
  const pinned = new Set<string>(PINNED_COLUMNS);
  const forbidden = new Set(forbiddenColumns(role));
  const chosen = columns.filter((id) => !pinned.has(id));
  const order = chosen.filter((id) => !forbidden.has(id)).map((id) => ({ id, textValue: headers[id] ?? id }));
  return (
    <Sheet
      isOpen={isOpen}
      onOpenChange={(open) => !open && onClose()}
      title={t.columnsTitle}
      actions={(close) => (
        <Button variant="primary" onPress={close}>
          {t.done}
        </Button>
      )}
    >
      <div className="columns-sheet">
        <p className="muted">{pinStart ? t.columnsPinned : t.columnsUnpinned}</p>
        <CheckboxGroup
          label={t.columnsShown}
          value={chosen}
          onChange={(next) => {
            // Keep the existing order and add new columns at the end.
            const kept = chosen.filter((id) => next.includes(id));
            const added = next.filter((id) => !kept.includes(id));
            onChange([...PINNED_COLUMNS, ...kept, ...added]);
          }}
        >
          {COLUMNS.filter((c) => !pinned.has(c.id)).map((c) => (
            <Checkbox key={c.id} value={c.id} isDisabled={forbidden.has(c.id)} description={forbidden.has(c.id) ? t.columnHiddenForRole : undefined}>
              {headers[c.id] ?? c.id}
            </Checkbox>
          ))}
        </CheckboxGroup>
        <h3 className="columns-sheet__heading">{t.columnsOrder}</h3>
        <ReorderableList
          label={t.columnsOrder}
          items={order}
          onReorder={(items) => {
            const hidden = chosen.filter((id) => forbidden.has(id));
            onChange([...PINNED_COLUMNS, ...items.map((i) => i.id), ...hidden]);
          }}
          renderItem={(item) => item.textValue}
        />
      </div>
    </Sheet>
  );
}
