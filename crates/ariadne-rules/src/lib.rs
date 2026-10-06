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

#[cfg(feature = "wasm")]
mod wasm;

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
