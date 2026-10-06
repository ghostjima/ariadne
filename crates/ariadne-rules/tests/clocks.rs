//! The legal clocks: worked examples written by hand, the counting in the
//! comments, and properties over every day of the calendar.

use ariadne_rules::calendar;
use ariadne_rules::clock::{
    clock, AmlDecisionKind, AmlFacts, AntifraudFacts, Applicant, Case, Clock, Count, DatabaseFacts,
    DeadlineKind as K, DutyKind, Extension, ExtensionGround, MeasureKind as M, MoneyClaim,
    Operation, Origin, Reading, Refusal, Regime, Sector, Stream, Warning, When,
    OMBUDSMAN_LIMIT_KOPECKS,
};
use ariadne_rules::{sources, Date, Error};

fn d(s: &str) -> Date {
    Date::parse(s).unwrap()
}

fn due(c: &Clock, kind: K) -> String {
    c.deadline(kind)
        .unwrap_or_else(|| panic!("no {kind:?} in {c:?}"))
        .due
        .to_string()
}

fn claim(roubles: u64, standard_form: bool, breach_on: Option<&str>) -> MoneyClaim {
    MoneyClaim {
        kopecks: roubles * 100,
        standard_form,
        breach_on: breach_on.map(d),
    }
}

fn no_aml() -> AmlFacts {
    AmlFacts {
        decision: None,
        documents_submitted_on: None,
        commission_applied_on: None,
        high_risk_measures_on: None,
        high_risk_notice_received_on: None,
    }
}

fn block(operation: Operation, stopped: &str) -> AntifraudFacts {
    AntifraudFacts {
        operation,
        stopped_on: d(stopped),
        confirmed_on: None,
        database_match_after_confirmation: false,
        refund_claim_received_on: None,
    }
}

fn no_database() -> DatabaseFacts {
    DatabaseFacts {
        instrument_suspended_on: None,
        police_information: false,
        data_removed_on: None,
        exclusion_received_by_operator_on: None,
        exclusion_data_missing: false,
        exclusion_received_by_bank_of_russia_on: None,
        exclusion_decision_received_on: None,
        bank_of_russia_query_received_on: None,
    }
}

/// The measures of a clock, as (code, day, part).
fn measures(c: &Clock) -> Vec<(&'static str, String, &'static str)> {
    c.measures
        .iter()
        .map(|m| (m.kind.code(), m.on.to_string(), m.basis.part))
        .collect()
}

#[test]
fn complaint_received_before_the_may_holidays() {
    // A bank, an electronic complaint received on Friday 8 May 2026, no
    // registration day given. Registration is due the working day after
    // receipt: 9 May is a holiday, 10 May a Sunday, 11 May the day off moved
    // from 9 May, so Tuesday 12 May. The earliest registration is the day
    // of receipt itself, which is assumed: the notice is due on 8 May and
    // the reply 15 working days after it: 12 to 15 May (4), 18 to 22 (9),
    // 25 to 29 (14), Monday 1 June (15).
    let mut case = Case::new(Stream::General, d("2026-05-08"));
    case.electronic = true;
    let c = clock(&case).unwrap();
    assert_eq!(c.regime, Regime::Complaint);
    assert_eq!(due(&c, K::Registration), "2026-05-12");
    assert_eq!(due(&c, K::RegistrationNotice), "2026-05-08");
    assert_eq!(due(&c, K::Reply), "2026-06-01");
    assert_eq!(c.warnings, [Warning::RegistrationDateAssumed]);
    let reply = c.deadline(K::Reply).unwrap();
    assert_eq!(reply.count, Count::WorkingDays(15));
    assert_eq!(reply.basis.source, sources::BANKING_LAW_30_1);
    assert_eq!((reply.basis.article, reply.basis.part), ("30.1", "7"));
    assert_eq!(reply.basis.reading, Reading::Text);
}

#[test]
fn forwarded_complaint_with_an_extension_to_obtain_documents() {
    // Forwarded by the Bank of Russia, registered on Tuesday 12 May 2026.
    // Reply: 13 to 15 May (3), 18 to 22 (8), 25 to 29 (13), 1 and 2 June
    // (15): 2 June. The extension notice is due by then. Ten more working
    // days: 3 to 5 June (18), 8 to 11 June (22; 12 June is a holiday,
    // 13 and 14 a weekend), 15 to 17 June (25): 17 June.
    let mut case = Case::new(Stream::Antifraud, d("2026-05-08"));
    case.registered_on = Some(d("2026-05-12"));
    case.origin = Origin::ForwardedByBankOfRussia;
    case.extension = Some(Extension {
        ground: ExtensionGround::RequestDocuments,
        working_days: 10,
    });
    let c = clock(&case).unwrap();
    assert_eq!(due(&c, K::Reply), "2026-06-02");
    assert_eq!(due(&c, K::ExtensionNotice), "2026-06-02");
    assert_eq!(due(&c, K::ReplyExtended), "2026-06-17");
    assert_eq!(c.reply_due(), Some(d("2026-06-17")));
    assert_eq!(
        c.deadline(K::ExtensionNotice).unwrap().basis.reading,
        Reading::Conservative
    );
    assert_eq!(
        c.deadline(K::ReplyExtended).unwrap().count,
        Count::WorkingDays(25)
    );
    assert!(c.warnings.is_empty() && c.refusals.is_empty(), "{c:?}");
    let copy = c.duties[0];
    assert_eq!(copy.kind, DutyKind::CopyToBankOfRussia);
    assert_eq!(copy.when, When::SameDayAsEachDispatch);
    assert_eq!((copy.basis.article, copy.basis.part), ("30.1", "15"));
}

