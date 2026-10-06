//! JavaScript bindings (feature `wasm`), for the desk's Web Worker.
//!
//! Small and typed: functions over strings, numbers and wasm-bindgen
//! structs, no JSON at the boundary. Dates cross as `YYYY-MM-DD` strings.
//! Errors are thrown as `Error` objects whose message is a code from the
//! crate (`invalid_date`, `outside_calendar`), never a sentence.

use crate::{calendar, Date, Error};
use wasm_bindgen::prelude::*;

fn js(e: Error) -> JsError {
    JsError::new(e.code())
}

fn date(s: &str) -> Result<Date, JsError> {
    Date::parse(s).map_err(js)
}

/// The crate version, as built.
#[wasm_bindgen]
pub fn version() -> String {
    crate::version().to_string()
}

/// The first and the last day the calendar covers, as `YYYY-MM-DD`.
#[wasm_bindgen(js_name = calendarRange)]
pub fn calendar_range() -> Vec<String> {
    vec![
        calendar::first_day().to_string(),
        calendar::last_day().to_string(),
    ]
}

/// Whether a day is a working day.
#[wasm_bindgen(js_name = isWorkingDay)]
pub fn is_working_day(day: &str) -> Result<bool, JsError> {
    calendar::is_working_day(date(day)?).map_err(js)
}

/// What kind of day it is: `working`, `working_weekend`, `holiday`,
/// `weekend` or `transferred_day_off`.
#[wasm_bindgen(js_name = dayKind)]
pub fn day_kind(day: &str) -> Result<String, JsError> {
    Ok(calendar::day_kind(date(day)?)
        .map_err(js)?
        .code()
        .to_string())
}

/// The first working day strictly after a day.
#[wasm_bindgen(js_name = nextWorkingDay)]
pub fn next_working_day(day: &str) -> Result<String, JsError> {
    Ok(calendar::next_working_day(date(day)?)
        .map_err(js)?
        .to_string())
}

/// The `n`-th working day after a day.
#[wasm_bindgen(js_name = addWorkingDays)]
pub fn add_working_days(day: &str, n: u32) -> Result<String, JsError> {
    Ok(calendar::add_working_days(date(day)?, n)
        .map_err(js)?
        .to_string())
}

/// The working days after `from` up to and including `to`, negative when
/// `to` is earlier.
#[wasm_bindgen(js_name = workingDaysBetween)]
pub fn working_days_between(from: &str, to: &str) -> Result<i32, JsError> {
    calendar::working_days_between(date(from)?, date(to)?).map_err(js)
}
