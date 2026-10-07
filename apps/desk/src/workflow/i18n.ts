// The words of a case's work: its stage, the transitions a role may take,
// the return for rework with its reason, the journal of who did what, when
// and why, and the handover of the assistant's draft. Russian first,
// English second; the stages' own names are the engine's language
// modules'.
import type { Action, ReturnReason, TransitionError } from "@ariadne/grid";
import type { SignDecision } from "./caseFile";
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

  /** Refusals of the desk beyond the transition table, by the letter. */
  letterRefusal: { "letter-undecided": string; "letter-not-signed": string; "letter-signed": string };

  /** The letter: the assistant's draft, the text as it stands, the
   * signatory named on it. */
  letter: {
    panel: string;
    asItStands: string;
    signedPanel: string;
    toBeSigned: (name: string, position: string) => string;
    signedBy: (name: string, position: string, time: string) => string;
    position: string;
    editedBy: (who: string, time: string) => string;
    otherLanguage: string;
    fromRegister: string;
    handedOver: (time: string) => string;
    notKept: string;
  };
  /** The review of a reply: findings, the diff, the edit. */
  review: {
    findings: string;
    findingsNote: string;
    diff: string;
    diffCaption: string;
    diffNone: string;
    diffStats: (changed: string, base: string, share: string) => string;
    removed: string;
    added: string;
    edit: string;
    editTitle: (id: string) => string;
    editLabel: string;
    editHelp: (max: string) => string;
    save: string;
    saved: (id: string) => string;
    errors: { "letter-empty": string; "letter-too-long": (max: string, length: string) => string; "letter-unchanged": string; "letter-signed": string };
    readOnly: string;
  };
  /** The signature step: the decision record, then the signature. */
  signature: {
    panel: string;
    basis: string;
    decision: string;
    decisions: Record<SignDecision, string>;
    decisionHelp: Record<SignDecision, string>;
    concerns: string;
    concernsHelp: (min: string) => string;
    wrong: string;
    wrongHelp: (min: string) => string;
    sign: string;
    defer: string;
    signed: (id: string) => string;
    deferred: (id: string) => string;
    frozen: string;
    sendNext: string;
    deferrals: string;
    record: (decision: string) => string;
    concernsSaid: (text: string) => string;
    wrongSaid: (text: string) => string;
    errors: {
      "not-awaiting-signature": string;
      "letter-signed": string;
      "wrong-required": (min: string) => string;
      "concerns-required": (min: string) => string;
      "record-too-long": (max: string) => string;
      "edit-first": string;
      "edited-so-modify": string;
      "letter-undecided": string;
    };
    notYours: (name: string) => string;
  };

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
    send: "Send the signed reply",
    close: "Close the case",
  },
  actHelp: {
    request_facts: "The case waits for facts from another team.",
    start_drafting: "The reply is drafted without asking for facts.",
    facts_received: "The facts are in: the reply is drafted.",
    hand_over: "The draft goes to the legal reviewer, who states the decision if it is not yet.",
    approve: "The reply goes to the signatory. It needs a decision, and a refusal its legal ground.",
    return: "The reply goes back to drafting, with the reason.",
    send: "The signed reply goes out to the applicant today.",
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
    send: "Sent",
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

  letterRefusal: {
    "letter-undecided": "The letter still leaves the decision open: state it, or edit the letter, first.",
    "letter-not-signed": "The reply goes out only signed: sign the letter first.",
    "letter-signed": "The letter is signed: it is not returned for rework.",
  },
  letter: {
    panel: "The letter",
    asItStands: "The letter as it stands",
    signedPanel: "The signed letter",
    toBeSigned: (name, position) => `To be signed by ${name}, ${position}.`,
    signedBy: (name, position, time) => `Signed by ${name}, ${position}, ${time}.`,
    position: "authorised person of the bank",
    editedBy: (who, time) => `Edited by ${who}, ${time}.`,
    otherLanguage: "This text was written in the other language of the desk and is shown as written.",
    fromRegister: "The assistant's draft, worked out from the case as the assistant drafts it: this case was not handed over in this page.",
    handedOver: (time) => `The assistant's draft, handed over ${time}.`,
    notKept: "The letter of a case answered before this page opened is not kept here.",
  },
  review: {
    findings: "What the rubric finds",
    findingsNote: "Grounds, options and deadlines are checked as the draft names them; sentence length on the text as it stands.",
    diff: "Changes against the assistant's draft",
    diffCaption: "Removed and added text, in order",
    diffNone: "No changes: the letter is the assistant's draft.",
    diffStats: (changed, base, share) => `${changed} of ${base} characters changed (${share}).`,
    removed: "removed",
    added: "added",
    edit: "Edit the letter",
    editTitle: (id) => `Edit the letter of ${id}`,
    editLabel: "Text of the letter",
    editHelp: (max) => `One sentence a line reads best. At most ${max} characters.`,
    save: "Save the letter",
    saved: (id) => `The letter of ${id} is saved.`,
    errors: {
      "letter-empty": "The letter is empty.",
      "letter-too-long": (max, length) => `At most ${max} characters; this letter has ${length}.`,
      "letter-unchanged": "Nothing changed.",
      "letter-signed": "The letter is signed and is not changed any more.",
    },
    readOnly: "Only the legal reviewer edits the letter under review.",
  },
  signature: {
    panel: "Signature",
    basis:
      "No statute names who signs a reply; it must let the applicant identify the organisation and the authorised official (Bank of Russia, questions and answers on 442-FZ). The MFO base standard (art. 18 item 9, from 1 July 2026) and the insurers' base standard (item 4.1.3) require the head, a deputy or an authorised person.",
    decision: "Decision",
    decisions: { approve: "Approve", modify: "Modify", override: "Override", defer: "Defer" },
    decisionHelp: {
      approve: "Sign the letter as proposed.",
      modify: "Sign it with your own changes: edit the letter first.",
      override: "Replace what was proposed with your own letter: edit it first, and say why.",
      defer: "Do not sign now; the case stays at signature.",
    },
    concerns: "Concerns",
    concernsHelp: (min) => `What gives you pause. Required unless you approve, at least ${min} characters.`,
    wrong: "What would make this wrong",
    wrongHelp: (min) => `The fact that, if true, would make this decision wrong. At least ${min} characters.`,
    sign: "Sign the letter",
    defer: "Defer the signature",
    signed: (id) => `The letter of ${id} is signed.`,
    deferred: (id) => `The signature of ${id} is deferred.`,
    frozen: "Signed: the letter is not changed any more.",
    sendNext: "Next: send the signed reply.",
    deferrals: "Deferred signatures",
    record: (decision) => `Decision: ${decision}`,
    concernsSaid: (text) => `Concerns: ${text}`,
    wrongSaid: (text) => `What would make this wrong: ${text}`,
    errors: {
      "not-awaiting-signature": "The case is not at signature.",
      "letter-signed": "The letter is already signed.",
      "wrong-required": (min) => `Say what would make this wrong, in at least ${min} characters.`,
      "concerns-required": (min) => `Say what your concerns are, in at least ${min} characters.`,
      "record-too-long": (max) => `At most ${max} characters in each field.`,
      "edit-first": "Edit the letter first: a modification or an override is your own text.",
      "edited-so-modify": "You changed the letter: that is a modification or an override, not an approval as proposed.",
      "letter-undecided": "The letter still leaves the decision open; it is not signed.",
    },
    notYours: (name) => `The signature is ${name}'s.`,
  },
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
    send: "Отправить подписанный ответ",
    close: "Закрыть обращение",
  },
  actHelp: {
    request_facts: "Обращение ждёт фактов от другого подразделения.",
    start_drafting: "Проект ответа готовится без запроса фактов.",
    facts_received: "Факты получены: готовится проект ответа.",
    hand_over: "Проект уходит юристу; если решение ещё не принято, его указывает юрист.",
    approve: "Ответ уходит подписанту. Нужно решение, для отказа также его правовое основание.",
    return: "Ответ возвращается на подготовку проекта с указанием причины.",
    send: "Подписанный ответ уходит заявителю сегодня.",
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
    send: "Отправлено",
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

  letterRefusal: {
    "letter-undecided": "В письме ещё не указано решение: сначала укажите его или отредактируйте письмо.",
    "letter-not-signed": "Ответ уходит только подписанным: сначала подпишите письмо.",
    "letter-signed": "Письмо подписано: на доработку оно не возвращается.",
  },
  letter: {
    panel: "Письмо",
    asItStands: "Письмо в текущем виде",
    signedPanel: "Подписанное письмо",
    toBeSigned: (name, position) => `Подписывает ${name}, ${position}.`,
    signedBy: (name, position, time) => `Подписал(а) ${name}, ${position}, ${time}.`,
    position: "уполномоченное лицо банка",
    editedBy: (who, time) => `Отредактировал(а) ${who}, ${time}.`,
    otherLanguage: "Этот текст написан на другом языке стола и показан как написан.",
    fromRegister: "Проект ассистента, построенный по обращению так, как его готовит ассистент: в этой вкладке обращение не передавалось.",
    handedOver: (time) => `Проект ассистента, передан ${time}.`,
    notKept: "Письмо по обращению, отвеченному до открытия этой страницы, здесь не хранится.",
  },
  review: {
    findings: "Что находит рубрика",
    findingsNote: "Основания, возможности и сроки проверяются по проекту; длина предложений по тексту в текущем виде.",
    diff: "Изменения относительно проекта ассистента",
    diffCaption: "Удалённый и добавленный текст по порядку",
    diffNone: "Изменений нет: письмо совпадает с проектом ассистента.",
    diffStats: (changed, base, share) => `Изменено ${changed} из ${base} знаков (${share}).`,
    removed: "удалено",
    added: "добавлено",
    edit: "Редактировать письмо",
    editTitle: (id) => `Письмо по ${id}`,
    editLabel: "Текст письма",
    editHelp: (max) => `Удобнее по одному предложению в строке. Не больше ${max} знаков.`,
    save: "Сохранить письмо",
    saved: (id) => `Письмо по ${id} сохранено.`,
    errors: {
      "letter-empty": "Письмо пустое.",
      "letter-too-long": (max, length) => `Не больше ${max} знаков, в письме ${length}.`,
      "letter-unchanged": "Ничего не изменилось.",
      "letter-signed": "Письмо подписано и больше не меняется.",
    },
    readOnly: "Письмо на проверке редактирует только юрист.",
  },
  signature: {
    panel: "Подпись",
    basis:
      "Закон не называет, кто подписывает ответ; ответ должен позволять заявителю установить организацию и уполномоченное должностное лицо (Банк России, вопросы и ответы по 442-ФЗ). Базовый стандарт МФО (ст. 18 п. 9, с 1 июля 2026 года) и базовый стандарт страховщиков (п. 4.1.3) требуют подписи руководителя, заместителя или уполномоченного лица.",
    decision: "Решение",
    decisions: { approve: "Согласовать", modify: "Изменить", override: "Заменить", defer: "Отложить" },
    decisionHelp: {
      approve: "Подписать письмо в предложенном виде.",
      modify: "Подписать со своими правками: сначала отредактируйте письмо.",
      override: "Заменить предложенное своим письмом: сначала отредактируйте его и объясните почему.",
      defer: "Не подписывать сейчас; обращение остаётся на подписи.",
    },
    concerns: "Сомнения",
    concernsHelp: (min) => `Что вас настораживает. Обязательно, кроме согласования, не короче ${min} знаков.`,
    wrong: "Что сделало бы это решение неверным",
    wrongHelp: (min) => `Факт, при котором это решение было бы ошибкой. Не короче ${min} знаков.`,
    sign: "Подписать письмо",
    defer: "Отложить подпись",
    signed: (id) => `Письмо по ${id} подписано.`,
    deferred: (id) => `Подпись по ${id} отложена.`,
    frozen: "Подписано: письмо больше не меняется.",
    sendNext: "Дальше: отправить подписанный ответ.",
    deferrals: "Отложенные подписи",
    record: (decision) => `Решение: ${decision}`,
    concernsSaid: (text) => `Сомнения: ${text}`,
    wrongSaid: (text) => `Что сделало бы решение неверным: ${text}`,
    errors: {
      "not-awaiting-signature": "Обращение не на подписи.",
      "letter-signed": "Письмо уже подписано.",
      "wrong-required": (min) => `Опишите, что сделало бы решение неверным, не короче ${min} знаков.`,
      "concerns-required": (min) => `Опишите сомнения, не короче ${min} знаков.`,
      "record-too-long": (max) => `Не больше ${max} знаков в каждом поле.`,
      "edit-first": "Сначала отредактируйте письмо: изменение или замена означают ваш собственный текст.",
      "edited-so-modify": "Вы изменили письмо: это изменение или замена, а не согласование в предложенном виде.",
      "letter-undecided": "В письме ещё не указано решение; оно не подписывается.",
    },
    notYours: (name) => `Подпись за подписантом ${name}.`,
  },
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