#[test]
fn extensions_the_law_does_not_allow_are_refused() {
    let mut case = Case::new(Stream::General, d("2026-05-12"));
    // Any ground other than requesting documents.
    case.extension = Some(Extension {
        ground: ExtensionGround::Other,
        working_days: 5,
    });
    let c = clock(&case).unwrap();
    assert_eq!(c.refusals, [Refusal::ExtensionGroundNotAllowed]);
    assert!(c.deadline(K::ReplyExtended).is_none());
    // More than ten working days.
    case.extension = Some(Extension {
        ground: ExtensionGround::RequestDocuments,
        working_days: 11,
    });
    let c = clock(&case).unwrap();
    assert_eq!(c.refusals, [Refusal::ExtensionTooLong]);
    assert!(c.deadline(K::ReplyExtended).is_none());
    // Zero days is not an extension at all.
    case.extension = Some(Extension {
        ground: ExtensionGround::RequestDocuments,
        working_days: 0,
    });
    assert_eq!(clock(&case), Err(Error::InvalidExtension));
}

#[test]
fn money_claim_on_the_standard_form_within_180_days() {
    // 120,000 roubles from an individual, on the standard electronic form,
    // received on Monday 27 April 2026; the breach on 1 March is 57 days
    // earlier (31 days of March, 26 of April). 123-FZ art. 16 part 2 item 1:
    // 15 working days from receipt: 28 to 30 April (3), 4 to 8 May (8), 12
    // to 15 May (12), 18 to 20 May (15): 20 May. The extension asked for is
    // refused, and no extended date exists.
    let mut case = Case::new(Stream::MoneyClaim, d("2026-04-27"));
    case.money_claim = Some(claim(120_000, true, Some("2026-03-01")));
    case.extension = Some(Extension {
        ground: ExtensionGround::RequestDocuments,
        working_days: 10,
    });
    let c = clock(&case).unwrap();
    assert_eq!(c.regime, Regime::OmbudsmanClaim);
    assert_eq!(due(&c, K::Reply), "2026-05-20");
    let reply = c.deadline(K::Reply).unwrap();
    assert_eq!(reply.basis.source, sources::OMBUDSMAN_LAW_16);
    assert_eq!(reply.basis.part, "2, item 1");
    assert_eq!(reply.from, d("2026-04-27"));
    assert_eq!(c.refusals, [Refusal::ExtensionNotAllowed]);
    assert!(c.deadline(K::ReplyExtended).is_none());
    assert!(c.deadline(K::ExtensionNotice).is_none());
    // Registration is still due the next working day, 28 April, kept as
    // the conservative reading: 123-FZ sets no registration term.
    assert_eq!(due(&c, K::Registration), "2026-04-28");
    assert_eq!(
        c.deadline(K::Registration).unwrap().basis.reading,
        Reading::Conservative
    );
}

#[test]
fn money_claim_otherwise_has_30_calendar_days_moved_off_a_day_off() {
    // Not on the standard form, received 27 April 2026: 30 days later is
    // Wednesday 27 May, a working day.
    let mut case = Case::new(Stream::MoneyClaim, d("2026-04-27"));
    case.money_claim = Some(claim(120_000, false, None));
    let c = clock(&case).unwrap();
    assert_eq!(due(&c, K::Reply), "2026-05-27");
    assert_eq!(
        c.deadline(K::Reply).unwrap().count,
        Count::CalendarDaysToWorkingDay(30)
    );
    // Received Thursday 9 April 2026: 30 days later is Saturday 9 May, a
    // holiday; 10 May is a Sunday and 11 May a moved day off, so the term
    // ends on Tuesday 12 May.
    case.received_on = d("2026-04-09");
    assert_eq!(due(&clock(&case).unwrap(), K::Reply), "2026-05-12");
}

#[test]
fn the_180_day_window_is_inclusive() {
    // Received 1 July 2026. A breach on 2 January is 180 days earlier
    // (30 + 28 + 31 + 30 + 31 + 30): 15 working days, 2 and 3 July (2),
    // 6 to 10 (7), 13 to 17 (12), 20 to 22 July (15). A breach on 1 January
    // is 181 days earlier: 30 calendar days, Friday 31 July.
    let mut case = Case::new(Stream::MoneyClaim, d("2026-07-01"));
    case.money_claim = Some(claim(10_000, true, Some("2026-01-02")));
    assert_eq!(due(&clock(&case).unwrap(), K::Reply), "2026-07-22");
    case.money_claim = Some(claim(10_000, true, Some("2026-01-01")));
    assert_eq!(due(&clock(&case).unwrap(), K::Reply), "2026-07-31");
}

