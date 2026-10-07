// The words of the supervisor's metrics. Russian first, English second.
import type { Lang } from "../i18n";

export type SupervisionStrings = {
  title: string;
  open: string;
  back: string;
  note: (day: string) => string;
  overall: string;
  counts: { cases: string; open: string; reviewed: string; signed: string };
  firstAction: string;
  firstActionBasis: (n: string) => string;
  breaches: string;
  breachesBasis: (late: string, lateDays: string, overdue: string, overdueDays: string) => string;
  light: string;
  lightBasis: (light: string, n: string, page: string) => string;
  overrides: string;
  overridesBasis: (overrides: string, n: string) => string;
  returned: string;
  returnedBasis: (returned: string, n: string) => string;
  reopened: string;
  reopenedBasis: (n: string) => string;
  escalated: string;
  escalatedBasis: (n: string) => string;
  workingDays: string;
  cases: string;
  median: (value: string, p90: string) => string;
  none: string;
  byOperator: string;
  columns: {
    operator: string;
    cases: string;
    open: string;
    overdue: string;
    late: string;
    firstAction: string;
    returned: string;
    light: string;
  };
  definitions: string;
  defs: string[];
  /** The edits a signatory made to a draft of the register, worked out
   * from the case: sentences in the reader's language. */
  edits: { greeting: string; courtesy: string; clarify: string; override: [string, string] };
  keys: { open: string; back: string };
};

const en: SupervisionStrings = {
  title: "Supervisor metrics",
  open: "Metrics",
  back: "Back to the queue",
  note: (day) =>
    `Computed in this page from the synthetic register, as of ${day}, with the changes made here: a demonstration of the measures, not any bank's figures. Each is a hypothesis to test with people who do this work.`,
  overall: "The register",
  counts: { cases: "Cases", open: "Open", reviewed: "Reached legal review", signed: "Signed letters" },
  firstAction: "Time to first action",
  firstActionBasis: (n) => `median, working days from registration to the first step on the case; over ${n} cases with a step`,
  breaches: "Deadline breaches",
  breachesBasis: (late, lateDays, overdue, overdueDays) =>
    `${late} replies sent late, ${lateDays} working days late in all; ${overdue} open cases past their last day, ${overdueDays} working days in all`,
  light: "Drafts signed with at most 20% changed",
  lightBasis: (light, n, page) =>
    `${light} of ${n} signed letters; characters changed (per changed passage, the longer side) against the assistant's draft, in the language shown; ${page} signed in this page, the rest worked out from the register`,
  overrides: "Override rate",
  overridesBasis: (overrides, n) => `${overrides} of ${n} signatures replaced what was proposed (decision Override)`,
  returned: "Returned for rework",
  returnedBasis: (returned, n) => `${returned} of ${n} replies that reached legal review were returned at least once`,
  reopened: "Reopened",
  reopenedBasis: (n) => `repeat complaints: the same applicant about the same operation as an earlier case, of ${n} cases`,
  escalated: "Escalated",
  escalatedBasis: (n) => `repeat complaints that came through the Bank of Russia after a complaint to the bank, of ${n} cases`,
  workingDays: "working days",
  cases: "cases",
  median: (value, p90) => `${value} (90th percentile ${p90})`,
  none: "none",
  byOperator: "By operator",
  columns: {
    operator: "Operator",
    cases: "Cases",
    open: "Open",
    overdue: "Overdue now",
    late: "Sent late",
    firstAction: "First action, median working days",
    returned: "Returned for rework",
    light: "Signed with at most 20% changed",
  },
  definitions: "How each is counted",
  defs: [
    "Time to first action: working days on the production calendar from the day of registration to the day of the case's first journal entry after it; the median and the 90th percentile.",
    "Deadline breaches: replies sent after their last day (extended where extended), and open cases past it on the day the data is taken, with the working days of each, summed.",
    "Signed with at most 20% changed: signed letters whose characters changed against the assistant's draft, for each changed passage the longer of what was removed and what was added, are at most a fifth of the draft's characters.",
    "Override rate: signatures with the decision Override, of all signatures; deferrals are not signatures.",
    "Returned for rework: replies with at least one return in their journal, of those that reached legal review.",
    "Reopened: a repeat complaint, linked to an earlier case of the same applicant about the same operation. Escalated: a repeat complaint that came through the Bank of Russia after the earlier one came to the bank. A share of all cases; whether the earlier one was answered is not asked.",
  ],
  edits: {
    greeting: "Dear Sir or Madam,",
    courtesy: "We apologise for the time our answer has taken.",
    clarify: "If anything in this letter is unclear, our staff will explain it by phone.",
    override: ["Having looked at the case again, we have taken another view of your complaint.", "Our decision and its reasons are set out below."],
  },
  keys: { open: "Supervisor metrics", back: "Back to the queue" },
};

