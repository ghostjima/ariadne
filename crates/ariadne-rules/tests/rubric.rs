//! The reply rubric: worked examples of replies, each finding explained.

use ariadne_rules::clock::{
    clock, AmlDecisionKind, AmlFacts, AntifraudFacts, Case, DatabaseFacts, DeadlineKind as K,
    MeasureKind, MoneyClaim, Operation, Stream,
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
        measures: vec![],
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

/// The client's card suspended on Saturday 9 May 2026 because the Bank
/// of Russia's database holds the client's own data, and a complaint about
/// it on Tuesday 12 May: no operation was blocked.
fn database_case(police_information: bool) -> Case {
    let mut case = Case::new(Stream::Antifraud, d("2026-05-12"));
    case.database = Some(DatabaseFacts {
        information_received_on: None,
        instrument_suspended_on: Some(d("2026-05-09")),
        transfers_capped_on: None,
        police_information,
        data_removed_on: None,
        exclusion_received_by_operator_on: None,
        exclusion_data_missing: false,
        exclusion_received_by_bank_of_russia_on: None,
        exclusion_decision_received_on: None,
        bank_of_russia_query_received_on: None,
        operator_application_sent_on: None,
    });
    case
}

#[test]
fn a_reply_about_a_suspension_for_the_database_tells_of_the_right_to_apply_for_removal() {
    // "незамедлительно уведомить клиента о приостановлении ..., а также о
    // праве клиента подать ... заявление в Банк России, в том числе через
    // оператора по переводу денежных средств, об исключении сведений"
    // (161-FZ art. 9 part 11.8), with or without the Ministry of Internal
    // Affairs' information: the option is owed, and its finding cites the
    // statute, not only the letter every option cites.
    for police in [false, true] {
        let case = database_case(police);
        let c = clock(&case).unwrap();
        let mut reply = Reply {
            replied_on: d("2026-05-12"),
            grounds: vec![ground(
                Act::PaymentSystem,
                "9",
                if police { "11.7" } else { "11.6" },
            )],
            reasons: vec![],
            next_steps: vec!["Ответьте на это письмо, если остались вопросы.".into()],
            client_options: vec![],
            stated_deadlines: vec![],
            measures: vec![MeasureKind::SuspendInstrument, MeasureKind::CapAtmCash],
            text: "Карта приостановлена. Сведения о вас есть в базе данных Банка России.".into(),
        };
        let findings = rubric(&reply, &case, &c);
        assert_eq!(
            codes(&findings),
            [("client_option_missing", Some("apply_for_removal"))]
        );
        let (source, reference) = findings[0].basis();
        assert_eq!(source, ariadne_rules::sources::PAYMENT_LAW_9);
        assert!(reference.starts_with("art. 9 part 11.8"), "{reference}");
        reply.client_options = vec![ClientOption::ApplyForRemoval];
        assert_eq!(rubric(&reply, &case, &c), []);
    }
    // Once the data have left the database the card is restored (part
    // 11.11), and there is nothing to apply for.
    let mut case = database_case(false);
    if let Some(f) = case.database.as_mut() {
        f.data_removed_on = Some(d("2026-05-12"));
    }
    let c = clock(&case).unwrap();
    let reply = Reply {
        replied_on: d("2026-05-12"),
        grounds: vec![ground(Act::PaymentSystem, "9", "11.6")],
        reasons: vec![],
        next_steps: vec!["Карта снова доступна.".into()],
        client_options: vec![],
        stated_deadlines: vec![],
        measures: vec![],
        text: "Сведения исключены из базы данных. Карта снова доступна.".into(),
    };
    assert_eq!(rubric(&reply, &case, &c), []);
    // A block on an OD-2506 sign carries no database facts: the option is
    // not owed.
    let case = antifraud_case();
    let c = clock(&case).unwrap();
    assert_eq!(rubric(&good_antifraud_reply(), &case, &c), []);
}

#[test]
fn a_reply_about_the_clients_data_in_the_database_says_which_restriction_applies() {
    // Under part 11.6 the bank "вправе приостановить"; if it does not,
    // the client's transfers to individuals are capped at 100,000 roubles
    // a month. ATM cash is capped either way (Banking Law art. 30 part
    // 16). The reply names the restrictions that apply and no other (the
    // Bank of Russia's letter No. IN-03-59/11: the kind of each
    // restriction and its legal ground), and the right to apply for
    // removal is owed for the cap too (the same letter).
    let mut case = database_case(false);
    if let Some(f) = case.database.as_mut() {
        f.instrument_suspended_on = None;
        f.transfers_capped_on = Some(d("2026-05-09"));
    }
    let c = clock(&case).unwrap();
    let mut reply = Reply {
        replied_on: d("2026-05-12"),
        grounds: vec![ground(Act::PaymentSystem, "9", "11.6")],
        reasons: vec![],
        next_steps: vec!["Ответьте на это письмо, если остались вопросы.".into()],
        client_options: vec![],
        stated_deadlines: vec![],
        // As if the card were suspended: the bank chose the cap instead.
        measures: vec![MeasureKind::SuspendInstrument],
        text: "Карта приостановлена. Сведения о вас есть в базе данных Банка России.".into(),
    };
    let findings = rubric(&reply, &case, &c);
    assert_eq!(
        codes(&findings),
        [
            ("client_option_missing", Some("apply_for_removal")),
            ("measure_not_taken", Some("suspend_instrument")),
            ("measure_missing", Some("cap_transfers")),
            ("measure_missing", Some("cap_atm_cash")),
        ]
    );
    assert_eq!(
        findings[1].basis().0,
        ariadne_rules::sources::PROACTIVE_LETTER
    );
    reply.measures = vec![MeasureKind::CapTransfers, MeasureKind::CapAtmCash];
    reply.client_options = vec![ClientOption::ApplyForRemoval];
    assert_eq!(rubric(&reply, &case, &c), []);
    // A suspended card: the cap must not be stated.
    let case = database_case(true);
    let c = clock(&case).unwrap();
    reply.grounds = vec![ground(Act::PaymentSystem, "9", "11.7")];
    assert_eq!(
        codes(&rubric(&reply, &case, &c)),
        [
            ("measure_missing", Some("suspend_instrument")),
            ("measure_not_taken", Some("cap_transfers")),
        ]
    );
    // An operation blocked on a sign carries no database restriction: the
    // rubric reads none.
    let case = antifraud_case();
    let c = clock(&case).unwrap();
    let mut good = good_antifraud_reply();
    assert_eq!(rubric(&good, &case, &c), []);
    good.measures = vec![MeasureKind::SuspendOrder];
    assert_eq!(rubric(&good, &case, &c), []);
}

#[test]
fn a_reply_states_the_restrictions_in_force_on_its_day_not_one_that_has_ended() {
    // The bank received the database information on Thursday 7 May 2026
    // and suspended the card under part 11.6 on Saturday 9 May. Until the
    // suspension the client's transfers were capped (part 11.6, sentence
    // 2); ATM cash is capped from the receipt (Banking Law art. 30 part
    // 16). A reply of 12 May states the suspension and the ATM cash cap:
    // the transfer cap ended with the suspension, and stating it is a
    // restriction that does not apply.
    let mut case = database_case(false);
    if let Some(f) = case.database.as_mut() {
        f.information_received_on = Some(d("2026-05-07"));
    }
    let c = clock(&case).unwrap();
    let mut reply = Reply {
        replied_on: d("2026-05-12"),
        grounds: vec![ground(Act::PaymentSystem, "9", "11.6")],
        reasons: vec![],
        next_steps: vec!["Ответьте на это письмо, если остались вопросы.".into()],
        client_options: vec![ClientOption::ApplyForRemoval],
        stated_deadlines: vec![],
        measures: vec![MeasureKind::SuspendInstrument, MeasureKind::CapAtmCash],
        text: "Карта приостановлена. Сведения о вас есть в базе данных Банка России.".into(),
    };
    assert_eq!(rubric(&reply, &case, &c), []);
    reply.measures.push(MeasureKind::CapTransfers);
    assert_eq!(
        codes(&rubric(&reply, &case, &c)),
        [("measure_not_taken", Some("cap_transfers"))]
    );
    // A reply written on 8 May, before the suspension, would state the
    // cap and not the suspension.
    reply.replied_on = d("2026-05-08");
    reply.measures = vec![MeasureKind::SuspendInstrument, MeasureKind::CapAtmCash];
    assert_eq!(
        codes(&rubric(&reply, &case, &c)),
        [
            ("measure_not_taken", Some("suspend_instrument")),
            ("measure_missing", Some("cap_transfers")),
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
fn a_refused_repeat_states_the_refusals_end_not_a_suspensions() {
    // A card operation refused on Friday 8 May 2026 under 161-FZ art. 8
    // part 3.4, sentence 2, repeated the same day and refused again after a
    // database match (part 3.10). A reply that day states when the next
    // repeat goes through (part 3.11): the two days are 8 and 9 May, so
    // from 10 May. It offers the repeat; nothing about a confirmation.
    let mut case = antifraud_case();
    case.antifraud = Some(AntifraudFacts {
        operation: Operation::CardSbpOrEmoney,
        confirmed_on: Some(d("2026-05-08")),
        database_match_after_confirmation: true,
        ..case.antifraud.unwrap()
    });
    let c = clock(&case).unwrap();
    let mut reply = good_antifraud_reply();
    reply.grounds = vec![
        ground(Act::PaymentSystem, "8", "3.4"),
        ground(Act::PaymentSystem, "8", "3.10"),
    ];
    reply.client_options = vec![ClientOption::RepeatOperation];
    reply.stated_deadlines = vec![StatedDeadline {
        kind: K::AntifraudRepeatRefusalEnds,
        due: d("2026-05-09"),
    }];
    assert_eq!(
        codes(&rubric(&reply, &case, &c)),
        [("deadline_missing", Some("antifraud_after_repeat_refusal"))]
    );
    reply.stated_deadlines.push(StatedDeadline {
        kind: K::AntifraudAfterRepeatRefusal,
        due: d("2026-05-10"),
    });
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
        commission_request_received_on: None,
        commission_request_working_days: None,
        commission_decided_on: None,
        high_risk_measures_on: None,
        high_risk_notice_received_on: None,
        rating_review_received_on: None,
    });
    let c = clock(&case).unwrap();
    let reply = Reply {
        replied_on: d("2026-05-05"),
        grounds: vec![ground(Act::AntiMoneyLaundering, "7", "11")],
        reasons: vec![Reason::Aml(AmlReason::OperationRefused)],
        next_steps: vec!["Пришлите документы о сделке.".into()],
        client_options: vec![ClientOption::SubmitDocuments],
        stated_deadlines: vec![],
        measures: vec![],
        text: "Мы отказали в операции по п. 11 ст. 7 Закона № 115-ФЗ. Пришлите документы о сделке."
            .into(),
    };
    assert_eq!(
        codes(&rubric(&reply, &case, &c)),
        [("client_option_missing", Some("apply_to_commission"))]
    );
}

#[test]
fn a_reply_states_when_the_bank_of_russia_reviews_a_rating() {
    // A legal entity asked the Bank of Russia to revise its high-risk
    // rating; the Bank of Russia received the application on Monday
    // 1 June 2026 and answers by 23 June (115-FZ art. 7.8 item 1.1). A
    // reply on 2 June that leaves the date out is flagged; with it, the
    // finding goes.
    let mut case = Case::new(Stream::AmlRefusal, d("2026-06-01"));
    case.applicant = ariadne_rules::clock::Applicant::LegalEntity;
    case.aml = Some(AmlFacts {
        decision: None,
        documents_submitted_on: None,
        commission_applied_on: None,
        commission_request_received_on: None,
        commission_request_working_days: None,
        commission_decided_on: None,
        high_risk_measures_on: None,
        high_risk_notice_received_on: None,
        rating_review_received_on: Some(d("2026-06-01")),
    });
    let c = clock(&case).unwrap();
    let mut reply = Reply {
        replied_on: d("2026-06-02"),
        grounds: vec![ground(Act::AntiMoneyLaundering, "7.8", "1.1")],
        reasons: vec![],
        next_steps: vec!["Дождитесь решения Банка России.".into()],
        client_options: vec![],
        stated_deadlines: vec![],
        measures: vec![],
        text: "Банк России рассмотрит ваше заявление. Дождитесь его решения.".into(),
    };
    assert_eq!(
        codes(&rubric(&reply, &case, &c)),
        [("deadline_missing", Some("high_risk_rating_review"))]
    );
    reply.stated_deadlines = vec![StatedDeadline {
        kind: K::HighRiskRatingReview,
        due: d("2026-06-23"),
    }];
    assert_eq!(rubric(&reply, &case, &c), []);
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
        measures: vec![],
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
        F::MeasureMissing,
        F::MeasureNotTaken,
        F::TextEmpty,
        F::SentenceTooLong,
        F::SentencesLongOnAverage,
    ] {
        let (source, reference) = f.basis();
        assert!(ariadne_rules::sources::ALL.contains(&source), "{f:?}");
        assert!(!reference.is_empty());
    }
    for o in ClientOption::ALL {
        if let Some((source, reference)) = o.basis() {
            assert!(ariadne_rules::sources::ALL.contains(&source), "{o:?}");
            assert!(!reference.is_empty());
        }
        assert_eq!(ClientOption::parse(o.code()), Ok(o));
    }
}

#[test]
fn the_word_limits_are_the_set_values_and_the_readme_says_so() {
    // 25 words a sentence at most and 15 on average: the values this
    // project sets, with no number in any source. The README states them
    // as the code has them, as set values that remain hypotheses. Its
    // line breaks (LF, or CRLF in a Windows checkout) read as spaces.
    assert_eq!((MAX_SENTENCE_WORDS, MAX_MEAN_SENTENCE_WORDS), (25, 15));
    let readme = include_str!("../README.md")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    for said in [
        format!(
            "The word limits, {MAX_SENTENCE_WORDS} words a sentence at most and {MAX_MEAN_SENTENCE_WORDS} on average, are the values this project sets"
        ),
        "remain hypotheses to calibrate on real replies".to_string(),
        format!(
            "a sentence of more than {MAX_SENTENCE_WORDS} words; more than {MAX_MEAN_SENTENCE_WORDS} words a sentence on average"
        ),
    ] {
        assert!(readme.contains(&said), "{said}");
    }
}
