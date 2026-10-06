// Interface strings in English, Russian and Arabic. Numbers reach these
// functions already formatted in the interface's locale (digits and
// grouping), and as numbers where a word has to agree with them. The data
// itself (client names, statuses, column headers) comes from the engine's
// language modules, @ariadne/grid/pools/{en,ru,ar}.

export type Lang = "en" | "ru" | "ar";
export const LANGUAGES: Lang[] = ["en", "ru", "ar"];

/** The locale given to React Aria and Intl for each language. Arabic uses
 * Arabic-Indic digits. */
export const LOCALES: Record<Lang, string> = { en: "en-US", ru: "ru-RU", ar: "ar-u-nu-arab" };

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
  roles: { operator: string; manager: string };
  operatorNote: (regions: string) => string;
  operatorHidden: (columns: string) => string;
  operatorActions: string;

  filtersLabel: string;
  statusGroup: string;
  priorityGroup: string;
  regionGroup: string;
  slaBreached: string;
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

  selected: (count: string) => string;
  bulkLabel: string;
  bulkStatus: string;
  apply: string;
  clearSelection: string;
  bulkNeedsManager: string;
  bulkDone: (status: string, count: string, n: number) => string;
  bulkSkipped: (count: string) => string;
  undo: string;
  undone: (count: string, n: number) => string;
  undoConflicts: (count: string, n: number) => string;
  nothingToUndo: string;

  editSaved: (id: string, column: string, value: string) => string;
  editRefused: (id: string, reason: string) => string;
  editErrors: {
    statusUnknown: string;
    approveNeedsComment: string;
    commentTooLong: (max: string, length: string) => string;
    rejectNeedsComment: string;
  };
  emptyComment: string;

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
  demoData: (total: string) => string;
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
  subtitle: "Fifty thousand service requests in one grid",
  gridLabel: "Requests",

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
  roles: { operator: "Operator", manager: "Manager" },
  operatorNote: (regions) => `Operators work the regions ${regions}.`,
  operatorHidden: (columns) => `Hidden for this role: ${columns}.`,
  operatorActions: "Bulk changes and export need the manager role.",

  filtersLabel: "Filters",
  statusGroup: "Status",
  priorityGroup: "Priority",
  regionGroup: "Region",
  slaBreached: "SLA breached",
  search: "Search",
  searchHint: "ID, client, owner, tags, comment or author",
  clearFilters: "Clear filters",
  filtersSummary: (active, n) => (n === 0 ? "Filters" : `Filters: ${active} on`),
  shownOf: (shown, total, n) => `${shown} of ${total} ${n === 1 ? "request" : "requests"}`,
  countLoading: "Loading requests",
  countPending: (count) => `(${count} still loading)`,
  countFailed: (count) => `(${count} did not load)`,
  updating: "Updating",

  density: "Density",
  densities: { compact: "Compact", default: "Regular", comfortable: "Comfortable" },

  columns: "Columns",
  columnsTitle: "Columns",
  columnsShown: "Shown columns",
  columnsOrder: "Order",
  columnsPinned: "ID and client stay pinned at the start.",
  columnsUnpinned: "On a narrow screen no column is pinned, so the grid scrolls sideways to every one.",
  narrowHint: "Scroll the grid sideways for the other columns.",
  columnHiddenForRole: "Not available to operators",
  done: "Done",

  selected: (count) => `Selected: ${count}`,
  bulkLabel: "Bulk change",
  bulkStatus: "New status",
  apply: "Apply",
  clearSelection: "Clear selection",
  bulkNeedsManager: "Bulk changes need the manager role.",
  bulkDone: (status, count, n) => `Status “${status}” set on ${count} ${n === 1 ? "request" : "requests"}.`,
  bulkSkipped: (count) => `Skipped ${count}: approval needs a comment.`,
  undo: "Undo",
  undone: (count, n) => `Undone on ${count} ${n === 1 ? "request" : "requests"}.`,
  undoConflicts: (count, n) => `${count} ${n === 1 ? "was" : "were"} changed by a colleague since and kept as they are.`,
  nothingToUndo: "Nothing to undo.",

  editSaved: (id, column, value) => `${id}: ${column} is now “${value}”.`,
  editRefused: (id, reason) => `${id} not changed: ${reason}`,
  editErrors: {
    statusUnknown: "Choose one of the listed statuses.",
    approveNeedsComment: "Approval needs a comment. Add one first.",
    commentTooLong: (max, length) => `At most ${max} characters; this comment has ${length}.`,
    rejectNeedsComment: "A rejected request needs a comment.",
  },
  emptyComment: "(empty)",

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
  demoData: (total) => `Demo: ${total} generated requests.`,
  demoColleague: (seconds) => `A simulated colleague edits one about every ${seconds} seconds; edit the same cell to see a conflict.`,
  demoColleagueOff: "The simulated colleague is off on this page; “Colleague’s edit” makes one change.",

  exportCsv: "Export CSV",
  exported: (count, n) => `Exported ${count} ${n === 1 ? "row" : "rows"}.`,
  exportedCapped: (count, total) => `Exported the first ${count} of ${total} rows.`,
  csvFile: "requests.csv",

  generating: "Generating requests",
  emptyTitle: "No requests match",
  emptyBody: "No request fits these filters and this search.",
  chunkErrorTitle: "Some requests did not load",
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
    edit: "Edit the status or the comment",
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
  subtitle: "Пятьдесят тысяч заявок в одной таблице",
  gridLabel: "Заявки",

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
  roles: { operator: "Оператор", manager: "Руководитель" },
  operatorNote: (regions) => `Оператор работает с регионами: ${regions}.`,
  operatorHidden: (columns) => `Скрыто для этой роли: ${columns}.`,
  operatorActions: "Массовые изменения и выгрузка доступны руководителю.",

  filtersLabel: "Фильтры",
  statusGroup: "Статус",
  priorityGroup: "Приоритет",
  regionGroup: "Регион",
  slaBreached: "SLA нарушен",
  search: "Поиск",
  searchHint: "Номер, клиент, ответственный, теги, комментарий или автор",
  clearFilters: "Сбросить фильтры",
  filtersSummary: (active, n) => (n === 0 ? "Фильтры" : `Фильтры: включено ${active}`),
  shownOf: (shown, total, n) => `${shown} ${ru(n, "заявка", "заявки", "заявок")} из ${total}`,
  countLoading: "Загрузка заявок",
  countPending: (count) => `(ещё загружается: ${count})`,
  countFailed: (count) => `(не загружено: ${count})`,
  updating: "Обновление",

  density: "Плотность",
  densities: { compact: "Плотно", default: "Обычно", comfortable: "Просторно" },

  columns: "Столбцы",
  columnsTitle: "Столбцы",
  columnsShown: "Показанные столбцы",
  columnsOrder: "Порядок",
  columnsPinned: "Номер и клиент всегда закреплены в начале.",
  columnsUnpinned: "На узком экране столбцы не закреплены, и таблица прокручивается вбок до любого из них.",
  narrowHint: "Остальные столбцы видны при прокрутке таблицы вбок.",
  columnHiddenForRole: "Недоступно оператору",
  done: "Готово",

  selected: (count) => `Выбрано: ${count}`,
  bulkLabel: "Массовое изменение",
  bulkStatus: "Новый статус",
  apply: "Применить",
  clearSelection: "Снять выбор",
  bulkNeedsManager: "Массовые изменения доступны руководителю.",
  bulkDone: (status, count, n) => `Статус «${status}» у ${count} ${ru(n, "заявки", "заявок", "заявок")}.`,
  bulkSkipped: (count) => `Пропущено: ${count}, для одобрения нужен комментарий.`,
  undo: "Отменить",
  undone: (count, n) => `Отменено у ${count} ${ru(n, "заявки", "заявок", "заявок")}.`,
  undoConflicts: (count) => `Изменённые коллегой после этого оставлены как есть: ${count}.`,
  nothingToUndo: "Отменять нечего.",

  editSaved: (id, column, value) => `${id}: ${column} теперь «${value}».`,
  editRefused: (id, reason) => `${id} не изменена: ${reason}`,
  editErrors: {
    statusUnknown: "Выберите один из статусов списка.",
    approveNeedsComment: "Для одобрения нужен комментарий. Сначала добавьте его.",
    commentTooLong: (max, length) => `Не больше ${max} символов, а в комментарии ${length}.`,
    rejectNeedsComment: "Отклонённой заявке нужен комментарий.",
  },
  emptyComment: "(пусто)",

  conflictTitle: "Изменено, пока вы редактировали",
  conflictBody: (id, column) => `Коллега изменил поле «${column}» заявки ${id} после того, как вы его открыли. Выберите, какое значение оставить.`,
  theirs: "Значение коллеги",
  yours: "Ваше значение",
  started: "Когда вы начали",
  keepTheirs: "Оставить их",
  useMine: "Сохранить моё",
  conflictUndecided: "Ваше значение ещё не сохранено. «Сохранить моё» сохранит его, «Оставить их» отбросит.",
  keptTheirs: (id) => `${id}: оставлено значение коллеги.`,
  usedMine: (id) => `${id}: сохранено ваше значение.`,
  colleagueEditing: (id, column, value) => `Коллега изменил ячейку, которую вы редактируете (${id}, ${column}), на «${value}».`,
  colleagueChanged: (id, column, value) => `Коллега изменил поле «${column}» заявки ${id} на «${value}».`,
  simulateColleague: "Правка коллеги",
  demoTitle: "Об этой демонстрации",
  demoData: (total) => `Демонстрация: ${total} сгенерированных заявок.`,
  demoColleague: (seconds) => `Имитируемый коллега меняет одну из них примерно раз в ${seconds} с; измените ту же ячейку, чтобы увидеть конфликт.`,
  demoColleagueOff: "Имитируемый коллега на этой странице выключен; «Правка коллеги» вносит одну правку.",

  exportCsv: "Выгрузить CSV",
  exported: (count, n) => `Выгружено: ${count} ${ru(n, "строка", "строки", "строк")}.`,
  exportedCapped: (count, total) => `Выгружены первые ${count} строк из ${total}.`,
  csvFile: "zayavki.csv",

  generating: "Создание заявок",
  emptyTitle: "Заявок не найдено",
  emptyBody: "Ни одна заявка не подходит под эти фильтры и поиск.",
  chunkErrorTitle: "Часть заявок не загрузилась",
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
    edit: "Изменить статус или комментарий",
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