#[test]
fn the_standard_form_can_end_later_than_30_days() {
    // Received Thursday 11 December 2025 on the standard form, the breach
    // the same day: 15 working days, 12 (1), 15 to 19 (6), 22 to 26 (11),
    // 29 and 30 December (13), then 12 and 13 January 2026 (15). Thirty
    // calendar days would have ended on Saturday 10 January, moved to
    // Monday 12 January; the text gives the 15 working days, and so does
    // the engine.
    let mut case = Case::new(Stream::MoneyClaim, d("2025-12-11"));
    case.money_claim = Some(claim(10_000, true, Some("2025-12-11")));
    assert_eq!(due(&clock(&case).unwrap(), K::Reply), "2026-01-13");
}

#[test]
fn unknown_breach_date_takes_the_earlier_term() {
    // Standard form, received Monday 22 December 2025, breach day unknown.
    // 15 working days end on 22 January 2026 (the New Year holidays do not
    // count); 30 calendar days end on Wednesday 21 January. The earlier,
    // 21 January, applies, flagged as a conservative reading.
    let mut case = Case::new(Stream::MoneyClaim, d("2025-12-22"));
    case.money_claim = Some(claim(10_000, true, None));
    let c = clock(&case).unwrap();
    assert_eq!(due(&c, K::Reply), "2026-01-21");
    assert_eq!(
        c.deadline(K::Reply).unwrap().basis.reading,
        Reading::Conservative
    );
    assert!(c.warnings.contains(&Warning::BreachDateUnknown));
}

#[test]
fn the_ombudsman_limit_is_500000_roubles_inclusive() {
    let mut case = Case::new(Stream::MoneyClaim, d("2026-04-27"));
    case.money_claim = Some(MoneyClaim {
        kopecks: OMBUDSMAN_LIMIT_KOPECKS,
        standard_form: false,
        breach_on: None,
    });
    assert_eq!(clock(&case).unwrap().regime, Regime::OmbudsmanClaim);
    // One kopeck more: the complaint article's 15 working days from the
    // assumed registration on 27 April, 20 May, and a warning.
    case.money_claim = Some(MoneyClaim {
        kopecks: OMBUDSMAN_LIMIT_KOPECKS + 1,
        standard_form: false,
        breach_on: None,
    });
    let c = clock(&case).unwrap();
    assert_eq!(c.regime, Regime::Complaint);
    assert_eq!(due(&c, K::Reply), "2026-05-20");
    assert!(c.warnings.contains(&Warning::MoneyClaimOutsideOmbudsman));
    // A money claim stream with no amount at all.
    case.money_claim = None;
    assert!(clock(&case)
        .unwrap()
        .warnings
        .contains(&Warning::MoneyClaimOutsideOmbudsman));
}

#[test]
fn a_legal_entity_is_not_a_consumer_under_123_fz() {
    let mut case = Case::new(Stream::MoneyClaim, d("2026-04-27"));
    case.applicant = Applicant::LegalEntity;
    case.money_claim = Some(claim(1_000, false, None));
    let c = clock(&case).unwrap();
    assert_eq!(c.regime, Regime::Complaint);
    assert!(c.warnings.contains(&Warning::MoneyClaimFromLegalEntity));
}

#[test]
fn a_securities_professional_gets_the_earlier_term_and_no_extension() {
    // Whether it joined the ombudsman's procedure is unknown. Received
    // 27 April 2026 off the standard form: 30 calendar days end on 27 May,
    // 15 working days after the assumed registration on 27 April end on
    // 20 May; 20 May applies, and the extension is refused all the same.
    let mut case = Case::new(Stream::MoneyClaim, d("2026-04-27"));
    case.sector = Sector::SecuritiesProfessional;
    case.money_claim = Some(claim(1_000, false, None));
    case.extension = Some(Extension {
        ground: ExtensionGround::RequestDocuments,
        working_days: 10,
    });
    let c = clock(&case).unwrap();
    assert_eq!(due(&c, K::Reply), "2026-05-20");
    let reply = c.deadline(K::Reply).unwrap();
    assert_eq!(reply.basis.source, sources::SECURITIES_LAW_15_11);
    assert_eq!(reply.basis.reading, Reading::Conservative);
    assert!(c.warnings.contains(&Warning::OmbudsmanParticipationUnknown));
    assert_eq!(c.refusals, [Refusal::ExtensionNotAllowed]);
}

#[test]
fn sro_copies_for_the_sectors_that_have_them() {
    let mut case = Case::new(Stream::General, d("2026-05-12"));
    case.standard_breach_found = true;
    for (sector, article, part) in [
        (Sector::Microfinance, "9.1", "12"),
        (Sector::Insurer, "6.2", "8"),
        (Sector::SecuritiesProfessional, "15.11", "5"),
        (Sector::CreditCooperative, "6.2", "10"),
    ] {
        case.sector = sector;
        let c = clock(&case).unwrap();
        let duty = c
            .duties
            .iter()
            .find(|x| x.kind == DutyKind::CopyToSro)
            .unwrap();
        assert_eq!(duty.when, When::SameDayAsReply);
        assert_eq!((duty.basis.article, duty.basis.part), (article, part));
    }
    // A bank has no self-regulatory organisation under the Banking Law.
    case.sector = Sector::Bank;
    let c = clock(&case).unwrap();
    assert!(c.duties.is_empty());
    assert!(c.warnings.contains(&Warning::SroCopyNotApplicable));
}

