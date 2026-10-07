//! Legal clocks: what is due, by when, and on what basis, for one
//! complaint and the facts around it.
//!
//! [`clock`] takes a [`Case`] and returns a [`Clock`]: dated
//! [`Deadline`]s, [`Duty`]s tied to an event rather than a date,
//! [`Warning`]s about the case's data, and [`Refusal`]s of what the law
//! does not allow (such as extending a claim's term under 123-FZ). Each
//! deadline and duty carries its [`Basis`]: the source, article and part,
//! and whether the date follows the text or a conservative reading of it.
//!
//! The clocks:
//!
//! - a complaint (442-FZ, which wrote the same article into each sector's
//!   law): registration by the working day after receipt; a registration
//!   notice for an electronic complaint by the day of registration; a
//!   reply in 15 working days from registration; one extension of at most
//!   10 working days, only to obtain documents, with a reasoned notice;
//!   for a complaint the Bank of Russia forwarded, a copy of every notice
//!   and of the reply to it on the day they go to the applicant; for a
//!   microfinance organisation, insurer, securities market professional
//!   or credit cooperative that finds a breach of a base or internal
//!   standard, the complaint and the reply to its self-regulatory
//!   organisation on the day the reply goes out;
//! - a money claim within the financial ombudsman's reach (123-FZ):
//!   15 working days from receipt for a claim on the standard electronic
//!   form within 180 days of the breach, otherwise 30 calendar days; no
//!   extension, and the engine refuses one;
//! - an antifraud block (161-FZ art. 8): the first action on part 3.4 for
//!   every kind of operation (a transfer order suspended for two days; a
//!   card, e-money or Faster Payments operation refused), the client's
//!   notice, the confirmation of a suspended order by the next day or the
//!   order not accepted (part 3.9), the second step on part 3.10 after a
//!   match in the Bank of Russia's database, the execution or the next
//!   repeat on part 3.11, the 30-day refund;
//! - the client's own data in that database (161-FZ art. 9, Bank of Russia
//!   Directive No. 6748-U): the notices of a suspended card or online
//!   banking, the restoring of it, and an application to remove the data,
//!   both the Bank of Russia's 15 working days from its receipt and the
//!   operator's own terms when the client applies through it;
//! - an anti-money-laundering refusal (115-FZ): the reasons in 5 working
//!   days, the answer to the client's documents in 7, the interagency
//!   commission's 20; for a client the Bank of Russia places in the high
//!   risk group, the notice in 5 working days and the client's 6 months to
//!   apply to the commission.

use crate::calendar;
use crate::sources::{self, Source};
use crate::{Date, Error};

/// The largest money claim the financial ombudsman hears: 500,000
/// roubles, in kopecks (123-FZ art. 15 part 1, "не превышает").
pub const OMBUDSMAN_LIMIT_KOPECKS: u64 = 500_000 * 100;

/// Calendar days since the breach within which a claim on the standard
/// electronic form gets the 15-working-day reply (123-FZ art. 16 part 2
/// item 1).
pub const STANDARD_FORM_WINDOW_DAYS: i32 = 180;

/// What the complaint is about.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Stream {
    /// Any other complaint.
    General,
    /// A claim for money from the organisation.
    MoneyClaim,
    /// A block or refusal under 161-FZ (antifraud).
    Antifraud,
    /// A refusal or restriction under 115-FZ (anti-money-laundering).
    AmlRefusal,
}

/// The kind of organisation that handles the complaint, which decides the
/// law and article that govern it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Sector {
    /// A credit institution: Banking Law art. 30.1.
    Bank,
    /// A microfinance organisation: 151-FZ art. 9.1.
    Microfinance,
    /// An insurer: 4015-1 art. 6.2.
    Insurer,
    /// A securities market professional: 39-FZ art. 15.11.
    SecuritiesProfessional,
    /// A credit consumer cooperative: 190-FZ art. 6.2.
    CreditCooperative,
}

/// Who complains.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Applicant {
    /// A natural person: a consumer of financial services under 123-FZ.
    Individual,
    /// A legal entity or an individual entrepreneur.
    LegalEntity,
}

/// How the complaint arrived.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Origin {
    /// From the applicant.
    Direct,
    /// Forwarded by the Bank of Russia under 86-FZ art. 79.3.
    ForwardedByBankOfRussia,
}

/// A money claim in the complaint.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct MoneyClaim {
    /// The amount claimed, in kopecks.
    pub kopecks: u64,
    /// Sent electronically on the standard form approved by the Council of
    /// the ombudsman's Service.
    pub standard_form: bool,
    /// The day the consumer's right was breached, when known.
    pub breach_on: Option<Date>,
}

/// Why the organisation wants more time.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ExtensionGround {
    /// To request further documents and materials: the only ground the
    /// law allows.
    RequestDocuments,
    /// Anything else.
    Other,
}

/// A requested extension of the reply term.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Extension {
    /// Why.
    pub ground: ExtensionGround,
    /// By how many working days, 1 or more.
    pub working_days: u32,
}

/// The kind of operation an antifraud block stopped. 161-FZ art. 8
/// part 3.4 is the ground of the first action for all four kinds: its
/// first sentence suspends a transfer order, its second refuses a card
/// operation, an e-money transfer or a Faster Payments transfer, which the
/// law treats alike and the engine keeps as one kind.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Operation {
    /// A card payment, an electronic money transfer or a transfer through
    /// the Faster Payments System: refused, and the client may repeat it.
    CardSbpOrEmoney,
    /// Any other transfer order: its acceptance is suspended for two days.
    Transfer,
}

/// The facts of an antifraud block under 161-FZ art. 8 and 9.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct AntifraudFacts {
    /// What was stopped.
    pub operation: Operation,
    /// The day the order was suspended or the operation refused.
    pub stopped_on: Date,
    /// The day the client confirmed the order or repeated the operation.
    pub confirmed_on: Option<Date>,
    /// After the confirmation or the repeat, the operator received data
    /// from the Bank of Russia's database (art. 8 part 3.10).
    pub database_match_after_confirmation: bool,
    /// The day the operator received an individual's refund claim under
    /// art. 8 part 3.13.
    pub refund_claim_received_on: Option<Date>,
}