const ar: Strings = {
  title: "Ariadne مكتب الطلبات",
  subtitle: "خمسون ألف طلب خدمة في جدول واحد",
  gridLabel: "الطلبات",

  view: "العرض",
  viewModified: "معدَّل",
  unsavedView: "عرض غير محفوظ",
  saveView: "احفظ العرض",
  saveViewTitle: "حفظ العرض",
  viewName: "الاسم",
  viewNameHint: "تُحفظ عوامل التصفية والبحث والأعمدة والترتيب والكثافة في هذا المتصفح.",
  save: "احفظ",
  viewSaved: (name) => `حُفظ العرض «${name}».`,
  viewApplied: (name) => `طُبّق العرض «${name}».`,
  deleteView: "احذف العرض",
  deleteViewTitle: (name) => `أتحذف العرض «${name}»؟`,
  deleteViewBody: "ستُزال عوامل التصفية والأعمدة والترتيب المحفوظة لهذا العرض من هذا المتصفح.",
  deleteViewConfirm: "احذف العرض",
  viewDeleted: (name) => `حُذف العرض «${name}».`,
  copyLink: "انسخ الرابط",
  linkCopied: "رابط هذا العرض في شريط العنوان وفي الحافظة.",
  linkInAddressBar: "رابط هذا العرض في شريط العنوان.",
  viewNameErrors: {
    empty: "أعطِ العرض اسمًا.",
    tooLong: (max, length) => `الحد الأقصى ${max} حرفًا، وفي هذا الاسم ${length}.`,
    isPreset: "هذا الاسم لعرض مدمج.",
  },

  role: "الدور",
  roles: { operator: "موظف التشغيل", manager: "المدير" },
  operatorNote: (regions) => `يعمل موظف التشغيل على المناطق: ${regions}.`,
  operatorHidden: (columns) => `مخفي لهذا الدور: ${columns}.`,
  operatorActions: "التغييرات الجماعية والتصدير متاحة للمدير.",

  filtersLabel: "عوامل التصفية",
  statusGroup: "الحالة",
  priorityGroup: "الأولوية",
  regionGroup: "المنطقة",
  slaBreached: "تجاوز مهلة الخدمة",
  search: "البحث",
  searchHint: "المعرّف أو العميل أو المسؤول أو الوسوم أو التعليق أو المنشئ",
  clearFilters: "امسح عوامل التصفية",
  filtersSummary: (active, n) => (n === 0 ? "عوامل التصفية" : `عوامل التصفية: المفعّل ${active}`),
  shownOf: (shown, total) => `الطلبات: ${shown} من ${total}`,
  countLoading: "جارٍ تحميل الطلبات",
  countPending: (count) => `(قيد التحميل: ${count})`,
  countFailed: (count) => `(لم يُحمَّل: ${count})`,
  updating: "جارٍ التحديث",

  density: "الكثافة",
  densities: { compact: "مضغوطة", default: "عادية", comfortable: "مريحة" },

  columns: "الأعمدة",
  columnsTitle: "الأعمدة",
  columnsShown: "الأعمدة المعروضة",
  columnsOrder: "الترتيب",
  columnsPinned: "يبقى المعرّف والعميل مثبّتين في البداية.",
  columnsUnpinned: "على الشاشة الضيقة لا يُثبَّت أي عمود، فيُمرَّر الجدول جانبيًا إلى أي منها.",
  narrowHint: "مرّر الجدول جانبيًا لرؤية بقية الأعمدة.",
  columnHiddenForRole: "غير متاح لموظف التشغيل",
  done: "تم",

  selected: (count) => `المحدد: ${count}`,
  bulkLabel: "تغيير جماعي",
  bulkStatus: "الحالة الجديدة",
  apply: "طبّق",
  clearSelection: "ألغِ التحديد",
  bulkNeedsManager: "التغييرات الجماعية متاحة للمدير.",
  bulkDone: (status, count) => `عُيّنت الحالة «${status}» لعدد ${count} من الطلبات.`,
  bulkSkipped: (count) => `تُخطّي ${count}: الموافقة تتطلب تعليقًا.`,
  undo: "تراجع",
  undone: (count) => `أُلغي التغيير على ${count} من الطلبات.`,
  undoConflicts: (count) => `بقيت كما هي لأن زميلًا غيّرها بعد ذلك: ${count}.`,
  nothingToUndo: "لا شيء للتراجع عنه.",

  editSaved: (id, column, value) => `${id}: أصبح ${column} «${value}».`,
  editRefused: (id, reason) => `لم يتغير ${id}: ${reason}`,
  editErrors: {
    statusUnknown: "اختر إحدى الحالات المدرجة.",
    approveNeedsComment: "الموافقة تتطلب تعليقًا. أضف تعليقًا أولًا.",
    commentTooLong: (max, length) => `الحد الأقصى ${max} حرفًا، وفي هذا التعليق ${length}.`,
    rejectNeedsComment: "الطلب المرفوض يحتاج إلى تعليق.",
  },
  emptyComment: "(فارغ)",

  conflictTitle: "تغيّر أثناء تحريرك",
  conflictBody: (id, column) => `غيّر زميل حقل «${column}» في ${id} بعد أن فتحته. اختر القيمة التي تبقى.`,
  theirs: "قيمة الزميل",
  yours: "قيمتك",
  started: "عند بدئك",
  keepTheirs: "أبقِ قيمته",
  useMine: "استخدم قيمتي",
  conflictUndecided: "لم تُحفظ قيمتك بعد. «استخدم قيمتي» يحفظها، و«أبقِ قيمته» يتجاهلها.",
  keptTheirs: (id) => `${id}: بقيت قيمة الزميل.`,
  usedMine: (id) => `${id}: حُفظت قيمتك.`,
  colleagueEditing: (id, column, value) => `غيّر زميل الخلية التي تحرّرها (${id}، ${column}) إلى «${value}».`,
  colleagueChanged: (id, column, value) => `غيّر زميل حقل «${column}» في ${id} إلى «${value}».`,
  simulateColleague: "تعديل زميل",
  demoTitle: "عن هذا العرض التوضيحي",
  demoData: (total) => `عرض توضيحي: ${total} طلب مولَّد.`,
  demoColleague: (seconds) => `يعدّل زميل افتراضي أحدها كل ${seconds} ثانية تقريبًا؛ حرّر الخلية نفسها لترى تعارضًا.`,
  demoColleagueOff: "الزميل الافتراضي متوقف في هذه الصفحة؛ «تعديل زميل» يُجري تعديلًا واحدًا.",

  exportCsv: "صدّر ملف CSV",
  exported: (count) => `الصفوف المصدّرة: ${count}.`,
  exportedCapped: (count, total) => `صُدّر أول ${count} صف من ${total}.`,
  csvFile: "requests.csv",

  generating: "جارٍ إنشاء الطلبات",
  emptyTitle: "لا طلبات مطابقة",
  emptyBody: "لا يطابق أي طلب عوامل التصفية والبحث هذه.",
  chunkErrorTitle: "لم يُحمَّل بعض الطلبات",
  chunkErrorRange: (from, to) => `الصفوف من ${from} إلى ${to} مفقودة.`,
  retry: "أعد المحاولة",
  workerFallback: "العامل الخلفي غير متاح، لذا تجري التصفية والترتيب في الصفحة نفسها وقد تكون أبطأ.",
  actionsLabel: "الإجراءات",

  shortcuts: "الاختصارات",
  shortcutsTitle: "اختصارات لوحة المفاتيح",
  shortcutGroups: { grid: "الجدول", editing: "التحرير", selection: "التحديد", app: "مكتب الطلبات" },
  keys: {
    move: "انقل الخلية النشطة",
    rowStart: "أول خلية في الصف",
    rowEnd: "آخر خلية في الصف",
    gridStart: "أول خلية في الجدول",
    gridEnd: "آخر خلية في الجدول",
    pageUp: "صفحة إلى الأعلى",
    pageDown: "صفحة إلى الأسفل",
    sort: "على العنوان: رتّب حسب العمود",
    edit: "حرّر الحالة أو التعليق",
    saveEdit: "احفظ التحرير",
    cancelEdit: "ألغِ التحرير",
    selectRow: "حدّد الصف أو ألغِ تحديده",
    extend: "وسّع التحديد",
    selectAll: "حدّد كل الصفوف المعروضة",
    search: "البحث",
    help: "اعرض هذه الاختصارات",
    undo: "تراجع عن آخر تغيير",
    grid: "انتقل إلى الجدول",
    clear: "امسح عوامل التصفية",
    export: "صدّر ملف CSV",
    colleague: "حاكِ تعديل زميل",
    saveView: "احفظ العرض",
  },

  performance: "الأداء",
  perfNote:
    "مقيس في هذا التبويب. أول الصفوف: من بدء التنقل إلى أول إطار مرسوم فيه صفوف. التصفية والترتيب: من الإدخال إلى إعادة رسم الجدول. الذهاب والإياب: من إرسال الاستعلام إلى وصول نتيجته. الحساب: الترتيب والبحث والتصفية داخل العامل الخلفي.",
  firstRows: "أول الصفوف",
  filterLatency: "التصفية",
  sortLatency: "الترتيب",
  roundTrip: "ذهاب وإياب مع العامل",
  workerCompute: "الحساب",
  rowsLoaded: "الصفوف المحمّلة",
  computedOn: "مكان الحساب",
  modeWorker: "العامل الخلفي",
  modeMain: "الخيط الرئيسي",
  ms: "مللي ثانية",
  medianP95: (p50, p95) => `الوسيط ${p50}، المئين ٩٥: ${p95}`,
  samples: (n) => `القياسات: ${n}`,
  notYet: "لم يُقس بعد",
};

export const strings: Record<Lang, Strings> = { en, ru: ruStrings, ar };
