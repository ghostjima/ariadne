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
}

impl Error {
    /// The stable code, in snake case.
    pub fn code(self) -> &'static str {
        match self {
            Error::InvalidDate => "invalid_date",
            Error::OutsideCalendar => "outside_calendar",
        }
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.code())
    }
}

impl std::error::Error for Error {}