/// The client's own data in the Bank of Russia's database of transfers
/// without voluntary consent, and what follows from it: 161-FZ art. 9
/// parts 9.2 and 11.6 to 11.11, and the Bank of Russia's Directive
/// No. 6748-U on the client's application to remove the data.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct DatabaseFacts {
    /// The day the operator suspended the client's electronic means of
    /// payment (a card, online banking) because of the data.
    pub instrument_suspended_on: Option<Date>,
    /// The Ministry of Internal Affairs reported unlawful acts with the
    /// data, which makes the suspension a duty (part 11.7) rather than an
    /// option (part 11.6).
    pub police_information: bool,
    /// The day the data left the database, which restores the means of
    /// payment at once (part 11.11).
    pub data_removed_on: Option<Date>,
    /// The day the operator received the client's application to remove
    /// the data, filed through it (Directive No. 6748-U, item 1.2).
    pub exclusion_received_by_operator_on: Option<Date>,
    /// The application filed through the operator lacks mandatory data,
    /// so the operator refuses to forward it (items 1.3 and 1.4).
    pub exclusion_data_missing: bool,
    /// The day the Bank of Russia received the application (items 2.1,
    /// 2.3 and 2.4 count the 15 working days from it).
    pub exclusion_received_by_bank_of_russia_on: Option<Date>,
    /// The day the operator received the Bank of Russia's decision, or its
    /// notice that the database holds no data on the client, to pass on
    /// to a client who applied through the operator.
    pub exclusion_decision_received_on: Option<Date>,
    /// The day a request of the Bank of Russia about an application
    /// reached the operator (item 2.9).
    pub bank_of_russia_query_received_on: Option<Date>,
}

/// What a 115-FZ decision refused.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum AmlDecisionKind {
    /// An operation (art. 7 item 11).
    RefuseOperation,
    /// A bank account or deposit contract (art. 7 item 5.2, paragraph 2).
    RefuseAccount,
    /// Terminating a bank account or deposit contract (art. 7 item 5.2,
    /// paragraph 3).
    TerminateAccount,
}

/// The facts of a 115-FZ refusal or restriction.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct AmlFacts {
    /// The decision and its day.
    pub decision: Option<(AmlDecisionKind, Date)>,
    /// The day the client submitted documents against the decision
    /// (art. 7 item 13.4).
    pub documents_submitted_on: Option<Date>,
    /// The day the client applied to the interagency commission.
    pub commission_applied_on: Option<Date>,
    /// The day the bank applied the measures for a client the Bank of
    /// Russia placed in the high-risk group (art. 7.7 item 5).
    pub high_risk_measures_on: Option<Date>,
    /// The day the client received the notice of those measures
    /// (art. 7.7 item 8).
    pub high_risk_notice_received_on: Option<Date>,
}

/// One complaint, with the facts the clocks need.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Case {
    pub stream: Stream,
    pub sector: Sector,
    pub applicant: Applicant,
    pub origin: Origin,
    /// The day the organisation received the complaint.
    pub received_on: Date,
    /// The day it was registered, when it has been.
    pub registered_on: Option<Date>,
    /// Received as an electronic document, which calls for a registration
    /// notice.
    pub electronic: bool,
    pub money_claim: Option<MoneyClaim>,
    pub extension: Option<Extension>,
    /// The organisation found a breach of a base or internal standard of
    /// its self-regulatory organisation.
    pub standard_breach_found: bool,
    pub antifraud: Option<AntifraudFacts>,
    pub database: Option<DatabaseFacts>,
    pub aml: Option<AmlFacts>,
}

impl Case {
    /// A complaint of `stream` to a bank from an individual, received
    /// directly on `received_on`, with nothing else known.
    pub fn new(stream: Stream, received_on: Date) -> Case {
        Case {
            stream,
            sector: Sector::Bank,
            applicant: Applicant::Individual,
            origin: Origin::Direct,
            received_on,
            registered_on: None,
            electronic: false,
            money_claim: None,
            extension: None,
            standard_breach_found: false,
            antifraud: None,
            database: None,
            aml: None,
        }
    }
}

/// Which law sets the reply term.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Regime {
    /// The sector's complaint article (442-FZ).
    Complaint,
    /// 123-FZ art. 16: a money claim within the ombudsman's reach.
    OmbudsmanClaim,
}

impl Regime {
    /// The stable code, in snake case.
    pub fn code(self) -> &'static str {
        match self {
            Regime::Complaint => "complaint",
            Regime::OmbudsmanClaim => "ombudsman_claim",
        }
    }
}

/// What a deadline is for.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum DeadlineKind {
    Registration,
    RegistrationNotice,
    Reply,
    ExtensionNotice,
    ReplyExtended,
    AntifraudSuspensionEnds,
    AntifraudConfirmation,
    AntifraudRepeatSuspensionEnds,
    AntifraudAfterRepeatSuspension,
    AntifraudRepeatRefusalEnds,
    AntifraudAfterRepeatRefusal,
    InstrumentSuspensionNotice,
    ExclusionForwarding,
    ExclusionRefusalNotice,
    ExclusionDecision,
    ExclusionDecisionRelay,
    BankOfRussiaQueryAnswer,
    AntifraudRefund,
    AmlReasonsNotice,
    AmlDocumentsAnswer,
    AmlCommissionDecision,
    HighRiskNotice,
    HighRiskCommissionApplication,
}

impl DeadlineKind {
    /// Every kind.
    pub const ALL: [DeadlineKind; 23] = {
        use DeadlineKind::*;
        [
            Registration,
            RegistrationNotice,
            Reply,
            ExtensionNotice,
            ReplyExtended,
            AntifraudSuspensionEnds,
            AntifraudConfirmation,
            AntifraudRepeatSuspensionEnds,
            AntifraudAfterRepeatSuspension,
            AntifraudRepeatRefusalEnds,
            AntifraudAfterRepeatRefusal,
            InstrumentSuspensionNotice,
            ExclusionForwarding,
            ExclusionRefusalNotice,
            ExclusionDecision,
            ExclusionDecisionRelay,
            BankOfRussiaQueryAnswer,
            AntifraudRefund,
            AmlReasonsNotice,
            AmlDocumentsAnswer,
            AmlCommissionDecision,
            HighRiskNotice,
            HighRiskCommissionApplication,
        ]
    };

    /// The kind with a code, or [`Error::UnknownCode`].
    pub fn parse(code: &str) -> Result<DeadlineKind, Error> {
        DeadlineKind::ALL
            .into_iter()
            .find(|k| k.code() == code)
            .ok_or(Error::UnknownCode)
    }

