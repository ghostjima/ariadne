//! The reply rubric: worked examples of replies, each finding explained.

use ariadne_rules::clock::{
    clock, AmlDecisionKind, AmlFacts, AntifraudFacts, Case, DeadlineKind as K, MoneyClaim,
    Operation, Stream,
};
use ariadne_rules::reasons::{AmlReason, Reason};
use ariadne_rules::rubric::{
    rubric, sentences, words, Act, ClientOption, Finding, FindingCode as F, Ground, Reply,
    StatedDeadline, MAX_MEAN_SENTENCE_WORDS, MAX_SENTENCE_WORDS,
};
use ariadne_rules::{reasons, Date};

fn d(s: &str) -> Date {
    Date::parse(s).unwrap()
}

fn ground(act: Act, article: &str, part: &str) -> Ground {
    Ground {
        act,
        article: article.into(),
        part: part.into(),
    }
}

fn codes(findings: &[Finding]) -> Vec<(&'static str, Option<&'static str>)> {
    findings
        .iter()
        .map(|f| (f.code.code(), f.subject))
        .collect()
}

/// A transfer suspended on Friday 8 May 2026 as atypical for the client
/// (sign 1.6), and a complaint about it the same day. The clock: the
/// suspension ends, and the confirmation is due, on 9 May.
fn antifraud_case() -> Case {
    let mut case = Case::new(Stream::Antifraud, d("2026-05-08"));
    case.antifraud = Some(AntifraudFacts {
        operation: Operation::Transfer,
        stopped_on: d("2026-05-08"),
        confirmed_on: None,
        database_match_after_confirmation: false,
        exclusion_request_registered_on: None,
        refund_claim_received_on: None,
    });
    case
}

fn good_antifraud_reply() -> Reply {
    Reply {
        replied_on: d("2026-05-08"),
        grounds: vec![ground(Act::PaymentSystem, "8", "3.4")],
        reasons: vec![Reason::Sign(reasons::sign("1.6").unwrap())],
        next_steps: vec!["Подтвердите перевод в приложении до 9 мая.".into()],
        client_options: vec![ClientOption::ConfirmOrder],
        stated_deadlines: vec![
            StatedDeadline {
                kind: K::AntifraudSuspensionEnds,
                due: d("2026-05-09"),
            },
            StatedDeadline {
                kind: K::AntifraudConfirmation,
                due: d("2026-05-09"),
            },
        ],
        // Four sentences of 15, 6, 6 and 6 words: "ч. 3.4 ст. 8" does not
        // end a sentence, "161-ФЗ." before a capital does.
        text: "Мы приостановили перевод на два дня по ч. 3.4 ст. 8 Федерального закона № 161-ФЗ. \
               Операция не похожа на ваши обычные переводы. \
               Подтвердите перевод в приложении до 9 мая. \
               Без подтверждения перевод не будет выполнен."
            .into(),
    }
}

#[test]
fn a_reply_that_meets_the_rubric_has_no_findings() {
    let case = antifraud_case();
    let c = clock(&case).unwrap();
    assert_eq!(rubric(&good_antifraud_reply(), &case, &c), []);
}

#[test]
fn grounds_from_both_laws_are_mixed() {
    // Adding a 115-FZ ground to the antifraud reply mixes the two laws;
    // so does a 115-FZ reason alone, with the 161-FZ ground.
    let case = antifraud_case();
    let c = clock(&case).unwrap();
    let mut reply = good_antifraud_reply();
    reply
        .grounds
        .push(ground(Act::AntiMoneyLaundering, "7", "11"));
    assert_eq!(codes(&rubric(&reply, &case, &c)), [("grounds_mixed", None)]);
    let mut reply = good_antifraud_reply();
    reply.reasons.push(Reason::Aml(AmlReason::OperationRefused));
    assert_eq!(codes(&rubric(&reply, &case, &c)), [("grounds_mixed", None)]);
}

