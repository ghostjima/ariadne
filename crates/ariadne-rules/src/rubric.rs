//! A deterministic rubric for a reply to a complaint, over a structured
//! reply rather than its prose: which legal grounds it names, which
//! reasons it gives, the next steps and options it offers the client,
//! the deadlines it states, and its text for a reading-ease check.
//!
//! The rubric checks what the law and the Bank of Russia ask of a reply,
//! and nothing that needs a legal judgment:
//!
//! - a legal ground is named, with act and article (Banking Law art. 30.1
//!   part 9 and the sector equivalents; the Bank of Russia's letter
//!   No. IN-01-59/98: "со ссылкой на конкретную норму");
//! - 161-FZ and 115-FZ grounds are not mixed (the same letter:
//!   "однозначно дифференцировать требования" of the two laws), and a
//!   reply on an antifraud or anti-money-laundering complaint names its
//!   own law;
//! - next steps are stated, and the options the law gives the client in
//!   that case (the same letter is the source of the duty to state them;
//!   each option has its own provision, [`client_options`]), among
//!   them, for a card or online banking suspended for the client's own
//!   data in the Bank of Russia's database, or the client's transfers
//!   capped instead, the right to apply for their removal and how (161-FZ
//!   art. 9 part 11.8; the Bank of Russia's letter No. IN-03-59/11);
//! - a reply about the client's own data in that database says which
//!   restrictions apply: the suspension or, instead, the transfer cap of
//!   161-FZ art. 9 part 11.6, and the ATM cash cap of the Banking Law
//!   art. 30 part 16 (the letter No. IN-03-59/11: the kind of each
//!   restriction and its legal ground);
//! - every deadline still running that concerns the client is stated,
//!   with the date the clock computes;
//! - sentences are not long (the Bank of Russia's recommendations on
//!   replies advise against long sentences and give no number; the word
//!   limits are the values this project sets, see [`MAX_SENTENCE_WORDS`]).
//!
//! A finding names two things: the source of the duty to state what is
//! missing ([`Finding::basis`], a letter or a page of the Bank of Russia,
//! or the statute where it obliges the bank to tell the client), and the
//! provision of the missing thing itself ([`Finding::provision`]): the
//! article and part that give the client the option, set the deadline or
//! ground the measure. [`reply_provisions`] gives the same provisions for
//! everything a reply to the case states, so that each statement can cite
//! its own.
//!
//! It returns coded findings; no finding means nothing to flag, not that
//! the reply is right. A person decides.

use crate::clock::{
    reply_content_basis, AmlDecisionKind, Applicant, Basis, Case, Clock, Deadline, DeadlineKind,
    MeasureKind, Operation, Reading, Regime, Stream,
};
use crate::reasons::{Family, Reason};
use crate::sources::{self, Source};
use crate::{Date, Error};

/// The most words a sentence may have before the rubric flags it. A value
/// this project sets, not a source's: the Bank of Russia advises against
/// long sentences and gives no number. Set, not measured: still a
/// hypothesis to calibrate on real replies.
pub const MAX_SENTENCE_WORDS: u32 = 25;

/// The most words a sentence may have on average before the rubric flags
/// the text. A value this project sets, like [`MAX_SENTENCE_WORDS`], and
/// as much a hypothesis to calibrate.
pub const MAX_MEAN_SENTENCE_WORDS: u32 = 15;

/// The act a reply names as a ground.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Act {
    /// 161-FZ, the National Payment System Law.
    PaymentSystem,
    /// 115-FZ, the Anti-Money-Laundering Law.
    AntiMoneyLaundering,
    /// 123-FZ, the Financial Ombudsman Law.
    Ombudsman,
    /// The sector's law on complaints (Banking Law and its equivalents).
    ComplaintLaw,
    /// Any other law or regulation.
    OtherLaw,
    /// The contract with the client, which has no article.
    Contract,
    /// A directive or regulation of the Bank of Russia, numbered in items:
    /// it has no articles, and a reply names its item.
    BankOfRussiaAct,
}

