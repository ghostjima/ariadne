// Interface strings in English and Russian. Numbers reach these functions
// already formatted in the interface's locale (digits and grouping), and
// as numbers where a word has to agree with them. The data itself
// (applicants, stages, column headers, complaint texts) comes from the
// engine's language modules, @ariadne/grid/pools/{en,ru}.

export type Lang = "en" | "ru";
export const LANGUAGES: Lang[] = ["en", "ru"];

/** The locale given to React Aria and Intl for each language. */
export const LOCALES: Record<Lang, string> = { en: "en-US", ru: "ru-RU" };

export const isLang = (v: string): v is Lang => (LANGUAGES as string[]).includes(v);

/** Russian plural form: one, few or many. */
function ru(n: number, one: string, few: string, many: string): string {
  const d = Math.abs(n) % 100;
  const u = d % 10;
  if (d > 10 && d < 20) return many;
  if (u === 1) return one;
  if (u >= 2 && u <= 4) return few;
  return many;
}

export type Strings = {
  title: string;
  subtitle: string;
  gridLabel: string;

  view: string;
  viewModified: string;
  unsavedView: string;
  saveView: string;
  saveViewTitle: string;
  viewName: string;
  viewNameHint: string;
  save: string;
  viewSaved: (name: string) => string;
  viewApplied: (name: string) => string;
  deleteView: string;
  deleteViewTitle: (name: string) => string;
  deleteViewBody: string;
  deleteViewConfirm: string;
  viewDeleted: (name: string) => string;
  copyLink: string;
  linkCopied: string;
  linkInAddressBar: string;
  viewNameErrors: { empty: string; tooLong: (max: string, length: string) => string; isPreset: string };

  role: string;
  roles: { operator: string; signatory: string; supervisor: string };
  /** What a restricted role works on and may not do. */
  roleNotes: { operator: (name: string) => string; signatory: (name: string) => string };
  roleHidden: (columns: string) => string;

  filtersLabel: string;
  stageGroup: string;
  streamGroup: string;
  sourceGroup: string;
  deadlineGroup: string;
  search: string;
  searchHint: string;
  clearFilters: string;
  /** The fold of the filter groups on a narrow screen. */
  filtersSummary: (active: string, n: number) => string;
  shownOf: (shown: string, total: string, n: number) => string;
  countLoading: string;
  /** In brackets after the count. */
  countPending: (count: string) => string;
  countFailed: (count: string) => string;
  updating: string;
  /** The day every deadline is counted from. */
  asOf: (day: string) => string;

  density: string;
  densities: { compact: string; default: string; comfortable: string };

  columns: string;
  columnsTitle: string;
  columnsShown: string;
  columnsOrder: string;
  columnsPinned: string;
  columnsUnpinned: string;
  narrowHint: string;
  columnHiddenForRole: string;
  done: string;

  /** Working days left, as the time-left column writes them. */
  workingDaysLeft: (count: string, n: number) => string;
  overdueBy: (count: string, n: number) => string;
  dueToday: string;

  selected: (count: string) => string;
  bulkLabel: string;
  bulkAssignee: string;
  apply: string;
  clearSelection: string;
  bulkNeedsSupervisor: string;
  bulkDone: (assignee: string, count: string, n: number) => string;
  bulkSkipped: (count: string) => string;
  undo: string;
  undone: (count: string, n: number) => string;
  undoConflicts: (count: string, n: number) => string;
  nothingToUndo: string;

  editSaved: (id: string, column: string, value: string) => string;
  editRefused: (id: string, reason: string) => string;
  editErrors: {
    valueUnknown: string;
    roleCannotEdit: (column: string) => string;
    stageNotForRole: string;
    replyNeedsOutcome: string;
    refusalNeedsGround: string;
    groundOtherStream: string;
    sendNeedsSignature: string;
    replyLocked: string;
    extensionNotAllowed: string;
    extensionTooLate: (day: string) => string;
    extensionAfterReply: string;
    noteTooLong: (max: string, length: string) => string;
  };
  emptyNote: string;

  conflictTitle: string;
  conflictBody: (id: string, column: string) => string;
  theirs: string;
  yours: string;
  started: string;
  keepTheirs: string;
  useMine: string;
  conflictUndecided: string;
  keptTheirs: (id: string) => string;
  usedMine: (id: string) => string;
  colleagueEditing: (id: string, column: string, value: string) => string;
  colleagueChanged: (id: string, column: string, value: string) => string;
  simulateColleague: string;
  demoTitle: string;
  demoData: (total: string, open: string) => string;
  demoColleague: (seconds: string) => string;
  demoColleagueOff: string;

  exportCsv: string;
  exported: (count: string, n: number) => string;
  exportedCapped: (count: string, total: string) => string;
  csvFile: string;

  generating: string;
  emptyTitle: string;
  emptyBody: string;
  chunkErrorTitle: string;
  chunkErrorRange: (from: string, to: string) => string;
  retry: string;
  workerFallback: string;
  actionsLabel: string;

  shortcuts: string;
  shortcutsTitle: string;
  shortcutGroups: { grid: string; editing: string; selection: string; app: string };
  keys: {
    move: string;
    rowStart: string;
    rowEnd: string;
    gridStart: string;
    gridEnd: string;
    pageUp: string;
    pageDown: string;
    sort: string;
    edit: string;
    saveEdit: string;
    cancelEdit: string;
    selectRow: string;
    extend: string;
    selectAll: string;
    search: string;
    help: string;
    undo: string;
    grid: string;
    clear: string;
    export: string;
    colleague: string;
    saveView: string;
  };

  performance: string;
  perfNote: string;
  firstRows: string;
  filterLatency: string;
  sortLatency: string;
  roundTrip: string;
  workerCompute: string;
  rowsLoaded: string;
  computedOn: string;
  modeWorker: string;
  modeMain: string;
  ms: string;
  medianP95: (p50: string, p95: string) => string;
  samples: (n: string) => string;
  notYet: string;
};

