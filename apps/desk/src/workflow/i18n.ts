// The words of a case's work: its stage, the transitions a role may take,
// the return for rework with its reason, the journal of who did what, when
// and why, and the handover of the assistant's draft. Russian first,
// English second; the stages' own names are the engine's language
// modules'.
import type { Action, ReturnReason, TransitionError } from "@ariadne/grid";
import type { Lang } from "../i18n";

export type WorkflowStrings = {
  panel: string;
  /** Who the page acts as, and on what. */
  actingAs: (role: string, name: string) => string;
  notYours: (name: string) => string;
  notYoursSigner: (name: string) => string;
  /** Nothing the role can do on the case at its stage. */
  nothingToDo: (stage: string) => string;
  returned: string;
  /** A button per transition, by action. */
  act: Partial<Record<Action, string>>;
  /** What each transition does, read under its button. */
  actHelp: Partial<Record<Action, string>>;
  returnTitle: (id: string) => string;
  returnFrom: (stage: string) => string;
  reason: string;
  reasonNone: string;
  reasons: Record<ReturnReason, string>;
  comment: string;
  commentHelp: (min: string) => string;
  returnConfirm: string;
  cancel: string;
  errors: Record<TransitionError["code"], string>;
  commentRequired: (min: string) => string;
  commentTooLong: (max: string, length: string) => string;
  /** Announced and toasted once a transition is made. */
  done: (id: string, stage: string) => string;

  journal: string;
  journalCaption: string;
  /** The journal's line for an entry, by action. */
  action: Record<Action, string>;
  move: (from: string, to: string) => string;
  why: (reason: string) => string;
  said: (comment: string) => string;
  generated: string;
  system: string;
  colleague: string;
  assistant: (name: string) => string;
  person: (role: string, name: string) => string;

  /** The assistant's handover, on the case. */
  handover: {
    recorded: (stage: string, who: string, time: string) => string;
    draftKept: string;
    confirmTitle: string;
    confirmText: (stage: string) => string;
    confirm: string;
    noDraft: string;
    notOperator: string;
    already: (stage: string) => string;
    /** Under the run's step once the handover is on the case. */
    final: string;
  };
};

const en: WorkflowStrings = {
  panel: "Work on the case",
  actingAs: (role, name) => `You act as the ${role.toLowerCase()}, ${name}.`,
  notYours: (name) => `This case is assigned to ${name}; the operator acts on their own cases only.`,
  notYoursSigner: (name) => `This reply is signed by ${name}; the signatory acts on their own replies only.`,
  nothingToDo: (stage) => `At “${stage}” this role has nothing to do on the case.`,
  returned: "Returned for rework",
  act: {
    request_facts: "Request facts",
    start_drafting: "Start drafting",
    facts_received: "Facts received",
    hand_over: "Hand over to legal review",
    approve: "Approve for signature",
    return: "Return for rework",
    send: "Sign and send",
    close: "Close the case",
  },
  actHelp: {
    request_facts: "The case waits for facts from another team.",
    start_drafting: "The reply is drafted without asking for facts.",
    facts_received: "The facts are in: the reply is drafted.",
    hand_over: "The draft goes to the legal reviewer, who states the decision if it is not yet.",
    approve: "The reply goes to the signatory. It needs a decision, and a refusal its legal ground.",
    return: "The reply goes back to drafting, with the reason.",
    send: "The reply goes out to the applicant today.",
    close: "The answered case is closed.",
  },
  returnTitle: (id) => `Return ${id} for rework`,
  returnFrom: (stage) => `From “${stage}” back to drafting. The reason goes into the case's journal.`,
  reason: "Reason",
  reasonNone: "Not chosen",
  reasons: {
    facts_missing: "Facts are missing",
    ground_wrong: "The legal ground is wrong",
    deadline_wrong: "A deadline is wrong or missing",
    option_missing: "An option of the client is missing",
    wording: "The wording needs work",
    other: "Another reason",
  },
  comment: "Comment",
  commentHelp: (min) => `Required for another reason, at least ${min} characters.`,
  returnConfirm: "Return for rework",
  cancel: "Cancel",
  errors: {
    "transition-not-allowed": "A case does not go there from this stage.",
    "stage-not-for-role": "This role does not take this step.",
    "reason-required": "Choose a reason.",
    "comment-required": "Say what the other reason is.",
    "comment-too-long": "The comment is too long.",
    "reply-needs-outcome": "Decide the outcome first: a reply goes to signature decided.",
    "refusal-needs-ground": "A refusal needs its legal ground first.",
  },
  commentRequired: (min) => `Say what the other reason is, in at least ${min} characters.`,
  commentTooLong: (max, length) => `At most ${max} characters; this comment has ${length}.`,
  done: (id, stage) => `${id} is now at “${stage}”.`,

  journal: "Journal",
  journalCaption: "Every step of the case: who took it, when and why",
  action: {
    register: "Registered",
    request_facts: "Facts requested",
    facts_received: "Facts received",
    start_drafting: "Drafting started",
    hand_over: "Handed over to legal review",
    approve: "Approved for signature",
    return: "Returned for rework",
    send: "Signed and sent",
    close: "Closed",
    extend: "Deadline extended by 10 working days",
    extension_withdrawn: "Extension withdrawn",
    undo: "Change undone",
    edit: "Letter edited",
    sign: "Letter signed",
    defer: "Signature deferred",
  },
  move: (from, to) => `${from} → ${to}`,
  why: (reason) => `Reason: ${reason}`,
  said: (comment) => `Comment: ${comment}`,
  generated: "From the register",
  system: "The desk",
  colleague: "A colleague",
  assistant: (name) => `The assistant, confirmed by ${name}`,
  person: (role, name) => `${role} ${name}`,

  handover: {
    recorded: (stage, who, time) => `On the case: “${stage}”, ${who}, ${time}.`,
    draftKept: "The draft is kept with the case for the reviewer; the run's log stays as it was.",
    confirmTitle: "The handover is not on the case yet",
    confirmText: (stage) => `Confirm it, and the case moves to “${stage}” with this draft. The run's log stays as it was.`,
    confirm: "Confirm the handover",
    noDraft: "No draft was written in this run, so there is nothing to hand over.",
    notOperator: "The handover is the operator's: switch to the operator role to confirm it.",
    already: (stage) => `The case is already at “${stage}”.`,
    final: "On the case now: a return for rework is the reviewer's.",
  },
};

