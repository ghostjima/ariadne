//! The provision behind every option, deadline and restriction a reply
//! states, and behind every finding about one: its own act, article and
//! part, read in the texts on 2026-10-10. The Bank of Russia's letters stay
//! the source of the duty to state them.

use ariadne_rules::clock::{
    clock, reply_content_basis, AmlDecisionKind, AmlFacts, AntifraudFacts, Applicant, Basis, Case,
    DatabaseFacts, DeadlineKind as K, MeasureKind, MoneyClaim, Operation, Reading, Sector, Stream,
};
use ariadne_rules::rubric::{
    bank_of_russia_complaint, client_options, deadline_provision, reply_provisions, rubric,
    ClientOption as O, FindingCode as F, Reply,
};
use ariadne_rules::{sources, Date};

fn d(s: &str) -> Date {
    Date::parse(s).unwrap()
}

/// A basis as (source id, article, part).
fn cite(b: Basis) -> (&'static str, &'static str, &'static str) {
    (b.source.id, b.article, b.part)
}

fn block(operation: Operation, database_match: bool) -> Case {
    let mut case = Case::new(Stream::Antifraud, d("2026-05-08"));
    case.antifraud = Some(AntifraudFacts {
        operation,
        stopped_on: d("2026-05-08"),
        confirmed_on: database_match.then(|| d("2026-05-08")),
        database_match_after_confirmation: database_match,
        refund_claim_received_on: None,
    });
    case
}

fn aml(facts: impl FnOnce(&mut AmlFacts)) -> Case {
    let mut case = Case::new(Stream::AmlRefusal, d("2026-05-04"));
    case.applicant = Applicant::LegalEntity;
    let mut f = AmlFacts {
        decision: None,
        documents_submitted_on: None,
        commission_applied_on: None,
        commission_request_received_on: None,
        commission_request_working_days: None,
        commission_decided_on: None,
        high_risk_measures_on: None,
        high_risk_notice_received_on: None,
        rating_review_received_on: None,
    };
    facts(&mut f);
    case.aml = Some(f);
    case
}

fn database(facts: impl FnOnce(&mut DatabaseFacts)) -> Case {
    let mut case = Case::new(Stream::Antifraud, d("2026-05-12"));
    let mut f = DatabaseFacts {
        information_received_on: Some(d("2026-05-09")),
        instrument_suspended_on: Some(d("2026-05-09")),
        suspension_lifted_on: None,
        transfers_capped_on: None,
        police_information: false,
        data_removed_on: None,
        exclusion_received_by_operator_on: None,
        exclusion_data_missing: false,
        exclusion_received_by_bank_of_russia_on: None,
        exclusion_decision_received_on: None,
        bank_of_russia_query_received_on: None,
        operator_application_sent_on: None,
    };
    facts(&mut f);
    case.database = Some(f);
    case
}

fn options(
    case: &Case,
    on: &str,
) -> Vec<(&'static str, (&'static str, &'static str, &'static str))> {
    client_options(case, &clock(case).unwrap(), d(on))
        .into_iter()
        .map(|o| (o.option.code(), cite(o.basis)))
        .collect()
}

fn empty_reply(on: &str) -> Reply {
    Reply {
        replied_on: d(on),
        grounds: vec![],
        reasons: vec![],
        next_steps: vec![],
        client_options: vec![],
        stated_deadlines: vec![],
        measures: vec![],
        text: String::new(),
    }
}

