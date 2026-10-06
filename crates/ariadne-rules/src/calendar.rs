//! The Russian production calendar for a five-day week, 2025 to 2027,
//! and counting in working days.
//!
//! A day is a working day unless it is a non-working holiday (Labour Code
//! art. 112 part 1), a Saturday or Sunday that is not made a working day
//! by a transfer, or the day a day off was transferred to. Transfers come
//! from two places, and both are written out below as data with their
//! basis:
//!
//! - art. 112 part 2: a day off that falls on a holiday moves to the next
//!   working day after the holiday, except for the holidays of 1 to 8
//!   January;
//! - the Government's yearly decree under art. 112 part 5, which moves two
//!   of the January days off and may move others; a day off it moves
//!   replaces the automatic move of part 2.
//!
//! Counting follows the Civil Code: a period starts on the day after the
//! date or event that begins it (art. 191). A Saturday made a working day
//! by a decree counts as a working day: it is one under the decree, and
//! counting it brings a deadline earlier, never later.
//!
//! The calendar covers [`first_day`] to [`last_day`]; any date outside it,
//! given or reached while counting, is [`Error::OutsideCalendar`].

use crate::date::Date;
use crate::sources::{self, Source};
use crate::Error;

/// The first and the last year the calendar covers.
pub const YEARS: (i32, i32) = (2025, 2027);

/// The first day the calendar covers: 2025-01-01.
pub fn first_day() -> Date {
    Date::from_ymd(YEARS.0, 1, 1).expect("a valid date")
}

/// The last day the calendar covers: 2027-12-31.
pub fn last_day() -> Date {
    Date::from_ymd(YEARS.1, 12, 31).expect("a valid date")
}

/// The non-working holidays, Labour Code art. 112 part 1, as month and
/// day: 1 to 6 and 8 January (New Year holidays), 7 January, 23 February,
/// 8 March, 1 May, 9 May, 12 June, 4 November.
pub const HOLIDAYS: [(u32, u32); 14] = [
    (1, 1),
    (1, 2),
    (1, 3),
    (1, 4),
    (1, 5),
    (1, 6),
    (1, 7),
    (1, 8),
    (2, 23),
    (3, 8),
    (5, 1),
    (5, 9),
    (6, 12),
    (11, 4),
];

/// What moved a day off.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum TransferBasis {
    /// Labour Code art. 112 part 2: a day off on a holiday moves to the
    /// next working day after it.
    Article112Part2,
    /// The Government's decree for the year, under art. 112 part 5.
    Decree,
}

/// A day off moved from one day of the year to another.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Transfer {
    /// Month and day of the Saturday or Sunday the day off moves from.
    pub from: (u32, u32),
    /// Month and day of the weekday it moves to, which becomes a day off.
    pub to: (u32, u32),
    /// What moved it.
    pub basis: TransferBasis,
}

const fn decree(from: (u32, u32), to: (u32, u32)) -> Transfer {
    Transfer {
        from,
        to,
        basis: TransferBasis::Decree,
    }
}

const fn part2(from: (u32, u32), to: (u32, u32)) -> Transfer {
    Transfer {
        from,
        to,
        basis: TransferBasis::Article112Part2,
    }
}

/// One year of the calendar.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Year {
    /// The year.
    pub year: i32,
    /// The Government's decree on the transfers of days off in that year.
    pub decree: Source,
    /// Every transfer of a day off in that year, by decree and by
    /// art. 112 part 2.
    pub transfers: &'static [Transfer],
}

