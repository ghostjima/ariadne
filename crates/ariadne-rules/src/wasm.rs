//! JavaScript bindings (feature `wasm`), for the desk's Web Worker.
//!
//! Small and typed: functions over strings, numbers and wasm-bindgen
//! structs, no JSON at the boundary. Dates cross as `YYYY-MM-DD` strings;
//! the inputs' choices are string enums, which TypeScript sees as unions
//! of their codes; the outputs carry codes as strings. Errors are thrown
//! as `Error` objects whose message is a code from the crate
//! (`invalid_date`, `outside_calendar`, ...), never a sentence.

use crate::clock::{self, Case};
use crate::reasons::{self, Reason};
use crate::rubric::{self, ClientOption, Reply};
use crate::{calendar, Date, Error};
use wasm_bindgen::prelude::*;

fn js(e: Error) -> JsError {
    JsError::new(e.code())
}

fn date(s: &str) -> Result<Date, JsError> {
    Date::parse(s).map_err(js)
}

/// The crate version, as built.
#[wasm_bindgen]
pub fn version() -> String {
    crate::version().to_string()
}

/// The first and the last day the calendar covers, as `YYYY-MM-DD`.
#[wasm_bindgen(js_name = calendarRange)]
pub fn calendar_range() -> Vec<String> {
    vec![
        calendar::first_day().to_string(),
        calendar::last_day().to_string(),
    ]
}

/// Whether a day is a working day.
#[wasm_bindgen(js_name = isWorkingDay)]
pub fn is_working_day(day: &str) -> Result<bool, JsError> {
    calendar::is_working_day(date(day)?).map_err(js)
}

/// What kind of day it is: `working`, `working_weekend`, `holiday`,
/// `weekend` or `transferred_day_off`.
#[wasm_bindgen(js_name = dayKind)]
pub fn day_kind(day: &str) -> Result<String, JsError> {
    Ok(calendar::day_kind(date(day)?)
        .map_err(js)?
        .code()
        .to_string())
}

/// The first working day strictly after a day.
#[wasm_bindgen(js_name = nextWorkingDay)]
pub fn next_working_day(day: &str) -> Result<String, JsError> {
    Ok(calendar::next_working_day(date(day)?)
        .map_err(js)?
        .to_string())
}

/// The `n`-th working day after a day.
#[wasm_bindgen(js_name = addWorkingDays)]
pub fn add_working_days(day: &str, n: u32) -> Result<String, JsError> {
    Ok(calendar::add_working_days(date(day)?, n)
        .map_err(js)?
        .to_string())
}

/// The working days after `from` up to and including `to`, negative when
/// `to` is earlier.
#[wasm_bindgen(js_name = workingDaysBetween)]
pub fn working_days_between(from: &str, to: &str) -> Result<i32, JsError> {
    calendar::working_days_between(date(from)?, date(to)?).map_err(js)
}

/// What the complaint is about.
#[wasm_bindgen]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StreamCode {
    General = "general",
    MoneyClaim = "money_claim",
    Antifraud = "antifraud",
    AmlRefusal = "aml_refusal",
}

/// The kind of organisation.
#[wasm_bindgen]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SectorCode {
    Bank = "bank",
    Microfinance = "microfinance",
    Insurer = "insurer",
    SecuritiesProfessional = "securities_professional",
    CreditCooperative = "credit_cooperative",
}

/// Who complains.
#[wasm_bindgen]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ApplicantCode {
    Individual = "individual",
    LegalEntity = "legal_entity",
}

/// How the complaint arrived.
#[wasm_bindgen]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OriginCode {
    Direct = "direct",
    ForwardedByBankOfRussia = "forwarded_by_bank_of_russia",
}

/// Why an extension is asked for.
#[wasm_bindgen]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExtensionGroundCode {
    RequestDocuments = "request_documents",
    Other = "other",
}