    /// The stable code, in snake case.
    pub fn code(self) -> &'static str {
        use DeadlineKind::*;
        match self {
            Registration => "registration",
            RegistrationNotice => "registration_notice",
            Reply => "reply",
            ExtensionNotice => "extension_notice",
            ReplyExtended => "reply_extended",
            AntifraudSuspensionEnds => "antifraud_suspension_ends",
            AntifraudConfirmation => "antifraud_confirmation",
            AntifraudRepeatSuspensionEnds => "antifraud_repeat_suspension_ends",
            AntifraudAfterRepeatSuspension => "antifraud_after_repeat_suspension",
            AntifraudRepeatRefusalEnds => "antifraud_repeat_refusal_ends",
            AntifraudAfterRepeatRefusal => "antifraud_after_repeat_refusal",
            InstrumentSuspensionNotice => "instrument_suspension_notice",
            ExclusionForwarding => "exclusion_forwarding",
            ExclusionRefusalNotice => "exclusion_refusal_notice",
            ExclusionDecision => "exclusion_decision",
            ExclusionDecisionRelay => "exclusion_decision_relay",
            BankOfRussiaQueryAnswer => "bank_of_russia_query_answer",
            AntifraudRefund => "antifraud_refund",
            AmlReasonsNotice => "aml_reasons_notice",
            AmlDocumentsAnswer => "aml_documents_answer",
            AmlCommissionDecision => "aml_commission_decision",
            HighRiskNotice => "high_risk_notice",
            HighRiskCommissionApplication => "high_risk_commission_application",
        }
    }

    /// Whether the deadline binds the client or a third party (the Bank of
    /// Russia, the commission) rather than the organisation: the reply
    /// should state it, but the organisation does not breach it.
    pub fn is_for_others(self) -> bool {
        use DeadlineKind::*;
        matches!(
            self,
            AntifraudConfirmation
                | ExclusionDecision
                | AmlCommissionDecision
                | HighRiskCommissionApplication
        )
    }
}

/// How a deadline was counted from its starting day.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Count {
    /// The day itself.
    SameDay,
    /// The first working day after it.
    NextWorkingDay,
    /// The n-th working day after it.
    WorkingDays(u32),
    /// n calendar days after it, whatever day that is.
    CalendarDays(u32),
    /// n calendar days after it, moved to the next working day when that
    /// is not one.
    CalendarDaysToWorkingDay(u32),
    /// n months after it (Civil Code art. 192).
    Months(u32),
}

impl Count {
    /// The stable code, in snake case, and the number it carries (zero
    /// when none).
    pub fn code(self) -> (&'static str, u32) {
        match self {
            Count::SameDay => ("same_day", 0),
            Count::NextWorkingDay => ("next_working_day", 1),
            Count::WorkingDays(n) => ("working_days", n),
            Count::CalendarDays(n) => ("calendar_days", n),
            Count::CalendarDaysToWorkingDay(n) => ("calendar_days_to_working_day", n),
            Count::Months(n) => ("months", n),
        }
    }
}

/// Whether a date follows the text or a reading of it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Reading {
    /// The text says so.
    Text,
    /// The text leaves it open; the engine takes the reading that gives
    /// the earlier date or the wider duty, and the README says why.
    Conservative,
}

/// The legal basis of a deadline or a duty.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Basis {
    /// The act, with its revision.
    pub source: Source,
    /// The article, as numbered in the act ("30.1"); empty for an act
    /// numbered in items only, such as a Bank of Russia directive, whose
    /// item is the part.
    pub article: &'static str,
    /// The part, item or paragraph, as numbered in the article ("7", or
    /// "13.1-1, paragraph 2").
    pub part: &'static str,
    pub reading: Reading,
}

const fn text(source: Source, article: &'static str, part: &'static str) -> Basis {
    Basis {
        source,
        article,
        part,
        reading: Reading::Text,
    }
}

const fn conservative(source: Source, article: &'static str, part: &'static str) -> Basis {
    Basis {
        source,
        article,
        part,
        reading: Reading::Conservative,
    }
}

/// A dated deadline.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Deadline {
    pub kind: DeadlineKind,
    /// The last day.
    pub due: Date,
    /// The day the count starts from.
    pub from: Date,
    pub count: Count,
    pub basis: Basis,
}

/// A duty tied to an event rather than to a date.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum DutyKind {
    /// Copy every notice and the reply to the Bank of Russia.
    CopyToBankOfRussia,
    /// Send the complaint and the reply to the self-regulatory
    /// organisation.
    CopyToSro,
    /// Tell the client of the suspension or refusal, give advice against a
    /// repeat of the fraud, and say how to confirm the order by the day
    /// after the suspension or that the operation may be repeated (161-FZ
    /// art. 8 part 3.6 items 1 to 3), at once.
    NotifyClientOfBlock,
    /// Tell the client of the second suspension or refusal, its reason
    /// and term, and that a later repeat is possible (161-FZ art. 8
    /// part 3.10, sentence 2), at once.
    NotifyClientOfRepeatBlock,
    /// Tell the client of a suspended card or online banking and of the
    /// right to apply to the Bank of Russia, also through the operator, to
    /// remove the data (161-FZ art. 9 part 11.8), at once.
    NotifyClientOfRightToApply,
    /// Restore the client's card or online banking and tell the client,
    /// once the data have left the database (161-FZ art. 9 part 11.11), at
    /// once.
    RestoreInstrument,
}

impl DutyKind {
    /// The stable code, in snake case.
    pub fn code(self) -> &'static str {
        match self {
            DutyKind::CopyToBankOfRussia => "copy_to_bank_of_russia",
            DutyKind::CopyToSro => "copy_to_sro",
            DutyKind::NotifyClientOfBlock => "notify_client_of_block",
            DutyKind::NotifyClientOfRepeatBlock => "notify_client_of_repeat_block",
            DutyKind::NotifyClientOfRightToApply => "notify_client_of_right_to_apply",
            DutyKind::RestoreInstrument => "restore_instrument",
        }
    }
}

/// When a duty falls due.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum When {
    /// On the day each notice and the reply go to the applicant.
    SameDayAsEachDispatch,
    /// On the day the reply goes to the applicant.
    SameDayAsReply,
    /// At once.
    Immediately,
}

impl When {
    /// The stable code, in snake case.
    pub fn code(self) -> &'static str {
        match self {
            When::SameDayAsEachDispatch => "same_day_as_each_dispatch",
            When::SameDayAsReply => "same_day_as_reply",
            When::Immediately => "immediately",
        }
    }
}