#[test]
fn every_option_cites_the_provision_that_gives_it_in_the_case() {
    // 161-FZ art. 8 part 3.6 item 3: "о возможности клиента подтвердить
    // распоряжение ..., или о возможности совершения клиентом повторной
    // операции".
    assert_eq!(
        options(&block(Operation::Transfer, false), "2026-05-08"),
        [("confirm_order", ("payment_law_8", "8", "3.6, item 3"))]
    );
    assert_eq!(
        options(&block(Operation::CardSbpOrEmoney, false), "2026-05-08"),
        [("repeat_operation", ("payment_law_8", "8", "3.6, item 3"))]
    );
    // After the second refusal the repeat is part 3.10's: "а также о
    // возможности совершения клиентом последующей повторной операции".
    assert_eq!(
        options(&block(Operation::CardSbpOrEmoney, true), "2026-05-08"),
        [(
            "repeat_operation",
            ("payment_law_8", "8", "3.10, sentence 2")
        )]
    );
    assert_eq!(
        options(&block(Operation::Transfer, true), "2026-05-08"),
        [
            ("confirm_order", ("payment_law_8", "8", "3.6, item 3")),
            (
                "repeat_operation",
                ("payment_law_8", "8", "3.10, sentence 2")
            )
        ]
    );
    // 115-FZ art. 7 item 13.4: "клиент ... вправе представить в эту
    // организацию документы и (или) сведения"; item 13.5: "вправе
    // обратиться с заявлением ... в межведомственную комиссию".
    let refused = aml(|f| f.decision = Some((AmlDecisionKind::RefuseOperation, d("2026-04-30"))));
    assert_eq!(
        options(&refused, "2026-05-05"),
        [
            ("submit_documents", ("aml_law_7", "7", "13.4, paragraph 1")),
            (
                "apply_to_commission",
                ("aml_law_7", "7", "13.5, paragraph 1")
            )
        ]
    );
    // Against the measures for a high-risk client the commission is art.
    // 7.8 item 1's: "заявитель вправе обратиться с заявлением об
    // отсутствии оснований для применения к нему мер".
    let high_risk = aml(|f| f.high_risk_measures_on = Some(d("2026-04-30")));
    assert_eq!(
        options(&high_risk, "2026-05-05"),
        [("apply_to_commission", ("aml_law_7_8", "7.8", "1"))]
    );
    // A terminated contract has neither under item 13.4.
    let terminated =
        aml(|f| f.decision = Some((AmlDecisionKind::TerminateAccount, d("2026-04-30"))));
    assert_eq!(options(&terminated, "2026-05-05"), []);
    // 123-FZ art. 16 part 4: "вправе направить обращение финансовому
    // уполномоченному после получения ответа финансовой организации".
    let mut claim = Case::new(Stream::MoneyClaim, d("2026-04-27"));
    claim.money_claim = Some(MoneyClaim {
        kopecks: 5_000_000,
        standard_form: false,
        breach_on: None,
    });
    assert_eq!(
        options(&claim, "2026-05-20"),
        [("apply_to_ombudsman", ("ombudsman_law_16", "16", "4"))]
    );
    // 161-FZ art. 9 part 11.8: "о праве клиента подать ... заявление в
    // Банк России ... об исключении сведений".
    assert_eq!(
        options(&database(|_| {}), "2026-05-12"),
        [("apply_for_removal", ("payment_law_9", "9", "11.8"))]
    );
    // Between them the cases above give every option the engine knows,
    // and every provision is read as the text has it.
    let seen: Vec<&str> = [
        block(Operation::Transfer, true),
        refused,
        claim,
        database(|_| {}),
    ]
    .iter()
    .flat_map(|c| client_options(c, &clock(c).unwrap(), d("2026-05-20")))
    .inspect(|o| {
        assert_eq!(o.basis.reading, Reading::Text);
        assert!(sources::ALL.contains(&o.basis.source));
        assert!(!o.basis.article.is_empty() && !o.basis.part.is_empty());
    })
    .map(|o| o.option.code())
    .collect();
    for option in O::ALL {
        assert!(seen.contains(&option.code()), "{}", option.code());
    }
}

