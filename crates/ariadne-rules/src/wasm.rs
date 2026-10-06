//! JavaScript bindings (feature `wasm`), for the desk's Web Worker.
//!
//! Small and typed: functions over strings, numbers and wasm-bindgen
//! structs, no JSON at the boundary. Errors are thrown as `Error` objects
//! whose message is a code from the crate, never a sentence.

use wasm_bindgen::prelude::*;

/// The crate version, as built.
#[wasm_bindgen]
pub fn version() -> String {
    crate::version().to_string()
}
