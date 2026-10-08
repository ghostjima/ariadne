//! The primary sources the rules encode, each with the revision it was
//! checked against.
//!
//! A rule cites a source by its `id`. The crate README lists every source
//! here with its link and revision, and a test holds the two together.

/// A primary legal text, as read.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
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

/// Banking Law, art. 30.1: how a credit institution handles complaints.
pub const BANKING_LAW_30_1: Source = Source {
    id: "banking_law_30_1",
    title: "Федеральный закон от 02.12.1990 N 395-1 «О банках и банковской деятельности», статья 30.1",
    url: "https://www.consultant.ru/document/cons_doc_LAW_5842/c96fe25edab2fcc32ab9225c1b392a2b2d599467/",
    revision: "2026-08-04",
    checked: "2026-10-06",
};

/// Microfinance Law, art. 9.1: how a microfinance organisation handles
/// complaints.
pub const MICROFINANCE_LAW_9_1: Source = Source {
    id: "microfinance_law_9_1",
    title: "Федеральный закон от 02.07.2010 N 151-ФЗ «О микрофинансовой деятельности и микрофинансовых организациях», статья 9.1",
    url: "https://www.consultant.ru/document/cons_doc_LAW_102112/69201da7780e16951d28521d25d0899992b44981/",
    revision: "2026-04-09",
    checked: "2026-10-06",
};

/// Insurance Law, art. 6.2: how an insurer handles complaints.
pub const INSURANCE_LAW_6_2: Source = Source {
    id: "insurance_law_6_2",
    title: "Закон РФ от 27.11.1992 N 4015-1 «Об организации страхового дела в Российской Федерации», статья 6.2",
    url: "https://www.consultant.ru/document/cons_doc_LAW_1307/0f3a0c69a3c8e13748037a8a4667ab9552b69ca4/",
    revision: "2026-08-04",
    checked: "2026-10-06",
};

/// Securities Market Law, art. 15.11: how a securities market
/// professional handles complaints.
pub const SECURITIES_LAW_15_11: Source = Source {
    id: "securities_law_15_11",
    title: "Федеральный закон от 22.04.1996 N 39-ФЗ «О рынке ценных бумаг», статья 15.11",
    url: "https://www.consultant.ru/document/cons_doc_LAW_10148/0d69714fc90963f4be8075f53386f5173417d690/",
    revision: "2026-08-04",
    checked: "2026-10-06",
};

/// Credit Cooperation Law, art. 6.2: how a credit consumer cooperative
/// handles complaints.
pub const CREDIT_COOPERATION_LAW_6_2: Source = Source {
    id: "credit_cooperation_law_6_2",
    title: "Федеральный закон от 18.07.2009 N 190-ФЗ «О кредитной кооперации», статья 6.2",
    url: "https://www.consultant.ru/document/cons_doc_LAW_89568/bee9c2156e1473d4fb79c0c2076863aee37312ca/",
    revision: "2026-04-09",
    checked: "2026-10-06",
};

/// Financial Ombudsman Law, art. 15: the ombudsman's jurisdiction,
/// money claims up to 500,000 roubles.
pub const OMBUDSMAN_LAW_15: Source = Source {
    id: "ombudsman_law_15",
    title: "Федеральный закон от 04.06.2018 N 123-ФЗ «Об уполномоченном по правам потребителей финансовых услуг», статья 15",
    url: "https://base.garant.ru/71958414/36bfb7176e3e8bfebe718035887e4efc/",
    revision: "2025-12-28",
    checked: "2026-10-06",
};

/// Financial Ombudsman Law, art. 16: the organisation's reply to a
/// claim before the ombudsman.
pub const OMBUDSMAN_LAW_16: Source = Source {
    id: "ombudsman_law_16",
    title: "Федеральный закон от 04.06.2018 N 123-ФЗ «Об уполномоченном по правам потребителей финансовых услуг», статья 16",
    url: "https://base.garant.ru/71958414/7a58987b486424ad79b62aa427dab1df/",
    revision: "2025-12-28",
    checked: "2026-10-06",
};

/// Financial Ombudsman Law, art. 28: who must take part.
pub const OMBUDSMAN_LAW_28: Source = Source {
    id: "ombudsman_law_28",
    title: "Федеральный закон от 04.06.2018 N 123-ФЗ «Об уполномоченном по правам потребителей финансовых услуг», статья 28",
    url: "https://base.garant.ru/71958414/53070549816cbd8f006da724de818c2e/",
    revision: "2025-12-28",
    checked: "2026-10-06",
};