/// A legal ground the reply names.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Ground {
    pub act: Act,
    /// The article, empty when the reply names none.
    pub article: String,
    /// The part or item, empty when the reply names none.
    pub part: String,
}

/// What the law lets the client do next. The provision that gives each
/// option in a case is [`client_options`]'.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ClientOption {
    /// Confirm the suspended order (161-FZ art. 8 part 3.6 item 3).
    ConfirmOrder,
    /// Repeat the refused operation (161-FZ art. 8 part 3.6 item 3; after
    /// a second refusal or suspension, part 3.10, sentence 2).
    RepeatOperation,
    /// Submit documents against a 115-FZ refusal (art. 7 item 13.4,
    /// paragraph 1).
    SubmitDocuments,
    /// Apply to the interagency commission: after the bank's answer on
    /// the documents (115-FZ art. 7 item 13.5, paragraph 1), or against
    /// the measures for a high-risk client (art. 7.8 item 1).
    ApplyToCommission,
    /// Apply to the financial ombudsman (123-FZ art. 16 part 4).
    ApplyToOmbudsman,
    /// Apply to the Bank of Russia to remove the client's data from its
    /// database, through the bank or through the Bank of Russia's
    /// Internet reception (161-FZ art. 9 part 11.8; Directive No. 6748-U
    /// item 1.2), whether the card or online banking is suspended or the
    /// transfers are capped instead (the Bank of Russia's letter
    /// No. IN-03-59/11, for restrictions under parts 11.6 and 11.7).
    ApplyForRemoval,
}

impl ClientOption {
    /// Every option.
    pub const ALL: [ClientOption; 6] = [
        ClientOption::ConfirmOrder,
        ClientOption::RepeatOperation,
        ClientOption::SubmitDocuments,
        ClientOption::ApplyToCommission,
        ClientOption::ApplyToOmbudsman,
        ClientOption::ApplyForRemoval,
    ];

    /// The option with a code, or [`Error::UnknownCode`].
    pub fn parse(code: &str) -> Result<ClientOption, Error> {
        ClientOption::ALL
            .into_iter()
            .find(|o| o.code() == code)
            .ok_or(Error::UnknownCode)
    }

    /// The stable code, in snake case.
    pub fn code(self) -> &'static str {
        match self {
            ClientOption::ConfirmOrder => "confirm_order",
            ClientOption::RepeatOperation => "repeat_operation",
            ClientOption::SubmitDocuments => "submit_documents",
            ClientOption::ApplyToCommission => "apply_to_commission",
            ClientOption::ApplyToOmbudsman => "apply_to_ombudsman",
            ClientOption::ApplyForRemoval => "apply_for_removal",
        }
    }

    /// The source of the duty to state the option, when it is not the
    /// letter every option cites ([`FindingCode::basis`]): the right to
    /// apply for removal is a duty of the statute, not only a
    /// recommendation, and the channels are the directive's. The
    /// provision that gives the option itself is [`client_options`]'.
    pub fn basis(self) -> Option<(Source, &'static str)> {
        match self {
            ClientOption::ApplyForRemoval => Some((
                sources::PAYMENT_LAW_9,
                "art. 9 part 11.8 after a suspension; for the transfer cap instead, the Bank of Russia's letter No. IN-03-59/11; the channels: Directive No. 6748-U item 1.2 and the same letter",
            )),
            _ => None,
        }
    }
}

/// A deadline as the reply states it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct StatedDeadline {
    pub kind: DeadlineKind,
    pub due: Date,
}

/// A reply, structured.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Reply {
    /// The day the reply goes out: deadlines that ended before it need
    /// not be stated.
    pub replied_on: Date,
    pub grounds: Vec<Ground>,
    /// The reasons it gives, as codes of [`crate::reasons`].
    pub reasons: Vec<Reason>,
    /// The next steps it states, one per item.
    pub next_steps: Vec<String>,
    pub client_options: Vec<ClientOption>,
    pub stated_deadlines: Vec<StatedDeadline>,
    /// The measures it says apply to the client, as kinds of the clock's
    /// measures; the rubric reads the ones about the client's own data in
    /// the database ([`MeasureKind::DATABASE`]).
    pub measures: Vec<MeasureKind>,
    /// The reply's text, for the reading-ease check.
    pub text: String,
}

