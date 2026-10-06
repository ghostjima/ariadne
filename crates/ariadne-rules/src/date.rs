//! Civil dates of the proleptic Gregorian calendar, without time or zone.
//!
//! The legal clocks count whole days, and every date the desk handles is
//! a day in Moscow time; a time of day never enters the rules.

use crate::Error;
use core::fmt;

/// A day, `0001-01-01` to `9999-12-31`. Ordered, copyable, and written
/// and read as `YYYY-MM-DD`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Date {
    /// Days since 1970-01-01.
    days: i32,
}

/// A day of the week.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Weekday {
    Monday,
    Tuesday,
    Wednesday,
    Thursday,
    Friday,
    Saturday,
    Sunday,
}

impl Weekday {
    /// Saturday or Sunday: the days off of a five-day week.
    pub fn is_weekend(self) -> bool {
        matches!(self, Weekday::Saturday | Weekday::Sunday)
    }
}

fn is_leap(y: i32) -> bool {
    (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
}

/// Days in a month of a year; zero for a month outside 1 to 12.
pub(crate) fn days_in_month(y: i32, m: u32) -> u32 {
    match m {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if is_leap(y) => 29,
        2 => 28,
        _ => 0,
    }
}

// Days from civil and back: H. Hinnant, "chrono-Compatible Low-Level Date
// Algorithms", in 32-bit arithmetic, which covers years 1 to 9999.
fn days_from_civil(y: i32, m: u32, d: u32) -> i32 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y.rem_euclid(400);
    let mp = (m as i32 + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d as i32 - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn civil_from_days(z: i32) -> (i32, u32, u32) {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let y = yoe + era * 400 + i32::from(m <= 2);
    (y, m, d)
}

impl Date {
    /// The day `d` of month `m` of year `y`, or [`Error::InvalidDate`].
    pub fn from_ymd(y: i32, m: u32, d: u32) -> Result<Date, Error> {
        if !(1..=9999).contains(&y) || d == 0 || d > days_in_month(y, m) {
            return Err(Error::InvalidDate);
        }
        Ok(Date {
            days: days_from_civil(y, m, d),
        })
    }

    /// Reads `YYYY-MM-DD`, exactly: four digits, two, two, with hyphens.
    pub fn parse(s: &str) -> Result<Date, Error> {
        let b = s.as_bytes();
        if b.len() != 10 || b[4] != b'-' || b[7] != b'-' {
            return Err(Error::InvalidDate);
        }
        let num = |r: core::ops::Range<usize>| -> Result<u32, Error> {
            b[r].iter().try_fold(0u32, |n, c| {
                if c.is_ascii_digit() {
                    Ok(n * 10 + u32::from(c - b'0'))
                } else {
                    Err(Error::InvalidDate)
                }
            })
        };
        Date::from_ymd(num(0..4)? as i32, num(5..7)?, num(8..10)?)
    }

    /// Year, month and day.
    pub fn ymd(self) -> (i32, u32, u32) {
        civil_from_days(self.days)
    }

    /// The year.
    pub fn year(self) -> i32 {
        self.ymd().0
    }

    /// The day of the week.
    pub fn weekday(self) -> Weekday {
        // 1970-01-01 was a Thursday.
        match (self.days + 3).rem_euclid(7) {
            0 => Weekday::Monday,
            1 => Weekday::Tuesday,
            2 => Weekday::Wednesday,
            3 => Weekday::Thursday,
            4 => Weekday::Friday,
            5 => Weekday::Saturday,
            _ => Weekday::Sunday,
        }
    }

    /// The day `n` calendar days later (earlier for a negative `n`).
    /// Callers stay within years 1 to 9999; the calendar's own range is
    /// checked where it matters.
    pub fn add_days(self, n: i32) -> Date {
        Date {
            days: self.days + n,
        }
    }

    /// Calendar days from `earlier` to `self`; negative when `self` is
    /// the earlier one.
    pub fn days_since(self, earlier: Date) -> i32 {
        self.days - earlier.days
    }

    /// The end of a period of `n` months that starts after this day,
    /// under the Civil Code, art. 192, part 3: the same day number in the
    /// last month, or that month's last day when it has no such day.
    pub fn add_months(self, n: u32) -> Date {
        let (y, m, d) = self.ymd();
        let months = y * 12 + (m as i32 - 1) + n as i32;
        let (ny, nm) = (months.div_euclid(12), months.rem_euclid(12) as u32 + 1);
        let nd = d.min(days_in_month(ny, nm));
        Date {
            days: days_from_civil(ny, nm, nd),
        }
    }
}

impl fmt::Display for Date {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let (y, m, d) = self.ymd();
        write!(f, "{y:04}-{m:02}-{d:02}")
    }
}

impl core::str::FromStr for Date {
    type Err = Error;
    fn from_str(s: &str) -> Result<Date, Error> {
        Date::parse(s)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn days_round_trip_over_four_centuries() {
        // Every day from 1900-01-01 to 2299-12-31 converts to its number
        // and back, and consecutive days are one apart.
        let start = Date::from_ymd(1900, 1, 1).unwrap();
        let mut prev = start;
        for i in 1..146_097 {
            let d = start.add_days(i);
            let (y, m, dd) = d.ymd();
            assert_eq!(Date::from_ymd(y, m, dd).unwrap(), d);
            assert_eq!(d.days_since(prev), 1);
            prev = d;
        }
    }

    #[test]
    fn known_weekdays() {
        // 2025-01-01 was a Wednesday, 2026-01-01 a Thursday, 2027-01-01 is
        // a Friday.
        assert_eq!(
            Date::parse("2025-01-01").unwrap().weekday(),
            Weekday::Wednesday
        );
        assert_eq!(
            Date::parse("2026-01-01").unwrap().weekday(),
            Weekday::Thursday
        );
        assert_eq!(
            Date::parse("2027-01-01").unwrap().weekday(),
            Weekday::Friday
        );
        assert_eq!(
            Date::parse("1970-01-01").unwrap().weekday(),
            Weekday::Thursday
        );
    }

    #[test]
    fn parse_is_strict() {
        for bad in [
            "2026-02-29",
            "2026-13-01",
            "2026-00-10",
            "2026-1-01",
            "2026/01/01",
            "20260101",
            " 2026-01-01",
            "0000-01-01",
            "2026-01-0a",
            "",
        ] {
            assert_eq!(Date::parse(bad), Err(Error::InvalidDate), "{bad}");
        }
        assert_eq!(Date::parse("2028-02-29").unwrap().to_string(), "2028-02-29");
    }

    #[test]
    fn months_end_on_the_same_day_or_the_last_of_a_shorter_month() {
        // Civil Code art. 192 part 3: 31 August plus six months ends on
        // 28 February (no 31st), 29 February 2028 in a leap year.
        let d = |s| Date::parse(s).unwrap();
        assert_eq!(d("2026-03-15").add_months(6), d("2026-09-15"));
        assert_eq!(d("2026-08-31").add_months(6), d("2027-02-28"));
        assert_eq!(d("2027-08-31").add_months(6), d("2028-02-29"));
        assert_eq!(d("2026-12-31").add_months(2), d("2027-02-28"));
    }
}
