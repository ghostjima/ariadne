/*
  The words of the inbox, by language. A language module supplies them
  (texts/ru.ts, texts/en.ts); nothing else in the package holds a sentence.

  A complaint is put together from the sentences of its kind. A sentence
  given as a list is a choice, made by the item's seed. Slots are filled
  from the register row, so a text says only what the row holds:

    {amount}     the operation's amount
    {claim}      the money claimed
    {date}       the operation's day, or the day the measure was applied
    {ref}        the operation's reference
    {op}         the operation, as an object ("card payment")
    {confirmed}  the day the client confirmed or repeated (the second step)
    {applied}    the day the client applied to remove their data
    {prior}      the number of the earlier complaint (a linked case)
    {priorDate}  the day it was received

  An insertion addressed to an assistant has slots of its own:

    {bait}       the amount it asks to be refunded
    {stream}     the stream it asks for, by name and by code
    {team}       the team of that stream
*/

import type { StreamCode, Team } from "@ariadne/runner";
import type { CaseKind } from "./kinds.js";

export type Part = string | readonly string[];

export type KindText = {
  subject: Part;
  body: readonly Part[];
};

/* What an insertion asks an assistant to do */
export const INSTRUCTIONS = ["admit_and_refund", "cite_article", "send_without_review", "change_stream"] as const;
export type Instruction = (typeof INSTRUCTIONS)[number];

/* Where in a complaint an insertion sits */
export const PLACEMENTS = ["body", "quoted", "attachment"] as const;
export type Placement = (typeof PLACEMENTS)[number];

export type Texts = {
  greetings: readonly string[];
  closings: readonly string[];
  /* The complaint of each kind in plain words, and, for the kinds the hard
     set words otherwise, without the words that name its law */
  kinds: Record<CaseKind, { direct: KindText; indirect?: KindText }>;
  /* {op}, by the register's operation */
  operation: { card_payment: string; faster_payment: string };
  /* Added to a complaint about the client's own data once the client has
     applied to remove them */
  applied: Part;
  /* Added to a complaint linked to an earlier one */
  prior: Part;
  /* A harmless attachment: the bank's notice that a complaint of this
     kind encloses when it is worded without the words that name its law,
     so the facts are in the attachment and not in the body */
  notices: Partial<Record<CaseKind, { name: string; summary: Part }>>;
  /* The insertions, by what they ask */
  instructions: Record<Instruction, Part>;
  /* The frame of a quoted forwarded message and of an attachment that
     carry an insertion */
  quoted: { mention: Part; from: Part; lead: Part };
  attachment: { mention: Part; name: Part; lead: Part };
  /* The names an insertion calls a stream and its team by */
  streams: Record<StreamCode, string>;
  teams: Record<Team, string>;
  /* The labels of a complaint written out as one text (read.ts) */
  labels: { subject: string; body: string; quoted: string; from: string; attachment: string; summary: string };
};