const en: Strings = {
  title: "Ariadne Desk",
  subtitle: "Complaints and refusals, each with its legal deadline",
  gridLabel: "Cases",

  view: "View",
  viewModified: "Modified",
  unsavedView: "Unsaved view",
  saveView: "Save view",
  saveViewTitle: "Save the view",
  viewName: "Name",
  viewNameHint: "Filters, search, columns, sort and density are saved in this browser.",
  save: "Save",
  viewSaved: (name) => `View “${name}” saved.`,
  viewApplied: (name) => `View “${name}” applied.`,
  deleteView: "Delete view",
  deleteViewTitle: (name) => `Delete the view “${name}”?`,
  deleteViewBody: "The saved filters, columns and sort of this view are removed from this browser.",
  deleteViewConfirm: "Delete view",
  viewDeleted: (name) => `View “${name}” deleted.`,
  copyLink: "Copy link",
  linkCopied: "A link to this view is in the address bar and on the clipboard.",
  linkInAddressBar: "A link to this view is in the address bar.",
  viewNameErrors: {
    empty: "Give the view a name.",
    tooLong: (max, length) => `At most ${max} characters; this name has ${length}.`,
    isPreset: "That name belongs to a built-in view.",
  },

  role: "Role",
  roles: { operator: "Operator", signatory: "Signatory", supervisor: "Supervisor" },
  roleNotes: {
    operator: (name) => `The operator works the cases assigned to ${name}: facts, the decision and its ground, then legal review and signature. Sending, extensions, bulk changes and export are not theirs.`,
    signatory: (name) => `The signatory signs and sends the replies assigned to ${name}, or returns one to drafting.`,
  },
  roleHidden: (columns) => `Hidden for this role: ${columns}.`,

  filtersLabel: "Filters",
  stageGroup: "Stage",
  streamGroup: "Stream",
  sourceGroup: "Source",
  deadlineGroup: "Deadline",
  search: "Search",
  searchHint: "Case, applicant, subject, operation, assignee or note",
  clearFilters: "Clear filters",
  filtersSummary: (active, n) => (n === 0 ? "Filters" : `Filters: ${active} on`),
  shownOf: (shown, total, n) => `${shown} of ${total} ${n === 1 ? "case" : "cases"}`,
  countLoading: "Loading cases",
  countPending: (count) => `(${count} still loading)`,
  countFailed: (count) => `(${count} did not load)`,
  updating: "Updating",
  asOf: (day) => `Deadlines as of ${day}.`,

  density: "Density",
  densities: { compact: "Compact", default: "Regular", comfortable: "Comfortable" },

  columns: "Columns",
  columnsTitle: "Columns",
  columnsShown: "Shown columns",
  columnsOrder: "Order",
  columnsPinned: "Case and applicant stay pinned at the start.",
  columnsUnpinned: "On a narrow screen no column is pinned, so the grid scrolls sideways to every one.",
  narrowHint: "Scroll the grid sideways for the other columns.",
  columnHiddenForRole: "Not shown to this role",
  done: "Done",

  workingDaysLeft: (count, n) => `${count} working ${n === 1 ? "day" : "days"}`,
  overdueBy: (count, n) => `${count} working ${n === 1 ? "day" : "days"} overdue`,
  dueToday: "Due today",

  selected: (count) => `Selected: ${count}`,
  bulkLabel: "Bulk change",
  bulkAssignee: "Assign to",
  apply: "Apply",
  clearSelection: "Clear selection",
  bulkNeedsSupervisor: "Reassigning cases needs the supervisor role.",
  bulkDone: (assignee, count, n) => `${count} ${n === 1 ? "case" : "cases"} assigned to ${assignee}.`,
  bulkSkipped: (count) => `Skipped ${count}.`,
  undo: "Undo",
  undone: (count, n) => `Undone on ${count} ${n === 1 ? "case" : "cases"}.`,
  undoConflicts: (count, n) => `${count} ${n === 1 ? "was" : "were"} changed by a colleague since and kept as they are.`,
  nothingToUndo: "Nothing to undo.",

  editSaved: (id, column, value) => `${id}: ${column} is now “${value}”.`,
  editRefused: (id, reason) => `${id} not changed: ${reason}`,
  editErrors: {
    valueUnknown: "Choose one of the listed values.",
    roleCannotEdit: (column) => `This role does not change ${column}.`,
    stageNotForRole: "This role cannot move a case to that stage.",
    replyNeedsOutcome: "Decide the outcome before legal review.",
    refusalNeedsGround: "A refusal needs a legal ground. Choose the ground first.",
    groundOtherStream: "This ground belongs to another stream: 161-FZ and 115-FZ grounds are not mixed.",
    sendNeedsSignature: "A reply goes out only after the signatory has it.",
    replyLocked: "The reply is with the signatory. Return it to drafting to change it.",
    extensionNotAllowed: "A money claim under 123-FZ cannot be extended.",
    extensionTooLate: (day) => `Too late to extend: the notice was due by ${day}.`,
    extensionAfterReply: "The reply has gone out; there is nothing to extend.",
    noteTooLong: (max, length) => `At most ${max} characters; this note has ${length}.`,
  },
  emptyNote: "(empty)",

  conflictTitle: "Changed while you were editing",
  conflictBody: (id, column) => `A colleague changed ${column} of ${id} after you opened it. Choose the value to keep.`,
  theirs: "Colleague’s value",
  yours: "Your value",
  started: "When you started",
  keepTheirs: "Keep theirs",
  useMine: "Use mine",
  conflictUndecided: "Your value is not saved yet. “Use mine” saves it; “Keep theirs” discards it.",
  keptTheirs: (id) => `${id}: the colleague’s value was kept.`,
  usedMine: (id) => `${id}: your value was saved.`,
  colleagueEditing: (id, column, value) => `A colleague changed the cell you are editing (${id}, ${column}) to “${value}”.`,
  colleagueChanged: (id, column, value) => `A colleague set ${column} of ${id} to “${value}”.`,
  simulateColleague: "Colleague’s edit",
  demoTitle: "About this demo",
  demoData: (total, open) => `Demo: ${total} invented complaints, ${open} of them open.`,
  demoColleague: (seconds) => `A simulated colleague edits one about every ${seconds} seconds; edit the same cell to see a conflict.`,
  demoColleagueOff: "The simulated colleague is off on this page; “Colleague’s edit” makes one change.",

  exportCsv: "Export CSV",
  exported: (count, n) => `Exported ${count} ${n === 1 ? "row" : "rows"}.`,
  exportedCapped: (count, total) => `Exported the first ${count} of ${total} rows.`,
  csvFile: "complaints.csv",

  generating: "Generating the register",
  emptyTitle: "No cases match",
  emptyBody: "No case fits these filters and this search.",
  chunkErrorTitle: "Some cases did not load",
  chunkErrorRange: (from, to) => `Rows ${from} to ${to} are missing.`,
  retry: "Retry",
  workerFallback: "The background worker is unavailable, so filtering and sorting run on the page itself and may be slower.",
  actionsLabel: "Actions",

  shortcuts: "Shortcuts",
  shortcutsTitle: "Keyboard shortcuts",
  shortcutGroups: { grid: "Grid", editing: "Editing", selection: "Selection", app: "Desk" },
  keys: {
    move: "Move the active cell",
    rowStart: "First cell of the row",
    rowEnd: "Last cell of the row",
    gridStart: "First cell of the grid",
    gridEnd: "Last cell of the grid",
    pageUp: "A page up",
    pageDown: "A page down",
    sort: "On a header: sort by the column",
    edit: "Edit the cell",
    saveEdit: "Save the edit",
    cancelEdit: "Cancel the edit",
    selectRow: "Select or release the row",
    extend: "Extend the selection",
    selectAll: "Select every row shown",
    search: "Search",
    help: "Show these shortcuts",
    undo: "Undo the last change",
    grid: "Go to the grid",
    clear: "Clear filters",
    export: "Export CSV",
    colleague: "Simulate a colleague’s edit",
    saveView: "Save the view",
  },

  performance: "Performance",
  perfNote:
    "Measured in this tab. First rows: from navigation to the first painted frame with rows. Filter and sort: from the input to the repainted grid. Worker round trip: from posting a query to receiving its result. Compute: sorting, search and filtering inside the worker.",
  firstRows: "First rows",
  filterLatency: "Filter",
  sortLatency: "Sort",
  roundTrip: "Worker round trip",
  workerCompute: "Compute",
  rowsLoaded: "Rows loaded",
  computedOn: "Computed on",
  modeWorker: "Worker",
  modeMain: "Main thread",
  ms: "ms",
  medianP95: (p50, p95) => `median ${p50}, p95 ${p95}`,
  samples: (n) => `samples: ${n}`,
  notYet: "not yet",
};