/// National Payment System Law, art. 8: suspending and refusing
/// transfers without the client's voluntary consent.
pub const PAYMENT_LAW_8: Source = Source {
    id: "payment_law_8",
    title: "Федеральный закон от 27.06.2011 N 161-ФЗ «О национальной платежной системе», статья 8",
    url: "https://www.consultant.ru/document/cons_doc_LAW_115625/cbc4acba397e1a1aebba6be746102a90208db5b4/",
    revision: "2026-08-04",
    checked: "2026-10-08",
};

/// National Payment System Law, art. 9: the client's data in the Bank of
/// Russia's database and the request to remove it.
pub const PAYMENT_LAW_9: Source = Source {
    id: "payment_law_9",
    title: "Федеральный закон от 27.06.2011 N 161-ФЗ «О национальной платежной системе», статья 9",
    url: "https://www.consultant.ru/document/cons_doc_LAW_115625/b0062cfb1c3cae710d57f0557303e78760a31d16/",
    revision: "2026-08-04",
    checked: "2026-10-08",
};

/// The Bank of Russia's letter on counting the terms of art. 8 of the
/// National Payment System Law.
pub const ANTIFRAUD_TERMS_LETTER: Source = Source {
    id: "letter_010_31_7975",
    title: "Письмо Банка России от 02.09.2024 N 010-31/7975 «О применении положений статьи 8 Федерального закона N 161-ФЗ в части исчисления сроков антифрод-мероприятий»",
    url: "https://www.garant.ru/products/ipo/prime/doc/409525913/",
    revision: "2024-09-02",
    checked: "2026-10-07",
};

/// The Bank of Russia's Directive No. 6748-U, as amended by Directive
/// No. 7287-U of 19.01.2026: how a client applies to remove its data from
/// the database, what the operator does with an application filed through
/// it, and the Bank of Russia's 15 working days from receipt. The text was
/// read in a full-text copy; the revision was confirmed on consultant.ru.
pub const DIRECTIVE_6748_U: Source = Source {
    id: "directive_6748_u",
    title: "Указание Банка России от 13.06.2024 N 6748-У «О порядке подачи клиентом оператора по переводу денежных средств в Банк России заявления об исключении сведений, относящихся к клиенту и (или) его электронному средству платежа, из базы данных о случаях и попытках осуществления переводов денежных средств без добровольного согласия клиента, порядке принятия Банком России мотивированного решения об удовлетворении или об отказе в удовлетворении заявления клиента оператора по переводу денежных средств или мотивированного заявления оператора по переводу денежных средств об исключении сведений, относящихся к клиенту и (или) его электронному средству платежа, из базы данных о случаях и попытках осуществления переводов денежных средств без добровольного согласия клиента и порядке получения оператором по переводу денежных средств информации об исключении сведений, относящихся к клиенту и (или) его электронному средству платежа, из базы данных о случаях и попытках осуществления переводов денежных средств без добровольного согласия клиента»",
    url: "https://legalacts.ru/doc/ukazanie-banka-rossii-ot-13062024-n-6748-u-o-porjadke/",
    revision: "2026-01-19",
    checked: "2026-10-07",
};

/// The Bank of Russia's page on requests to remove data from its
/// database. It says the 15 working days run from the request's
/// registration; Directive No. 6748-U, which binds, counts them from the
/// day the Bank of Russia receives the request, and the engine follows
/// the directive.
pub const BANK_OF_RUSSIA_EXCLUSION_PAGE: Source = Source {
    id: "cbr_exclusion_page",
    title: "Банк России, «Заявление об исключении сведений из базы данных о случаях и попытках осуществления переводов денежных средств без добровольного согласия клиента»",
    url: "https://www.cbr.ru/contactBR/161-FZ/",
    revision: "2026-10-06",
    checked: "2026-10-06",
};

/// Anti-Money-Laundering Law, art. 7: refusals, the reasons notice, the
/// client's documents and the interagency commission.
pub const AML_LAW_7: Source = Source {
    id: "aml_law_7",
    title: "Федеральный закон от 07.08.2001 N 115-ФЗ «О противодействии легализации (отмыванию) доходов, полученных преступным путем, и финансированию терроризма», статья 7",
    url: "https://www.consultant.ru/document/cons_doc_LAW_32834/3e3e0d20d2919071b55ef95f26f849df6a4f11e8/",
    revision: "2026-08-04",
    checked: "2026-10-07",
};

/// Anti-Money-Laundering Law, art. 7.7: measures against a client the
/// Bank of Russia places in the high-risk group.
pub const AML_LAW_7_7: Source = Source {
    id: "aml_law_7_7",
    title: "Федеральный закон от 07.08.2001 N 115-ФЗ «О противодействии легализации (отмыванию) доходов, полученных преступным путем, и финансированию терроризма», статья 7.7",
    url: "https://www.consultant.ru/document/cons_doc_LAW_32834/0a562008be657e44b6145557f337cc626af9ffab/",
    revision: "2026-08-04",
    checked: "2026-10-06",
};

