//! The primary sources the rules encode, each with the revision it was
//! checked against.
//!
//! A rule cites a source by its `id`. The crate README lists every source
//! here with its link and revision, and a test holds the two together.

/// A primary legal text, as read.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Source {
    /// A stable identifier, cited by the rules.
    pub id: &'static str,
    /// The act's own title, in Russian.
    pub title: &'static str,
    /// Where the text was read.
    pub url: &'static str,
    /// The revision the text was checked against (`ред. от`), or the date
    /// of the act when it has not been amended, as `YYYY-MM-DD`.
    pub revision: &'static str,
    /// The day the text was read, as `YYYY-MM-DD`.
    pub checked: &'static str,
}

/// Labour Code, art. 112: the non-working holidays and the rule that
/// moves a day off falling on a holiday.
pub const LABOUR_CODE_112: Source = Source {
    id: "labour_code_112",
    title: "Трудовой кодекс Российской Федерации от 30.12.2001 N 197-ФЗ, статья 112 «Нерабочие праздничные дни»",
    url: "https://www.consultant.ru/document/cons_doc_LAW_34683/98ef2900507766e70ff29c0b9d8e2353ea80a1cf/",
    revision: "2026-05-25",
    checked: "2026-10-06",
};

/// Civil Code, arts. 191 to 193: when a period starts and ends.
pub const CIVIL_CODE_191_193: Source = Source {
    id: "civil_code_191_193",
    title: "Гражданский кодекс Российской Федерации (часть первая) от 30.11.1994 N 51-ФЗ, статьи 191-193",
    url: "https://www.consultant.ru/document/cons_doc_LAW_5142/60f6af8755cda8e568604f21cd44e823c3407d8f/",
    revision: "2026-06-10",
    checked: "2026-10-06",
};

/// The Government's transfers of days off in 2025.
pub const DECREE_2025: Source = Source {
    id: "decree_1335_2024",
    title: "Постановление Правительства Российской Федерации от 04.10.2024 N 1335 «О переносе выходных дней в 2025 году»",
    url: "http://static.government.ru/media/files/QkGT2QIDdzICtlaxOxctIZQONofaJwZO.pdf",
    revision: "2024-10-04",
    checked: "2026-10-06",
};

/// The Government's transfers of days off in 2026.
pub const DECREE_2026: Source = Source {
    id: "decree_1466_2025",
    title: "Постановление Правительства Российской Федерации от 24.09.2025 N 1466 «О переносе выходных дней в 2026 году»",
    url: "http://static.government.ru/media/files/4jeB8hNKm69ggOa9yDiYOli6YoAyM21i.pdf",
    revision: "2025-09-24",
    checked: "2026-10-06",
};

/// The Government's transfers of days off in 2027.
pub const DECREE_2027: Source = Source {
    id: "decree_1187_2026",
    title: "Постановление Правительства Российской Федерации от 17.09.2026 N 1187 «О переносе выходных дней в 2027 году»",
    url: "https://www.consultant.ru/document/cons_doc_LAW_544706/",
    revision: "2026-09-17",
    checked: "2026-10-06",
};

/// Every source the crate encodes.
pub const ALL: &[Source] = &[
    LABOUR_CODE_112,
    CIVIL_CODE_191_193,
    DECREE_2025,
    DECREE_2026,
    DECREE_2027,
];