/// A duty tied to an event.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Duty {
    pub kind: DutyKind,
    pub when: When,
    pub basis: Basis,
}

/// What the operator did or does to an operation or to the client's means
/// of payment, on what ground: the provision a reply names for it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum MeasureKind {
    /// A transfer order's acceptance suspended for two days (161-FZ
    /// art. 8 part 3.4, sentence 1).
    SuspendOrder,
    /// A card, e-money or Faster Payments operation refused (part 3.4,
    /// sentence 2).
    RefuseOperation,
    /// The confirmed order suspended again for two days after a database
    /// match (part 3.10, sentence 1).
    SuspendConfirmedOrder,
    /// The repeated operation refused after a database match (part 3.10,
    /// sentence 1).
    RefuseRepeat,
    /// No confirmation in time: the order counts as not accepted
    /// (part 3.9).
    OrderNotAccepted,
    /// The client's card or online banking suspended for the client's own
    /// data in the database (161-FZ art. 9 part 11.6, or 11.7 with the
    /// Ministry of Internal Affairs' information).
    SuspendInstrument,
}

impl MeasureKind {
    /// The stable code, in snake case.
    pub fn code(self) -> &'static str {
        match self {
            MeasureKind::SuspendOrder => "suspend_order",
            MeasureKind::RefuseOperation => "refuse_operation",
            MeasureKind::SuspendConfirmedOrder => "suspend_confirmed_order",
            MeasureKind::RefuseRepeat => "refuse_repeat",
            MeasureKind::OrderNotAccepted => "order_not_accepted",
            MeasureKind::SuspendInstrument => "suspend_instrument",
        }
    }
}

/// A measure, the day it takes effect, and its ground.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Measure {
    pub kind: MeasureKind,
    pub on: Date,
    pub basis: Basis,
}

/// Something about the case's data a person should look at.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Warning {
    /// No registration day was given; the earliest possible one (the day
    /// of receipt, or the next working day) was assumed, which gives the
    /// earliest reply date.
    RegistrationDateAssumed,
    /// Registered after the working day following receipt.
    RegisteredLate,
    /// The stream is a money claim, but no amount was given or it is over
    /// 500,000 roubles: the complaint article's terms apply.
    MoneyClaimOutsideOmbudsman,
    /// A money claim from a legal entity: 123-FZ covers consumers only.
    MoneyClaimFromLegalEntity,
    /// A securities market professional takes part in the ombudsman's
    /// procedure only if it joined voluntarily; the earlier of both reply
    /// dates applies and no extension is proposed.
    OmbudsmanParticipationUnknown,
    /// A claim on the standard form with no breach date: whether 180 days
    /// have passed is unknown, so the earlier of both reply dates applies.
    BreachDateUnknown,
    /// The client confirmed after the day following the suspension: the
    /// order counts as not accepted (161-FZ art. 8 part 3.9), and a later
    /// database match suspends nothing.
    ConfirmationLate,
    /// A database match after confirmation, but no confirmation day.
    ConfirmationDateMissing,
    /// The 30-day refund of 161-FZ art. 8 part 3.13 is owed to
    /// individuals only.
    RefundForIndividualsOnly,
    /// The high-risk group of 115-FZ art. 7.7 applies to legal entities
    /// and individual entrepreneurs only.
    HighRiskForLegalEntitiesOnly,
    /// 115-FZ art. 7 item 13.4 provides for documents against a refused
    /// operation or a refused contract, not a terminated one; the 7-day
    /// answer is given anyway.
    DocumentsAnswerBeyondText,
    /// A bank has no self-regulatory organisation to copy a standard
    /// breach to under the Banking Law.
    SroCopyNotApplicable,
}

impl Warning {
    /// The stable code, in snake case.
    pub fn code(self) -> &'static str {
        use Warning::*;
        match self {
            RegistrationDateAssumed => "registration_date_assumed",
            RegisteredLate => "registered_late",
            MoneyClaimOutsideOmbudsman => "money_claim_outside_ombudsman",
            MoneyClaimFromLegalEntity => "money_claim_from_legal_entity",
            OmbudsmanParticipationUnknown => "ombudsman_participation_unknown",
            BreachDateUnknown => "breach_date_unknown",
            ConfirmationLate => "confirmation_late",
            ConfirmationDateMissing => "confirmation_date_missing",
            RefundForIndividualsOnly => "refund_for_individuals_only",
            HighRiskForLegalEntitiesOnly => "high_risk_for_legal_entities_only",
            DocumentsAnswerBeyondText => "documents_answer_beyond_text",
            SroCopyNotApplicable => "sro_copy_not_applicable",
        }
    }
}

/// Something the engine will not propose, because the law does not allow
/// it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Refusal {
    /// No extension for a money claim under 123-FZ art. 16 part 2.
    ExtensionNotAllowed,
    /// An extension only to request documents and materials.
    ExtensionGroundNotAllowed,
    /// An extension of at most 10 working days.
    ExtensionTooLong,
}

impl Refusal {
    /// The stable code, in snake case.
    pub fn code(self) -> &'static str {
        match self {
            Refusal::ExtensionNotAllowed => "extension_not_allowed",
            Refusal::ExtensionGroundNotAllowed => "extension_ground_not_allowed",
            Refusal::ExtensionTooLong => "extension_too_long",
        }
    }
}

/// Everything the law says about the dates of one case.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Clock {
    pub regime: Regime,
    pub deadlines: Vec<Deadline>,
    pub duties: Vec<Duty>,
    /// The measures taken, each with its ground.
    pub measures: Vec<Measure>,
    pub warnings: Vec<Warning>,
    pub refusals: Vec<Refusal>,
}

impl Clock {
    /// The deadline of a kind, when there is one.
    pub fn deadline(&self, kind: DeadlineKind) -> Option<&Deadline> {
        self.deadlines.iter().find(|d| d.kind == kind)
    }

    /// The reply's last day: extended when an extension was allowed.
    pub fn reply_due(&self) -> Option<Date> {
        self.deadline(DeadlineKind::ReplyExtended)
            .or_else(|| self.deadline(DeadlineKind::Reply))
            .map(|d| d.due)
    }
}

/// The most an extension may add, in working days.
pub const MAX_EXTENSION_WORKING_DAYS: u32 = 10;