#[test]
fn each_sector_cites_its_own_article() {
    for (sector, article, registration, reply) in [
        (Sector::Bank, "30.1", "5", "7"),
        (Sector::Microfinance, "9.1", "5", "7"),
        (Sector::Insurer, "6.2", "3", "5, paragraph 1"),
        (Sector::SecuritiesProfessional, "15.11", "1", "2"),
        (Sector::CreditCooperative, "6.2", "5", "6"),
    ] {
        let mut case = Case::new(Stream::General, d("2026-05-12"));
        case.sector = sector;
        let c = clock(&case).unwrap();
        let r = c.deadline(K::Registration).unwrap().basis;
        let p = c.deadline(K::Reply).unwrap().basis;
        assert_eq!((r.article, r.part), (article, registration), "{sector:?}");
        assert_eq!((p.article, p.part), (article, reply), "{sector:?}");
    }
}

#[test]
fn registration_late_or_out_of_order() {
    // Received Friday 8 May 2026, due for registration on 12 May.
    let mut case = Case::new(Stream::General, d("2026-05-08"));
    case.registered_on = Some(d("2026-05-13"));
    assert!(clock(&case)
        .unwrap()
        .warnings
        .contains(&Warning::RegisteredLate));
    case.registered_on = Some(d("2026-05-07"));
    assert_eq!(clock(&case), Err(Error::DatesOutOfOrder));
    // Received on the last covered working day: the registration day
    // would be in 2028.
    let case = Case::new(Stream::General, d("2027-12-30"));
    assert_eq!(clock(&case), Err(Error::OutsideCalendar));
}

#[test]
fn antifraud_transfer_suspended_confirmed_and_suspended_again() {
    // A transfer order suspended on Friday 8 May 2026. The two days count
    // from and including that day, in calendar days: they end on Saturday
    // 9 May, a holiday, which does not matter. The client may confirm by
    // 9 May. Confirmed on 9 May; then a match in the Bank of Russia's
    // database suspends the order again for two days from and including
    // 9 May, to Sunday 10 May; on 11 May it is executed at once.
    let mut case = Case::new(Stream::Antifraud, d("2026-05-12"));
    let mut f = block(Operation::Transfer, "2026-05-08");
    f.confirmed_on = Some(d("2026-05-09"));
    f.database_match_after_confirmation = true;
    case.antifraud = Some(f);
    let c = clock(&case).unwrap();
    assert_eq!(due(&c, K::AntifraudSuspensionEnds), "2026-05-09");
    assert_eq!(due(&c, K::AntifraudConfirmation), "2026-05-09");
    assert_eq!(due(&c, K::AntifraudRepeatSuspensionEnds), "2026-05-10");
    assert_eq!(due(&c, K::AntifraudAfterRepeatSuspension), "2026-05-11");
    let kinds: Vec<_> = c.duties.iter().map(|x| x.kind).collect();
    assert_eq!(
        kinds,
        [
            DutyKind::NotifyClientOfBlock,
            DutyKind::NotifyClientOfRepeatBlock
        ]
    );
    assert!(c.duties.iter().all(|x| x.when == When::Immediately));
    let parts: Vec<_> = c.duties.iter().map(|x| x.basis.part).collect();
    assert_eq!(parts, ["3.6, items 1 to 3", "3.10, sentence 2"]);
    // The first action rests on part 3.4, sentence 1; the second, after
    // the confirmation, on part 3.10.
    assert_eq!(
        measures(&c),
        [
            ("suspend_order", "2026-05-08".into(), "3.4, sentence 1"),
            (
                "suspend_confirmed_order",
                "2026-05-09".into(),
                "3.10, sentence 1"
            ),
        ]
    );
    assert_eq!(
        c.deadline(K::AntifraudSuspensionEnds).unwrap().basis.source,
        sources::ANTIFRAUD_TERMS_LETTER
    );
    assert!(c.deadline(K::AntifraudRepeatRefusalEnds).is_none());
    assert!(c.warnings.is_empty() || c.warnings == [Warning::RegistrationDateAssumed]);

    // Confirmed on Sunday 10 May: too late, the order counts as not
    // accepted from 10 May, the first day after the window (part 3.9), and
    // the database match suspends nothing: there is no confirmed order.
    f.confirmed_on = Some(d("2026-05-10"));
    case.antifraud = Some(f);
    let c = clock(&case).unwrap();
    assert!(c.warnings.contains(&Warning::ConfirmationLate));
    assert_eq!(
        measures(&c),
        [
            ("suspend_order", "2026-05-08".into(), "3.4, sentence 1"),
            ("order_not_accepted", "2026-05-10".into(), "3.9"),
        ]
    );
    assert!(c.deadline(K::AntifraudRepeatSuspensionEnds).is_none());
    assert!(c.deadline(K::AntifraudAfterRepeatSuspension).is_none());
    assert_eq!(c.duties.len(), 1);
    // Confirmed before the block: an error.
    f.confirmed_on = Some(d("2026-05-07"));
    case.antifraud = Some(f);
    assert_eq!(clock(&case), Err(Error::DatesOutOfOrder));
}