#[test]
fn a_finding_carries_the_provision_of_what_is_missing_beside_the_source_of_the_duty_to_state_it() {
    // A suspended transfer answered with nothing: the missing option and
    // each missing deadline cite their own provision; the duty to state
    // them stays the Bank of Russia's letter and its page on replies.
    let case = block(Operation::Transfer, false);
    let c = clock(&case).unwrap();
    let found = rubric(&empty_reply("2026-05-08"), &case, &c);
    let of = |code: F, subject: Option<&str>| {
        found
            .iter()
            .find(|f| f.code == code && f.subject == subject)
            .unwrap_or_else(|| panic!("no {code:?} {subject:?}"))
    };
    let option = of(F::ClientOptionMissing, Some("confirm_order"));
    assert_eq!(
        option.provision.map(cite),
        Some(("payment_law_8", "8", "3.6, item 3"))
    );
    assert_eq!(option.basis().0, sources::RESTRICTIONS_LETTER);
    let confirmation = of(F::DeadlineMissing, Some("antifraud_confirmation"));
    assert_eq!(
        confirmation.provision.map(cite),
        Some(("payment_law_8", "8", "3.6, item 3"))
    );
    assert_eq!(confirmation.basis().0, sources::BANK_OF_RUSSIA_REPLY_PAGE);
    // The two days of the suspension are the statute's; the letter the
    // clock cites says how they are counted.
    let ends = of(F::DeadlineMissing, Some("antifraud_suspension_ends"));
    assert_eq!(
        ends.provision.map(cite),
        Some(("payment_law_8", "8", "3.4, sentence 1"))
    );
    assert_eq!(
        cite(c.deadline(K::AntifraudSuspensionEnds).unwrap().basis),
        ("letter_010_31_7975", "8", "3.4")
    );
    // No ground named: the complaint article's part on what a reply
    // contains, the bank's here.
    assert_eq!(
        of(F::GroundMissing, None).provision.map(cite),
        Some(("banking_law_30_1", "30.1", "9"))
    );
    // The findings about the text and the stream have no provision.
    assert_eq!(of(F::StreamGroundMissing, None).provision, None);
    assert_eq!(of(F::TextEmpty, None).provision, None);

    // The client's data in the database, the bank's choice of the cap: a
    // restriction left out cites its own ground; one stated that does not
    // apply has none.
    let case = database(|f| {
        f.instrument_suspended_on = None;
        f.transfers_capped_on = Some(d("2026-05-09"));
    });
    let c = clock(&case).unwrap();
    let mut reply = empty_reply("2026-05-12");
    reply.measures = vec![MeasureKind::SuspendInstrument];
    let found = rubric(&reply, &case, &c);
    let measure = |code: F, subject: &str| {
        found
            .iter()
            .find(|f| f.code == code && f.subject == Some(subject))
            .unwrap()
    };
    assert_eq!(
        measure(F::MeasureMissing, "cap_transfers")
            .provision
            .map(cite),
        Some(("payment_law_9", "9", "11.6, sentence 2"))
    );
    assert_eq!(
        measure(F::MeasureMissing, "cap_atm_cash")
            .provision
            .map(cite),
        Some(("banking_law_30", "30", "16"))
    );
    assert_eq!(
        measure(F::MeasureNotTaken, "suspend_instrument").provision,
        None
    );
    assert_eq!(
        measure(F::MeasureMissing, "cap_atm_cash").basis().0,
        sources::PROACTIVE_LETTER
    );
    // The removal option keeps the statute as the source of the duty to
    // state it, and has the same part as its own provision.
    let removal = measure(F::ClientOptionMissing, "apply_for_removal");
    assert_eq!(removal.basis().0, sources::PAYMENT_LAW_9);
    assert_eq!(
        removal.provision.map(cite),
        Some(("payment_law_9", "9", "11.8"))
    );
}