/// The operation an antifraud block stopped.
#[wasm_bindgen]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OperationCode {
    CardSbpOrEmoney = "card_sbp_or_emoney",
    Transfer = "transfer",
}

/// What a 115-FZ decision refused.
#[wasm_bindgen]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AmlDecisionCode {
    RefuseOperation = "refuse_operation",
    RefuseAccount = "refuse_account",
    TerminateAccount = "terminate_account",
}

/// One complaint and the facts around it. Construct it with the stream
/// and the day of receipt, then set what is known; a field left unset is
/// unknown.
#[wasm_bindgen(getter_with_clone)]
#[derive(Debug, Clone)]
pub struct CaseInput {
    pub stream: StreamCode,
    pub sector: SectorCode,
    pub applicant: ApplicantCode,
    pub origin: OriginCode,
    #[wasm_bindgen(js_name = receivedOn)]
    pub received_on: String,
    #[wasm_bindgen(js_name = registeredOn)]
    pub registered_on: Option<String>,
    pub electronic: bool,
    /// The money claimed, in whole kopecks.
    #[wasm_bindgen(js_name = claimKopecks)]
    pub claim_kopecks: Option<f64>,
    #[wasm_bindgen(js_name = claimStandardForm)]
    pub claim_standard_form: bool,
    #[wasm_bindgen(js_name = breachOn)]
    pub breach_on: Option<String>,
    #[wasm_bindgen(js_name = extensionGround)]
    pub extension_ground: Option<ExtensionGroundCode>,
    #[wasm_bindgen(js_name = extensionWorkingDays)]
    pub extension_working_days: Option<u32>,
    #[wasm_bindgen(js_name = standardBreachFound)]
    pub standard_breach_found: bool,
    #[wasm_bindgen(js_name = blockedOperation)]
    pub blocked_operation: Option<OperationCode>,
    #[wasm_bindgen(js_name = blockedOn)]
    pub blocked_on: Option<String>,
    #[wasm_bindgen(js_name = confirmedOn)]
    pub confirmed_on: Option<String>,
    #[wasm_bindgen(js_name = databaseMatchAfterConfirmation)]
    pub database_match_after_confirmation: bool,
    #[wasm_bindgen(js_name = exclusionRequestRegisteredOn)]
    pub exclusion_request_registered_on: Option<String>,
    #[wasm_bindgen(js_name = refundClaimReceivedOn)]
    pub refund_claim_received_on: Option<String>,
    #[wasm_bindgen(js_name = amlDecision)]
    pub aml_decision: Option<AmlDecisionCode>,
    #[wasm_bindgen(js_name = amlDecisionOn)]
    pub aml_decision_on: Option<String>,
    #[wasm_bindgen(js_name = documentsSubmittedOn)]
    pub documents_submitted_on: Option<String>,
    #[wasm_bindgen(js_name = commissionAppliedOn)]
    pub commission_applied_on: Option<String>,
    #[wasm_bindgen(js_name = highRiskMeasuresOn)]
    pub high_risk_measures_on: Option<String>,
    #[wasm_bindgen(js_name = highRiskNoticeReceivedOn)]
    pub high_risk_notice_received_on: Option<String>,
}

#[wasm_bindgen]
impl CaseInput {
    /// A complaint of `stream` to a bank from an individual, received
    /// directly on `received_on`, with nothing else known.
    #[wasm_bindgen(constructor)]
    pub fn new(stream: StreamCode, received_on: String) -> CaseInput {
        CaseInput {
            stream,
            sector: SectorCode::Bank,
            applicant: ApplicantCode::Individual,
            origin: OriginCode::Direct,
            received_on,
            registered_on: None,
            electronic: false,
            claim_kopecks: None,
            claim_standard_form: false,
            breach_on: None,
            extension_ground: None,
            extension_working_days: None,
            standard_breach_found: false,
            blocked_operation: None,
            blocked_on: None,
            confirmed_on: None,
            database_match_after_confirmation: false,
            exclusion_request_registered_on: None,
            refund_claim_received_on: None,
            aml_decision: None,
            aml_decision_on: None,
            documents_submitted_on: None,
            commission_applied_on: None,
            high_risk_measures_on: None,
            high_risk_notice_received_on: None,
        }
    }
}

