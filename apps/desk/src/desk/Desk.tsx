// The desk: views, role, filters and search above the grid, bulk changes on
// the selection, inline edits with conflict resolution, CSV export, and the
// keyboard shortcuts. Data work goes through DeskEngine (worker first).
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  AlertDialog,
  Button,
  Callout,
  ChoiceGroup,
  DataGrid,
  Disclosure,
  EmptyState,
  FilterChip,
  FilterChipGroup,
  LiveRegion,
  ProgressBar,
  Select,
  ShortcutsDialog,
  Tag,
  TextField,
  ToastQueue,
  ToastRegion,
  Toolbar,
  groupShortcuts,
  isApplePlatform,
  keepFocusInPlace,
  shortcutKeys,
  useShortcuts,
  useStoaFormat,
  type DataGridColumn,
  type DataGridEdit,
  type DataGridEditTarget,
  type DataGridSort,
  type Shortcut,
  type ShortcutGroup,
} from "@ghostjima/stoa-react";
import {
  AS_OF_DAY,
  CORPUS_CHUNK,
  CORPUS_ROWS,
  CSV_LIMIT,
  DEFAULT_SEED,
  DEFAULT_VIEW,
  EMPTY_FILTERS,
  EditHistory,
  PRESET_VIEWS,
  SCALE_CHUNK,
  SCALE_ROWS,
  SELF_ASSIGNEE,
  SELF_SIGNATORY,
  Stage,
  activeFilterCount,
  applyRemoteEdit,
  beginEdit,
  canBulk,
  canEditColumn,
  canExport,
  colleagueSchedule,
  criteriaFor,
  detectConflict,
  dueTicks,
  hasActiveFilters,
  hiddenForRole,
  isPreset,
  normalizeDraft,
  planColleagueEdit,
  readCell,
  removeView,
  rowId,
  rowOfId,
  saveView,
  viewToUrl,
  visibleColumns,
  type CellValue,
  type Density,
  type EditColumn,
  type EditSession,
  type Role,
  type View,
} from "@ariadne/grid";
import { DeskEngine, type QueryResult } from "../data/engine";
import { POOLS } from "../data/query";
import type { Lang, Strings } from "../i18n";
import { buildColumns, cellValueText, editErrorText, makeFormats } from "./columns";
import { countText } from "./counts";
import { useNarrow } from "./narrow";
import { ColumnsSheet, ConflictDialog, SaveViewDialog, type ConflictView } from "./dialogs";
import { afterPaint, record, recordFirstRows } from "./metrics";
import { PerfPanel } from "./PerfPanel";
import { readSavedViews, readUrlConfig, setParam, writeSavedViews, type UrlConfig } from "./settings";

const SEED = DEFAULT_SEED;
/** The view the desk opens on: the open cases, the least time left
 * first. First in the list of views. */
const START_VIEW = PRESET_VIEWS.find((v) => v.name === "open") ?? DEFAULT_VIEW;
const PRESETS = [START_VIEW, ...PRESET_VIEWS.filter((v) => v !== START_VIEW)];
const EDITABLE: readonly string[] = ["stage", "outcome", "ground", "extension", "assignee", "note"];
const isEditColumn = (column: string): column is EditColumn => EDITABLE.includes(column);

/** Row keys, one string per store row, made once. */
let keys: string[] = [];
const rowKey = (i: number): string => keys[i] ?? rowId(i);

type Conflict = { row: number; col: EditColumn; mine: string; base: CellValue; theirs: CellValue; error: string | null; dismissed: boolean };

function createEngine(config: UrlConfig): DeskEngine {
  return new DeskEngine({
    seed: SEED,
    total: config.scale ? SCALE_ROWS : CORPUS_ROWS,
    chunkSize: config.scale ? SCALE_CHUNK : CORPUS_CHUNK,
    failChunks: config.failChunks,
    createWorker: config.useWorker ? () => new Worker(new URL("../data/desk.worker.ts", import.meta.url), { type: "module" }) : undefined,
  });
}