#[test]
fn what_a_reply_must_contain_is_each_sectors_own_part() {
    // "Ответ на обращение должен содержать информацию о результатах
    // объективного и всестороннего рассмотрения обращения, быть
    // обоснованным и включать ссылки на имеющие отношение к
    // рассматриваемому в обращении вопросу требования законодательства
    // Российской Федерации".
    for (sector, expected) in [
        (Sector::Bank, ("banking_law_30_1", "30.1", "9")),
        (Sector::Microfinance, ("microfinance_law_9_1", "9.1", "9")),
        (Sector::Insurer, ("insurance_law_6_2", "6.2", "6")),
        (
            Sector::SecuritiesProfessional,
            ("securities_law_15_11", "15.11", "4"),
        ),
        (
            Sector::CreditCooperative,
            ("credit_cooperation_law_6_2", "6.2", "8"),
        ),
    ] {
        assert_eq!(cite(reply_content_basis(sector)), expected);
        let mut case = Case::new(Stream::General, d("2026-05-12"));
        case.sector = sector;
        let c = clock(&case).unwrap();
        let found = rubric(&empty_reply("2026-05-12"), &case, &c);
        let ground = found.iter().find(|f| f.code == F::GroundMissing).unwrap();
        assert_eq!(ground.provision.map(cite), Some(expected));
    }
}

#[test]
fn the_provisions_of_a_reply_cover_what_it_states_and_nothing_that_has_ended() {
    // The bank received the database information on Thursday 7 May 2026
    // and suspended the card on Saturday 9 May; the Bank of Russia
    // received the client's application on 12 May and decides by 2 June.
    let case = database(|f| {
        f.information_received_on = Some(d("2026-05-07"));
        f.exclusion_received_by_operator_on = Some(d("2026-05-08"));
        f.exclusion_received_by_bank_of_russia_on = Some(d("2026-05-12"));
    });
    let c = clock(&case).unwrap();
    let p = reply_provisions(&case, &c, d("2026-05-12"));
    assert_eq!(
        p.options
            .iter()
            .map(|o| (o.option.code(), cite(o.basis)))
            .collect::<Vec<_>>(),
        [("apply_for_removal", ("payment_law_9", "9", "11.8"))]
    );
    // The Bank of Russia's 15 working days are the statute's, part 11.10;
    // the directive the clock cites says from which day.
    assert_eq!(
        p.deadlines
            .iter()
            .map(|x| (x.kind.code(), cite(x.basis)))
            .collect::<Vec<_>>(),
        [("exclusion_decision", ("payment_law_9", "9", "11.10"))]
    );
    assert_eq!(
        cite(c.deadline(K::ExclusionDecision).unwrap().basis),
        ("directive_6748_u", "", "2.1, 2.3, 2.4")
    );
    assert_eq!(
        deadline_provision(c.deadline(K::ExclusionDecision).unwrap()).reading,
        Reading::Text
    );
    // The transfer cap that ran on 7 and 8 May has ended: the reply of 12
    // May states the suspension and the ATM cash cap.
    assert_eq!(
        p.measures
            .iter()
            .map(|m| (m.kind.code(), cite(m.basis)))
            .collect::<Vec<_>>(),
        [
            ("suspend_instrument", ("payment_law_9", "9", "11.6")),
            ("cap_atm_cash", ("banking_law_30", "30", "16"))
        ]
    );
    assert_eq!(cite(p.content), ("banking_law_30_1", "30.1", "9"));
    // "Поступившее в Банк России обращение физического лица ...": an
    // individual's complaint to the Bank of Russia is art. 79.3's; no
    // provision was found for a legal entity's.
    assert_eq!(
        p.complaint_to_bank_of_russia.map(cite),
        Some(("central_bank_law_79_3", "79.3", "1"))
    );
    let mut company = case;
    company.applicant = Applicant::LegalEntity;
    assert_eq!(bank_of_russia_complaint(&company), None);
    // Once the data have left the database no restriction is stated.
    let removed = database(|f| f.data_removed_on = Some(d("2026-05-11")));
    let c = clock(&removed).unwrap();
    let p = reply_provisions(&removed, &c, d("2026-05-12"));
    assert!(p.measures.is_empty() && p.options.is_empty());
    // A deadline that ended before the reply is not among them.
    let case = block(Operation::Transfer, false);
    let c = clock(&case).unwrap();
    assert!(reply_provisions(&case, &c, d("2026-05-20"))
        .deadlines
        .is_empty());
    assert_eq!(
        reply_provisions(&case, &c, d("2026-05-08")).deadlines.len(),
        2
    );
}