fn opt_date(s: &Option<String>) -> Result<Option<Date>, Error> {
    s.as_deref().map(Date::parse).transpose()
}

/// A JavaScript number as whole kopecks: finite, non-negative, an
/// integer, and exact (below 2^53).
fn kopecks(x: f64) -> Result<u64, Error> {
    const EXACT: f64 = 9_007_199_254_740_992.0;
    if x.is_finite() && x >= 0.0 && x.fract() == 0.0 && x < EXACT {
        Ok(x as u64)
    } else {
        Err(Error::InvalidAmount)
    }
}

/// The input as the crate's [`Case`]; pure, so it is tested natively.
fn to_case(i: &CaseInput) -> Result<Case, Error> {
    let stream = match i.stream {
        StreamCode::General => clock::Stream::General,
        StreamCode::MoneyClaim => clock::Stream::MoneyClaim,
        StreamCode::Antifraud => clock::Stream::Antifraud,
        StreamCode::AmlRefusal => clock::Stream::AmlRefusal,
        StreamCode::__Invalid => return Err(Error::UnknownCode),
    };
    let mut case = Case::new(stream, Date::parse(&i.received_on)?);
    case.sector = match i.sector {
        SectorCode::Bank => clock::Sector::Bank,
        SectorCode::Microfinance => clock::Sector::Microfinance,
        SectorCode::Insurer => clock::Sector::Insurer,
        SectorCode::SecuritiesProfessional => clock::Sector::SecuritiesProfessional,
        SectorCode::CreditCooperative => clock::Sector::CreditCooperative,
        SectorCode::__Invalid => return Err(Error::UnknownCode),
    };
    case.applicant = match i.applicant {
        ApplicantCode::Individual => clock::Applicant::Individual,
        ApplicantCode::LegalEntity => clock::Applicant::LegalEntity,
        ApplicantCode::__Invalid => return Err(Error::UnknownCode),
    };
    case.origin = match i.origin {
        OriginCode::Direct => clock::Origin::Direct,
        OriginCode::ForwardedByBankOfRussia => clock::Origin::ForwardedByBankOfRussia,
        OriginCode::__Invalid => return Err(Error::UnknownCode),
    };
    case.registered_on = opt_date(&i.registered_on)?;
    case.electronic = i.electronic;
    case.money_claim = match i.claim_kopecks {
        None => None,
        Some(x) => Some(clock::MoneyClaim {
            kopecks: kopecks(x)?,
            standard_form: i.claim_standard_form,
            breach_on: opt_date(&i.breach_on)?,
        }),
    };
    case.extension = match (i.extension_ground, i.extension_working_days) {
        (None, None) => None,
        (Some(ground), Some(working_days)) => Some(clock::Extension {
            ground: match ground {
                ExtensionGroundCode::RequestDocuments => clock::ExtensionGround::RequestDocuments,
                ExtensionGroundCode::Other => clock::ExtensionGround::Other,
                ExtensionGroundCode::__Invalid => return Err(Error::UnknownCode),
            },
            working_days,
        }),
        _ => return Err(Error::InvalidExtension),
    };
    case.standard_breach_found = i.standard_breach_found;
    case.antifraud = match (i.blocked_operation, opt_date(&i.blocked_on)?) {
        (None, None) => None,
        (Some(op), Some(stopped_on)) => Some(clock::AntifraudFacts {
            operation: match op {
                OperationCode::CardSbpOrEmoney => clock::Operation::CardSbpOrEmoney,
                OperationCode::Transfer => clock::Operation::Transfer,
                OperationCode::__Invalid => return Err(Error::UnknownCode),
            },
            stopped_on,
            confirmed_on: opt_date(&i.confirmed_on)?,
            database_match_after_confirmation: i.database_match_after_confirmation,
            exclusion_request_registered_on: opt_date(&i.exclusion_request_registered_on)?,
            refund_claim_received_on: opt_date(&i.refund_claim_received_on)?,
        }),
        _ => return Err(Error::MissingDate),
    };
    let decision = match (i.aml_decision, opt_date(&i.aml_decision_on)?) {
        (None, None) => None,
        (Some(kind), Some(on)) => Some((
            match kind {
                AmlDecisionCode::RefuseOperation => clock::AmlDecisionKind::RefuseOperation,
                AmlDecisionCode::RefuseAccount => clock::AmlDecisionKind::RefuseAccount,
                AmlDecisionCode::TerminateAccount => clock::AmlDecisionKind::TerminateAccount,
                AmlDecisionCode::__Invalid => return Err(Error::UnknownCode),
            },
            on,
        )),
        _ => return Err(Error::MissingDate),
    };
    let aml = clock::AmlFacts {
        decision,
        documents_submitted_on: opt_date(&i.documents_submitted_on)?,
        commission_applied_on: opt_date(&i.commission_applied_on)?,
        high_risk_measures_on: opt_date(&i.high_risk_measures_on)?,
        high_risk_notice_received_on: opt_date(&i.high_risk_notice_received_on)?,
    };
    let any_aml = aml.decision.is_some()
        || aml.documents_submitted_on.is_some()
        || aml.commission_applied_on.is_some()
        || aml.high_risk_measures_on.is_some()
        || aml.high_risk_notice_received_on.is_some();
    case.aml = any_aml.then_some(aml);
    Ok(case)
}