/// Anti-Money-Laundering Law, art. 7.8: the client's application to the
/// interagency commission against those measures.
pub const AML_LAW_7_8: Source = Source {
    id: "aml_law_7_8",
    title: "Федеральный закон от 07.08.2001 N 115-ФЗ «О противодействии легализации (отмыванию) доходов, полученных преступным путем, и финансированию терроризма», статья 7.8",
    url: "https://www.consultant.ru/document/cons_doc_LAW_32834/b9e70868f2269695609ac83c8cabbc15dbc7b4e0/",
    revision: "2026-08-04",
    checked: "2026-10-07",
};

/// The Bank of Russia's Regulation No. 842-P, as amended by Directive
/// No. 7382-U of 25.06.2026: how the interagency commission reviews an
/// application, its request to the organisation and the notice of its
/// decision. The text was read in a full-text copy; the revision was
/// confirmed on consultant.ru.
pub const REGULATION_842_P: Source = Source {
    id: "regulation_842_p",
    title: "Положение Банка России от 23.09.2024 N 842-П «О требованиях к заявлениям, предусмотренным абзацем первым пункта 13.5 статьи 7 и пунктами 1 и 1.2 статьи 7.8 Федерального закона от 7 августа 2001 года N 115-ФЗ \"О противодействии легализации (отмыванию) доходов, полученных преступным путем, и финансированию терроризма\", порядке и сроках рассмотрения межведомственной комиссией таких заявлений и прилагаемых к ним документов и (или) сведений, порядке принятия решения по результатам такого рассмотрения, а также порядке сообщения межведомственной комиссией о принятом решении»",
    url: "https://legalacts.ru/doc/polozhenie-banka-rossii-ot-23092024-n-842-p-o-trebovanijakh/",
    revision: "2026-06-25",
    checked: "2026-10-07",
};

/// The Bank of Russia's Order No. OD-2506: the signs of a transfer
/// without the client's voluntary consent, from 1 January 2026.
pub const OD_2506: Source = Source {
    id: "order_od_2506",
    title: "Приказ Банка России от 05.11.2025 N ОД-2506 «Об установлении признаков осуществления перевода денежных средств без добровольного согласия клиента и отмене приказа Банка России от 27 июня 2024 года N ОД-1027»",
    url: "https://cbr.ru/Crosscut/LawActs/File/10123",
    revision: "2025-11-05",
    checked: "2026-10-06",
};

/// The Bank of Russia's information letter on informing clients of
/// restrictions: name the law and its provision, keep 161-FZ and 115-FZ
/// apart, state the client's next steps.
pub const RESTRICTIONS_LETTER: Source = Source {
    id: "letter_in_01_59_98",
    title: "Информационное письмо Банка России от 26.08.2025 N ИН-01-59/98 «Об информировании клиентов при ограничении операций и дистанционных способов распоряжения счетом»",
    url: "https://www.garant.ru/products/ipo/prime/doc/412494092/",
    revision: "2025-08-26",
    checked: "2026-10-06",
};

/// The Bank of Russia's recommendations on replies to complaints: plain
/// language, no long sentences, concrete terms.
pub const BANK_OF_RUSSIA_REPLY_PAGE: Source = Source {
    id: "cbr_reply_page",
    title: "Банк России, «Рассмотрение обращений потребителей финансовых услуг»",
    url: "https://www.cbr.ru/protection_rights/rassmotrenie-obrascheniy-potrebiteley-finansovykh-uslug/",
    revision: "2026-10-06",
    checked: "2026-10-06",
};

/// Every source the crate encodes.
pub const ALL: &[Source] = &[
    LABOUR_CODE_112,
    CIVIL_CODE_191_193,
    DECREE_2025,
    DECREE_2026,
    DECREE_2027,
    BANKING_LAW_30_1,
    MICROFINANCE_LAW_9_1,
    INSURANCE_LAW_6_2,
    SECURITIES_LAW_15_11,
    CREDIT_COOPERATION_LAW_6_2,
    OMBUDSMAN_LAW_15,
    OMBUDSMAN_LAW_16,
    OMBUDSMAN_LAW_28,
    PAYMENT_LAW_8,
    PAYMENT_LAW_9,
    ANTIFRAUD_TERMS_LETTER,
    DIRECTIVE_6748_U,
    BANK_OF_RUSSIA_EXCLUSION_PAGE,
    AML_LAW_7,
    AML_LAW_7_7,
    AML_LAW_7_8,
    REGULATION_842_P,
    OD_2506,
    RESTRICTIONS_LETTER,
    BANK_OF_RUSSIA_REPLY_PAGE,
];
