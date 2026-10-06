//! The production calendar: worked examples written by hand around the
//! New Year and May holidays, the published yearly totals, and properties
//! checked exhaustively over every day the calendar covers.

use ariadne_rules::calendar::{
    add_working_days, day_kind, first_day, is_working_day, last_day, next_working_day,
    working_day_on_or_after, working_days_between, DayKind,
};
use ariadne_rules::{Date, Error, Weekday};

fn d(s: &str) -> Date {
    Date::parse(s).unwrap()
}

fn working(s: &str) -> bool {
    is_working_day(d(s)).unwrap()
}

#[test]
fn new_year_2025_to_2026() {
    // 31 December 2025 (Wednesday) is the day off moved from Sunday
    // 5 January 2025 (Decree No. 1335); 1 to 8 January 2026 are holidays;
    // 9 January (Friday) is the day off moved from Saturday 3 January
    // (Decree No. 1466); 10 and 11 January are a weekend. So the last
    // working day of 2025 is Tuesday 30 December, the first of 2026 is
    // Monday 12 January.
    assert_eq!(day_kind(d("2025-12-31")), Ok(DayKind::TransferredDayOff));
    assert_eq!(day_kind(d("2026-01-09")), Ok(DayKind::TransferredDayOff));
    assert_eq!(day_kind(d("2026-01-03")), Ok(DayKind::Holiday));
    assert_eq!(next_working_day(d("2025-12-30")), Ok(d("2026-01-12")));

    // Fifteen working days registered on Monday 22 December 2025:
    // 23, 24, 25, 26 December (4), 29, 30 December (6), then nothing until
    // 12 January: 12 to 16 January (11), 19 to 22 January (15).
    assert_eq!(add_working_days(d("2025-12-22"), 15), Ok(d("2026-01-22")));

    // Received on Friday 26 December: 29 (1), 30 (2), 12 January (3).
    assert_eq!(add_working_days(d("2025-12-26"), 3), Ok(d("2026-01-12")));
}

#[test]
fn new_year_2026_to_2027() {
    // 31 December 2026 (Thursday) is the day off moved from Sunday
    // 4 January 2026 (Decree No. 1466). 1 to 8 January 2027 are holidays
    // and 9, 10 January a weekend. Saturday 2 and Sunday 3 January 2027
    // stay days off as holidays; their days off move to Friday 5 November
    // and Friday 31 December 2027 (Decree No. 1187). So from Wednesday
    // 30 December 2026 the next working day is Monday 11 January 2027.
    assert_eq!(day_kind(d("2026-12-31")), Ok(DayKind::TransferredDayOff));
    assert_eq!(day_kind(d("2027-01-02")), Ok(DayKind::Holiday));
    assert_eq!(next_working_day(d("2026-12-30")), Ok(d("2027-01-11")));
    assert_eq!(day_kind(d("2027-11-05")), Ok(DayKind::TransferredDayOff));
    assert_eq!(day_kind(d("2027-12-31")), Ok(DayKind::TransferredDayOff));
}

#[test]
fn may_2025() {
    // Thursday 1 May holiday; Friday 2 May the day off moved from Saturday
    // 4 January; 3 and 4 May a weekend. Thursday 8 May the day off moved
    // from Sunday 23 February; Friday 9 May holiday; 10, 11 May weekend.
    // Five working days after Tuesday 29 April: 30 April (1), 5 (2), 6 (3),
    // 7 (4), 12 May (5).
    for off in ["2025-05-01", "2025-05-02", "2025-05-08", "2025-05-09"] {
        assert!(!working(off), "{off}");
    }
    assert_eq!(add_working_days(d("2025-04-29"), 5), Ok(d("2025-05-12")));
    // The 8 March holiday fell on a Saturday; its day off went to Friday
    // 13 June by decree, not to Monday 10 March under art. 112 part 2.
    assert!(working("2025-03-10"));
    assert_eq!(day_kind(d("2025-06-13")), Ok(DayKind::TransferredDayOff));
}

#[test]
fn may_2026() {
    // Friday 1 May holiday, 2 and 3 May weekend; Saturday 9 May holiday,
    // whose day off moves to Monday 11 May (art. 112 part 2). From
    // Thursday 30 April the next working day is Monday 4 May; from
    // Friday 8 May it is Tuesday 12 May.
    assert_eq!(next_working_day(d("2026-04-30")), Ok(d("2026-05-04")));
    assert_eq!(next_working_day(d("2026-05-08")), Ok(d("2026-05-12")));
    assert_eq!(day_kind(d("2026-05-11")), Ok(DayKind::TransferredDayOff));
    // 8 March 2026 is a Sunday: Monday 9 March is off.
    assert!(!working("2026-03-09"));
}

#[test]
fn may_2027() {
    // Saturday 1 May and Sunday 9 May are holidays; their days off move to
    // Monday 3 May and Monday 10 May (art. 112 part 2). From Friday
    // 30 April the next working day is Tuesday 4 May; from Friday 7 May
    // it is Tuesday 11 May. Ten working days from 30 April: 4, 5, 6, 7
    // (4), 11, 12, 13, 14 (8), 17, 18 May (10).
    assert_eq!(next_working_day(d("2027-04-30")), Ok(d("2027-05-04")));
    assert_eq!(next_working_day(d("2027-05-07")), Ok(d("2027-05-11")));
    assert_eq!(add_working_days(d("2027-04-30"), 10), Ok(d("2027-05-18")));
    // 12 June 2027 is a Saturday: Monday 14 June is off.
    assert!(!working("2027-06-14"));
}