/// What a finding is about.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum FindingCode {
    /// No legal ground named.
    GroundMissing,
    /// A law named without an article, or a Bank of Russia directive
    /// without its item.
    GroundWithoutArticle,
    /// Grounds or reasons from both 161-FZ and 115-FZ.
    GroundsMixed,
    /// An antifraud or anti-money-laundering complaint answered without
    /// naming that law.
    StreamGroundMissing,
    /// No next step stated.
    NextStepsMissing,
    /// An option the law gives the client is not stated; the subject
    /// names it.
    ClientOptionMissing,
    /// A running deadline that concerns the client is not stated; the
    /// subject names it.
    DeadlineMissing,
    /// A deadline is stated with another date than the clock's; the
    /// subject names it.
    DeadlineMismatch,
    /// A restriction that applies for the client's own data in the
    /// database (the suspension, the transfer cap, the ATM cash cap) is not
    /// stated; the subject names its measure.
    MeasureMissing,
    /// A restriction for the client's own data in the database is stated
    /// that does not apply (the suspension where the transfers are capped
    /// instead, or the other way round); the subject names its measure.
    MeasureNotTaken,
    /// No text.
    TextEmpty,
    /// A sentence of more than [`MAX_SENTENCE_WORDS`] words.
    SentenceTooLong,
    /// Sentences of more than [`MAX_MEAN_SENTENCE_WORDS`] words on
    /// average.
    SentencesLongOnAverage,
}

impl FindingCode {
    /// The stable code, in snake case.
    pub fn code(self) -> &'static str {
        use FindingCode::*;
        match self {
            GroundMissing => "ground_missing",
            GroundWithoutArticle => "ground_without_article",
            GroundsMixed => "grounds_mixed",
            StreamGroundMissing => "stream_ground_missing",
            NextStepsMissing => "next_steps_missing",
            ClientOptionMissing => "client_option_missing",
            DeadlineMissing => "deadline_missing",
            DeadlineMismatch => "deadline_mismatch",
            MeasureMissing => "measure_missing",
            MeasureNotTaken => "measure_not_taken",
            TextEmpty => "text_empty",
            SentenceTooLong => "sentence_too_long",
            SentencesLongOnAverage => "sentences_long_on_average",
        }
    }

    /// The source the check rests on, and where in it.
    pub fn basis(self) -> (Source, &'static str) {
        use FindingCode::*;
        match self {
            GroundMissing | GroundWithoutArticle => (
                sources::RESTRICTIONS_LETTER,
                "paragraph 3; and the sector complaint article, e.g. Banking Law art. 30.1 part 9",
            ),
            GroundsMixed | StreamGroundMissing | NextStepsMissing => {
                (sources::RESTRICTIONS_LETTER, "paragraph 3")
            }
            ClientOptionMissing => (
                sources::RESTRICTIONS_LETTER,
                "paragraph 3; the provision of each option",
            ),
            DeadlineMissing | DeadlineMismatch => {
                (sources::BANK_OF_RUSSIA_REPLY_PAGE, "concrete terms")
            }
            MeasureMissing | MeasureNotTaken => (
                sources::PROACTIVE_LETTER,
                "the kind of each restriction and its legal ground",
            ),
            TextEmpty | SentenceTooLong | SentencesLongOnAverage => (
                sources::BANK_OF_RUSSIA_REPLY_PAGE,
                "plain language, no long sentences",
            ),
        }
    }
}

/// One finding.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Finding {
    pub code: FindingCode,
    /// The code of the option or deadline the finding is about.
    pub subject: Option<&'static str>,
    /// The provision of what the finding is about, when it has one of its
    /// own: the article and part that give the client a missing option,
    /// set a missing or misstated deadline, or ground a restriction left
    /// out; for a reply with no ground, or a ground without its article,
    /// the part of the sector's complaint article on what a reply must
    /// contain. `None` for a restriction stated that does not apply, and
    /// for the findings about the text.
    pub provision: Option<Basis>,
    /// For a sentence finding, the sentence's index (from zero).
    pub sentence: Option<u32>,
    /// For a sentence finding, its words; for the average, the mean,
    /// rounded down.
    pub words: Option<u32>,
}

