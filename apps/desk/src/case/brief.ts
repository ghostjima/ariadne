// What the assistant is told about a case: the engine's CaseBrief, worked
// out from the register's codes and from ariadne-rules, never from the
// complaint's text. It is built in @ariadne/inbox, which the assistant's
// other readers of a case use too; the desk takes it from there, and
// brief.test.ts checks it here against the register the desk shows.
export { caseBrief, clientDuties, factsDueOf, groundsOf, instrumentGround, reasonOf } from "@ariadne/inbox/brief";