#[test]
fn working_saturdays() {
    // Saturday 1 November 2025: its day off moved to Monday 3 November,
    // so it is a working day, and the next working day after Friday
    // 31 October. Saturday 20 February 2027 likewise, its day off moved
    // to Monday 22 February.
    assert_eq!(day_kind(d("2025-11-01")), Ok(DayKind::WorkingWeekend));
    assert_eq!(next_working_day(d("2025-10-31")), Ok(d("2025-11-01")));
    assert!(!working("2025-11-03"));
    assert!(!working("2025-11-04"));
    assert_eq!(day_kind(d("2027-02-20")), Ok(DayKind::WorkingWeekend));
    assert_eq!(next_working_day(d("2027-02-19")), Ok(d("2027-02-20")));
    // 21 (Sunday), 22 (moved), 23 (holiday) February 2027 are off.
    assert_eq!(next_working_day(d("2027-02-20")), Ok(d("2027-02-24")));
}

#[test]
fn published_totals() {
    // The production calendars for a five-day week: 247 working days in
    // each of 2025, 2026 and 2027; January has 17, 15 and 15. 1 January is
    // never a working day, so counting after it covers the whole year.
    for (year, total, january) in [(2025, 247, 17), (2026, 247, 15), (2027, 247, 15)] {
        let jan1 = Date::from_ymd(year, 1, 1).unwrap();
        let dec31 = Date::from_ymd(year, 12, 31).unwrap();
        let jan31 = Date::from_ymd(year, 1, 31).unwrap();
        assert!(!is_working_day(jan1).unwrap());
        assert_eq!(working_days_between(jan1, dec31), Ok(total), "{year}");
        assert_eq!(working_days_between(jan1, jan31), Ok(january), "{year}");
    }
}

#[test]
fn deadline_on_a_day_off_moves_to_the_next_working_day() {
    // Civil Code art. 193: Saturday 2 May 2026 moves to Monday 4 May.
    assert_eq!(
        working_day_on_or_after(d("2026-05-02")),
        Ok(d("2026-05-04"))
    );
    assert_eq!(
        working_day_on_or_after(d("2026-05-05")),
        Ok(d("2026-05-05"))
    );
}

#[test]
fn outside_the_calendar_is_an_error_not_a_guess() {
    assert_eq!(is_working_day(d("2024-12-31")), Err(Error::OutsideCalendar));
    assert_eq!(is_working_day(d("2028-01-03")), Err(Error::OutsideCalendar));
    // Counting past the last day stops with the same code: from Thursday
    // 30 December 2027 the next working day would be in 2028.
    assert_eq!(
        next_working_day(d("2027-12-30")),
        Err(Error::OutsideCalendar)
    );
    assert_eq!(
        add_working_days(d("2027-12-20"), 10),
        Err(Error::OutsideCalendar)
    );
    assert_eq!(first_day(), d("2025-01-01"));
    assert_eq!(last_day(), d("2027-12-31"));
}

fn every_day() -> impl Iterator<Item = Date> {
    let (first, last) = (first_day(), last_day());
    (0..=last.days_since(first)).map(move |i| first.add_days(i))
}

#[test]
fn property_ordinary_weekdays_work_and_weekends_rest() {
    // Outside the listed holidays and transfers, Monday to Friday work and
    // Saturday and Sunday rest; each kind is consistent with the weekday.
    for day in every_day() {
        let kind = day_kind(day).unwrap();
        let weekend = day.weekday().is_weekend();
        match kind {
            DayKind::Working | DayKind::TransferredDayOff => assert!(!weekend, "{day}"),
            DayKind::Weekend | DayKind::WorkingWeekend => assert!(weekend, "{day}"),
            DayKind::Holiday => {}
        }
        assert_eq!(is_working_day(day).unwrap(), kind.is_working());
    }
    // Only two Saturdays work in the three years.
    let saturdays: Vec<_> = every_day()
        .filter(|&x| x.weekday() == Weekday::Saturday && is_working_day(x).unwrap())
        .map(|x| x.to_string())
        .collect();
    assert_eq!(saturdays, ["2025-11-01", "2027-02-20"]);
}

#[test]
fn property_counting_round_trips() {
    // For every day and every n up to 40 that stays inside the calendar:
    // the n-th working day after d is a working day after d, the count
    // between them is n, and counting in two steps equals counting at once.
    for day in every_day() {
        assert_eq!(next_working_day(day).ok(), add_working_days(day, 1).ok());
        let mut prev = day;
        for n in 1..=40u32 {
            let Ok(end) = add_working_days(day, n) else {
                assert!(day.days_since(last_day()) > -80, "{day} {n}");
                break;
            };
            assert!(end > prev, "{day} {n}");
            assert!(is_working_day(end).unwrap(), "{day} {n}");
            assert_eq!(working_days_between(day, end), Ok(n as i32), "{day} {n}");
            assert_eq!(working_days_between(end, day), Ok(-(n as i32)), "{day} {n}");
            if n % 7 == 0 {
                let split = add_working_days(add_working_days(day, n / 2).unwrap(), n - n / 2);
                assert_eq!(split, Ok(end), "{day} {n}");
            }
            prev = end;
        }
    }
}