impl Finding {
    /// The source of the duty to state what the finding is about, and
    /// where in it: the finding code's, or for a missing option with a
    /// source of its own, the option's.
    pub fn basis(&self) -> (Source, &'static str) {
        let option = self.subject.and_then(|s| ClientOption::parse(s).ok());
        match (self.code, option.and_then(ClientOption::basis)) {
            (FindingCode::ClientOptionMissing, Some(basis)) => basis,
            _ => self.code.basis(),
        }
    }

    fn of(code: FindingCode) -> Finding {
        Finding {
            code,
            subject: None,
            provision: None,
            sentence: None,
            words: None,
        }
    }

    fn about(code: FindingCode, subject: &'static str, provision: Option<Basis>) -> Finding {
        Finding {
            subject: Some(subject),
            provision,
            ..Finding::of(code)
        }
    }
}

const fn provision(source: Source, article: &'static str, part: &'static str) -> Basis {
    Basis {
        source,
        article,
        part,
        reading: Reading::Text,
    }
}

/// An option the law gives the client in a case, with the provision that
/// gives it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct OptionProvision {
    pub option: ClientOption,
    pub basis: Basis,
}

/// A deadline a reply to a case states, with the provision that sets it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct DeadlineProvision {
    pub kind: DeadlineKind,
    pub basis: Basis,
}

/// A restriction a reply to a case states, with the provision it rests
/// on.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct MeasureProvision {
    pub kind: MeasureKind,
    pub basis: Basis,
}

/// The provision behind everything a reply to a case states on a day, so
/// that each statement cites its own: the client's options, the deadlines
/// that concern the client and still run, the restrictions in force for
/// the client's own data in the Bank of Russia's database, the part of the
/// sector's complaint article on what a reply must contain, and the
/// provision behind telling the client that a complaint may also go to the
/// Bank of Russia.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ReplyProvisions {
    pub options: Vec<OptionProvision>,
    pub deadlines: Vec<DeadlineProvision>,
    pub measures: Vec<MeasureProvision>,
    /// What a reply must contain, references to the law among it.
    pub content: Basis,
    /// `None` where no provision was found: for a legal entity.
    pub complaint_to_bank_of_russia: Option<Basis>,
}

/// The provision that sets a deadline a reply states. The clock's own
/// basis, except where the clock cites how a term is counted rather than
/// what sets it: the two days of a suspended transfer are 161-FZ art. 8
/// part 3.4, sentence 1, and of a confirmed one part 3.10, sentence 1 (the
/// Bank of Russia's letter No. 010-31/7975, which the clock cites, says
/// how the days are counted); the Bank of Russia's 15 working days on an
/// application to remove data are 161-FZ art. 9 part 11.10 (Directive No.
/// 6748-U, which the clock cites, says from which day).
pub fn deadline_provision(deadline: &Deadline) -> Basis {
    match deadline.kind {
        DeadlineKind::AntifraudSuspensionEnds => {
            provision(sources::PAYMENT_LAW_8, "8", "3.4, sentence 1")
        }
        DeadlineKind::AntifraudRepeatSuspensionEnds => {
            provision(sources::PAYMENT_LAW_8, "8", "3.10, sentence 1")
        }
        DeadlineKind::ExclusionDecision => provision(sources::PAYMENT_LAW_9, "9", "11.10"),
        _ => deadline.basis,
    }
}

/// The provision behind telling the client that a complaint may also go
/// to the Bank of Russia: "Поступившее в Банк России обращение физического
/// лица ... о нарушении кредитной организацией, некредитной финансовой
/// организацией ... его прав ... направляется для рассмотрения по существу
/// в финансовую организацию" (86-FZ art. 79.3 part 1). The article speaks
/// of an individual's complaint only: no provision was found for a legal
/// entity, and `None` is given for one.
pub fn bank_of_russia_complaint(case: &Case) -> Option<Basis> {
    match case.applicant {
        Applicant::Individual => Some(provision(sources::CENTRAL_BANK_LAW_79_3, "79.3", "1")),
        Applicant::LegalEntity => None,
    }
}