/// A deadline: what for, the last day, the day counted from, how it was
/// counted, and its basis.
#[wasm_bindgen(getter_with_clone)]
#[derive(Debug, Clone)]
pub struct DeadlineOutput {
    /// A deadline code (`reply`, `registration`, ...).
    pub kind: String,
    pub due: String,
    pub from: String,
    /// A count code (`working_days`, `calendar_days`, ...).
    pub count: String,
    /// The number of days or months counted.
    #[wasm_bindgen(js_name = countValue)]
    pub count_value: u32,
    /// The deadline binds the client or a third party, not the
    /// organisation.
    #[wasm_bindgen(js_name = forOthers)]
    pub for_others: bool,
    pub basis: BasisOutput,
}

/// A duty tied to an event.
#[wasm_bindgen(getter_with_clone)]
#[derive(Debug, Clone)]
pub struct DutyOutput {
    /// A duty code (`copy_to_bank_of_russia`, ...).
    pub kind: String,
    /// When: `same_day_as_each_dispatch`, `same_day_as_reply` or
    /// `immediately`.
    pub when: String,
    pub basis: BasisOutput,
}

/// The legal basis of a deadline or a duty.
#[wasm_bindgen(getter_with_clone)]
#[derive(Debug, Clone)]
pub struct BasisOutput {
    /// The source's identifier.
    pub source: String,
    /// The act's title, in Russian.
    pub act: String,
    pub article: String,
    pub part: String,
    /// The revision the text was checked against.
    pub revision: String,
    pub url: String,
    /// `text` or `conservative`.
    pub reading: String,
}

/// The clocks of one case.
#[wasm_bindgen(getter_with_clone)]
#[derive(Debug, Clone)]
pub struct ClockOutput {
    /// `complaint` or `ombudsman_claim`.
    pub regime: String,
    pub deadlines: Vec<DeadlineOutput>,
    pub duties: Vec<DutyOutput>,
    /// Warning codes.
    pub warnings: Vec<String>,
    /// Refusal codes (`extension_not_allowed`, ...).
    pub refusals: Vec<String>,
    /// The reply's last day, extended when an extension was allowed.
    #[wasm_bindgen(js_name = replyDue)]
    pub reply_due: Option<String>,
}