/// The reply term of the complaint articles, in working days.
pub const REPLY_WORKING_DAYS: u32 = 15;

/// The article and parts of a sector's complaint article.
struct SectorArticle {
    source: Source,
    article: &'static str,
    registration: &'static str,
    reply: &'static str,
    extension: &'static str,
    copy_to_bank_of_russia: &'static str,
    copy_to_sro: Option<&'static str>,
}

fn sector_article(sector: Sector) -> SectorArticle {
    match sector {
        Sector::Bank => SectorArticle {
            source: sources::BANKING_LAW_30_1,
            article: "30.1",
            registration: "5",
            reply: "7",
            extension: "8",
            copy_to_bank_of_russia: "15",
            copy_to_sro: None,
        },
        Sector::Microfinance => SectorArticle {
            source: sources::MICROFINANCE_LAW_9_1,
            article: "9.1",
            registration: "5",
            reply: "7",
            extension: "8",
            copy_to_bank_of_russia: "16",
            copy_to_sro: Some("12"),
        },
        Sector::Insurer => SectorArticle {
            source: sources::INSURANCE_LAW_6_2,
            article: "6.2",
            registration: "3",
            reply: "5, paragraph 1",
            extension: "5, paragraph 2",
            copy_to_bank_of_russia: "12",
            copy_to_sro: Some("8"),
        },
        Sector::SecuritiesProfessional => SectorArticle {
            source: sources::SECURITIES_LAW_15_11,
            article: "15.11",
            registration: "1",
            reply: "2",
            extension: "3",
            copy_to_bank_of_russia: "11",
            copy_to_sro: Some("5"),
        },
        Sector::CreditCooperative => SectorArticle {
            source: sources::CREDIT_COOPERATION_LAW_6_2,
            article: "6.2",
            registration: "5",
            reply: "6",
            extension: "7",
            copy_to_bank_of_russia: "15",
            copy_to_sro: Some("10"),
        },
    }
}

/// Whether 123-FZ art. 28 part 1 obliges the sector to take part in the
/// ombudsman's procedure. Securities market professionals may join
/// voluntarily (part 2); the engine does not know whether one has.
fn ombudsman_mandatory(sector: Sector) -> bool {
    !matches!(sector, Sector::SecuritiesProfessional)
}

fn check_order(earlier: Date, later: Date) -> Result<(), Error> {
    if later < earlier {
        Err(Error::DatesOutOfOrder)
    } else {
        Ok(())
    }
}

/// The clocks of one case.
///
/// Errors: [`Error::DatesOutOfOrder`] when a day comes before the day it
/// follows from (registered before received, confirmed before stopped,
/// and so on); [`Error::InvalidExtension`] for an extension of zero days;
/// [`Error::OutsideCalendar`] when a count in working days leaves the
/// production calendar.
pub fn clock(case: &Case) -> Result<Clock, Error> {
    let mut c = Clock {
        regime: Regime::Complaint,
        deadlines: Vec::new(),
        duties: Vec::new(),
        measures: Vec::new(),
        warnings: Vec::new(),
        refusals: Vec::new(),
    };
    complaint(case, &mut c)?;
    if let Some(f) = case.antifraud {
        antifraud(case, &f, &mut c)?;
    }
    if let Some(f) = case.database {
        database(&f, &mut c)?;
    }
    if let Some(f) = case.aml {
        aml(case, &f, &mut c)?;
    }
    Ok(c)
}

/// Whether the money claim falls under 123-FZ, and whether that is
/// certain.
fn ombudsman_regime(case: &Case, c: &mut Clock) -> Option<MoneyClaim> {
    let claim = match case.money_claim {
        Some(claim) if claim.kopecks <= OMBUDSMAN_LIMIT_KOPECKS => claim,
        _ => {
            if case.stream == Stream::MoneyClaim {
                c.warnings.push(Warning::MoneyClaimOutsideOmbudsman);
            }
            return None;
        }
    };
    if case.applicant == Applicant::LegalEntity {
        c.warnings.push(Warning::MoneyClaimFromLegalEntity);
        return None;
    }
    Some(claim)
}

fn complaint(case: &Case, c: &mut Clock) -> Result<(), Error> {
    let a = sector_article(case.sector);
    let received = case.received_on;

    // Registration: "не позднее рабочего дня, следующего за днем его
    // поступления".
    let registration_due = calendar::next_working_day(received)?;
    c.deadlines.push(Deadline {
        kind: DeadlineKind::Registration,
        due: registration_due,
        from: received,
        count: Count::NextWorkingDay,
        basis: text(a.source, a.article, a.registration),
    });

    let registered = match case.registered_on {
        Some(r) => {
            check_order(received, r)?;
            if r > registration_due {
                c.warnings.push(Warning::RegisteredLate);
            }
            r
        }
        None => {
            // The earliest registration gives the earliest reply date.
            c.warnings.push(Warning::RegistrationDateAssumed);
            calendar::working_day_on_or_after(received)?
        }
    };

    if case.electronic {
        c.deadlines.push(Deadline {
            kind: DeadlineKind::RegistrationNotice,
            due: registered,
            from: registered,
            count: Count::SameDay,
            basis: text(a.source, a.article, a.registration),
        });
    }

    let claim = ombudsman_regime(case, c);
    let complaint_reply = Deadline {
        kind: DeadlineKind::Reply,
        due: calendar::add_working_days(registered, REPLY_WORKING_DAYS)?,
        from: registered,
        count: Count::WorkingDays(REPLY_WORKING_DAYS),
        basis: text(a.source, a.article, a.reply),
    };

    match claim {
        None => {
            c.deadlines.push(complaint_reply);
            extension(case, &a, complaint_reply, registered, c)?;
        }
        Some(claim) => {
            c.regime = Regime::OmbudsmanClaim;
            // The sector article sends such a claim to 123-FZ's "порядок и
            // сроки", which set no registration term; keeping the
            // article's registration (and its notice) is the wider duty.
            for d in c.deadlines.iter_mut() {
                if matches!(
                    d.kind,
                    DeadlineKind::Registration | DeadlineKind::RegistrationNotice
                ) {
                    d.basis.reading = Reading::Conservative;
                }
            }
            let mut reply = ombudsman_reply(case, claim, c)?;
            if !ombudsman_mandatory(case.sector) {
                // Not known to take part: whichever term ends first, and no
                // extension, which 123-FZ would not allow.
                c.warnings.push(Warning::OmbudsmanParticipationUnknown);
                if complaint_reply.due < reply.due {
                    reply = Deadline {
                        basis: Basis {
                            reading: Reading::Conservative,
                            ..complaint_reply.basis
                        },
                        ..complaint_reply
                    };
                }
            }
            c.deadlines.push(reply);
            if case.extension.is_some() {
                c.refusals.push(Refusal::ExtensionNotAllowed);
            }
        }
    }

    if case.origin == Origin::ForwardedByBankOfRussia {
        c.duties.push(Duty {
            kind: DutyKind::CopyToBankOfRussia,
            when: When::SameDayAsEachDispatch,
            basis: text(a.source, a.article, a.copy_to_bank_of_russia),
        });
    }
    if case.standard_breach_found {
        match a.copy_to_sro {
            Some(part) => c.duties.push(Duty {
                kind: DutyKind::CopyToSro,
                when: When::SameDayAsReply,
                basis: text(a.source, a.article, part),
            }),
            None => c.warnings.push(Warning::SroCopyNotApplicable),
        }
    }
    Ok(())
}