/// The provisions behind what a reply to `case` states on `replied_on`.
pub fn reply_provisions(case: &Case, clock: &Clock, replied_on: Date) -> ReplyProvisions {
    let database = case.database.is_some_and(|f| f.data_removed_on.is_none());
    ReplyProvisions {
        options: client_options(case, clock, replied_on),
        deadlines: clock
            .deadlines
            .iter()
            .filter(|d| stated_to_client(d.kind) && d.due >= replied_on)
            .map(|d| DeadlineProvision {
                kind: d.kind,
                basis: deadline_provision(d),
            })
            .collect(),
        measures: clock
            .measures
            .iter()
            .filter(|m| {
                database && MeasureKind::DATABASE.contains(&m.kind) && m.in_force_on(replied_on)
            })
            .map(|m| MeasureProvision {
                kind: m.kind,
                basis: m.basis,
            })
            .collect(),
        content: reply_content_basis(case.sector),
        complaint_to_bank_of_russia: bank_of_russia_complaint(case),
    }
}

/// Whether the reply should state a deadline of this kind while it runs:
/// the ones that bind the client or tell the client when to expect
/// something, not the organisation's own steps.
fn stated_to_client(kind: DeadlineKind) -> bool {
    use DeadlineKind::*;
    matches!(
        kind,
        AntifraudSuspensionEnds
            | AntifraudConfirmation
            | AntifraudRepeatSuspensionEnds
            | AntifraudAfterRepeatSuspension
            | AntifraudRepeatRefusalEnds
            | AntifraudAfterRepeatRefusal
            | ExclusionDecision
            | AntifraudRefund
            | AmlDocumentsAnswer
            | AmlCommissionDecision
            | HighRiskCommissionApplication
            | HighRiskRatingReview
    )
}

/// The options the law gives the client in this case, on the day the
/// reply goes out, each with the provision that gives it.
pub fn client_options(case: &Case, clock: &Clock, replied_on: Date) -> Vec<OptionProvision> {
    let mut need: Vec<OptionProvision> = Vec::new();
    let mut add = |option: ClientOption, basis: Basis| {
        match need.iter_mut().find(|o| o.option == option) {
            // The later step of the same option is where the client stands.
            Some(o) => o.basis = basis,
            None => need.push(OptionProvision { option, basis }),
        }
    };
    if clock.regime == Regime::OmbudsmanClaim {
        // "Потребитель финансовых услуг вправе направить обращение
        // финансовому уполномоченному после получения ответа финансовой
        // организации".
        add(
            ClientOption::ApplyToOmbudsman,
            provision(sources::OMBUDSMAN_LAW_16, "16", "4"),
        );
    }
    if let Some(f) = case.antifraud {
        // "о возможности клиента подтвердить распоряжение не позднее одного
        // дня, следующего за днем приостановления ..., или о возможности
        // совершения клиентом повторной операции".
        let first = provision(sources::PAYMENT_LAW_8, "8", "3.6, item 3");
        match f.operation {
            Operation::Transfer => add(ClientOption::ConfirmOrder, first),
            Operation::CardSbpOrEmoney => add(ClientOption::RepeatOperation, first),
        }
        if f.database_match_after_confirmation {
            // "а также о возможности совершения клиентом последующей
            // повторной операции".
            add(
                ClientOption::RepeatOperation,
                provision(sources::PAYMENT_LAW_8, "8", "3.10, sentence 2"),
            );
        }
    }
    if let Some(f) = case.aml {
        let mut refused = false;
        if let Some((kind, _)) = f.decision {
            // Documents and then the commission, against a refused
            // operation or a refused contract (art. 7 items 13.4, 13.5):
            // "клиент ... вправе представить в эту организацию документы и
            // (или) сведения об отсутствии оснований для принятия решения
            // об отказе"; "вправе обратиться с заявлением ... в
            // межведомственную комиссию, созданную при Центральном банке
            // Российской Федерации".
            if kind != AmlDecisionKind::TerminateAccount {
                refused = true;
                add(
                    ClientOption::SubmitDocuments,
                    provision(sources::AML_LAW_7, "7", "13.4, paragraph 1"),
                );
                add(
                    ClientOption::ApplyToCommission,
                    provision(sources::AML_LAW_7, "7", "13.5, paragraph 1"),
                );
            }
        }
        if !refused
            && (f.high_risk_measures_on.is_some() || f.high_risk_notice_received_on.is_some())
        {
            // "заявитель вправе обратиться с заявлением об отсутствии
            // оснований для применения к нему мер ... в ... межведомственную
            // комиссию".
            add(
                ClientOption::ApplyToCommission,
                provision(sources::AML_LAW_7_8, "7.8", "1"),
            );
        }
    }
    if let Some(f) = case.database {
        // "незамедлительно уведомить клиента о приостановлении ..., а также
        // о праве клиента подать ... заявление в Банк России, в том числе
        // через оператора по переводу денежных средств, об исключении
        // сведений" (161-FZ art. 9 part 11.8): owed after a suspension, as
        // long as the data are in the database. For the transfer cap the
        // bank chose instead, the Bank of Russia's letter No. IN-03-59/11
        // asks the same "в случае введения ограничений согласно
        // основаниям, предусмотренным частями 11.6 и 11.7".
        let restricted = clock.measures.iter().any(|m| {
            m.in_force_on(replied_on)
                && matches!(
                    m.kind,
                    MeasureKind::SuspendInstrument | MeasureKind::CapTransfers
                )
        });
        if restricted && f.data_removed_on.is_none() {
            add(
                ClientOption::ApplyForRemoval,
                provision(sources::PAYMENT_LAW_9, "9", "11.8"),
            );
        }
    }
    need
}