export function Desk({ lang, t }: { lang: Lang; t: Strings }) {
  const stoa = useStoaFormat();
  const [config] = useState(readUrlConfig);
  const [engine] = useState(() => createEngine(config));
  const store = engine.store;
  if (keys.length !== store.size) keys = Array.from({ length: store.size }, (_, i) => rowId(i));
  const snap = useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  const history = useRef(new EditHistory());
  const toasts = useMemo(() => new ToastQueue(), []);
  const { pools, labels } = POOLS[lang];
  const formats = useMemo(() => makeFormats(lang), [lang]);
  const integer = useCallback((n: number) => formats.integer.format(n), [formats]);
  const decimal = useCallback((n: number) => formats.one.format(n), [formats]);

  const [view, setView] = useState<View>(() => config.view ?? START_VIEW);
  const [dirty, setDirty] = useState(false);
  const [savedViews, setSavedViews] = useState<View[]>(readSavedViews);
  const [role, setRole] = useState<Role>(config.role);
  const [selection, setSelection] = useState<ReadonlySet<string>>(() => new Set());
  // Bumped by every write to the store, so the grid draws the new values.
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);
  const [announcement, setAnnouncement] = useState("");
  const [dialog, setDialog] = useState<"save" | "delete" | "columns" | "shortcuts" | null>(null);
  const [bulkAssignee, setBulkAssignee] = useState(SELF_ASSIGNEE);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [session, setSession] = useState<EditSession | null>(null);

  useEffect(() => {
    engine.start();
    return () => engine.stop();
  }, [engine]);

  // Queries: the view's filters as the role sees them, its sort, and the
  // language (search and text sorts are per language).
  const criteria = useMemo(() => criteriaFor(view, role), [view.filters, view.search, role]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    engine.query({ criteria, sort: view.sort, lang });
  }, [engine, criteria, view.sort, lang]);

  // While an editor is open the grid keeps the rows it had: a colleague's
  // change that moved the row out of the view would close the editor and
  // drop what the person typed.
  const frozen = useRef<QueryResult | null>(null);
  const result = session ? frozen.current : snap.result;
  const shownResult = useRef(result);
  shownResult.current = result;
  const rows = useMemo(() => (result ? Array.from(result.index) : []), [result]);

  // Timings: interaction to the repainted grid, round trip, first rows.
  const pending = useRef<{ kind: "filter" | "sort"; start: number; id: number } | null>(null);
  const mark = (kind: "filter" | "sort") => {
    pending.current = { kind, start: performance.now(), id: engine.upcomingId };
  };
  useLayoutEffect(() => {
    if (!result) return;
    if (result.index.length > 0 || snap.load.loadedRows > 0) recordFirstRows();
    const p = pending.current;
    if (p && result.id >= p.id) {
      pending.current = null;
      afterPaint(() => record(p.kind, performance.now() - p.start, p.start));
    }
  }, [result]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const r = snap.result;
    if (!r) return;
    const now = performance.now();
    const compute = r.sortMs + r.searchMs + r.filterMs;
    record("round-trip", r.roundTripMs, now - r.roundTripMs);
    // Measured inside the worker; only its duration is meaningful.
    record("compute", compute, now - compute);
  }, [snap.result]);

  const ids = useMemo(() => visibleColumns(view, role), [view.columns, role]); // eslint-disable-line react-hooks/exhaustive-deps
  const narrow = useNarrow();
  const columns = useMemo(
    () => buildColumns(ids, { store, lang, t, formats, role, pin: !narrow }),
    [ids, store, lang, t, formats, role, narrow],
  );

  const announce = (text: string) => setAnnouncement(text);

  // Views.
  const viewLabel = (v: View) => (isPreset(v.name) ? labels.presets[v.name as keyof typeof labels.presets] : v.name || t.unsavedView);
  const patchView = (patch: Partial<View>) => {
    setView((v) => ({ ...v, ...patch }));
    setDirty(true);
  };
  const applyView = (next: View) => {
    mark("filter");
    setView(next);
    setDirty(false);
    setSelection(new Set());
    announce(t.viewApplied(viewLabel(next)));
  };
  const allViews = [...PRESETS, ...savedViews];
  const viewOptions = allViews.map((v) => ({ id: v.name, label: viewLabel(v) }));
  if (!allViews.some((v) => v.name === view.name)) viewOptions.push({ id: view.name || "-", label: viewLabel(view) });
  const isSaved = savedViews.some((v) => v.name === view.name);

  const onSaveView = (name: string) => {
    const list = saveView(savedViews, view, name);
    setSavedViews(list);
    writeSavedViews(list);
    setView({ ...view, name });
    setDirty(false);
    setDialog(null);
    toasts.add({ tone: "positive", text: t.viewSaved(name), timeout: 5000 });
  };
  const onDeleteView = () => {
    const name = view.name;
    const list = removeView(savedViews, name);
    setSavedViews(list);
    writeSavedViews(list);
    applyView(START_VIEW);
    toasts.add({ tone: "info", text: t.viewDeleted(name), timeout: 5000 });
  };
  const copyLink = () => {
    const url = viewToUrl(view, location.href);
    window.history.replaceState(window.history.state, "", url);
    const done = (copied: boolean) => toasts.add({ tone: "info", text: copied ? t.linkCopied : t.linkInAddressBar, timeout: 5000 });
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => done(true), () => done(false));
    else done(false);
  };

  // Role.
  const changeRole = (next: Role) => {
    mark("filter");
    setRole(next);
    setParam("role", next === "supervisor" ? null : next);
    setSelection(new Set());
  };

  // Filters.
  const filters = view.filters;
  const setFilters = (patch: Partial<typeof filters>) => {
    mark("filter");
    patchView({ filters: { ...filters, ...patch } });
  };
  const clearFilters = () => {
    mark("filter");
    patchView({ filters: EMPTY_FILTERS, search: "" });
  };
  const anyFilter = hasActiveFilters(filters) || view.search.trim() !== "";
  const facets = result?.facets;

  // Edits. An edit session (the value the editor started from) runs from
  // the grid's edit start to its save or cancel.
  const searchBox = useRef<HTMLDivElement>(null);
  const gridBox = useRef<HTMLDivElement>(null);
  const focusGrid = () => gridBox.current?.querySelector<HTMLElement>('[role="grid"] [tabindex="0"]')?.focus();
  const sessionRef = useRef<EditSession | null>(null);
  const onEditStart = ({ row, column }: DataGridEditTarget<number>) => {
    if (!isEditColumn(column)) return;
    const s = beginEdit(store, row, column);
    sessionRef.current = s;
    frozen.current = shownResult.current;
    setSession(s);
  };
  const endSession = () => {
    sessionRef.current = null;
    setSession(null);
  };

  /** Saves an edit through the history; returns the refusal, if any. */
  const applyEdit = (row: number, col: EditColumn, value: string): string | null => {
    const now = Date.now();
    const res =
      col === "note"
        ? history.current.setNote(store, row, { kind: "text", text: normalizeDraft(col, value) }, role, now)
        : history.current.setField(store, [row], col, Number(value), role, now);
    const refused = res.rejected[0];
    if (refused) {
      const reason = editErrorText(t, formats, labels, refused.error);
      announce(t.editRefused(rowId(row), reason));
      return reason;
    }
    engine.sync([row], col === "note");
    bump();
    announce(t.editSaved(rowId(row), labels.columns[col] ?? col, cellValueText(readCell(store, row, col), lang, t)));
    return null;
  };

  const onEdit = ({ row, column, value }: DataGridEdit<number>) => {
    if (!isEditColumn(column)) return;
    const s = sessionRef.current;
    endSession();
    if (s && s.row === row && s.col === column) {
      const found = detectConflict(store, s);
      if (found) {
        setConflict({ row, col: column, mine: value, base: s.base, theirs: found.theirs, error: null, dismissed: false });
        return;
      }
    }
    applyEdit(row, column, value);
  };

  const conflictView: ConflictView | null = conflict && {
    id: rowId(conflict.row),
    column: labels.columns[conflict.col] ?? conflict.col,
    theirs: cellValueText(conflict.theirs, lang, t),
    mine: conflict.col === "note" ? conflict.mine.trim() || t.emptyNote : cellValueText({ col: conflict.col, value: Number(conflict.mine) }, lang, t),
    started: cellValueText(conflict.base, lang, t),
    error: conflict.error,
    dismissed: conflict.dismissed,
  };
  // Once the dialog has gone, the focus goes back to the edited cell: the
  // editor that had it before the dialog is gone too.
  const refocusGrid = useRef(false);
  useEffect(() => {
    if (conflict !== null || !refocusGrid.current) return;
    refocusGrid.current = false;
    const frame = requestAnimationFrame(focusGrid);
    return () => cancelAnimationFrame(frame);
  }, [conflict]); // eslint-disable-line react-hooks/exhaustive-deps
  const closeConflict = () => {
    refocusGrid.current = true;
    setConflict(null);
  };
  const keepTheirs = () => {
    if (!conflict) return;
    closeConflict();
    toasts.add({ tone: "info", text: t.keptTheirs(rowId(conflict.row)), timeout: 5000 });
  };
  const useMine = () => {
    if (!conflict) return;
    const error = applyEdit(conflict.row, conflict.col, conflict.mine);
    if (error) setConflict({ ...conflict, error });
    else {
      closeConflict();
      toasts.add({ tone: "positive", text: t.usedMine(rowId(conflict.row)), timeout: 5000 });
    }
  };
  const dismissConflict = () => {
    if (conflict && !conflict.dismissed) setConflict({ ...conflict, dismissed: true });
  };

  // The simulated colleague.
  const tick = useRef(0);
  const simulate = () => {
    const visible = shownResult.current?.index ?? new Uint32Array(0);
    const s = sessionRef.current;
    const edit = planColleagueEdit(store, visible, tick.current++, s);
    if (!edit) return;
    applyRemoteEdit(store, edit, Date.now());
    engine.sync([edit.row], edit.cell.col === "note");
    bump();
    const id = rowId(edit.row);
    const column = labels.columns[edit.cell.col] ?? edit.cell.col;
    const value = cellValueText(edit.cell, lang, t);
    const mine = s !== null && s.row === edit.row && s.col === edit.cell.col;
    toasts.add({ tone: mine ? "warning" : "info", text: mine ? t.colleagueEditing(id, column, value) : t.colleagueChanged(id, column, value), timeout: 6000 });
  };
  const simulateRef = useRef(simulate);
  simulateRef.current = simulate;
  useEffect(() => {
    const seconds = config.colleagueSeconds;
    if (seconds === null) return;
    const schedule = colleagueSchedule(SEED, 10_000, seconds * 1000);
    const started = performance.now();
    let fired = 0;
    const timer = setInterval(() => {
      const due = dueTicks(schedule, performance.now() - started);
      for (; fired < due; fired++) simulateRef.current();
    }, Math.min(1000, seconds * 250));
    return () => clearInterval(timer);
  }, [config.colleagueSeconds]);

  // Selection and bulk changes. A bulk change applies to the selected rows
  // that the current view shows.
  const selectedRows = useMemo(() => {
    if (selection.size === 0 || !result) return [];
    const shown = new Uint8Array(store.size);
    for (const i of result.index) shown[i] = 1;
    const out: number[] = [];
    for (const key of selection) {
      const r = rowOfId(key, store.size);
      if (r >= 0 && shown[r] === 1) out.push(r);
    }
    return out;
  }, [selection, result, store]);

  const undoLast = () => {
    const r = history.current.undo(store);
    if (!r) {
      announce(t.nothingToUndo);
      return;
    }
    engine.sync(r.restored, r.entry.kind === "note");
    bump();
    const n = r.restored.length;
    const c = r.conflicts.length;
    toasts.add({
      tone: c > 0 ? "warning" : "info",
      text: [n > 0 ? t.undone(integer(n), n) : "", c > 0 ? t.undoConflicts(integer(c), c) : ""].filter(Boolean).join(" "),
      timeout: 6000,
    });
  };

  // The bulk bar closes with its selection; the focus, on its Apply or
  // Clear selection, goes back to the grid's active cell first.
  const closeBulk = () => {
    focusGrid();
    setSelection(new Set());
  };

  const applyBulk = () => {
    if (selectedRows.length === 0 || !canBulk(role)) return;
    const res = history.current.setField(store, selectedRows, "assignee", bulkAssignee, role, Date.now());
    const skipped = res.rejected.length;
    closeBulk();
    if (!res.entry) {
      toasts.add({ tone: "warning", text: t.bulkSkipped(integer(skipped)), timeout: 6000 });
      return;
    }
    engine.sync(res.applied, false);
    bump();
    const n = res.applied.length;
    const text = [t.bulkDone(pools.assignees[bulkAssignee] ?? "", integer(n), n), skipped > 0 ? t.bulkSkipped(integer(skipped)) : ""].filter(Boolean).join(" ");
    toasts.add({ tone: skipped > 0 ? "warning" : "positive", text, action: { label: t.undo, onAction: undoLast }, timeout: 10_000 });
  };

  // CSV export of the current view, computed in the worker.
  const exportCsv = async () => {
    if (!canExport(role) || !result) return;
    const total = result.index.length;
    const text = await engine.csv(result.index, ids, lang, CSV_LIMIT);
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = t.csvFile;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    const n = Math.min(total, CSV_LIMIT);
    toasts.add({ tone: "positive", text: total > CSV_LIMIT ? t.exportedCapped(integer(n), integer(total)) : t.exported(integer(n), n), timeout: 6000 });
  };

  // Keyboard.
  const app = t.shortcutGroups.app;
  const shortcuts: Shortcut[] = [
    { key: "/", description: t.keys.search, group: app, onTrigger: () => searchBox.current?.querySelector("input")?.focus() },
    { key: "?", description: t.keys.help, group: app, onTrigger: () => setDialog("shortcuts") },
    { key: "z", modifiers: ["mod"], description: t.keys.undo, group: app, onTrigger: undoLast },
    { key: "g", description: t.keys.grid, group: app, onTrigger: focusGrid },
    { key: "x", description: t.keys.clear, group: app, onTrigger: clearFilters },
    { key: "s", description: t.keys.saveView, group: app, onTrigger: () => setDialog("save") },
    { key: "c", description: t.keys.colleague, group: app, onTrigger: simulate },
  ];
  // Listed only for a role that may export: Stoa draws a disabled line in
  // the shortcuts dialog below the contrast axe asks for.
  if (canExport(role)) shortcuts.push({ key: "e", description: t.keys.export, group: app, onTrigger: () => void exportCsv() });
  const help = useShortcuts(shortcuts, { enabled: dialog === null && conflict === null });
  const apple = isApplePlatform();
  const k = (key: string, modifiers?: Shortcut["modifiers"]) => shortcutKeys({ key, modifiers }, apple, stoa.messages);
  const gridGroups: ShortcutGroup[] = [
    {
      title: t.shortcutGroups.grid,
      shortcuts: [
        { keys: [...k("ArrowUp"), ...k("ArrowDown"), ...k("ArrowLeft"), ...k("ArrowRight")], description: t.keys.move },
        { keys: k("Home"), description: t.keys.rowStart },
        { keys: k("End"), description: t.keys.rowEnd },
        { keys: k("Home", ["mod"]), description: t.keys.gridStart },
        { keys: k("End", ["mod"]), description: t.keys.gridEnd },
        { keys: k("PageUp"), description: t.keys.pageUp },
        { keys: k("PageDown"), description: t.keys.pageDown },
        { keys: k("Enter"), description: t.keys.sort },
      ],
    },
    {
      title: t.shortcutGroups.editing,
      shortcuts: [
        { keys: k("F2"), description: t.keys.edit },
        { keys: k("Enter"), description: t.keys.saveEdit },
        { keys: k("Escape"), description: t.keys.cancelEdit },
      ],
    },
    {
      title: t.shortcutGroups.selection,
      shortcuts: [
        { keys: k(" "), description: t.keys.selectRow },
        { keys: k("ArrowDown", ["shift"]), description: t.keys.extend },
        { keys: k("a", ["mod"]), description: t.keys.selectAll },
      ],
    },
  ];
  const groups = [...gridGroups, ...groupShortcuts(help, app)];

  // The grid only renders again when what it shows changes; its handlers
  // reach the latest state through a ref.
  const latest = useRef({ onEdit, onEditStart, endSession, mark, patchView });
  latest.current = { onEdit, onEditStart, endSession, mark, patchView };
  const gridHandlers = useMemo<GridHandlers>(
    () => ({
      onSortChange: (s) => {
        latest.current.mark("sort");
        latest.current.patchView({ sort: s ? { id: s.column, desc: s.direction === "descending" } : null });
      },
      onSelectionChange: setSelection,
      onEdit: (edit) => latest.current.onEdit(edit),
      onEditStart: (target) => latest.current.onEditStart(target),
      onEditCancel: () => latest.current.endSession(),
    }),
    [],
  );
  const clearRef = useRef(clearFilters);
  clearRef.current = clearFilters;
  const emptyState = useMemo(
    () => <EmptyState title={t.emptyTitle} description={t.emptyBody} action={<Button onPress={() => clearRef.current()}>{t.clearFilters}</Button>} />,
    [t],
  );

  // States.
  const load = snap.load;
  const loading = !result || (load.loadedRows === 0 && load.loading);
  const sort = useMemo<DataGridSort | null>(
    () => (view.sort ? { column: view.sort.id, direction: view.sort.desc ? "descending" : "ascending" } : null),
    [view.sort],
  );
  const density = view.density === "default" ? "regular" : view.density;
  const hidden = hiddenForRole(view, role);
  const shownCount = result?.index.length ?? 0;

  const chips = (list: readonly string[], counts: Uint32Array | undefined) => list.map((label, i) => ({ id: i, label, count: counts?.[i] }));
  const chipGroups = (
    <>
      <ChipRow>
        <FilterChipGroup<number>
          label={t.stageGroup}
          size="small"
          chips={chips(labels.stage, facets?.stage)}
          value={filters.stage}
          onChange={(stage) => setFilters({ stage })}
        />
      </ChipRow>
      <ChipRow>
        <FilterChipGroup<number>
          label={t.deadlineGroup}
          size="small"
          chips={chips(labels.deadline, facets?.deadline)}
          value={filters.deadline}
          onChange={(deadline) => setFilters({ deadline })}
        />
      </ChipRow>
      <ChipRow>
        <FilterChipGroup<number>
          label={t.streamGroup}
          size="small"
          chips={chips(labels.stream, facets?.stream)}
          value={filters.stream}
          onChange={(stream) => setFilters({ stream })}
        />
      </ChipRow>
      <ChipRow>
        <FilterChipGroup<number>
          label={t.sourceGroup}
          size="small"
          chips={chips(labels.source, facets?.source)}
          value={filters.source}
          onChange={(source) => setFilters({ source })}
        />
      </ChipRow>
    </>
  );

  // The open cases of the register, for the demo's line about the data.
  const openCount = useMemo(() => {
    let n = 0;
    for (let i = 0; i < store.size; i++) if (store.loaded[i] === 1 && (store.stage[i] ?? 0) < Stage.Sent) n++;
    return n;
  }, [store, snap.load.loadedRows, version]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="desk">
      {/* What only the demo has: generated data, a simulated colleague and
          a role switch instead of a sign-in. Apart from the desk's own
          controls, and saying what the colleague does. */}
      <section className="desk__demo" aria-label={t.demoTitle}>
        <p>
          {t.demoData(integer(store.size), integer(openCount))}{" "}
          {config.colleagueSeconds === null ? t.demoColleagueOff : t.demoColleague(integer(config.colleagueSeconds))}
        </p>
        <ChoiceGroup<Role>
          label={t.role}
          size="small"
          value={role}
          onChange={changeRole}
          choices={[
            { id: "operator", label: t.roles.operator },
            { id: "signatory", label: t.roles.signatory },
            { id: "supervisor", label: t.roles.supervisor },
          ]}
        />
        <Button onPress={simulate}>{t.simulateColleague}</Button>
      </section>

      <section className="desk__bar" aria-label={t.view}>
        <div className="desk__row">
          <div className="desk__view">
            <Select<string>
              label={t.view}
              size="small"
              options={viewOptions}
              value={view.name || "-"}
              onChange={(name) => {
                const next = allViews.find((v) => v.name === name);
                if (next) applyView(next);
              }}
            />
            {dirty && <Tag tone="warning" size="small">{t.viewModified}</Tag>}
          </div>
          <ChoiceGroup<Density>
            label={t.density}
            size="small"
            value={view.density}
            onChange={(d) => patchView({ density: d })}
            choices={[
              { id: "compact", label: t.densities.compact },
              { id: "default", label: t.densities.default },
              { id: "comfortable", label: t.densities.comfortable },
            ]}
          />
        </div>
        <Toolbar label={t.actionsLabel}>
          <Button onPress={() => setDialog("save")}>{t.saveView}</Button>
          <Button variant="ghost" onPress={copyLink}>{t.copyLink}</Button>
          {isSaved && (
            <Button variant="ghost" onPress={() => setDialog("delete")}>{t.deleteView}</Button>
          )}
          <Button variant="ghost" onPress={() => setDialog("columns")}>{t.columns}</Button>
          {canExport(role) && (
            <Button variant="ghost" onPress={() => void exportCsv()} isDisabled={!result || shownCount === 0}>
              {t.exportCsv}
            </Button>
          )}
          <Button variant="ghost" onPress={() => setDialog("shortcuts")}>{t.shortcuts}</Button>
        </Toolbar>
      </section>

      <section className="desk__filters" aria-label={t.filtersLabel}>
        <div className="desk__search" ref={searchBox}>
          <TextField
            label={t.search}
            value={view.search}
            placeholder={t.searchHint}
            onChange={(search) => {
              mark("filter");
              patchView({ search });
            }}
          />
        </div>
        {narrow ? (
          // On a narrow screen the chip groups fold away above the grid.
          <Disclosure summary={t.filtersSummary(integer(activeFilterCount(filters)), activeFilterCount(filters))}>
            {chipGroups}
          </Disclosure>
        ) : (
          chipGroups
        )}
        <div className="desk__row desk__status">
          <p className="desk__count" data-testid="row-count">
            {countText(t, integer, {
              shown: result ? shownCount : null,
              total: store.size,
              loaded: load.loadedRows,
              loading: load.loading,
              failed: load.chunkErrors.reduce((n, e) => n + e.count, 0),
            })}
          </p>
          <span className="muted">{t.asOf(formats.day(AS_OF_DAY))}</span>
          {snap.busy && result && <span className="muted">{t.updating}</span>}
          {anyFilter && (
            <Button variant="ghost" onPress={clearFilters}>
              {t.clearFilters}
            </Button>
          )}
        </div>
        {narrow && <p className="muted desk__hint">{t.narrowHint}</p>}
      </section>

      {role !== "supervisor" && (
        // What the role works on and may not do; the supervisor may do all.
        <Callout tone="info" role="none">
          {role === "operator" ? t.roleNotes.operator(pools.assignees[SELF_ASSIGNEE] ?? "") : t.roleNotes.signatory(pools.signatories[SELF_SIGNATORY] ?? "")}
          {hidden.length > 0 && ` ${t.roleHidden(hidden.map((id) => labels.columns[id] ?? id).join(", "))}`}
        </Callout>
      )}
      {snap.mode === "main" && (
        // Announced when the worker fails during the session; a page opened
        // without one says it as part of the page.
        <Callout tone="warning" role={config.useWorker ? "alert" : "none"}>
          {t.workerFallback}
        </Callout>
      )}
      {load.chunkErrors.length > 0 && (
        <Callout
          tone="negative"
          role="alert"
          title={t.chunkErrorTitle}
          action={
            <Button
              onPress={(e) => {
                // The notice and its button go once the rows are in.
                keepFocusInPlace(e.target);
                load.chunkErrors.forEach((err) => engine.retry(err.index));
              }}
            >
              {t.retry}
            </Button>
          }
        >
          {load.chunkErrors.map((e) => t.chunkErrorRange(integer(e.start + 1), integer(e.start + e.count))).join(" ")}
        </Callout>
      )}
      {load.loading && <ProgressBar label={t.generating} value={load.loadedRows} maxValue={store.size} formatValue={integer} />}

      {selectedRows.length > 0 && (
        <section className="desk__bulk" aria-label={t.bulkLabel}>
          <p className="desk__count">{t.selected(integer(selectedRows.length))}</p>
          {canBulk(role) ? (
            <>
              <Select<number>
                label={t.bulkAssignee}
                size="small"
                options={pools.assignees.map((name, id) => ({ id, label: name }))}
                value={bulkAssignee}
                onChange={setBulkAssignee}
              />
              <Button variant="primary" onPress={applyBulk}>{t.apply}</Button>
            </>
          ) : (
            <p className="muted">{t.bulkNeedsSupervisor}</p>
          )}
          <Button variant="ghost" onPress={closeBulk}>{t.clearSelection}</Button>
        </section>
      )}

      <div className="desk__grid" data-density={density} ref={gridBox}>
        <GridView
          label={t.gridLabel}
          rows={rows}
          columns={columns}
          sort={sort}
          selection={selection}
          highlight={view.search.trim()}
          loading={loading}
          emptyState={emptyState}
          version={version}
          handlers={gridHandlers}
        />
      </div>

      <PerfPanel t={t} mode={snap.mode} loaded={load.loadedRows} integer={integer} decimal={decimal} />

      <LiveRegion>{announcement}</LiveRegion>
      <ToastRegion queue={toasts} />
      <ShortcutsDialog isOpen={dialog === "shortcuts"} onOpenChange={(open) => !open && setDialog(null)} title={t.shortcutsTitle} groups={groups} />
      <SaveViewDialog
        isOpen={dialog === "save"}
        initialName={isPreset(view.name) ? "" : view.name}
        t={t}
        integer={integer}
        onClose={() => setDialog(null)}
        onSave={onSaveView}
      />
      <AlertDialog
        isOpen={dialog === "delete"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={t.deleteViewTitle(view.name)}
        confirmLabel={t.deleteViewConfirm}
        tone="destructive"
        onConfirm={onDeleteView}
      >
        {t.deleteViewBody}
      </AlertDialog>
      <ColumnsSheet
        isOpen={dialog === "columns"}
        onClose={() => setDialog(null)}
        columns={view.columns}
        onChange={(next) => patchView({ columns: next })}
        role={role}
        pinStart={!narrow}
        headers={labels.columns}
        t={t}
      />
      <ConflictDialog conflict={conflictView} t={t} onKeepTheirs={keepTheirs} onUseMine={useMine} onDismiss={dismissConflict} />
    </div>
  );
}