/// The reply term of 123-FZ art. 16 part 2.
fn ombudsman_reply(case: &Case, claim: MoneyClaim, c: &mut Clock) -> Result<Deadline, Error> {
    let received = case.received_on;
    let short = Deadline {
        kind: DeadlineKind::Reply,
        due: calendar::add_working_days(received, 15)?,
        from: received,
        count: Count::WorkingDays(15),
        basis: text(sources::OMBUDSMAN_LAW_16, "16", "2, item 1"),
    };
    // "в течение тридцати календарных дней ... Если последний день срока
    // приходится на нерабочий день, днем окончания срока считается
    // ближайший следующий за ним рабочий день."
    let long = Deadline {
        kind: DeadlineKind::Reply,
        due: calendar::working_day_on_or_after(received.add_days(30))?,
        from: received,
        count: Count::CalendarDaysToWorkingDay(30),
        basis: text(sources::OMBUDSMAN_LAW_16, "16", "2, item 2"),
    };
    if !claim.standard_form {
        return Ok(long);
    }
    match claim.breach_on {
        Some(breach) => {
            check_order(breach, received)?;
            Ok(
                if received.days_since(breach) <= STANDARD_FORM_WINDOW_DAYS {
                    short
                } else {
                    long
                },
            )
        }
        None => {
            c.warnings.push(Warning::BreachDateUnknown);
            let earlier = if short.due <= long.due { short } else { long };
            Ok(Deadline {
                basis: Basis {
                    reading: Reading::Conservative,
                    ..earlier.basis
                },
                ..earlier
            })
        }
    }
}

fn extension(
    case: &Case,
    a: &SectorArticle,
    reply: Deadline,
    registered: Date,
    c: &mut Clock,
) -> Result<(), Error> {
    let Some(ext) = case.extension else {
        return Ok(());
    };
    if ext.working_days == 0 {
        return Err(Error::InvalidExtension);
    }
    let mut allowed = true;
    if ext.ground != ExtensionGround::RequestDocuments {
        c.refusals.push(Refusal::ExtensionGroundNotAllowed);
        allowed = false;
    }
    if ext.working_days > MAX_EXTENSION_WORKING_DAYS {
        c.refusals.push(Refusal::ExtensionTooLong);
        allowed = false;
    }
    if !allowed {
        return Ok(());
    }
    // The notice must reach the applicant while the term still runs: the
    // text sets no date for it, and a term cannot be extended after it
    // has ended.
    c.deadlines.push(Deadline {
        kind: DeadlineKind::ExtensionNotice,
        due: reply.due,
        from: registered,
        count: Count::WorkingDays(REPLY_WORKING_DAYS),
        basis: conservative(a.source, a.article, a.extension),
    });
    let total = REPLY_WORKING_DAYS + ext.working_days;
    c.deadlines.push(Deadline {
        kind: DeadlineKind::ReplyExtended,
        due: calendar::add_working_days(registered, total)?,
        from: registered,
        count: Count::WorkingDays(total),
        basis: text(a.source, a.article, a.extension),
    });
    Ok(())
}

fn antifraud(case: &Case, f: &AntifraudFacts, c: &mut Clock) -> Result<(), Error> {
    let stopped = f.stopped_on;
    let letter = sources::ANTIFRAUD_TERMS_LETTER;
    let law = sources::PAYMENT_LAW_8;
    let transfer = f.operation == Operation::Transfer;
    // The first action rests on part 3.4 for all four kinds of operation:
    // its first sentence "приостанавливает прием к исполнению распоряжения
    // клиента на два дня" for a transfer order; its second "отказывает в
    // совершении соответствующей операции (перевода)" for a card, e-money
    // or Faster Payments operation. Part 3.10 is never the ground of a
    // first refusal: it is the second step, after a confirmation or a
    // repeat.
    c.measures.push(if transfer {
        Measure {
            kind: MeasureKind::SuspendOrder,
            on: stopped,
            basis: text(law, "8", "3.4, sentence 1"),
        }
    } else {
        Measure {
            kind: MeasureKind::RefuseOperation,
            on: stopped,
            basis: text(law, "8", "3.4, sentence 2"),
        }
    });
    // "обязан незамедлительно ... предоставить клиенту информацию": the
    // block (item 1), advice against a repeat of the fraud (item 2), and
    // the confirmation by the day after the suspension or the repeat of a
    // refused operation (item 3).
    c.duties.push(Duty {
        kind: DutyKind::NotifyClientOfBlock,
        when: When::Immediately,
        basis: text(law, "8", "3.6, items 1 to 3"),
    });
    let confirm_by = stopped.add_days(1);
    if transfer {
        // Two days, counted from and including the day of suspension, in
        // calendar days, whatever the last day is (the Bank of Russia's
        // letter of 02.09.2024 No. 010-31/7975). Suspended on Friday
        // 8 May 2026, the two days are 8 and 9 May and end on 9 May, a
        // holiday, which does not matter.
        c.deadlines.push(Deadline {
            kind: DeadlineKind::AntifraudSuspensionEnds,
            due: confirm_by,
            from: stopped,
            count: Count::CalendarDays(1),
            basis: text(letter, "8", "3.4"),
        });
        // "не позднее одного дня, следующего за днем приостановления": a
        // window for a suspended transfer only; a refused card, e-money or
        // Faster Payments operation may be repeated, and the text sets no
        // term for the repeat.
        c.deadlines.push(Deadline {
            kind: DeadlineKind::AntifraudConfirmation,
            due: confirm_by,
            from: stopped,
            count: Count::CalendarDays(1),
            basis: text(law, "8", "3.6, item 3"),
        });
    }
    let mut late = false;
    if let Some(confirmed) = f.confirmed_on {
        check_order(stopped, confirmed)?;
        if transfer && confirmed > confirm_by {
            late = true;
            c.warnings.push(Warning::ConfirmationLate);
            // "При неполучении от клиента подтверждения ... указанное
            // распоряжение считается не принятым к исполнению": suspended
            // on 8 May and confirmed on 10 May, the order is not accepted
            // from 10 May, the first day after the window.
            c.measures.push(Measure {
                kind: MeasureKind::OrderNotAccepted,
                on: confirm_by.add_days(1),
                basis: text(law, "8", "3.9"),
            });
        }
    }
    if f.database_match_after_confirmation {
        match f.confirmed_on {
            None => c.warnings.push(Warning::ConfirmationDateMissing),
            // An order not accepted is not suspended again.
            Some(_) if late => {}
            Some(confirmed) => repeat_block(f.operation, confirmed, c),
        }
    }
    if let Some(received) = f.refund_claim_received_on {
        if case.applicant == Applicant::LegalEntity {
            c.warnings.push(Warning::RefundForIndividualsOnly);
        } else {
            // "в течение 30 дней, следующих за днем получения": calendar
            // days, not moved off a day off; the letter that says so for
            // parts 3.4 and 3.10 does not cover part 3.13, so this is the
            // conservative reading.
            c.deadlines.push(Deadline {
                kind: DeadlineKind::AntifraudRefund,
                due: received.add_days(30),
                from: received,
                count: Count::CalendarDays(30),
                basis: conservative(law, "8", "3.13"),
            });
        }
    }
    Ok(())
}