#[test]
fn antifraud_card_payment_is_refused_not_suspended() {
    // A card, e-money or Faster Payments operation refused on Friday 8 May
    // 2026: the first refusal rests on part 3.4, sentence 2, not on part
    // 3.10. No two-day suspension and no confirmation term; the client may
    // repeat it. A repeat the same day that meets a database match is
    // refused (part 3.10, sentence 1); the two days of part 3.11 are 8 and
    // 9 May, and from 10 May the operator must carry out the next repeat.
    // It is a refusal, so the suspension's codes do not appear.
    let mut case = Case::new(Stream::Antifraud, d("2026-05-12"));
    let mut f = block(Operation::CardSbpOrEmoney, "2026-05-08");
    f.confirmed_on = Some(d("2026-05-08"));
    f.database_match_after_confirmation = true;
    case.antifraud = Some(f);
    let c = clock(&case).unwrap();
    assert!(c.deadline(K::AntifraudSuspensionEnds).is_none());
    assert!(c.deadline(K::AntifraudConfirmation).is_none());
    assert!(c.deadline(K::AntifraudRepeatSuspensionEnds).is_none());
    assert!(c.deadline(K::AntifraudAfterRepeatSuspension).is_none());
    assert_eq!(due(&c, K::AntifraudRepeatRefusalEnds), "2026-05-09");
    assert_eq!(due(&c, K::AntifraudAfterRepeatRefusal), "2026-05-10");
    let after = c.deadline(K::AntifraudAfterRepeatRefusal).unwrap();
    assert_eq!((after.basis.article, after.basis.part), ("8", "3.11"));
    // The letter speaks of the confirmation's day; the repeat's is read
    // the same way, conservatively.
    assert_eq!(after.basis.reading, Reading::Conservative);
    assert_eq!(
        measures(&c),
        [
            ("refuse_operation", "2026-05-08".into(), "3.4, sentence 2"),
            ("refuse_repeat", "2026-05-08".into(), "3.10, sentence 1"),
        ]
    );
    // A repeat on Sunday 10 May, any day later than the next one, is not
    // late: the text sets no term for a repeat.
    f.confirmed_on = Some(d("2026-05-10"));
    case.antifraud = Some(f);
    let c = clock(&case).unwrap();
    assert!(!c.warnings.contains(&Warning::ConfirmationLate));
    assert_eq!(due(&c, K::AntifraudAfterRepeatRefusal), "2026-05-12");
    // A match with no confirmation day is flagged, not guessed.
    f.confirmed_on = None;
    case.antifraud = Some(f);
    let c = clock(&case).unwrap();
    assert!(c.warnings.contains(&Warning::ConfirmationDateMissing));
    assert!(c.deadline(K::AntifraudRepeatSuspensionEnds).is_none());
}

#[test]
fn every_kind_of_operation_gets_part_3_4_as_its_first_ground() {
    // Transfers suspend (sentence 1); card, e-money and Faster Payments
    // operations, one kind in the engine, are refused (sentence 2). The
    // client is told at once under part 3.6 items 1 to 3 in either case.
    for (operation, kind, part) in [
        (Operation::Transfer, M::SuspendOrder, "3.4, sentence 1"),
        (
            Operation::CardSbpOrEmoney,
            M::RefuseOperation,
            "3.4, sentence 2",
        ),
    ] {
        let mut case = Case::new(Stream::Antifraud, d("2026-05-12"));
        case.antifraud = Some(block(operation, "2026-05-08"));
        let c = clock(&case).unwrap();
        assert_eq!(c.measures.len(), 1, "{operation:?}");
        let m = c.measures[0];
        assert_eq!((m.kind, m.on), (kind, d("2026-05-08")));
        assert_eq!(m.basis.source, sources::PAYMENT_LAW_8);
        assert_eq!((m.basis.article, m.basis.part), ("8", part));
        assert_eq!(m.basis.reading, Reading::Text);
        let notice = c.duties[0];
        assert_eq!(notice.kind, DutyKind::NotifyClientOfBlock);
        assert_eq!(notice.when, When::Immediately);
        assert_eq!(notice.basis.part, "3.6, items 1 to 3");
    }
}

#[test]
fn antifraud_refund() {
    // A refund claim received on 31 January 2026: 30 calendar days later is
    // 2 March (28 days of February, then 2).
    let mut case = Case::new(Stream::Antifraud, d("2026-02-02"));
    let mut f = block(Operation::Transfer, "2025-12-20");
    f.refund_claim_received_on = Some(d("2026-01-31"));
    case.antifraud = Some(f);
    let c = clock(&case).unwrap();
    assert_eq!(due(&c, K::AntifraudRefund), "2026-03-02");
    assert_eq!(
        c.deadline(K::AntifraudRefund).unwrap().count,
        Count::CalendarDays(30)
    );
    assert_eq!(
        c.deadline(K::AntifraudRefund).unwrap().basis.reading,
        Reading::Conservative
    );
    // The refund is owed to individuals only.
    case.applicant = Applicant::LegalEntity;
    let c = clock(&case).unwrap();
    assert!(c.deadline(K::AntifraudRefund).is_none());
    assert!(c.warnings.contains(&Warning::RefundForIndividualsOnly));
}

