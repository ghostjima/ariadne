//! Errors, as codes.

use core::fmt;

/// Why a computation could not be made. Each error is a stable code
/// ([`Error::code`]); the desk owns the sentence that explains it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Error {
    /// Not a date written `YYYY-MM-DD`, or no such day.
    InvalidDate,
    /// A date the production calendar does not cover, given or reached
    /// while counting: before [`crate::calendar::first_day`] or after
    /// [`crate::calendar::last_day`].
    OutsideCalendar,
    /// A day comes before the day it follows from: registered before
    /// received, confirmed before the block, and so on.
    DatesOutOfOrder,
    /// An extension of zero working days.
    InvalidExtension,
    /// A money amount that is not a whole, non-negative number of kopecks.
    InvalidAmount,
    /// A code that names no known value.
    UnknownCode,
    /// A fact given without the day it needs: a blocked operation without
    /// the day of the block, a decision without its day.
    MissingDate,
}

impl Error {
    /// The stable code, in snake case.
    pub fn code(self) -> &'static str {
        match self {
            Error::InvalidDate => "invalid_date",
            Error::OutsideCalendar => "outside_calendar",
            Error::DatesOutOfOrder => "dates_out_of_order",
            Error::InvalidExtension => "invalid_extension",
            Error::InvalidAmount => "invalid_amount",
            Error::UnknownCode => "unknown_code",
            Error::MissingDate => "missing_date",
        }
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.code())
    }
}

impl std::error::Error for Error {}