/// Sentences of a text: a full stop, question or exclamation mark or
/// ellipsis ends one when whitespace and a capital letter (or the end)
/// follow, so "ст. 8" and "3.4" do not split; a line break ends one too,
/// for lists.
pub fn sentences(text: &str) -> Vec<&str> {
    let mut out = Vec::new();
    let mut start = 0;
    let chars: Vec<(usize, char)> = text.char_indices().collect();
    for (k, &(i, c)) in chars.iter().enumerate() {
        let end = match c {
            '\n' => true,
            '.' | '!' | '?' | '\u{2026}' => {
                let mut rest = chars[k + 1..].iter().map(|&(_, c)| c);
                match rest.next() {
                    None => true,
                    Some(w) if w.is_whitespace() => rest
                        .find(|c| {
                            !c.is_whitespace()
                                && !matches!(c, '«' | '"' | '(' | '-' | '\u{2013}' | '\u{2014}')
                        })
                        .is_none_or(|n| n.is_uppercase()),
                    Some(_) => false,
                }
            }
            _ => false,
        };
        if end {
            let s = text[start..i + c.len_utf8()].trim();
            if words(s) > 0 {
                out.push(s);
            }
            start = i + c.len_utf8();
        }
    }
    let s = text[start..].trim();
    if words(s) > 0 {
        out.push(s);
    }
    out
}

/// Words of a sentence: whitespace-separated tokens with a letter or a
/// digit, so a dash or a bullet is not a word.
pub fn words(sentence: &str) -> u32 {
    sentence
        .split_whitespace()
        .filter(|t| t.chars().any(char::is_alphanumeric))
        .count() as u32
}