const ruStrings: Strings = {
  title: "Ariadne Стол заявок",
  subtitle: "Жалобы и отказы, у каждой свой законный срок",
  gridLabel: "Обращения",

  view: "Вид",
  viewModified: "Изменён",
  unsavedView: "Несохранённый вид",
  saveView: "Сохранить вид",
  saveViewTitle: "Сохранение вида",
  viewName: "Название",
  viewNameHint: "Фильтры, поиск, столбцы, сортировка и плотность сохранятся в этом браузере.",
  save: "Сохранить",
  viewSaved: (name) => `Вид «${name}» сохранён.`,
  viewApplied: (name) => `Применён вид «${name}».`,
  deleteView: "Удалить вид",
  deleteViewTitle: (name) => `Удалить вид «${name}»?`,
  deleteViewBody: "Сохранённые фильтры, столбцы и сортировка этого вида будут удалены из браузера.",
  deleteViewConfirm: "Удалить вид",
  viewDeleted: (name) => `Вид «${name}» удалён.`,
  copyLink: "Скопировать ссылку",
  linkCopied: "Ссылка на этот вид в адресной строке и в буфере обмена.",
  linkInAddressBar: "Ссылка на этот вид в адресной строке.",
  viewNameErrors: {
    empty: "Дайте виду название.",
    tooLong: (max, length) => `Не больше ${max} символов, а в названии ${length}.`,
    isPreset: "Это название встроенного вида.",
  },

  role: "Роль",
  roles: { operator: "Оператор", signatory: "Подписант", supervisor: "Руководитель" },
  roleNotes: {
    operator: (name) => `Оператор ведёт обращения, назначенные на исполнителя ${name}: факты, решение и его основание, затем юридическая проверка и подпись. Отправка, продление, массовые изменения и выгрузка ему недоступны.`,
    signatory: (name) => `Подписант (${name}) подписывает и отправляет назначенные ему ответы или возвращает ответ на доработку.`,
  },
  roleHidden: (columns) => `Скрыто для этой роли: ${columns}.`,

  filtersLabel: "Фильтры",
  stageGroup: "Этап",
  streamGroup: "Поток",
  sourceGroup: "Источник",
  deadlineGroup: "Срок",
  search: "Поиск",
  searchHint: "Номер, заявитель, тема, операция, исполнитель или заметка",
  clearFilters: "Сбросить фильтры",
  filtersSummary: (active, n) => (n === 0 ? "Фильтры" : `Фильтры: включено ${active}`),
  shownOf: (shown, total, n) => `${shown} ${ru(n, "обращение", "обращения", "обращений")} из ${total}`,
  countLoading: "Загрузка обращений",
  countPending: (count) => `(ещё загружается: ${count})`,
  countFailed: (count) => `(не загружено: ${count})`,
  updating: "Обновление",
  asOf: (day) => `Сроки на ${day}.`,

  density: "Плотность",
  densities: { compact: "Плотно", default: "Обычно", comfortable: "Просторно" },

  columns: "Столбцы",
  columnsTitle: "Столбцы",
  columnsShown: "Показанные столбцы",
  columnsOrder: "Порядок",
  columnsPinned: "Номер и заявитель всегда закреплены в начале.",
  columnsUnpinned: "На узком экране столбцы не закреплены, и таблица прокручивается вбок до любого из них.",
  narrowHint: "Остальные столбцы видны при прокрутке таблицы вбок.",
  columnHiddenForRole: "Не показывается этой роли",
  done: "Готово",

  workingDaysLeft: (count, n) => `${count} ${ru(n, "рабочий день", "рабочих дня", "рабочих дней")}`,
  overdueBy: (count, n) => `просрочено на ${count} ${ru(n, "рабочий день", "рабочих дня", "рабочих дней")}`,
  dueToday: "Срок сегодня",

  selected: (count) => `Выбрано: ${count}`,
  bulkLabel: "Массовое изменение",
  bulkAssignee: "Назначить исполнителя",
  apply: "Применить",
  clearSelection: "Снять выбор",
  bulkNeedsSupervisor: "Переназначать обращения может руководитель.",
  bulkDone: (assignee, count, n) => `${count} ${ru(n, "обращение назначено", "обращения назначены", "обращений назначено")} на исполнителя ${assignee}.`,
  bulkSkipped: (count) => `Пропущено: ${count}.`,
  undo: "Отменить",
  undone: (count, n) => `Отменено у ${count} ${ru(n, "обращения", "обращений", "обращений")}.`,
  undoConflicts: (count) => `Изменённые коллегой после этого оставлены как есть: ${count}.`,
  nothingToUndo: "Отменять нечего.",

  editSaved: (id, column, value) => `${id}: ${column} теперь «${value}».`,
  editRefused: (id, reason) => `${id} не изменено: ${reason}`,
  editErrors: {
    valueUnknown: "Выберите одно из значений списка.",
    roleCannotEdit: (column) => `Эта роль не меняет поле «${column}».`,
    stageNotForRole: "Эта роль не может перевести обращение на этот этап.",
    replyNeedsOutcome: "До юридической проверки нужно принять решение.",
    refusalNeedsGround: "Для отказа нужно правовое основание. Сначала выберите основание.",
    groundOtherStream: "Это основание другого потока: основания 161-ФЗ и 115-ФЗ не смешиваются.",
    sendNeedsSignature: "Ответ отправляется только после передачи на подпись.",
    replyLocked: "Ответ на подписи. Чтобы изменить его, верните его в черновик.",
    extensionNotAllowed: "Денежное требование по 123-ФЗ продлить нельзя.",
    extensionTooLate: (day) => `Продлевать поздно: уведомление нужно было направить до ${day}.`,
    extensionAfterReply: "Ответ уже отправлен, продлевать нечего.",
    noteTooLong: (max, length) => `Не больше ${max} символов, а в заметке ${length}.`,
  },
  emptyNote: "(пусто)",

  conflictTitle: "Изменено, пока вы редактировали",
  conflictBody: (id, column) => `Коллега изменил поле «${column}» обращения ${id} после того, как вы его открыли. Выберите, какое значение оставить.`,
  theirs: "Значение коллеги",
  yours: "Ваше значение",
  started: "Когда вы начали",
  keepTheirs: "Оставить их",
  useMine: "Сохранить моё",
  conflictUndecided: "Ваше значение ещё не сохранено. «Сохранить моё» сохранит его, «Оставить их» отбросит.",
  keptTheirs: (id) => `${id}: оставлено значение коллеги.`,
  usedMine: (id) => `${id}: сохранено ваше значение.`,
  colleagueEditing: (id, column, value) => `Коллега изменил ячейку, которую вы редактируете (${id}, ${column}), на «${value}».`,
  colleagueChanged: (id, column, value) => `Коллега изменил поле «${column}» обращения ${id} на «${value}».`,
  simulateColleague: "Правка коллеги",
  demoTitle: "Об этой демонстрации",
  demoData: (total, open) => `Демонстрация: ${total} выдуманных обращений, в работе ${open}.`,
  demoColleague: (seconds) => `Имитируемый коллега меняет одно из них примерно раз в ${seconds} с; измените ту же ячейку, чтобы увидеть конфликт.`,
  demoColleagueOff: "Имитируемый коллега на этой странице выключен; «Правка коллеги» вносит одну правку.",

  exportCsv: "Выгрузить CSV",
  exported: (count, n) => `Выгружено: ${count} ${ru(n, "строка", "строки", "строк")}.`,
  exportedCapped: (count, total) => `Выгружены первые ${count} строк из ${total}.`,
  csvFile: "obrashcheniya.csv",

  generating: "Создание реестра",
  emptyTitle: "Обращений не найдено",
  emptyBody: "Ни одно обращение не подходит под эти фильтры и поиск.",
  chunkErrorTitle: "Часть обращений не загрузилась",
  chunkErrorRange: (from, to) => `Нет строк с ${from} по ${to}.`,
  retry: "Повторить",
  workerFallback: "Фоновый поток недоступен, поэтому фильтры и сортировка выполняются на самой странице и могут работать медленнее.",
  actionsLabel: "Действия",

  shortcuts: "Клавиши",
  shortcutsTitle: "Сочетания клавиш",
  shortcutGroups: { grid: "Таблица", editing: "Редактирование", selection: "Выбор", app: "Рабочее место" },
  keys: {
    move: "Перейти к соседней ячейке",
    rowStart: "Первая ячейка строки",
    rowEnd: "Последняя ячейка строки",
    gridStart: "Первая ячейка таблицы",
    gridEnd: "Последняя ячейка таблицы",
    pageUp: "На страницу вверх",
    pageDown: "На страницу вниз",
    sort: "На заголовке: сортировать по столбцу",
    edit: "Изменить ячейку",
    saveEdit: "Сохранить правку",
    cancelEdit: "Отменить правку",
    selectRow: "Выбрать строку или снять выбор",
    extend: "Расширить выбор",
    selectAll: "Выбрать все показанные строки",
    search: "Поиск",
    help: "Показать эти сочетания",
    undo: "Отменить последнее изменение",
    grid: "Перейти к таблице",
    clear: "Сбросить фильтры",
    export: "Выгрузить CSV",
    colleague: "Сымитировать правку коллеги",
    saveView: "Сохранить вид",
  },

  performance: "Производительность",
  perfNote:
    "Измерено в этой вкладке. Первые строки: от начала перехода до первого кадра со строками. Фильтр и сортировка: от ввода до перерисованной таблицы. Обмен с потоком: от отправки запроса до получения ответа. Вычисление: сортировка, поиск и фильтрация в фоновом потоке.",
  firstRows: "Первые строки",
  filterLatency: "Фильтр",
  sortLatency: "Сортировка",
  roundTrip: "Обмен с потоком",
  workerCompute: "Вычисление",
  rowsLoaded: "Загружено строк",
  computedOn: "Где считается",
  modeWorker: "Фоновый поток",
  modeMain: "Основной поток",
  ms: "мс",
  medianP95: (p50, p95) => `медиана ${p50}, p95 ${p95}`,
  samples: (n) => `замеров: ${n}`,
  notYet: "пока нет",
};

export const strings: Record<Lang, Strings> = { en, ru: ruStrings };