const ru: WorkflowStrings = {
  panel: "Работа с обращением",
  actingAs: (role, name) => `Вы действуете в роли «${role}»: ${name}.`,
  notYours: (name) => `Обращение назначено на исполнителя ${name}; оператор работает только со своими обращениями.`,
  notYoursSigner: (name) => `Ответ подписывает ${name}; подписант работает только со своими ответами.`,
  nothingToDo: (stage) => `На этапе «${stage}» у этой роли нет действий по обращению.`,
  returned: "Возвращено на доработку",
  act: {
    request_facts: "Запросить факты",
    start_drafting: "Начать проект ответа",
    facts_received: "Факты получены",
    hand_over: "Передать на юридическую проверку",
    approve: "Согласовать на подпись",
    return: "Вернуть на доработку",
    send: "Подписать и отправить",
    close: "Закрыть обращение",
  },
  actHelp: {
    request_facts: "Обращение ждёт фактов от другого подразделения.",
    start_drafting: "Проект ответа готовится без запроса фактов.",
    facts_received: "Факты получены: готовится проект ответа.",
    hand_over: "Проект уходит юристу; если решение ещё не принято, его указывает юрист.",
    approve: "Ответ уходит подписанту. Нужно решение, для отказа также его правовое основание.",
    return: "Ответ возвращается на подготовку проекта с указанием причины.",
    send: "Ответ уходит заявителю сегодня.",
    close: "Обращение с отправленным ответом закрывается.",
  },
  returnTitle: (id) => `Вернуть ${id} на доработку`,
  returnFrom: (stage) => `С этапа «${stage}» на подготовку проекта. Причина попадёт в журнал обращения.`,
  reason: "Причина",
  reasonNone: "Не выбрана",
  reasons: {
    facts_missing: "Не хватает фактов",
    ground_wrong: "Неверное правовое основание",
    deadline_wrong: "Срок указан неверно или не указан",
    option_missing: "Не указана возможность клиента",
    wording: "Нужно поправить формулировки",
    other: "Другая причина",
  },
  comment: "Комментарий",
  commentHelp: (min) => `Обязателен для другой причины, не короче ${min} знаков.`,
  returnConfirm: "Вернуть на доработку",
  cancel: "Отмена",
  errors: {
    "transition-not-allowed": "С этого этапа обращение туда не переходит.",
    "stage-not-for-role": "Этот шаг делает другая роль.",
    "reason-required": "Выберите причину.",
    "comment-required": "Опишите другую причину.",
    "comment-too-long": "Комментарий слишком длинный.",
    "reply-needs-outcome": "Сначала примите решение: на подпись уходит ответ с решением.",
    "refusal-needs-ground": "Сначала укажите правовое основание отказа.",
  },
  commentRequired: (min) => `Опишите другую причину, не короче ${min} знаков.`,
  commentTooLong: (max, length) => `Не больше ${max} знаков, в комментарии ${length}.`,
  done: (id, stage) => `${id} теперь на этапе «${stage}».`,

  journal: "Журнал",
  journalCaption: "Каждый шаг по обращению: кто, когда и почему",
  action: {
    register: "Зарегистрировано",
    request_facts: "Запрошены факты",
    facts_received: "Факты получены",
    start_drafting: "Начат проект ответа",
    hand_over: "Передано на юридическую проверку",
    approve: "Согласовано на подпись",
    return: "Возвращено на доработку",
    send: "Подписано и отправлено",
    close: "Закрыто",
    extend: "Срок продлён на 10 рабочих дней",
    extension_withdrawn: "Продление отменено",
    undo: "Изменение отменено",
    edit: "Письмо отредактировано",
    sign: "Письмо подписано",
    defer: "Подпись отложена",
  },
  move: (from, to) => `${from} → ${to}`,
  why: (reason) => `Причина: ${reason}`,
  said: (comment) => `Комментарий: ${comment}`,
  generated: "Из реестра",
  system: "Система",
  colleague: "Коллега",
  assistant: (name) => `Ассистент, подтвердил(а) ${name}`,
  person: (role, name) => `${role} ${name}`,

  handover: {
    recorded: (stage, who, time) => `В обращении: «${stage}», ${who}, ${time}.`,
    draftKept: "Проект сохранён в обращении для юриста; журнал запуска не меняется.",
    confirmTitle: "Передача ещё не отражена в обращении",
    confirmText: (stage) => `Подтвердите её, и обращение перейдёт на этап «${stage}» с этим проектом. Журнал запуска не меняется.`,
    confirm: "Подтвердить передачу",
    noDraft: "В этом запуске проект не подготовлен, передавать нечего.",
    notOperator: "Передачу подтверждает оператор: переключитесь на роль оператора.",
    already: (stage) => `Обращение уже на этапе «${stage}».`,
    final: "Отражено в обращении: вернуть на доработку может юрист.",
  },
};

export const workflowStrings: Record<Lang, WorkflowStrings> = { ru, en };