/// The rubric's findings for a reply to a case whose clock is `clock`.
pub fn rubric(reply: &Reply, case: &Case, clock: &Clock) -> Vec<Finding> {
    let mut out = Vec::new();

    // Grounds.
    // The sector's complaint article asks a reply for references to the
    // requirements of the law: its own provision for a ground left out.
    let content = Some(reply_content_basis(case.sector));
    if reply.grounds.is_empty() {
        out.push(Finding {
            provision: content,
            ..Finding::of(FindingCode::GroundMissing)
        });
    }
    // A law is named with its article; a Bank of Russia directive has
    // items only, and is named with its item; the contract has neither.
    if reply.grounds.iter().any(|g| match g.act {
        Act::Contract => false,
        Act::BankOfRussiaAct => g.part.trim().is_empty(),
        _ => g.article.trim().is_empty(),
    }) {
        out.push(Finding {
            provision: content,
            ..Finding::of(FindingCode::GroundWithoutArticle)
        });
    }
    let names = |act: Act| reply.grounds.iter().any(|g| g.act == act);
    let gives = |family: Family| reply.reasons.iter().any(|r| r.family() == family);
    let antifraud = names(Act::PaymentSystem) || gives(Family::Antifraud);
    let aml = names(Act::AntiMoneyLaundering) || gives(Family::Aml);
    if antifraud && aml {
        out.push(Finding::of(FindingCode::GroundsMixed));
    }
    let stream_act = match case.stream {
        Stream::Antifraud => Some(Act::PaymentSystem),
        Stream::AmlRefusal => Some(Act::AntiMoneyLaundering),
        Stream::General | Stream::MoneyClaim => None,
    };
    if let Some(act) = stream_act {
        if !names(act) {
            out.push(Finding::of(FindingCode::StreamGroundMissing));
        }
    }

    // Next steps and options.
    if reply.next_steps.iter().all(|s| s.trim().is_empty()) {
        out.push(Finding::of(FindingCode::NextStepsMissing));
    }
    for o in client_options(case, clock, reply.replied_on) {
        if !reply.client_options.contains(&o.option) {
            out.push(Finding::about(
                FindingCode::ClientOptionMissing,
                o.option.code(),
                Some(o.basis),
            ));
        }
    }

    // Deadlines.
    for d in &clock.deadlines {
        if !stated_to_client(d.kind) || d.due < reply.replied_on {
            continue;
        }
        let own = Some(deadline_provision(d));
        match reply.stated_deadlines.iter().find(|s| s.kind == d.kind) {
            None => out.push(Finding::about(
                FindingCode::DeadlineMissing,
                d.kind.code(),
                own,
            )),
            Some(s) if s.due != d.due => out.push(Finding::about(
                FindingCode::DeadlineMismatch,
                d.kind.code(),
                own,
            )),
            Some(_) => {}
        }
    }

    // The restrictions for the client's own data in the database, while
    // the data are there: each one that applies on the day of the reply is
    // stated, none that does not (a transfer cap the suspension replaced
    // has ended).
    if case.database.is_some_and(|f| f.data_removed_on.is_none()) {
        let applies: Vec<(MeasureKind, Basis)> = clock
            .measures
            .iter()
            .filter(|m| m.in_force_on(reply.replied_on))
            .map(|m| (m.kind, m.basis))
            .filter(|(k, _)| MeasureKind::DATABASE.contains(k))
            .collect();
        for k in MeasureKind::DATABASE {
            let stated = reply.measures.contains(&k);
            let applied = applies.iter().find(|(kind, _)| *kind == k);
            match (applied, stated) {
                // The restriction's own ground, which the reply owes.
                (Some((_, basis)), false) => out.push(Finding::about(
                    FindingCode::MeasureMissing,
                    k.code(),
                    Some(*basis),
                )),
                (None, true) => {
                    out.push(Finding::about(FindingCode::MeasureNotTaken, k.code(), None))
                }
                _ => {}
            }
        }
    }

    // Reading ease.
    let all = sentences(&reply.text);
    if all.is_empty() {
        out.push(Finding::of(FindingCode::TextEmpty));
    } else {
        let mut total = 0;
        for (i, s) in all.iter().enumerate() {
            let n = words(s);
            total += n;
            if n > MAX_SENTENCE_WORDS {
                out.push(Finding {
                    sentence: Some(i as u32),
                    words: Some(n),
                    ..Finding::of(FindingCode::SentenceTooLong)
                });
            }
        }
        let count = all.len() as u32;
        if total > MAX_MEAN_SENTENCE_WORDS * count {
            out.push(Finding {
                words: Some(total / count),
                ..Finding::of(FindingCode::SentencesLongOnAverage)
            });
        }
    }
    out
}