/// The three years, with every transfer.
pub const CALENDAR: [Year; 3] = [
    Year {
        year: 2025,
        decree: sources::DECREE_2025,
        // Decree No. 1335 of 04.10.2024 moves all five; it also moves the
        // holidays of 23 February (a Sunday) and 8 March (a Saturday),
        // which art. 112 part 2 would have moved to 24 February and
        // 10 March.
        transfers: &[
            decree((1, 4), (5, 2)),
            decree((1, 5), (12, 31)),
            decree((2, 23), (5, 8)),
            decree((3, 8), (6, 13)),
            decree((11, 1), (11, 3)),
        ],
    },
    Year {
        year: 2026,
        decree: sources::DECREE_2026,
        // Decree No. 1466 of 24.09.2025 moves the two January days off;
        // 8 March is a Sunday and 9 May a Saturday, so art. 112 part 2
        // moves those days off to Monday 9 March and Monday 11 May.
        transfers: &[
            decree((1, 3), (1, 9)),
            decree((1, 4), (12, 31)),
            part2((3, 8), (3, 9)),
            part2((5, 9), (5, 11)),
        ],
    },
    Year {
        year: 2027,
        decree: sources::DECREE_2027,
        // Decree No. 1187 of 17.09.2026 moves the two January days off
        // and Saturday 20 February, which becomes a working day; 1 May is
        // a Saturday, 9 May a Sunday and 12 June a Saturday, so art. 112
        // part 2 moves those days off to Monday 3 May, Monday 10 May and
        // Monday 14 June.
        transfers: &[
            decree((1, 2), (11, 5)),
            decree((1, 3), (12, 31)),
            decree((2, 20), (2, 22)),
            part2((5, 1), (5, 3)),
            part2((5, 9), (5, 10)),
            part2((6, 12), (6, 14)),
        ],
    },
];

/// Why a day is, or is not, a working day.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum DayKind {
    /// Monday to Friday, with nothing moved onto it.
    Working,
    /// A Saturday or Sunday whose day off a transfer moved elsewhere: a
    /// working day.
    WorkingWeekend,
    /// A non-working holiday under art. 112 part 1.
    Holiday,
    /// A Saturday or Sunday that is not a holiday.
    Weekend,
    /// A weekday that a day off was transferred to.
    TransferredDayOff,
}

impl DayKind {
    /// Whether a day of this kind is a working day.
    pub fn is_working(self) -> bool {
        matches!(self, DayKind::Working | DayKind::WorkingWeekend)
    }

    /// The stable code, in snake case.
    pub fn code(self) -> &'static str {
        match self {
            DayKind::Working => "working",
            DayKind::WorkingWeekend => "working_weekend",
            DayKind::Holiday => "holiday",
            DayKind::Weekend => "weekend",
            DayKind::TransferredDayOff => "transferred_day_off",
        }
    }
}

fn covered(d: Date) -> Result<&'static Year, Error> {
    let y = d.year();
    CALENDAR
        .iter()
        .find(|c| c.year == y)
        .ok_or(Error::OutsideCalendar)
}

/// The year of the calendar a date falls in, with its decree and
/// transfers.
pub fn year_of(d: Date) -> Result<&'static Year, Error> {
    covered(d)
}

/// What kind of day `d` is.
pub fn day_kind(d: Date) -> Result<DayKind, Error> {
    let year = covered(d)?;
    let (_, m, day) = d.ymd();
    let md = (m, day);
    if HOLIDAYS.contains(&md) {
        return Ok(DayKind::Holiday);
    }
    if year.transfers.iter().any(|t| t.to == md) {
        return Ok(DayKind::TransferredDayOff);
    }
    if d.weekday().is_weekend() {
        // A transfer from a holiday leaves the holiday a day off; only a
        // transfer from a plain Saturday or Sunday makes it a working day.
        if year.transfers.iter().any(|t| t.from == md) {
            return Ok(DayKind::WorkingWeekend);
        }
        return Ok(DayKind::Weekend);
    }
    Ok(DayKind::Working)
}

/// Whether `d` is a working day.
pub fn is_working_day(d: Date) -> Result<bool, Error> {
    Ok(day_kind(d)?.is_working())
}

/// The first working day after `d` (strictly after: `d` itself never
/// counts).
pub fn next_working_day(d: Date) -> Result<Date, Error> {
    covered(d)?;
    let mut day = d;
    loop {
        day = day.add_days(1);
        if is_working_day(day)? {
            return Ok(day);
        }
    }
}