const ru: SupervisionStrings = {
  title: "Показатели руководителя",
  open: "Показатели",
  back: "Назад к очереди",
  note: (day) =>
    `Посчитано в этой вкладке по синтетическому реестру на ${day}, с изменениями, сделанными здесь: демонстрация показателей, а не данные какого-либо банка. Каждый показатель является гипотезой для проверки с людьми, которые делают эту работу.`,
  overall: "Реестр",
  counts: { cases: "Обращений", open: "Открыто", reviewed: "Дошли до юридической проверки", signed: "Подписанных писем" },
  firstAction: "Время до первого действия",
  firstActionBasis: (n) => `медиана, рабочих дней от регистрации до первого шага по обращению; по ${n} обращениям с шагами`,
  breaches: "Нарушения сроков",
  breachesBasis: (late, lateDays, overdue, overdueDays) =>
    `ответов с опозданием: ${late}, всего ${lateDays} рабочих дней; открытых обращений после последнего дня: ${overdue}, всего ${overdueDays} рабочих дней`,
  light: "Проекты, подписанные с изменением не больше 20%",
  lightBasis: (light, n, page) =>
    `${light} из ${n} подписанных писем; изменённые знаки (по каждому изменённому фрагменту большая сторона) относительно проекта ассистента, на языке показа; подписано в этой вкладке: ${page}, остальные построены по реестру`,
  overrides: "Доля замен",
  overridesBasis: (overrides, n) => `${overrides} из ${n} подписей заменили предложенное (решение «Заменить»)`,
  returned: "Возвраты на доработку",
  returnedBasis: (returned, n) => `${returned} из ${n} ответов, дошедших до юридической проверки, возвращались хотя бы раз`,
  reopened: "Повторные",
  reopenedBasis: (n) => `повторные обращения: тот же заявитель по той же операции, что и в прежнем обращении, из ${n} обращений`,
  escalated: "Эскалированные",
  escalatedBasis: (n) => `повторные обращения, пришедшие через Банк России после обращения в банк, из ${n} обращений`,
  workingDays: "раб. дн.",
  cases: "обращений",
  median: (value, p90) => `${value} (90-й процентиль ${p90})`,
  none: "нет",
  byOperator: "По операторам",
  columns: {
    operator: "Оператор",
    cases: "Обращений",
    open: "Открыто",
    overdue: "Просрочено сейчас",
    late: "Отправлено с опозданием",
    firstAction: "Первое действие, медиана рабочих дней",
    returned: "Возвраты на доработку",
    light: "Подписано с изменением не больше 20%",
  },
  definitions: "Как считается",
  defs: [
    "Время до первого действия: рабочие дни по производственному календарю от дня регистрации до дня первой записи журнала после неё; медиана и 90-й процентиль.",
    "Нарушения сроков: ответы, отправленные после последнего дня (с учётом продления), и открытые обращения после него на дату данных, с рабочими днями каждого, суммарно.",
    "Подписано с изменением не больше 20%: подписанные письма, в которых изменённые относительно проекта ассистента знаки (по каждому изменённому фрагменту большая из удалённой и добавленной частей) составляют не больше пятой части знаков проекта.",
    "Доля замен: подписи с решением «Заменить» среди всех подписей; отложенные подписи не считаются.",
    "Возвраты на доработку: ответы, в журнале которых есть хотя бы один возврат, среди дошедших до юридической проверки.",
    "Повторные: обращение, связанное с прежним обращением того же заявителя по той же операции. Эскалированные: повторные, пришедшие через Банк России после обращения в банк. Доля всех обращений; был ли ответ на прежнее, не учитывается.",
  ],
  edits: {
    greeting: "Уважаемый заявитель!",
    courtesy: "Приносим извинения за время, которое занял наш ответ.",
    clarify: "Если что-то в письме непонятно, наши сотрудники объяснят по телефону.",
    override: ["Рассмотрев обращение повторно, мы пришли к иному выводу по вашей жалобе.", "Наше решение и его причины изложены ниже."],
  },
  keys: { open: "Показатели руководителя", back: "Назад к очереди" },
};

export const supervisionStrings: Record<Lang, SupervisionStrings> = { ru, en };