/// The second step of part 3.10 after a database match, on the day of the
/// confirmation or the repeat, and what part 3.11 then requires.
fn repeat_block(operation: Operation, on: Date, c: &mut Clock) {
    let letter = sources::ANTIFRAUD_TERMS_LETTER;
    let law = sources::PAYMENT_LAW_8;
    // "обязан незамедлительно уведомить клиента ... с указанием причины
    // такого приостановления (отказа) и срока такого приостановления, а
    // также о возможности совершения клиентом последующей повторной
    // операции".
    c.duties.push(Duty {
        kind: DutyKind::NotifyClientOfRepeatBlock,
        when: When::Immediately,
        basis: text(law, "8", "3.10, sentence 2"),
    });
    match operation {
        Operation::Transfer => {
            // "приостанавливает прием к исполнению подтвержденного
            // распоряжения клиента на два дня со дня направления клиентом
            // подтверждения": that day included (the letter). Confirmed on
            // Saturday 9 May 2026, the two days are 9 and 10 May; on
            // 11 May the order is executed at once (part 3.11).
            c.measures.push(Measure {
                kind: MeasureKind::SuspendConfirmedOrder,
                on,
                basis: text(law, "8", "3.10, sentence 1"),
            });
            c.deadlines.push(Deadline {
                kind: DeadlineKind::AntifraudRepeatSuspensionEnds,
                due: on.add_days(1),
                from: on,
                count: Count::CalendarDays(1),
                basis: text(letter, "8", "3.10"),
            });
            c.deadlines.push(Deadline {
                kind: DeadlineKind::AntifraudAfterRepeatSuspension,
                due: on.add_days(2),
                from: on,
                count: Count::CalendarDays(2),
                basis: text(law, "8", "3.11"),
            });
        }
        Operation::CardSbpOrEmoney => {
            // "отказывает в совершении клиентом повторной операции": a
            // refusal, not a suspension. "по истечении двух дней со дня
            // осуществления действий по совершению клиентом повторной
            // операции" the operator must carry out the client's next
            // repeat (part 3.11). The letter counts the confirmation's day
            // in the two days; the repeat's term uses the same words "со
            // дня" and is read the same way, which ends it earlier: a
            // conservative reading. Repeated on Friday 8 May 2026, the two
            // days are 8 and 9 May; a repeat from 10 May goes through.
            c.measures.push(Measure {
                kind: MeasureKind::RefuseRepeat,
                on,
                basis: text(law, "8", "3.10, sentence 1"),
            });
            c.deadlines.push(Deadline {
                kind: DeadlineKind::AntifraudRepeatRefusalEnds,
                due: on.add_days(1),
                from: on,
                count: Count::CalendarDays(1),
                basis: conservative(law, "8", "3.11"),
            });
            c.deadlines.push(Deadline {
                kind: DeadlineKind::AntifraudAfterRepeatRefusal,
                due: on.add_days(2),
                from: on,
                count: Count::CalendarDays(2),
                basis: conservative(law, "8", "3.11"),
            });
        }
    }
}