#[test]
fn aml_refusal_reasons_documents_and_commission() {
    // An operation refused on Thursday 30 April 2026: the reasons within 5
    // working days, 4 to 8 May: 8 May. Documents submitted on 8 May: the
    // answer within 7 working days, 12 to 15 May (4), 18 to 20 May (7):
    // 20 May. An application to the commission on Monday 1 June: 20
    // working days, 2 to 5 June (4), 8 to 11 June (8; 12 June is a
    // holiday), 15 to 19 (13), 22 to 26 (18), 29 and 30 June (20).
    let mut case = Case::new(Stream::AmlRefusal, d("2026-05-12"));
    let mut f = no_aml();
    f.decision = Some((AmlDecisionKind::RefuseOperation, d("2026-04-30")));
    f.documents_submitted_on = Some(d("2026-05-08"));
    f.commission_applied_on = Some(d("2026-06-01"));
    case.aml = Some(f);
    let c = clock(&case).unwrap();
    assert_eq!(due(&c, K::AmlReasonsNotice), "2026-05-08");
    assert_eq!(due(&c, K::AmlDocumentsAnswer), "2026-05-20");
    assert_eq!(due(&c, K::AmlCommissionDecision), "2026-06-30");
    assert_eq!(
        c.deadline(K::AmlReasonsNotice).unwrap().basis.part,
        "13.1-1, paragraph 2"
    );
    assert_eq!(
        c.deadline(K::AmlDocumentsAnswer).unwrap().basis.part,
        "13.4, paragraph 2"
    );
    assert_eq!(
        c.deadline(K::AmlCommissionDecision).unwrap().basis.part,
        "13.5, paragraph 3"
    );

    // A terminated account: the reasons under paragraph 1, and the 7-day
    // answer to documents flagged as going beyond the text.
    f.decision = Some((AmlDecisionKind::TerminateAccount, d("2026-04-30")));
    case.aml = Some(f);
    let c = clock(&case).unwrap();
    assert_eq!(
        c.deadline(K::AmlReasonsNotice).unwrap().basis.part,
        "13.1-1, paragraph 1"
    );
    assert!(c.warnings.contains(&Warning::DocumentsAnswerBeyondText));
    // Documents before the decision: an error.
    f.documents_submitted_on = Some(d("2026-04-29"));
    case.aml = Some(f);
    assert_eq!(clock(&case), Err(Error::DatesOutOfOrder));
}

#[test]
fn high_risk_notice_and_the_clients_six_months() {
    // A legal entity in the high-risk group; the bank applies the measures
    // on Thursday 29 April 2027. The notice within 5 working days after:
    // 30 April (1), then 1 to 3 May are off, 4 to 7 May (5): 7 May. The
    // client receives it on 7 May and has six months to apply to the
    // commission: to 7 November 2027, a Sunday, not moved.
    let mut case = Case::new(Stream::AmlRefusal, d("2027-05-11"));
    case.applicant = Applicant::LegalEntity;
    let mut f = no_aml();
    f.high_risk_measures_on = Some(d("2027-04-29"));
    f.high_risk_notice_received_on = Some(d("2027-05-07"));
    case.aml = Some(f);
    let c = clock(&case).unwrap();
    assert_eq!(due(&c, K::HighRiskNotice), "2027-05-07");
    assert_eq!(due(&c, K::HighRiskCommissionApplication), "2027-11-07");
    let six = c.deadline(K::HighRiskCommissionApplication).unwrap();
    assert_eq!(six.count, Count::Months(6));
    assert_eq!(six.basis.reading, Reading::Conservative);
    assert_eq!(six.basis.source, sources::AML_LAW_7_8);
    // Received on 31 August 2026: February 2027 has no 31st, so the six
    // months end on its last day.
    f.high_risk_measures_on = None;
    f.high_risk_notice_received_on = Some(d("2026-08-31"));
    case.aml = Some(f);
    assert_eq!(
        due(&clock(&case).unwrap(), K::HighRiskCommissionApplication),
        "2027-02-28"
    );
    // The high-risk group is for legal entities and entrepreneurs.
    case.applicant = Applicant::Individual;
    assert!(clock(&case)
        .unwrap()
        .warnings
        .contains(&Warning::HighRiskForLegalEntitiesOnly));
}

#[test]
fn a_suspended_card_is_notified_the_same_day_and_restored_at_once() {
    // The client's card is suspended on Saturday 9 May 2026 for the
    // client's own data in the Bank of Russia's database, with the Ministry
    // of Internal Affairs' information: a duty under part 11.7. The notice
    // with the reason is due the same day, 9 May, a holiday or not (art. 9
    // part 9.2); the notice of the right to apply for removal goes at once
    // (part 11.8). Once the data leave the database, on 20 May, the card is
    // restored at once (part 11.11).
    let mut case = Case::new(Stream::Antifraud, d("2026-05-12"));
    let mut f = no_database();
    f.instrument_suspended_on = Some(d("2026-05-09"));
    f.police_information = true;
    case.database = Some(f);
    let c = clock(&case).unwrap();
    assert_eq!(due(&c, K::InstrumentSuspensionNotice), "2026-05-09");
    let notice = c.deadline(K::InstrumentSuspensionNotice).unwrap();
    assert_eq!(notice.count, Count::SameDay);
    assert_eq!(notice.basis.source, sources::PAYMENT_LAW_9);
    assert_eq!((notice.basis.article, notice.basis.part), ("9", "9.2"));
    assert_eq!(
        measures(&c),
        [("suspend_instrument", "2026-05-09".into(), "11.7")]
    );
    let duties: Vec<_> = c.duties.iter().map(|x| (x.kind, x.basis.part)).collect();
    assert_eq!(duties, [(DutyKind::NotifyClientOfRightToApply, "11.8")]);
    assert!(c.duties.iter().all(|x| x.when == When::Immediately));
    // Without that information the suspension is the operator's option.
    f.police_information = false;
    f.data_removed_on = Some(d("2026-05-20"));
    case.database = Some(f);
    let c = clock(&case).unwrap();
    assert_eq!(c.measures[0].basis.part, "11.6");
    let duties: Vec<_> = c.duties.iter().map(|x| (x.kind, x.basis.part)).collect();
    assert_eq!(
        duties,
        [
            (DutyKind::NotifyClientOfRightToApply, "11.8"),
            (DutyKind::RestoreInstrument, "11.11")
        ]
    );
    // Removed before the suspension: an error.
    f.data_removed_on = Some(d("2026-05-08"));
    case.database = Some(f);
    assert_eq!(clock(&case), Err(Error::DatesOutOfOrder));
}