type GridHandlers = {
  onSortChange: (sort: DataGridSort | null) => void;
  onSelectionChange: (keys: Set<string>) => void;
  onEdit: (edit: DataGridEdit<number>) => void;
  onEditStart: (target: DataGridEditTarget<number>) => void;
  onEditCancel: () => void;
};

type GridViewProps = {
  label: string;
  rows: number[];
  columns: DataGridColumn<number>[];
  sort: DataGridSort | null;
  selection: ReadonlySet<string>;
  highlight: string;
  loading: boolean;
  emptyState: React.ReactNode;
  /** Not drawn: a new value makes the grid read the store again. */
  version: number;
  handlers: GridHandlers;
};

/** The DataGrid, drawn again only when one of its inputs changes, not on
 * every change of the desk around it (a chip pressed, a dialog opened). */
const GridView = memo(function GridView({ label, rows, columns, sort, selection, highlight, loading, emptyState, handlers }: GridViewProps) {
  return (
    <DataGrid<number>
      label={label}
      rows={rows}
      columns={columns}
      rowKey={rowKey}
      sort={sort}
      onSortChange={handlers.onSortChange}
      manualSorting
      selectionMode="multiple"
      selectedKeys={selection}
      onSelectionChange={handlers.onSelectionChange}
      onEdit={handlers.onEdit}
      onEditStart={handlers.onEditStart}
      onEditCancel={handlers.onEditCancel}
      highlight={highlight}
      loading={loading}
      className="desk__grid-box"
      emptyState={emptyState}
    />
  );
});

/** A filter group, which shows its own name above its chips, with any
 * chip that goes with it. */
function ChipRow({ children }: { children: React.ReactNode }) {
  return <div className="chip-row">{children}</div>;
}