#[test]
fn a_ground_needs_its_article_and_the_streams_law() {
    let case = antifraud_case();
    let c = clock(&case).unwrap();
    // The law named, but no article.
    let mut reply = good_antifraud_reply();
    reply.grounds = vec![ground(Act::PaymentSystem, " ", "")];
    assert_eq!(
        codes(&rubric(&reply, &case, &c)),
        [("ground_without_article", None)]
    );
    // Only the contract: it needs no article, but the antifraud complaint
    // is answered without 161-FZ.
    reply.grounds = vec![ground(Act::Contract, "", "")];
    assert_eq!(
        codes(&rubric(&reply, &case, &c)),
        [("stream_ground_missing", None)]
    );
    // No ground at all.
    reply.grounds.clear();
    assert_eq!(
        codes(&rubric(&reply, &case, &c)),
        [("ground_missing", None), ("stream_ground_missing", None)]
    );
}

#[test]
fn next_steps_and_the_clients_options() {
    let case = antifraud_case();
    let c = clock(&case).unwrap();
    let mut reply = good_antifraud_reply();
    reply.next_steps = vec!["  ".into()];
    reply.client_options.clear();
    assert_eq!(
        codes(&rubric(&reply, &case, &c)),
        [
            ("next_steps_missing", None),
            ("client_option_missing", Some("confirm_order"))
        ]
    );
}

#[test]
fn running_deadlines_are_stated_with_the_clocks_date() {
    let case = antifraud_case();
    let c = clock(&case).unwrap();
    // The confirmation stated for 10 May, the suspension's end left out.
    let mut reply = good_antifraud_reply();
    reply.stated_deadlines = vec![StatedDeadline {
        kind: K::AntifraudConfirmation,
        due: d("2026-05-10"),
    }];
    assert_eq!(
        codes(&rubric(&reply, &case, &c)),
        [
            ("deadline_missing", Some("antifraud_suspension_ends")),
            ("deadline_mismatch", Some("antifraud_confirmation"))
        ]
    );
    // A reply on 12 May: both ended on 9 May and need no mention.
    reply.replied_on = d("2026-05-12");
    reply.stated_deadlines.clear();
    assert_eq!(rubric(&reply, &case, &c), []);
}

#[test]
fn an_aml_refusal_needs_documents_and_the_commission() {
    // An operation refused on Thursday 30 April 2026 under 115-FZ art. 7
    // item 11; the client may submit documents (item 13.4), then apply to
    // the interagency commission (item 13.5). The reply offers the
    // documents only. The reasons notice is the bank's own term and need
    // not be stated.
    let mut case = Case::new(Stream::AmlRefusal, d("2026-05-04"));
    case.aml = Some(AmlFacts {
        decision: Some((AmlDecisionKind::RefuseOperation, d("2026-04-30"))),
        documents_submitted_on: None,
        commission_applied_on: None,
        high_risk_measures_on: None,
        high_risk_notice_received_on: None,
    });
    let c = clock(&case).unwrap();
    let reply = Reply {
        replied_on: d("2026-05-05"),
        grounds: vec![ground(Act::AntiMoneyLaundering, "7", "11")],
        reasons: vec![Reason::Aml(AmlReason::OperationRefused)],
        next_steps: vec!["Пришлите документы о сделке.".into()],
        client_options: vec![ClientOption::SubmitDocuments],
        stated_deadlines: vec![],
        text: "Мы отказали в операции по п. 11 ст. 7 Закона № 115-ФЗ. Пришлите документы о сделке."
            .into(),
    };
    assert_eq!(
        codes(&rubric(&reply, &case, &c)),
        [("client_option_missing", Some("apply_to_commission"))]
    );
}