/// The client's own data in the Bank of Russia's database (161-FZ art. 9,
/// Directive No. 6748-U).
fn database(f: &DatabaseFacts, c: &mut Clock) -> Result<(), Error> {
    let law = sources::PAYMENT_LAW_9;
    let directive = sources::DIRECTIVE_6748_U;
    if let Some(on) = f.instrument_suspended_on {
        c.measures.push(Measure {
            kind: MeasureKind::SuspendInstrument,
            on,
            basis: text(law, "9", if f.police_information { "11.7" } else { "11.6" }),
        });
        // "обязан в день такого приостановления ... предоставить клиенту
        // информацию о приостановлении ... с указанием причины": a card
        // suspended on Saturday 9 May 2026 is notified on 9 May.
        c.deadlines.push(Deadline {
            kind: DeadlineKind::InstrumentSuspensionNotice,
            due: on,
            from: on,
            count: Count::SameDay,
            basis: text(law, "9", "9.2"),
        });
        // "незамедлительно уведомить клиента о приостановлении ... а также
        // о праве клиента подать ... заявление в Банк России".
        c.duties.push(Duty {
            kind: DutyKind::NotifyClientOfRightToApply,
            when: When::Immediately,
            basis: text(law, "9", "11.8"),
        });
        if let Some(removed) = f.data_removed_on {
            check_order(on, removed)?;
            c.duties.push(Duty {
                kind: DutyKind::RestoreInstrument,
                when: When::Immediately,
                basis: text(law, "9", "11.11"),
            });
        }
    }
    if let Some(received) = f.exclusion_received_by_operator_on {
        if f.exclusion_data_missing {
            // "в срок, не превышающий 5 рабочих дней со дня поступления
            // заявления клиента ... с указанием основания отказа": received
            // on Friday 8 May 2026, 12 to 15 May (4), 18 May (5).
            c.deadlines.push(Deadline {
                kind: DeadlineKind::ExclusionRefusalNotice,
                due: calendar::add_working_days(received, 5)?,
                from: received,
                count: Count::WorkingDays(5),
                basis: text(directive, "", "1.4"),
            });
        } else {
            // "не позднее рабочего дня, следующего за днем поступления
            // заявления клиента оператору", together with the operator's own
            // view on whether the data were rightly included: received on
            // Friday 8 May 2026, forwarded by Tuesday 12 May.
            c.deadlines.push(Deadline {
                kind: DeadlineKind::ExclusionForwarding,
                due: calendar::next_working_day(received)?,
                from: received,
                count: Count::NextWorkingDay,
                basis: text(directive, "", "1.5"),
            });
        }
    }
    if let Some(received) = f.exclusion_received_by_bank_of_russia_on {
        if let Some(by_operator) = f.exclusion_received_by_operator_on {
            check_order(by_operator, received)?;
        }
        // "в срок, не превышающий 15 рабочих дней со дня поступления
        // заявления клиента в Банк России" (the statute's 15 working days,
        // art. 9 part 11.10, counted as the directive says). The Bank of
        // Russia's page counts from registration, which is later or the
        // same day; the directive binds, and its start is the earlier one.
        c.deadlines.push(Deadline {
            kind: DeadlineKind::ExclusionDecision,
            due: calendar::add_working_days(received, 15)?,
            from: received,
            count: Count::WorkingDays(15),
            basis: text(directive, "", "2.1, 2.3, 2.4"),
        });
    }
    if let Some(decided) = f.exclusion_decision_received_on {
        if let Some(received) = f.exclusion_received_by_bank_of_russia_on {
            check_order(received, decided)?;
        }
        // The decision, or the notice that the database holds no data on
        // the client, goes on to the client "не позднее рабочего дня,
        // следующего за днем получения".
        c.deadlines.push(Deadline {
            kind: DeadlineKind::ExclusionDecisionRelay,
            due: calendar::next_working_day(decided)?,
            from: decided,
            count: Count::NextWorkingDay,
            basis: text(directive, "", "2.1, 2.3, 2.4"),
        });
    }
    if let Some(asked) = f.bank_of_russia_query_received_on {
        // "в течение 3 рабочих дней со дня поступления запроса Банка
        // России".
        c.deadlines.push(Deadline {
            kind: DeadlineKind::BankOfRussiaQueryAnswer,
            due: calendar::add_working_days(asked, 3)?,
            from: asked,
            count: Count::WorkingDays(3),
            basis: text(directive, "", "2.9"),
        });
    }
    Ok(())
}

fn aml(case: &Case, f: &AmlFacts, c: &mut Clock) -> Result<(), Error> {
    if let Some((kind, on)) = f.decision {
        let part = match kind {
            AmlDecisionKind::RefuseOperation => "13.1-1, paragraph 2",
            AmlDecisionKind::RefuseAccount | AmlDecisionKind::TerminateAccount => {
                "13.1-1, paragraph 1"
            }
        };
        // "информацию о дате и причинах ... не позднее пяти рабочих дней
        // со дня принятия решения".
        c.deadlines.push(Deadline {
            kind: DeadlineKind::AmlReasonsNotice,
            due: calendar::add_working_days(on, 5)?,
            from: on,
            count: Count::WorkingDays(5),
            basis: text(sources::AML_LAW_7, "7", part),
        });
        if let Some(submitted) = f.documents_submitted_on {
            check_order(on, submitted)?;
            if kind == AmlDecisionKind::TerminateAccount {
                c.warnings.push(Warning::DocumentsAnswerBeyondText);
            }
        }
    }
    if let Some(submitted) = f.documents_submitted_on {
        // "не позднее семи рабочих дней со дня их представления".
        c.deadlines.push(Deadline {
            kind: DeadlineKind::AmlDocumentsAnswer,
            due: calendar::add_working_days(submitted, 7)?,
            from: submitted,
            count: Count::WorkingDays(7),
            basis: text(sources::AML_LAW_7, "7", "13.4, paragraph 2"),
        });
    }
    if let Some(applied) = f.commission_applied_on {
        // "общий срок рассмотрения ... не может превышать двадцать рабочих
        // дней со дня обращения заявителя".
        c.deadlines.push(Deadline {
            kind: DeadlineKind::AmlCommissionDecision,
            due: calendar::add_working_days(applied, 20)?,
            from: applied,
            count: Count::WorkingDays(20),
            basis: text(sources::AML_LAW_7, "7", "13.5, paragraph 3"),
        });
    }
    let high_risk = f.high_risk_measures_on.is_some() || f.high_risk_notice_received_on.is_some();
    if high_risk && case.applicant == Applicant::Individual {
        c.warnings.push(Warning::HighRiskForLegalEntitiesOnly);
    }
    if let Some(on) = f.high_risk_measures_on {
        // "не позднее пяти рабочих дней, следующих за днем применения мер".
        c.deadlines.push(Deadline {
            kind: DeadlineKind::HighRiskNotice,
            due: calendar::add_working_days(on, 5)?,
            from: on,
            count: Count::WorkingDays(5),
            basis: text(sources::AML_LAW_7_7, "7.7", "8"),
        });
    }
    if let Some(received) = f.high_risk_notice_received_on {
        if let Some(on) = f.high_risk_measures_on {
            check_order(on, received)?;
        }
        // "в течение шести месяцев со дня, следующего за днем получения
        // заявителем информации": the period starts the day after
        // receipt and ends on the same day number six months after the
        // receipt (Civil Code arts. 191, 192), not moved off a day off.
        // Counting the six months from the day after receipt would end a
        // day later; the earlier end is taken.
        c.deadlines.push(Deadline {
            kind: DeadlineKind::HighRiskCommissionApplication,
            due: received.add_months(6),
            from: received,
            count: Count::Months(6),
            basis: conservative(sources::AML_LAW_7_8, "7.8", "1, paragraph 2"),
        });
    }
    Ok(())
}
