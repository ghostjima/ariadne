//! The signs of Order No. OD-2506 as transcribed, the 115-FZ reason
//! categories, and the 161-FZ grounds a reply names.

use ariadne_rules::clock::{clock, Case, DatabaseFacts, MeasureKind, Stream};
use ariadne_rules::reasons::{
    sign, AmlReason, Bound, Family, PaymentGround, Reason, SignGroup, Unit, AML_REASONS,
    GROUP_WORDING, PAYMENT_GROUNDS, SIGNS, SIGNS_SOURCE,
};
use ariadne_rules::{sources, Date, Error};

#[test]
fn fourteen_signs_in_the_orders_order() {
    // Twelve signs for transfers of money (1.1 to 1.12), two for digital
    // rubles (2.1, 2.2).
    let numbers: Vec<_> = SIGNS.iter().map(|s| s.number).collect();
    assert_eq!(
        numbers,
        [
            "1.1", "1.2", "1.3", "1.4", "1.5", "1.6", "1.7", "1.8", "1.9", "1.10", "1.11", "1.12",
            "2.1", "2.2"
        ]
    );
    for s in &SIGNS {
        let group = if s.number.starts_with("1.") {
            SignGroup::Transfers
        } else {
            SignGroup::DigitalRubles
        };
        assert_eq!(s.group, group, "{}", s.number);
        assert_eq!(s.code, format!("od2506_{}", s.number.replace('.', "_")));
        assert_eq!(sign(s.number), Some(s));
        assert_eq!(sign(s.code), Some(s));
    }
    assert_eq!(SIGNS_SOURCE, sources::OD_2506);
    assert_eq!(GROUP_WORDING.len(), 2);
}

#[test]
fn the_wording_is_clean_text_from_the_order() {
    for s in &SIGNS {
        let w = s.wording;
        assert!(w.ends_with('.'), "{}", s.number);
        assert!(
            ["Совпадение", "Наличие", "Несоответствие"]
                .iter()
                .any(|p| w.starts_with(p)),
            "{}",
            s.number
        );
        // No doubled spaces, no hyphen left from a line break, no page
        // number run into the text.
        assert!(!w.contains("  "), "{}", s.number);
        let chars: Vec<char> = w.chars().collect();
        for i in 1..chars.len().saturating_sub(1) {
            assert!(
                !(chars[i] == '-' && chars[i + 1] == ' ' && chars[i - 1].is_alphabetic()),
                "{}: a broken hyphen",
                s.number
            );
        }
    }
    // Phrases checked against the order's text.
    let w = |n| sign(n).unwrap().wording;
    assert!(w("1.2").ends_with("(применяется с 01.03.2026)."));
    assert!(
        w("1.9").contains("в период не менее чем шесть часов до момента направления распоряжения")
    );
    assert!(
        w("1.10").contains("осуществленной в течение 48 часов до момента направления распоряжения")
    );
    assert!(w("1.10")
        .contains("подпунктом 5.2.1 пункта 5 Положения Банка России от 30.01.2025 № 851-П"));
    assert!(
        w("1.11").contains("в течение 24 часов с момента осуществления трансграничного перевода")
    );
    assert!(w("1.11").ends_with("на сумму более 100 тысяч рублей."));
    assert!(w("1.12").starts_with(
        "Наличие информации о поступлении денежных средств на сумму более 200 тысяч рублей"
    ));
    assert!(w("1.12").contains("в период менее чем за 24 часа до момента направления распоряжения"));
    assert!(w("1.12").contains("ранее в течение 6 месяцев не совершались переводы"));
}

#[test]
fn every_threshold_is_stated_in_its_sign() {
    // Each number the engine carries appears in the sign's own words.
    let mut count = 0;
    for s in &SIGNS {
        for t in s.thresholds {
            count += 1;
            let words = match (t.unit, t.value) {
                (Unit::Hours, 6) => "шесть часов".to_string(),
                (Unit::Hours, 24) if t.bound == Bound::LessThan => "24 часа".to_string(),
                (Unit::Hours, v) => format!("{v} часов"),
                (Unit::Roubles, v) => format!("{} тысяч рублей", v / 1000),
                (Unit::Months, v) => format!("{v} месяцев"),
            };
            let bound = match t.bound {
                Bound::MoreThan => "более",
                Bound::LessThan => "менее чем",
                Bound::AtLeast => "не менее чем",
                Bound::Within => "в течение",
            };
            assert!(s.wording.contains(&words), "{}: {words}", s.number);
            assert!(s.wording.contains(bound), "{}: {bound}", s.number);
        }
    }
    // 1.9 (6 hours), 1.10 (48 hours), 1.11 (24 hours, 100,000 roubles),
    // 1.12 (200,000 roubles, 24 hours, 6 months).
    assert_eq!(count, 7);
}

#[test]
fn sign_1_2_applies_from_march_2026_the_rest_from_january() {
    for s in &SIGNS {
        let from = if s.number == "1.2" {
            "2026-03-01"
        } else {
            "2026-01-01"
        };
        assert_eq!(s.applies_from, from, "{}", s.number);
    }
}

