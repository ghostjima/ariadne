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
//!   that case (the same letter; the provisions cited per option);
//! - every deadline still running that concerns the client is stated,
//!   with the date the clock computes;
//! - sentences are not long (the Bank of Russia's recommendations on
//!   replies advise against long sentences; the word limits are this
//!   engine's own, see [`MAX_SENTENCE_WORDS`]).
//!
//! It returns coded findings; no finding means nothing to flag, not that
//! the reply is right. A person decides.

use crate::clock::{AmlDecisionKind, Case, Clock, DeadlineKind, Operation, Regime, Stream};
use crate::reasons::{Family, Reason};
use crate::sources::{self, Source};
use crate::{Date, Error};

/// The most words a sentence may have before the rubric flags it. The
/// engine's own number, not a source's: a hypothesis to calibrate on real
/// replies.
pub const MAX_SENTENCE_WORDS: u32 = 25;

/// The most words a sentence may have on average before the rubric flags
/// the text. The engine's own number, like [`MAX_SENTENCE_WORDS`].
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

/// What the law lets the client do next.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ClientOption {
    /// Confirm the suspended order (161-FZ art. 8 part 3.6 item 3).
    ConfirmOrder,
    /// Repeat the refused operation (161-FZ art. 8 parts 3.6 item 3,
    /// 3.10).
    RepeatOperation,
    /// Submit documents against a 115-FZ refusal (art. 7 item 13.4).
    SubmitDocuments,
    /// Apply to the interagency commission (115-FZ art. 7 item 13.5,
    /// art. 7.7 item 8).
    ApplyToCommission,
    /// Apply to the financial ombudsman (123-FZ art. 16 part 4).
    ApplyToOmbudsman,
}

impl ClientOption {
    /// Every option.
    pub const ALL: [ClientOption; 5] = [
        ClientOption::ConfirmOrder,
        ClientOption::RepeatOperation,
        ClientOption::SubmitDocuments,
        ClientOption::ApplyToCommission,
        ClientOption::ApplyToOmbudsman,
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
    /// The reply's text, for the reading-ease check.
    pub text: String,
}

/// What a finding is about.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum FindingCode {
    /// No legal ground named.
    GroundMissing,
    /// A law named without an article.
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
    /// For a sentence finding, the sentence's index (from zero).
    pub sentence: Option<u32>,
    /// For a sentence finding, its words; for the average, the mean,
    /// rounded down.
    pub words: Option<u32>,
}

impl Finding {
    fn of(code: FindingCode) -> Finding {
        Finding {
            code,
            subject: None,
            sentence: None,
            words: None,
        }
    }

    fn about(code: FindingCode, subject: &'static str) -> Finding {
        Finding {
            subject: Some(subject),
            ..Finding::of(code)
        }
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
    )
}

/// The options the law gives the client in this case.
fn required_options(case: &Case, clock: &Clock) -> Vec<ClientOption> {
    let mut need = Vec::new();
    let mut add = |o: ClientOption| {
        if !need.contains(&o) {
            need.push(o);
        }
    };
    if clock.regime == Regime::OmbudsmanClaim {
        add(ClientOption::ApplyToOmbudsman);
    }
    if let Some(f) = case.antifraud {
        match f.operation {
            Operation::Transfer => add(ClientOption::ConfirmOrder),
            Operation::CardSbpOrEmoney => add(ClientOption::RepeatOperation),
        }
        if f.database_match_after_confirmation {
            add(ClientOption::RepeatOperation);
        }
    }
    if let Some(f) = case.aml {
        if let Some((kind, _)) = f.decision {
            // Documents and then the commission, against a refused
            // operation or a refused contract (art. 7 items 13.4, 13.5).
            if kind != AmlDecisionKind::TerminateAccount {
                add(ClientOption::SubmitDocuments);
                add(ClientOption::ApplyToCommission);
            }
        }
        if f.high_risk_measures_on.is_some() || f.high_risk_notice_received_on.is_some() {
            add(ClientOption::ApplyToCommission);
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
    if reply.grounds.is_empty() {
        out.push(Finding::of(FindingCode::GroundMissing));
    }
    if reply
        .grounds
        .iter()
        .any(|g| g.act != Act::Contract && g.article.trim().is_empty())
    {
        out.push(Finding::of(FindingCode::GroundWithoutArticle));
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
    for o in required_options(case, clock) {
        if !reply.client_options.contains(&o) {
            out.push(Finding::about(FindingCode::ClientOptionMissing, o.code()));
        }
    }

    // Deadlines.
    for d in &clock.deadlines {
        if !stated_to_client(d.kind) || d.due < reply.replied_on {
            continue;
        }
        match reply.stated_deadlines.iter().find(|s| s.kind == d.kind) {
            None => out.push(Finding::about(FindingCode::DeadlineMissing, d.kind.code())),
            Some(s) if s.due != d.due => {
                out.push(Finding::about(FindingCode::DeadlineMismatch, d.kind.code()))
            }
            Some(_) => {}
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