#[test]
fn the_bank_of_russia_counts_15_working_days_from_receipt() {
    // An application to remove the data, received by the Bank of Russia on
    // Friday 26 December 2025 (Directive No. 6748-U, items 2.1, 2.3 and
    // 2.4: "со дня поступления заявления клиента в Банк России", not from
    // its registration): 29, 30 December (2), 12 to 16 January (7), 19 to
    // 23 (12), 26 to 28 January (15): 28 January 2026.
    let mut case = Case::new(Stream::Antifraud, d("2026-02-02"));
    let mut f = no_database();
    f.exclusion_received_by_bank_of_russia_on = Some(d("2025-12-26"));
    case.database = Some(f);
    let c = clock(&case).unwrap();
    let decision = c.deadline(K::ExclusionDecision).unwrap();
    assert_eq!(decision.due, d("2026-01-28"));
    assert_eq!(decision.from, d("2025-12-26"));
    assert_eq!(decision.basis.source, sources::DIRECTIVE_6748_U);
    assert_eq!(
        (decision.basis.article, decision.basis.part),
        ("", "2.1, 2.3, 2.4")
    );
    assert!(K::ExclusionDecision.is_for_others());
    // Nothing the operator owes when the client applied to the Bank of
    // Russia directly.
    assert_eq!(c.deadlines.len(), 3, "{c:?}");
}

#[test]
fn the_operator_forwards_an_application_or_refuses_it_with_a_notice() {
    // The client applies through the bank on Friday 8 May 2026 (item 1.2).
    // With every mandatory datum, the bank forwards it with its own view of
    // the inclusion by the next working day, Tuesday 12 May (item 1.5).
    // The Bank of Russia receives it on 12 May: its decision is due in 15
    // working days, 13 to 15 May (3), 18 to 22 (8), 25 to 29 (13), 1 and
    // 2 June (15). Its request reaches the bank on 14 May: the answer is
    // due in 3 working days, 15, 18, 19 May. The bank receives the
    // decision on Friday 29 May and passes it on by Monday 1 June.
    let mut case = Case::new(Stream::Antifraud, d("2026-05-08"));
    let mut f = no_database();
    f.exclusion_received_by_operator_on = Some(d("2026-05-08"));
    f.exclusion_received_by_bank_of_russia_on = Some(d("2026-05-12"));
    f.bank_of_russia_query_received_on = Some(d("2026-05-14"));
    f.exclusion_decision_received_on = Some(d("2026-05-29"));
    case.database = Some(f);
    let c = clock(&case).unwrap();
    assert_eq!(due(&c, K::ExclusionForwarding), "2026-05-12");
    assert_eq!(due(&c, K::ExclusionDecision), "2026-06-02");
    assert_eq!(due(&c, K::BankOfRussiaQueryAnswer), "2026-05-19");
    assert_eq!(due(&c, K::ExclusionDecisionRelay), "2026-06-01");
    for (kind, part) in [
        (K::ExclusionForwarding, "1.5"),
        (K::BankOfRussiaQueryAnswer, "2.9"),
        (K::ExclusionDecisionRelay, "2.1, 2.3, 2.4"),
    ] {
        let b = c.deadline(kind).unwrap().basis;
        assert_eq!((b.source, b.part), (sources::DIRECTIVE_6748_U, part));
        assert!(!kind.is_for_others());
    }
    assert!(c.deadline(K::ExclusionRefusalNotice).is_none());
    // Mandatory data missing: no forwarding, but a notice of the refusal
    // with its ground within 5 working days of receipt (items 1.3, 1.4):
    // 12 to 15 May (4), 18 May (5).
    f.exclusion_data_missing = true;
    f.exclusion_received_by_bank_of_russia_on = None;
    f.bank_of_russia_query_received_on = None;
    f.exclusion_decision_received_on = None;
    case.database = Some(f);
    let c = clock(&case).unwrap();
    assert_eq!(due(&c, K::ExclusionRefusalNotice), "2026-05-18");
    assert_eq!(
        c.deadline(K::ExclusionRefusalNotice).unwrap().basis.part,
        "1.4"
    );
    assert!(c.deadline(K::ExclusionForwarding).is_none());
    // The Bank of Russia cannot receive it before the bank did.
    f.exclusion_data_missing = false;
    f.exclusion_received_by_bank_of_russia_on = Some(d("2026-05-07"));
    case.database = Some(f);
    assert_eq!(clock(&case), Err(Error::DatesOutOfOrder));
}

