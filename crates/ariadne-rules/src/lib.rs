//! Deterministic legal rules for a complaints desk.
//!
//! The crate is the legal core of Ariadne Desk: the rules a complaint is
//! measured against, written as plain functions over plain data, tested
//! on worked examples and compiled to WebAssembly for the desk's worker.
//! It decides nothing about a case; it computes what the law says about
//! dates and duties, and a person decides.
//!
//! Not legal advice. Every rule names the act, article, part and revision
//! it encodes; the crate README lists every source.
//!
//! Errors and refusals cross every boundary as codes, never as sentences:
//! the desk owns the wording in each interface language.
//!
//! - [`calendar`]: the Russian production calendar for 2025 to 2027 and
//!   counting in working days.
//! - [`clock`]: the legal clocks of a complaint and of the antifraud and
//!   anti-money-laundering facts around it, each deadline with its basis.
//! - [`reasons`]: the signs of Bank of Russia Order No. OD-2506 and the
//!   115-FZ refusal grounds, as reason codes, and the 161-FZ grounds a
//!   reply names.
//! - [`rubric`]: coded findings on a structured reply.
//!
//! ```
//! use ariadne_rules::{calendar, Date};
//!
//! // Registered on Monday 22 December 2025, a complaint has 15 working
//! // days: the New Year holidays (31 December to 11 January) do not count.
//! let registered = Date::parse("2025-12-22").unwrap();
//! let due = calendar::add_working_days(registered, 15).unwrap();
//! assert_eq!(due.to_string(), "2026-01-22");
//! ```

pub mod calendar;
pub mod clock;
pub mod date;
mod error;
pub mod reasons;
pub mod rubric;
pub mod sources;
#[cfg(feature = "wasm")]
mod wasm;

pub use date::{Date, Weekday};
pub use error::Error;

/// The crate version, as built.
pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[cfg(test)]
mod tests {
    #[test]
    fn version_is_the_manifest_version() {
        assert_eq!(super::version(), "0.1.0");
    }
}