fn basis(b: clock::Basis) -> BasisOutput {
    BasisOutput {
        source: b.source.id.to_string(),
        act: b.source.title.to_string(),
        article: b.article.to_string(),
        part: b.part.to_string(),
        revision: b.source.revision.to_string(),
        url: b.source.url.to_string(),
        reading: match b.reading {
            clock::Reading::Text => "text",
            clock::Reading::Conservative => "conservative",
        }
        .to_string(),
    }
}

fn to_output(c: &clock::Clock) -> ClockOutput {
    ClockOutput {
        regime: c.regime.code().to_string(),
        deadlines: c
            .deadlines
            .iter()
            .map(|d| {
                let (count, count_value) = d.count.code();
                DeadlineOutput {
                    kind: d.kind.code().to_string(),
                    due: d.due.to_string(),
                    from: d.from.to_string(),
                    count: count.to_string(),
                    count_value,
                    for_others: d.kind.is_for_others(),
                    basis: basis(d.basis),
                }
            })
            .collect(),
        duties: c
            .duties
            .iter()
            .map(|d| DutyOutput {
                kind: d.kind.code().to_string(),
                when: d.when.code().to_string(),
                basis: basis(d.basis),
            })
            .collect(),
        warnings: c.warnings.iter().map(|w| w.code().to_string()).collect(),
        refusals: c.refusals.iter().map(|r| r.code().to_string()).collect(),
        reply_due: c.reply_due().map(|d| d.to_string()),
    }
}

/// The legal clocks of a case: deadlines with their basis, duties,
/// warnings and refusals.
#[wasm_bindgen]
pub fn clock(input: &CaseInput) -> Result<ClockOutput, JsError> {
    let case = to_case(input).map_err(js)?;
    Ok(to_output(&clock::clock(&case).map_err(js)?))
}

/// A threshold a sign states.
#[wasm_bindgen(getter_with_clone)]
#[derive(Debug, Clone)]
pub struct ThresholdOutput {
    pub value: u32,
    /// `roubles`, `hours` or `months`.
    pub unit: String,
    /// `more_than`, `less_than`, `at_least` or `within`.
    pub bound: String,
    /// What it bounds, in English.
    pub of: String,
}

/// A sign of Order No. OD-2506.
#[wasm_bindgen(getter_with_clone)]
#[derive(Debug, Clone)]
pub struct SignOutput {
    /// The sign's number in the order ("1.10").
    pub number: String,
    /// The reason code ("od2506_1_10").
    pub code: String,
    /// `transfers` or `digital_rubles`.
    pub group: String,
    pub summary: String,
    #[wasm_bindgen(js_name = appliesFrom)]
    pub applies_from: String,
    pub thresholds: Vec<ThresholdOutput>,
    /// The wording, transcribed from the order, in Russian.
    pub wording: String,
}

/// The signs of the Bank of Russia's Order No. OD-2506, in the order's
/// order.
#[wasm_bindgen(js_name = od2506Signs)]
pub fn od2506_signs() -> Vec<SignOutput> {
    reasons::SIGNS
        .iter()
        .map(|s| SignOutput {
            number: s.number.into(),
            code: s.code.into(),
            group: match s.group {
                reasons::SignGroup::Transfers => "transfers",
                reasons::SignGroup::DigitalRubles => "digital_rubles",
            }
            .into(),
            summary: s.summary.into(),
            applies_from: s.applies_from.into(),
            thresholds: s
                .thresholds
                .iter()
                .map(|t| ThresholdOutput {
                    value: t.value as u32,
                    unit: match t.unit {
                        reasons::Unit::Roubles => "roubles",
                        reasons::Unit::Hours => "hours",
                        reasons::Unit::Months => "months",
                    }
                    .into(),
                    bound: match t.bound {
                        reasons::Bound::MoreThan => "more_than",
                        reasons::Bound::LessThan => "less_than",
                        reasons::Bound::AtLeast => "at_least",
                        reasons::Bound::Within => "within",
                    }
                    .into(),
                    of: t.of.into(),
                })
                .collect(),
            wording: s.wording.into(),
        })
        .collect()
}