fn days(from: &str, to: &str) -> impl Iterator<Item = Date> {
    let (a, b) = (d(from), d(to));
    (0..=b.days_since(a)).map(move |i| a.add_days(i))
}

#[test]
fn property_complaint_clocks_over_every_day() {
    // For every receipt day that leaves room in the calendar: registration
    // is the next working day; the reply is 15 working days after the
    // assumed registration and after the registration deadline is due; an
    // extension of n days ends exactly n working days after the reply.
    for received in days("2025-01-01", "2027-10-31") {
        let mut case = Case::new(Stream::General, received);
        let c = clock(&case).unwrap();
        let reg = c.deadline(K::Registration).unwrap().due;
        let reply = c.deadline(K::Reply).unwrap();
        assert_eq!(Ok(reg), calendar::next_working_day(received));
        assert!(reply.due > reg, "{received}");
        assert_eq!(
            calendar::working_days_between(reply.from, reply.due),
            Ok(15)
        );
        assert!(reply.from >= received);
        for n in 1..=10 {
            case.extension = Some(Extension {
                ground: ExtensionGround::RequestDocuments,
                working_days: n,
            });
            let c = clock(&case).unwrap();
            let extended = c.deadline(K::ReplyExtended).unwrap().due;
            assert_eq!(
                calendar::working_days_between(reply.due, extended),
                Ok(n as i32)
            );
        }
    }
}

#[test]
fn property_ombudsman_claims_are_never_extended() {
    // Every receipt day, standard form or not, with or without a breach
    // day: never an extended date, always the refusal. Off the standard
    // form, or with the breach day unknown, the reply is never later than
    // 30 calendar days moved to a working day; on the standard form within
    // 180 days it is exactly 15 working days, which can be later.
    for received in days("2025-01-01", "2027-10-31") {
        for (standard, breach) in [(false, None), (true, None), (true, Some(received))] {
            let mut case = Case::new(Stream::MoneyClaim, received);
            case.money_claim = Some(MoneyClaim {
                kopecks: 100,
                standard_form: standard,
                breach_on: breach,
            });
            case.extension = Some(Extension {
                ground: ExtensionGround::RequestDocuments,
                working_days: 10,
            });
            let c = clock(&case).unwrap();
            assert_eq!(c.regime, Regime::OmbudsmanClaim);
            assert!(c.deadline(K::ReplyExtended).is_none());
            assert_eq!(c.refusals, [Refusal::ExtensionNotAllowed]);
            let latest = calendar::working_day_on_or_after(received.add_days(30)).unwrap();
            let reply = c.reply_due().unwrap();
            if breach.is_some() {
                assert_eq!(calendar::working_days_between(received, reply), Ok(15));
            } else {
                assert!(reply <= latest, "{received}");
            }
        }
    }
}

#[test]
fn property_every_basis_is_a_listed_source() {
    let mut case = Case::new(Stream::AmlRefusal, d("2026-05-08"));
    case.origin = Origin::ForwardedByBankOfRussia;
    case.electronic = true;
    case.extension = Some(Extension {
        ground: ExtensionGround::RequestDocuments,
        working_days: 3,
    });
    let mut f = block(Operation::Transfer, "2026-05-01");
    f.confirmed_on = Some(d("2026-05-02"));
    f.database_match_after_confirmation = true;
    f.refund_claim_received_on = Some(d("2026-05-05"));
    case.antifraud = Some(f);
    case.database = Some(DatabaseFacts {
        instrument_suspended_on: Some(d("2026-05-01")),
        police_information: true,
        data_removed_on: Some(d("2026-05-29")),
        exclusion_received_by_operator_on: Some(d("2026-05-04")),
        exclusion_data_missing: false,
        exclusion_received_by_bank_of_russia_on: Some(d("2026-05-05")),
        exclusion_decision_received_on: Some(d("2026-05-28")),
        bank_of_russia_query_received_on: Some(d("2026-05-06")),
    });
    case.aml = Some(AmlFacts {
        decision: Some((AmlDecisionKind::RefuseAccount, d("2026-05-04"))),
        documents_submitted_on: Some(d("2026-05-06")),
        commission_applied_on: Some(d("2026-05-20")),
        high_risk_measures_on: Some(d("2026-05-04")),
        high_risk_notice_received_on: Some(d("2026-05-06")),
    });
    let c = clock(&case).unwrap();
    assert_eq!(c.deadlines.len(), 20);
    // Only an act numbered in items alone has no article.
    let itemised = [sources::DIRECTIVE_6748_U];
    let article_ok =
        |b: &ariadne_rules::clock::Basis| !b.article.is_empty() || itemised.contains(&b.source);
    for x in &c.deadlines {
        assert!(sources::ALL.contains(&x.basis.source), "{x:?}");
        assert!(x.due >= x.from, "{x:?}");
        assert!(article_ok(&x.basis) && !x.basis.part.is_empty(), "{x:?}");
    }
    for x in &c.duties {
        assert!(sources::ALL.contains(&x.basis.source), "{x:?}");
        assert!(article_ok(&x.basis) && !x.basis.part.is_empty(), "{x:?}");
    }
    for x in &c.measures {
        assert!(sources::ALL.contains(&x.basis.source), "{x:?}");
        assert!(article_ok(&x.basis) && !x.basis.part.is_empty(), "{x:?}");
    }
}