#[test]
fn a_money_claim_reply_names_the_ombudsman() {
    // A claim of 50,000 roubles: under 123-FZ the consumer may apply to the
    // financial ombudsman after the reply (art. 16 part 4).
    let mut case = Case::new(Stream::MoneyClaim, d("2026-04-27"));
    case.money_claim = Some(MoneyClaim {
        kopecks: 5_000_000,
        standard_form: false,
        breach_on: None,
    });
    let c = clock(&case).unwrap();
    let reply = Reply {
        replied_on: d("2026-05-20"),
        grounds: vec![ground(Act::ComplaintLaw, "30.1", "7")],
        reasons: vec![],
        next_steps: vec!["Вы можете обратиться к финансовому уполномоченному.".into()],
        client_options: vec![],
        stated_deadlines: vec![],
        text: "Мы рассмотрели ваше требование. Мы не можем его удовлетворить.".into(),
    };
    assert_eq!(
        codes(&rubric(&reply, &case, &c)),
        [("client_option_missing", Some("apply_to_ombudsman"))]
    );
}

#[test]
fn long_sentences_are_flagged_with_their_index_and_length() {
    let case = antifraud_case();
    let c = clock(&case).unwrap();
    let mut reply = good_antifraud_reply();
    // A second sentence of 30 words: "Слово", then "слово" 29 times.
    let long = format!("Слово {}", vec!["слово"; 29].join(" "));
    reply.text = format!("Перевод приостановлен. {long}. Подтвердите перевод.");
    let f = rubric(&reply, &case, &c);
    assert_eq!(f.len(), 1);
    assert_eq!(f[0].code, F::SentenceTooLong);
    assert_eq!((f[0].sentence, f[0].words), (Some(1), Some(30)));
    // Two sentences of 16 words: none too long (16 <= 25), but the mean
    // of 16 is over 15.
    let fifteen = vec!["слово"; 15].join(" ");
    reply.text = format!("Первое {fifteen}. Второе {fifteen}.");
    assert_eq!(words(&reply.text), 32);
    let f = rubric(&reply, &case, &c);
    assert_eq!(codes(&f), [("sentences_long_on_average", None)]);
    assert_eq!(f[0].words, Some(16));
    // Fifteen each: within the limit.
    let fourteen = vec!["слово"; 14].join(" ");
    reply.text = format!("Первое {fourteen}. Второе {fourteen}.");
    assert_eq!(rubric(&reply, &case, &c), []);
    // No text at all.
    reply.text = " \n ".into();
    assert_eq!(codes(&rubric(&reply, &case, &c)), [("text_empty", None)]);
    const { assert!(MAX_MEAN_SENTENCE_WORDS < MAX_SENTENCE_WORDS) };
}

#[test]
fn sentences_split_where_a_reader_would() {
    // References with abbreviations and numbers do not split; a capital
    // after a full stop, a quote or a dash does; line breaks split list
    // items; an ellipsis splits; a dash alone is not a word.
    let text = "По п. 11 ст. 7 Закона № 115-ФЗ мы отказали. «Банк» ответит в 3.4 дня.\n\
                - первый шаг\n- второй шаг\nЖдём… Ответ придёт – завтра.";
    assert_eq!(
        sentences(text),
        [
            "По п. 11 ст. 7 Закона № 115-ФЗ мы отказали.",
            "«Банк» ответит в 3.4 дня.",
            "- первый шаг",
            "- второй шаг",
            "Ждём…",
            "Ответ придёт – завтра."
        ]
    );
    assert_eq!(words("- первый шаг"), 2);
    assert_eq!(words("Ответ придёт – завтра."), 3);
    assert_eq!(
        sentences("Сумма 100 тыс. руб. уже зачислена"),
        ["Сумма 100 тыс. руб. уже зачислена"]
    );
}

#[test]
fn every_finding_cites_a_listed_source() {
    for f in [
        F::GroundMissing,
        F::GroundWithoutArticle,
        F::GroundsMixed,
        F::StreamGroundMissing,
        F::NextStepsMissing,
        F::ClientOptionMissing,
        F::DeadlineMissing,
        F::DeadlineMismatch,
        F::TextEmpty,
        F::SentenceTooLong,
        F::SentencesLongOnAverage,
    ] {
        let (source, reference) = f.basis();
        assert!(ariadne_rules::sources::ALL.contains(&source), "{f:?}");
        assert!(!reference.is_empty());
    }
}
