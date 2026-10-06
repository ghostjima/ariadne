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
//! - an antifraud block (161-FZ): the two-day suspension, the client's
//!   confirmation by the next day, the second suspension after a match in
//!   the Bank of Russia's database, the Bank of Russia's 15 working days on
//!   a request to remove data, the 30-day refund;
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

/// The kind of operation an antifraud block stopped.
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
    /// After the confirmation, the operator received data from the Bank of
    /// Russia's database (art. 8 part 3.10).
    pub database_match_after_confirmation: bool,
    /// The day the Bank of Russia registered a request to remove data from
    /// its database (art. 9 parts 11.8 to 11.10).
    pub exclusion_request_registered_on: Option<Date>,
    /// The day the operator received an individual's refund claim under
    /// art. 8 part 3.13.
    pub refund_claim_received_on: Option<Date>,
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
    ExclusionDecision,
    AntifraudRefund,
    AmlReasonsNotice,
    AmlDocumentsAnswer,
    AmlCommissionDecision,
    HighRiskNotice,
    HighRiskCommissionApplication,
}

impl DeadlineKind {
    /// Every kind.
    pub const ALL: [DeadlineKind; 16] = {
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
            ExclusionDecision,
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
            ExclusionDecision => "exclusion_decision",
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
    /// The article, as numbered in the act ("30.1").
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
    /// Tell the client of the suspension or refusal, with advice and how
    /// to confirm or repeat (161-FZ art. 8 part 3.6).
    NotifyClientOfBlock,
    /// Tell the client of the second suspension, its reason and term, and
    /// that a later repeat is possible (161-FZ art. 8 part 3.10).
    NotifyClientOfRepeatBlock,
}

impl DutyKind {
    /// The stable code, in snake case.
    pub fn code(self) -> &'static str {
        match self {
            DutyKind::CopyToBankOfRussia => "copy_to_bank_of_russia",
            DutyKind::CopyToSro => "copy_to_sro",
            DutyKind::NotifyClientOfBlock => "notify_client_of_block",
            DutyKind::NotifyClientOfRepeatBlock => "notify_client_of_repeat_block",
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
    /// order counts as not accepted (161-FZ art. 8 part 3.9).
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
        warnings: Vec::new(),
        refusals: Vec::new(),
    };
    complaint(case, &mut c)?;
    if let Some(f) = case.antifraud {
        antifraud(case, &f, &mut c)?;
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
    // The client is told at once (part 3.6).
    c.duties.push(Duty {
        kind: DutyKind::NotifyClientOfBlock,
        when: When::Immediately,
        basis: text(sources::PAYMENT_LAW_8, "8", "3.6"),
    });
    let confirm_by = stopped.add_days(1);
    if f.operation == Operation::Transfer {
        // "приостанавливает прием к исполнению распоряжения клиента на два
        // дня": counted from and including the day of suspension, in
        // calendar days, whatever the last day is (the Bank of Russia's
        // letter of 02.09.2024 No. 010-31/7975). The two days end on the
        // day after the suspension, with the confirmation window.
        c.deadlines.push(Deadline {
            kind: DeadlineKind::AntifraudSuspensionEnds,
            due: confirm_by,
            from: stopped,
            count: Count::CalendarDays(1),
            basis: text(letter, "8", "3.4"),
        });
        // "не позднее одного дня, следующего за днем приостановления".
        c.deadlines.push(Deadline {
            kind: DeadlineKind::AntifraudConfirmation,
            due: confirm_by,
            from: stopped,
            count: Count::CalendarDays(1),
            basis: text(sources::PAYMENT_LAW_8, "8", "3.6, item 3"),
        });
    }
    if let Some(confirmed) = f.confirmed_on {
        check_order(stopped, confirmed)?;
        if f.operation == Operation::Transfer && confirmed > confirm_by {
            c.warnings.push(Warning::ConfirmationLate);
        }
    }
    if f.database_match_after_confirmation {
        match f.confirmed_on {
            None => c.warnings.push(Warning::ConfirmationDateMissing),
            Some(confirmed) => {
                // Two days "со дня направления клиентом подтверждения",
                // that day included (the same letter); then the order is
                // executed, or the next repeat allowed, at once
                // (part 3.11).
                c.duties.push(Duty {
                    kind: DutyKind::NotifyClientOfRepeatBlock,
                    when: When::Immediately,
                    basis: text(sources::PAYMENT_LAW_8, "8", "3.10"),
                });
                c.deadlines.push(Deadline {
                    kind: DeadlineKind::AntifraudRepeatSuspensionEnds,
                    due: confirmed.add_days(1),
                    from: confirmed,
                    count: Count::CalendarDays(1),
                    basis: text(letter, "8", "3.10"),
                });
                c.deadlines.push(Deadline {
                    kind: DeadlineKind::AntifraudAfterRepeatSuspension,
                    due: confirmed.add_days(2),
                    from: confirmed,
                    count: Count::CalendarDays(2),
                    basis: text(sources::PAYMENT_LAW_8, "8", "3.11"),
                });
            }
        }
    }
    if let Some(registered) = f.exclusion_request_registered_on {
        // "в срок, не превышающий 15 рабочих дней"; the Bank of Russia
        // counts from the request's registration.
        c.deadlines.push(Deadline {
            kind: DeadlineKind::ExclusionDecision,
            due: calendar::add_working_days(registered, 15)?,
            from: registered,
            count: Count::WorkingDays(15),
            basis: text(sources::PAYMENT_LAW_9, "9", "11.10"),
        });
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
                basis: conservative(sources::PAYMENT_LAW_8, "8", "3.13"),
            });
        }
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