/// A 115-FZ reason category.
#[wasm_bindgen(getter_with_clone)]
#[derive(Debug, Clone)]
pub struct AmlReasonOutput {
    pub code: String,
    pub source: String,
    pub article: String,
    pub part: String,
    pub revision: String,
}

/// The 115-FZ reason categories.
#[wasm_bindgen(js_name = amlReasons)]
pub fn aml_reasons() -> Vec<AmlReasonOutput> {
    reasons::AML_REASONS
        .iter()
        .map(|r| {
            let (source, article, part) = r.basis();
            AmlReasonOutput {
                code: r.code().into(),
                source: source.id.into(),
                article: article.into(),
                part: part.into(),
                revision: source.revision.into(),
            }
        })
        .collect()
}

/// The act a reply names.
#[wasm_bindgen]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ActCode {
    PaymentSystem = "payment_system",
    AntiMoneyLaundering = "anti_money_laundering",
    Ombudsman = "ombudsman",
    ComplaintLaw = "complaint_law",
    OtherLaw = "other_law",
    Contract = "contract",
}

/// A legal ground a reply names.
#[wasm_bindgen(getter_with_clone)]
#[derive(Debug, Clone)]
pub struct GroundInput {
    pub act: ActCode,
    pub article: String,
    pub part: String,
}

#[wasm_bindgen]
impl GroundInput {
    #[wasm_bindgen(constructor)]
    pub fn new(act: ActCode, article: String, part: String) -> GroundInput {
        GroundInput { act, article, part }
    }
}

/// A deadline as a reply states it.
#[wasm_bindgen(getter_with_clone)]
#[derive(Debug, Clone)]
pub struct StatedDeadlineInput {
    /// A deadline code (`antifraud_confirmation`, ...).
    pub kind: String,
    pub due: String,
}

#[wasm_bindgen]
impl StatedDeadlineInput {
    #[wasm_bindgen(constructor)]
    pub fn new(kind: String, due: String) -> StatedDeadlineInput {
        StatedDeadlineInput { kind, due }
    }
}

/// A reply, structured, for the rubric.
#[wasm_bindgen(getter_with_clone)]
#[derive(Debug, Clone)]
pub struct ReplyInput {
    #[wasm_bindgen(js_name = repliedOn)]
    pub replied_on: String,
    pub grounds: Vec<GroundInput>,
    /// Reason codes (`od2506_1_6`, `aml_operation_refused`, ...).
    pub reasons: Vec<String>,
    #[wasm_bindgen(js_name = nextSteps)]
    pub next_steps: Vec<String>,
    /// Option codes (`confirm_order`, `apply_to_commission`, ...).
    #[wasm_bindgen(js_name = clientOptions)]
    pub client_options: Vec<String>,
    #[wasm_bindgen(js_name = statedDeadlines)]
    pub stated_deadlines: Vec<StatedDeadlineInput>,
    pub text: String,
}

#[wasm_bindgen]
impl ReplyInput {
    /// A reply going out on `replied_on` with `text`, nothing else filled.
    #[wasm_bindgen(constructor)]
    pub fn new(replied_on: String, text: String) -> ReplyInput {
        ReplyInput {
            replied_on,
            grounds: Vec::new(),
            reasons: Vec::new(),
            next_steps: Vec::new(),
            client_options: Vec::new(),
            stated_deadlines: Vec::new(),
            text,
        }
    }
}

/// One finding of the rubric.
#[wasm_bindgen(getter_with_clone)]
#[derive(Debug, Clone)]
pub struct FindingOutput {
    /// A finding code (`grounds_mixed`, ...).
    pub code: String,
    /// The option or deadline code the finding is about.
    pub subject: Option<String>,
    pub sentence: Option<u32>,
    pub words: Option<u32>,
    /// The source the check rests on, and where in it.
    pub source: String,
    pub reference: String,
}