/// `d` when it is a working day, otherwise the first working day after
/// it: where a deadline ends when its last day is not a working day
/// (Civil Code art. 193).
pub fn working_day_on_or_after(d: Date) -> Result<Date, Error> {
    if is_working_day(d)? {
        Ok(d)
    } else {
        next_working_day(d)
    }
}

/// The last day of a period of `n` working days that begins after `d`:
/// the `n`-th working day after `d` (Civil Code art. 191: the period
/// starts on the next day). Zero working days is `d` itself.
pub fn add_working_days(d: Date, n: u32) -> Result<Date, Error> {
    covered(d)?;
    let mut day = d;
    for _ in 0..n {
        day = next_working_day(day)?;
    }
    Ok(day)
}

/// The working days after `from` up to and including `to`; negative, the
/// same count, when `to` is before `from`. For `n` of zero or more,
/// `working_days_between(d, add_working_days(d, n)?)` is `n`.
pub fn working_days_between(from: Date, to: Date) -> Result<i32, Error> {
    covered(from)?;
    covered(to)?;
    let (a, b, sign) = if from <= to {
        (from, to, 1)
    } else {
        (to, from, -1)
    };
    let mut n = 0;
    let mut day = a;
    while day < b {
        day = day.add_days(1);
        if is_working_day(day)? {
            n += 1;
        }
    }
    Ok(sign * n)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn date(y: i32, (m, d): (u32, u32)) -> Date {
        Date::from_ymd(y, m, d).unwrap()
    }

    #[test]
    fn every_transfer_moves_a_weekend_day_to_a_weekday() {
        for year in CALENDAR {
            for t in year.transfers {
                assert!(date(year.year, t.from).weekday().is_weekend(), "{t:?}");
                assert!(!date(year.year, t.to).weekday().is_weekend(), "{t:?}");
                assert!(!HOLIDAYS.contains(&t.to), "{t:?}");
            }
        }
    }

    #[test]
    fn part_2_transfers_are_exactly_what_article_112_derives() {
        // For every holiday outside 1 to 8 January that falls on a
        // Saturday or Sunday and is not moved by the decree, art. 112
        // part 2 moves the day off to the next working day after the
        // holiday; and nothing else is moved under part 2.
        for year in CALENDAR {
            let decreed: Vec<_> = year
                .transfers
                .iter()
                .filter(|t| t.basis == TransferBasis::Decree)
                .collect();
            let mut derived = Vec::new();
            for &h in HOLIDAYS.iter().filter(|(m, _)| *m != 1) {
                let day = date(year.year, h);
                if !day.weekday().is_weekend() || decreed.iter().any(|t| t.from == h) {
                    continue;
                }
                let mut next = day.add_days(1);
                loop {
                    let (_, m, d) = next.ymd();
                    let off = HOLIDAYS.contains(&(m, d))
                        || next.weekday().is_weekend()
                        || decreed.iter().any(|t| t.to == (m, d))
                        || derived.iter().any(|t: &Transfer| t.to == (m, d));
                    if !off {
                        break;
                    }
                    next = next.add_days(1);
                }
                let (_, m, d) = next.ymd();
                derived.push(part2(h, (m, d)));
            }
            let listed: Vec<_> = year
                .transfers
                .iter()
                .filter(|t| t.basis == TransferBasis::Article112Part2)
                .copied()
                .collect();
            assert_eq!(listed, derived, "{}", year.year);
        }
    }

    #[test]
    fn decrees_move_two_january_days_off_each_year() {
        // Art. 112 part 2: the Government moves two of the days off that
        // fall on 1 to 8 January.
        for year in CALENDAR {
            let january = year
                .transfers
                .iter()
                .filter(|t| t.basis == TransferBasis::Decree && t.from.0 == 1)
                .count();
            assert_eq!(january, 2, "{}", year.year);
        }
    }
}