#[test]
fn the_transcription_has_not_changed() {
    // A fingerprint (FNV-1a, 64 bits) of every sign's number and wording.
    // A change to the transcription changes it; update it only with a
    // new reading of the order, and its revision in src/sources.rs.
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for s in &SIGNS {
        for b in s.number.bytes().chain(s.wording.bytes()) {
            h ^= u64::from(b);
            h = h.wrapping_mul(0x0100_0000_01b3);
        }
    }
    assert_eq!(h, FINGERPRINT, "{h:#x}");
}

const FINGERPRINT: u64 = 0x292a_f5cd_5afd_2c91;

#[test]
fn reasons_parse_from_their_codes_and_keep_their_family() {
    for s in &SIGNS {
        let r = Reason::parse(s.code).unwrap();
        assert_eq!(r.family(), Family::Antifraud);
        assert_eq!(r.code(), s.code);
    }
    for a in AML_REASONS {
        let r = Reason::parse(a.code()).unwrap();
        assert_eq!(r, Reason::Aml(a));
        assert_eq!(r.family(), Family::Aml);
    }
    assert_eq!(Reason::parse("od2506_1_13"), Err(Error::UnknownCode));
    assert_eq!(Reason::parse(""), Err(Error::UnknownCode));
}

#[test]
fn aml_categories_cite_their_items() {
    let item = |r: AmlReason| {
        let (source, article, part) = r.basis();
        (source.id, article, part)
    };
    assert_eq!(item(AmlReason::OperationRefused), ("aml_law_7", "7", "11"));
    assert_eq!(
        item(AmlReason::AccountRefused),
        ("aml_law_7", "7", "5.2, paragraph 2")
    );
    assert_eq!(
        item(AmlReason::AccountTerminated),
        ("aml_law_7", "7", "5.2, paragraph 3")
    );
    assert_eq!(
        item(AmlReason::OperationSuspended),
        ("aml_law_7", "7", "10")
    );
    assert_eq!(
        item(AmlReason::OperationSuspendedByDecision),
        ("aml_law_7", "7", "10.1")
    );
    assert_eq!(
        item(AmlReason::FundsFrozen),
        ("aml_law_7", "7", "1, subitem 6")
    );
    assert_eq!(
        item(AmlReason::HighRiskMeasures),
        ("aml_law_7_7", "7.7", "5")
    );
}

#[test]
fn payment_grounds_keep_their_codes_in_order_and_cite_their_parts() {
    // The codes are stable and in this order: the desk stores them as
    // numbers in it, and a new ground goes at the end.
    let cited: Vec<_> = PAYMENT_GROUNDS
        .iter()
        .map(|g| {
            let (source, article, part) = g.basis();
            (g.code(), source.id, article, part)
        })
        .collect();
    assert_eq!(
        cited,
        [
            ("payment_8_3_4", "payment_law_8", "8", "3.4"),
            ("payment_8_3_10", "payment_law_8", "8", "3.10"),
            ("payment_9_11_6", "payment_law_9", "9", "11.6"),
            ("payment_9_11_7", "payment_law_9", "9", "11.7"),
        ]
    );
    for g in PAYMENT_GROUNDS {
        assert_eq!(PaymentGround::parse(g.code()), Ok(g));
        // Never a reason code: a ground is the provision, a reason why.
        assert_eq!(Reason::parse(g.code()), Err(Error::UnknownCode));
    }
    assert_eq!(
        PaymentGround::parse("payment_9_11_8"),
        Err(Error::UnknownCode)
    );
}

#[test]
fn a_suspended_card_rests_on_part_11_6_or_with_the_police_information_on_11_7() {
    // The client's card suspended on Saturday 9 May 2026 for the client's
    // own data in the Bank of Russia's database: the measure's ground is
    // the one a reply about removing the data names.
    for (police, ground) in [
        (false, PaymentGround::InstrumentSuspended),
        (true, PaymentGround::InstrumentSuspendedOnPoliceInformation),
    ] {
        assert_eq!(PaymentGround::of_instrument_suspension(police), ground);
        let mut case = Case::new(Stream::Antifraud, Date::parse("2026-05-12").unwrap());
        case.database = Some(DatabaseFacts {
            instrument_suspended_on: Some(Date::parse("2026-05-09").unwrap()),
            transfers_capped_on: None,
            police_information: police,
            data_removed_on: None,
            exclusion_received_by_operator_on: None,
            exclusion_data_missing: false,
            exclusion_received_by_bank_of_russia_on: None,
            exclusion_decision_received_on: None,
            bank_of_russia_query_received_on: None,
            operator_application_sent_on: None,
        });
        let c = clock(&case).unwrap();
        let m = c
            .measures
            .iter()
            .find(|m| m.kind == MeasureKind::SuspendInstrument)
            .unwrap();
        let (source, article, part) = ground.basis();
        assert_eq!(
            (m.basis.source, m.basis.article, m.basis.part),
            (source, article, part)
        );
        assert_eq!(source, sources::PAYMENT_LAW_9);
    }
}