fn to_reply(r: &ReplyInput) -> Result<Reply, Error> {
    Ok(Reply {
        replied_on: Date::parse(&r.replied_on)?,
        grounds: r
            .grounds
            .iter()
            .map(|g| {
                Ok(rubric::Ground {
                    act: match g.act {
                        ActCode::PaymentSystem => rubric::Act::PaymentSystem,
                        ActCode::AntiMoneyLaundering => rubric::Act::AntiMoneyLaundering,
                        ActCode::Ombudsman => rubric::Act::Ombudsman,
                        ActCode::ComplaintLaw => rubric::Act::ComplaintLaw,
                        ActCode::OtherLaw => rubric::Act::OtherLaw,
                        ActCode::Contract => rubric::Act::Contract,
                        ActCode::__Invalid => return Err(Error::UnknownCode),
                    },
                    article: g.article.clone(),
                    part: g.part.clone(),
                })
            })
            .collect::<Result<_, Error>>()?,
        reasons: r
            .reasons
            .iter()
            .map(|c| Reason::parse(c))
            .collect::<Result<_, Error>>()?,
        next_steps: r.next_steps.clone(),
        client_options: r
            .client_options
            .iter()
            .map(|c| ClientOption::parse(c))
            .collect::<Result<_, Error>>()?,
        stated_deadlines: r
            .stated_deadlines
            .iter()
            .map(|s| {
                Ok(rubric::StatedDeadline {
                    kind: clock::DeadlineKind::parse(&s.kind)?,
                    due: Date::parse(&s.due)?,
                })
            })
            .collect::<Result<_, Error>>()?,
        text: r.text.clone(),
    })
}

fn rubric_pure(reply: &ReplyInput, input: &CaseInput) -> Result<Vec<FindingOutput>, Error> {
    let case = to_case(input)?;
    let c = clock::clock(&case)?;
    Ok(rubric::rubric(&to_reply(reply)?, &case, &c)
        .into_iter()
        .map(|f| {
            let (source, reference) = f.code.basis();
            FindingOutput {
                code: f.code.code().into(),
                subject: f.subject.map(String::from),
                sentence: f.sentence,
                words: f.words,
                source: source.id.into(),
                reference: reference.into(),
            }
        })
        .collect())
}

/// The rubric's findings for a reply to a case: the case's clock is
/// computed from the same input.
#[wasm_bindgen]
pub fn rubric(reply: &ReplyInput, input: &CaseInput) -> Result<Vec<FindingOutput>, JsError> {
    rubric_pure(reply, input).map_err(js)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_input_becomes_the_case_and_the_clock_its_output() {
        // The forwarded complaint with an extension of the clock tests:
        // registered 12 May 2026, reply 2 June, extended to 17 June.
        let mut i = CaseInput::new(StreamCode::Antifraud, "2026-05-08".into());
        i.registered_on = Some("2026-05-12".into());
        i.origin = OriginCode::ForwardedByBankOfRussia;
        i.extension_ground = Some(ExtensionGroundCode::RequestDocuments);
        i.extension_working_days = Some(10);
        i.blocked_operation = Some(OperationCode::Transfer);
        i.blocked_on = Some("2026-05-08".into());
        let case = to_case(&i).unwrap();
        let out = to_output(&clock::clock(&case).unwrap());
        assert_eq!(out.regime, "complaint");
        assert_eq!(out.reply_due.as_deref(), Some("2026-06-17"));
        let reply = out.deadlines.iter().find(|d| d.kind == "reply").unwrap();
        assert_eq!(
            (reply.due.as_str(), reply.count.as_str(), reply.count_value),
            ("2026-06-02", "working_days", 15)
        );
        assert_eq!(
            (
                reply.basis.source.as_str(),
                reply.basis.article.as_str(),
                reply.basis.part.as_str()
            ),
            ("banking_law_30_1", "30.1", "7")
        );
        assert_eq!(reply.basis.revision, "2026-08-04");
        assert_eq!(out.duties[0].kind, "copy_to_bank_of_russia");
        assert!(out
            .deadlines
            .iter()
            .any(|d| d.kind == "antifraud_confirmation" && d.for_others));
    }

    #[test]
    fn the_rubric_runs_over_the_same_input() {
        // The antifraud transfer of the rubric tests, suspended on 8 May
        // 2026: a reply that names 161-FZ and the 115-FZ category mixes
        // the two laws and leaves out the confirmation and its date.
        let mut i = CaseInput::new(StreamCode::Antifraud, "2026-05-08".into());
        i.blocked_operation = Some(OperationCode::Transfer);
        i.blocked_on = Some("2026-05-08".into());
        let mut r = ReplyInput::new("2026-05-08".into(), "Перевод приостановлен.".into());
        r.grounds = vec![GroundInput::new(
            ActCode::PaymentSystem,
            "8".into(),
            "3.4".into(),
        )];
        r.reasons = vec!["aml_operation_refused".into()];
        r.next_steps = vec!["Подтвердите перевод.".into()];
        r.stated_deadlines = vec![StatedDeadlineInput::new(
            "antifraud_suspension_ends".into(),
            "2026-05-09".into(),
        )];
        let f = rubric_pure(&r, &i).unwrap();
        let codes: Vec<_> = f
            .iter()
            .map(|x| (x.code.as_str(), x.subject.as_deref()))
            .collect();
        assert_eq!(
            codes,
            [
                ("grounds_mixed", None),
                ("client_option_missing", Some("confirm_order")),
                ("deadline_missing", Some("antifraud_confirmation"))
            ]
        );
        assert_eq!(f[0].source, "letter_in_01_59_98");
        r.client_options = vec!["call_us".into()];
        assert_eq!(rubric_pure(&r, &i).unwrap_err(), Error::UnknownCode);
        r.client_options.clear();
        r.reasons = vec!["od2506_9_9".into()];
        assert_eq!(rubric_pure(&r, &i).unwrap_err(), Error::UnknownCode);
    }

    #[test]
    fn signs_and_categories_cross_whole() {
        let signs = od2506_signs();
        assert_eq!(signs.len(), 14);
        let s = signs.iter().find(|s| s.number == "1.12").unwrap();
        assert_eq!(s.thresholds[0].value, 200_000);
        assert_eq!(
            (
                s.thresholds[0].unit.as_str(),
                s.thresholds[0].bound.as_str()
            ),
            ("roubles", "more_than")
        );
        assert_eq!(aml_reasons().len(), 7);
    }

    #[test]
    fn incomplete_or_malformed_input_is_a_code() {
        let base = CaseInput::new(StreamCode::MoneyClaim, "2026-04-27".into());
        let mut i = base.clone();
        i.claim_kopecks = Some(12.5);
        assert_eq!(to_case(&i), Err(Error::InvalidAmount));
        i.claim_kopecks = Some(-1.0);
        assert_eq!(to_case(&i), Err(Error::InvalidAmount));
        let mut i = base.clone();
        i.extension_working_days = Some(5);
        assert_eq!(to_case(&i), Err(Error::InvalidExtension));
        let mut i = base.clone();
        i.blocked_operation = Some(OperationCode::Transfer);
        assert_eq!(to_case(&i), Err(Error::MissingDate));
        let mut i = base.clone();
        i.aml_decision_on = Some("2026-04-27".into());
        assert_eq!(to_case(&i), Err(Error::MissingDate));
        let mut i = base;
        i.breach_on = Some("2026-4-1".into());
        i.claim_kopecks = Some(100.0);
        assert_eq!(to_case(&i), Err(Error::InvalidDate));
    }
}
