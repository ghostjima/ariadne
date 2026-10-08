//! Reason codes: the signs of a transfer without the client's voluntary
//! consent set by the Bank of Russia's Order No. OD-2506, and the
//! grounds of a refusal or restriction under 115-FZ as reason categories;
//! and the 161-FZ provisions a reply names as the ground of what the
//! operator did.
//!
//! The signs are transcribed from the order's text as the Bank of Russia
//! publishes it (`sources::OD_2506`), each with its number, wording and
//! the thresholds it states. A reason names one family of law: a sign is
//! a 161-FZ reason, a category a 115-FZ one; the reply rubric keeps the
//! two apart.

use crate::sources::{self, Source};
use crate::Error;

/// The two lists of the order.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum SignGroup {
    /// Item 1: transfers of money, including accepting the orders of a
    /// digital-ruble platform user.
    Transfers,
    /// Item 2: transfers of digital rubles.
    DigitalRubles,
}

/// The heading of each list, as the order words it.
pub const GROUP_WORDING: [(SignGroup, &str); 2] = [
    (
        SignGroup::Transfers,
        "Признаки, выявляемые в отношении переводов денежных средств, в том числе при осуществлении приема к исполнению распоряжений пользователя платформы цифрового рубля:",
    ),
    (
        SignGroup::DigitalRubles,
        "Признаки, выявляемые в отношении переводов цифровых рублей:",
    ),
];

/// The unit of a threshold.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Unit {
    Roubles,
    Hours,
    Months,
}

/// How a threshold bounds its quantity, in the order's words.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Bound {
    /// "более".
    MoreThan,
    /// "менее чем".
    LessThan,
    /// "не менее чем".
    AtLeast,
    /// "в течение".
    Within,
}

/// A number a sign states.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Threshold {
    pub value: u64,
    pub unit: Unit,
    pub bound: Bound,
    /// What it bounds, in English.
    pub of: &'static str,
}

/// One sign of the order.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Sign {
    /// The sign's number in the order ("1.10").
    pub number: &'static str,
    /// The reason code ("od2506_1_10").
    pub code: &'static str,
    pub group: SignGroup,
    /// A short English summary for the desk; the wording is the law.
    pub summary: &'static str,
    /// The day the sign applies from: the order's 1 January 2026, or
    /// 1 March 2026 for sign 1.2, as the sign itself says.
    pub applies_from: &'static str,
    /// The numbers the sign states.
    pub thresholds: &'static [Threshold],
    /// The sign's wording, transcribed from the order.
    pub wording: &'static str,
}

/// The order the signs come from.
pub const SIGNS_SOURCE: Source = sources::OD_2506;

/// The fourteen signs of Order No. OD-2506: twelve for transfers of
/// money, two for transfers of digital rubles.
pub const SIGNS: [Sign; 14] = [
    Sign {
        number: "1.1",
        code: "od2506_1_1",
        group: SignGroup::Transfers,
        summary: "the recipient matches the Bank of Russia database of transfers without voluntary consent",
        applies_from: "2026-01-01",
        thresholds: &[
        ],
        wording: "Совпадение информации о получателе средств с информацией о получателе средств по переводам денежных средств без добровольного согласия клиента, а именно без согласия клиента или с согласия клиента, полученного под влиянием обмана или при злоупотреблении доверием (далее при совместном упоминании – перевод денежных средств без добровольного согласия клиента), полученной из базы данных о случаях и попытках осуществления переводов денежных средств без добровольного согласия клиента, формирование и ведение которой осуществляются Банком России на основании части 5 статьи 27 Федерального закона от 27 июня 2011 года № 161-ФЗ «О национальной платежной системе» (далее − база данных).",
    },
    Sign {
        number: "1.2",
        code: "od2506_1_2",
        group: SignGroup::Transfers,
        summary: "the recipient or its payment instrument matches the state anti-fraud information system (41-FZ)",
        applies_from: "2026-03-01",
        thresholds: &[
        ],
        wording: "Совпадение сведений, относящихся к получателю средств и (или) его электронному средству платежа, со сведениями, размещенными в государственной информационной системе противодействия правонарушениям, совершаемым с использованием информационных и коммуникационных технологий, созданной в соответствии с частью 1 статьи 1 Федерального закона от 01.04.2025 № 41-ФЗ «О создании государственной информационной системы противодействия правонарушениям, совершаемым с использованием информационных и коммуникационных технологий, и о внесении изменений в отдельные законодательные акты Российской Федерации» (применяется с 01.03.2026).",
    },
    Sign {
        number: "1.3",
        code: "od2506_1_3",
        group: SignGroup::Transfers,
        summary: "an ATM and card exchange took longer than the payment system rules allow",
        applies_from: "2026-01-01",
        thresholds: &[
        ],
        wording: "Наличие превышения установленного правилами платежной системы времени направления ответа на запрос (APDU (application protocol data unit) – команда) в рамках взаимодействия банкомата и платежной карты или токенизированной (цифровой) платежной карты.",
    },
    Sign {
        number: "1.4",
        code: "od2506_1_4",
        group: SignGroup::Transfers,
        summary: "the payment infrastructure flagged a risk level or compromise factors",
        applies_from: "2026-01-01",
        thresholds: &[
        ],
        wording: "Наличие информации об уровне риска осуществления операции без добровольного согласия клиента, о факторах риска компрометации данных электронного средства платежа, направленной в авторизационных сообщениях оператором услуг платежной инфраструктуры, если это предусмотрено правилами платежной системы, или электронных сообщениях, полученных от операционного центра, платежного клирингового центра другой платежной системы при предоставлении операционных услуг и услуг платежного клиринга при переводе денежных средств с использованием сервиса быстрых платежей платежной системы Банка России.",
    },
    Sign {
        number: "1.5",
        code: "od2506_1_5",
        group: SignGroup::Transfers,
        summary: "the device matches devices in the Bank of Russia database",
        applies_from: "2026-01-01",
        thresholds: &[
        ],
        wording: "Совпадение информации о параметрах устройств, с использованием которых осуществлен доступ к автоматизированной системе, программному обеспечению в целях осуществления перевода денежных средств, с информацией о параметрах устройств, с использованием которых был осуществлен доступ к автоматизированной системе, программному обеспечению в целях осуществления перевода денежных средств без добровольного согласия клиента, полученной из базы данных.",
    },
    Sign {
        number: "1.6",
        code: "od2506_1_6",
        group: SignGroup::Transfers,
        summary: "the operation is atypical for the client (time, place, device, amount, frequency, recipient)",
        applies_from: "2026-01-01",
        thresholds: &[
        ],
        wording: "Несоответствие характера, и (или) параметров, и (или) объема проводимой операции (время (дни) осуществления операции; место осуществления операции; устройство, с использованием которого осуществляется операция, и параметры его использования; сумма осуществления операции; периодичность (частота) осуществления операций; получатель средств) операциям, обычно совершаемым клиентом оператора по переводу денежных средств (осуществляемой клиентом деятельности).",
    },
    Sign {
        number: "1.7",
        code: "od2506_1_7",
        group: SignGroup::Transfers,
        summary: "the recipient is on the operator's own internal lists",
        applies_from: "2026-01-01",
        thresholds: &[
        ],
        wording: "Совпадение информации о получателе средств (в том числе его электронном средстве платежа) с информацией о получателе средств (в том числе его электронном средстве платежа), ранее включенном во внутренние перечни (при наличии) оператора по переводу денежных средств в качестве получателя средств по переводам денежных средств без добровольного согласия клиента.",
    },
    Sign {
        number: "1.8",
        code: "od2506_1_8",
        group: SignGroup::Transfers,
        summary: "the recipient is subject of a criminal case on such transfers",
        applies_from: "2026-01-01",
        thresholds: &[
        ],
        wording: "Совпадение информации о получателе средств (в том числе его электронном средстве платежа) с информацией о получателе средств (в том числе его электронном средстве платежа), совершившем противоправные действия, связанные с осуществлением перевода денежных средств без добровольного согласия клиента, в связи с чем в отношении такого получателя средств возбуждено уголовное дело (подтвержденное документально).",
    },
    Sign {
        number: "1.9",
        code: "od2506_1_9",
        group: SignGroup::Transfers,
        summary: "atypical calls or messages found by telecom, messenger or website operators",
        applies_from: "2026-01-01",
        thresholds: &[
            Threshold {
                value: 6,
                unit: Unit::Hours,
                bound: Bound::AtLeast,
                of: "the period before the order in which the calls or messages were found",
            },
        ],
        wording: "Наличие информации, полученной от операторов связи, владельцев мессенджеров, владельцев сайтов в информационно-телекоммуникационной сети «Интернет» и (или) иных юридических лиц, о том, что в период не менее чем шесть часов до момента направления распоряжения о переводе денежных средств ими выявлены: телефонные переговоры с применением абонентского номера подвижной радиотелефонной связи, используемого во взаимоотношениях с кредитной организацией, не соответствующие характеру (периодичности (частоте), продолжительности) обычно совершаемых клиентом телефонных переговоров до или во время осуществления переводов денежных средств; факт (факты) нетипичного получения сообщений, в том числе в мессенджерах и (или) по электронной почте, в частности коротких текстовых сообщений (увеличение количества получаемых сообщений, в том числе от федеральной государственной информационной системы «Единый портал государственных и муниципальных услуг (функций)» и (или) кредитных организаций, с новых абонентских номеров или от новых адресатов).",
    },
    Sign {
        number: "1.10",
        code: "od2506_1_10",
        group: SignGroup::Transfers,
        summary: "malware, an atypical session, a recent phone number change or a device change",
        applies_from: "2026-01-01",
        thresholds: &[
            Threshold {
                value: 48,
                unit: Unit::Hours,
                bound: Bound::Within,
                of: "a change of the phone number before the order",
            },
        ],
        wording: "Наличие информации, полученной от операторов связи, владельцев мессенджеров, владельцев сайтов в информационно-телекоммуникационной сети «Интернет» и (или) иных юридических лиц, а также выявленной оператором по переводу денежных средств в рамках реализуемой им системы управления рисками: о вредоносном программном обеспечении (вредоносных программах) на устройствах абонента – физического лица, с применением которых осуществляется перевод денежных средств; о нетипичных для клиента параметрах, событиях в сессии дистанционного банковского обслуживания (использование нетипичного провайдера связи, операционной системы, приложения пользователя, использование инструментов, обеспечивающих сокрытие сессионных данных); о смене абонентского номера подвижной радиотелефонной связи в личном кабинете дистанционного банковского обслуживания или личном кабинете физического лица в федеральной государственной информационной системе «Единый портал государственных и муниципальных услуг (функций)», осуществленной в течение 48 часов до момента направления распоряжения о переводе денежных средств; о выявлении факта изменения идентификационного модуля устройства клиента и (или) параметров устройства, с применением которого осуществляется перевод денежных средств, до момента подтверждения принадлежности клиенту абонентского номера подвижной радиотелефонной связи в соответствии с подпунктом 5.2.1 пункта 5 Положения Банка России от 30.01.2025 № 851-П «Об установлении обязательных для кредитных организаций, иностранных банков, осуществляющих деятельность на территории Российской Федерации через свои филиалы, требований к обеспечению защиты информации при осуществлении банковской деятельности в целях противодействия осуществлению переводов денежных средств без согласия клиента»; о выявленной в рамках реализации мероприятий по противодействию осуществлению переводов денежных средств без добровольного согласия клиента, предусмотренных частью 4 статьи 27 Федерального закона от 27 июня 2011 года № 161-ФЗ «О национальной платежной системе», операции, соответствующей признакам осуществления перевода денежных средств без добровольного согласия клиента, в том числе информации, полученной от оператора по переводу денежных средств, обслуживающего получателя средств, оператора платформы цифрового рубля, участников платформы цифрового рубля, а также операторов услуг платежной инфраструктуры.",
    },
    Sign {
        number: "1.11",
        code: "od2506_1_11",
        group: SignGroup::Transfers,
        summary: "a cash deposit by token card at an ATM soon after a large cross-border transfer",
        applies_from: "2026-01-01",
        thresholds: &[
            Threshold {
                value: 24,
                unit: Unit::Hours,
                bound: Bound::Within,
                of: "the cash deposit request after the cross-border transfer",
            },
            Threshold {
                value: 100000,
                unit: Unit::Roubles,
                bound: Bound::MoreThan,
                of: "the cross-border transfer to individuals",
            },
        ],
        wording: "Наличие запроса на внесение наличных денежных средств на банковский счет клиента – физического лица с применением токенизированной (цифровой) платежной карты с использованием банкомата в течение 24 часов с момента осуществления трансграничного перевода денежных средств по распоряжению указанного клиента – физического лица в пользу получателей – физических лиц на сумму более 100 тысяч рублей.",
    },
    Sign {
        number: "1.12",
        code: "od2506_1_12",
        group: SignGroup::Transfers,
        summary: "a large Faster Payments inflow from the client's own account elsewhere, then a transfer to a new recipient",
        applies_from: "2026-01-01",
        thresholds: &[
            Threshold {
                value: 200000,
                unit: Unit::Roubles,
                bound: Bound::MoreThan,
                of: "the inflow from the client's account at another operator",
            },
            Threshold {
                value: 24,
                unit: Unit::Hours,
                bound: Bound::LessThan,
                of: "the time from the inflow to the order",
            },
            Threshold {
                value: 6,
                unit: Unit::Months,
                bound: Bound::Within,
                of: "no earlier transfers by the payer to the recipient",
            },
        ],
        wording: "Наличие информации о поступлении денежных средств на сумму более 200 тысяч рублей на банковский счет (вклад) физического лица с использованием сервиса быстрых платежей платежной системы Банка России с банковского счета (вклада) указанного физического лица, открытого другим оператором по переводу денежных средств, в период менее чем за 24 часа до момента направления распоряжения о переводе денежных средств физическому лицу, в адрес которого ранее в течение 6 месяцев не совершались переводы денежных средств указанным плательщиком.",
    },
    Sign {
        number: "2.1",
        code: "od2506_2_1",
        group: SignGroup::DigitalRubles,
        summary: "the digital-ruble recipient matches the Bank of Russia database",
        applies_from: "2026-01-01",
        thresholds: &[
        ],
        wording: "Совпадение информации о получателе средств, являющемся пользователем платформы цифрового рубля, с информацией о получателе средств по переводам денежных средств без добровольного согласия клиента, содержащейся в базе данных.",
    },
    Sign {
        number: "2.2",
        code: "od2506_2_2",
        group: SignGroup::DigitalRubles,
        summary: "the digital-ruble recipient was flagged earlier by the platform operator",
        applies_from: "2026-01-01",
        thresholds: &[
        ],
        wording: "Совпадение информации о получателе средств, являющемся пользователем платформы цифрового рубля (в том числе его электронном средстве платежа), с информацией, квалифицированной ранее оператором платформы цифрового рубля в качестве сведений о переводе денежных средств (его попытке) без добровольного согласия клиента.",
    },
];

/// The sign with a number ("1.10") or a code ("od2506_1_10").
pub fn sign(number_or_code: &str) -> Option<&'static Sign> {
    SIGNS
        .iter()
        .find(|s| s.number == number_or_code || s.code == number_or_code)
}

/// A ground of a refusal or restriction under 115-FZ, as a reason
/// category.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum AmlReason {
    /// An operation refused on a suspicion raised by internal control
    /// (art. 7 item 11).
    OperationRefused,
    /// A bank account or deposit contract refused (art. 7 item 5.2,
    /// paragraph 2).
    AccountRefused,
    /// A bank account or deposit contract terminated after two or more
    /// refused operations in a calendar year (art. 7 item 5.2,
    /// paragraph 3).
    AccountTerminated,
    /// An operation suspended for five working days because a party is
    /// one of the persons item 10 lists (art. 7 item 10).
    OperationSuspended,
    /// Operations suspended on a decision taken under art. 8 part 10
    /// (art. 7 item 10.1).
    OperationSuspendedByDecision,
    /// Money or other property frozen (blocked) (art. 7 item 1,
    /// subitem 6).
    FundsFrozen,
    /// Measures against a legal entity or entrepreneur the bank and the
    /// Bank of Russia place in the high-risk group (art. 7.7 item 5).
    HighRiskMeasures,
}

/// Every 115-FZ reason category.
pub const AML_REASONS: [AmlReason; 7] = [
    AmlReason::OperationRefused,
    AmlReason::AccountRefused,
    AmlReason::AccountTerminated,
    AmlReason::OperationSuspended,
    AmlReason::OperationSuspendedByDecision,
    AmlReason::FundsFrozen,
    AmlReason::HighRiskMeasures,
];

impl AmlReason {
    /// The reason code, in snake case.
    pub fn code(self) -> &'static str {
        match self {
            AmlReason::OperationRefused => "aml_operation_refused",
            AmlReason::AccountRefused => "aml_account_refused",
            AmlReason::AccountTerminated => "aml_account_terminated",
            AmlReason::OperationSuspended => "aml_operation_suspended",
            AmlReason::OperationSuspendedByDecision => "aml_operation_suspended_by_decision",
            AmlReason::FundsFrozen => "aml_funds_frozen",
            AmlReason::HighRiskMeasures => "aml_high_risk_measures",
        }
    }

    /// The source, article and item the category rests on.
    pub fn basis(self) -> (Source, &'static str, &'static str) {
        let art7 = sources::AML_LAW_7;
        match self {
            AmlReason::OperationRefused => (art7, "7", "11"),
            AmlReason::AccountRefused => (art7, "7", "5.2, paragraph 2"),
            AmlReason::AccountTerminated => (art7, "7", "5.2, paragraph 3"),
            AmlReason::OperationSuspended => (art7, "7", "10"),
            AmlReason::OperationSuspendedByDecision => (art7, "7", "10.1"),
            AmlReason::FundsFrozen => (art7, "7", "1, subitem 6"),
            AmlReason::HighRiskMeasures => (sources::AML_LAW_7_7, "7.7", "5"),
        }
    }
}

/// A provision of 161-FZ a reply names as the ground of what the operator
/// did, with a stable code. The codes are kept in this order and a new
/// ground is added at the end, so a code once given never changes its
/// meaning; the desk keeps a number of its own for each that never
/// changes either.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum PaymentGround {
    /// The first action on an operation that matched a sign, for every
    /// kind of operation: a transfer order suspended for two days, or a
    /// card, e-money or Faster Payments operation refused (art. 8
    /// part 3.4).
    FirstAction,
    /// The second action, after the client confirmed the order or
    /// repeated the operation and the Bank of Russia's database then
    /// answered (art. 8 part 3.10).
    SecondAction,
    /// The client's card or online banking suspended because the Bank of
    /// Russia's database holds the client's data and the Ministry of
    /// Internal Affairs has reported no unlawful acts: the operator may
    /// suspend it (art. 9 part 11.6). The ground of a reply about removing
    /// the data from the database.
    InstrumentSuspended,
    /// The same with the Ministry of Internal Affairs' information on
    /// unlawful acts: the operator must suspend it (art. 9 part 11.7).
    InstrumentSuspendedOnPoliceInformation,
}

/// Every 161-FZ ground, in the order of their codes.
pub const PAYMENT_GROUNDS: [PaymentGround; 4] = [
    PaymentGround::FirstAction,
    PaymentGround::SecondAction,
    PaymentGround::InstrumentSuspended,
    PaymentGround::InstrumentSuspendedOnPoliceInformation,
];

impl PaymentGround {
    /// The ground with a code, or [`Error::UnknownCode`].
    pub fn parse(code: &str) -> Result<PaymentGround, Error> {
        PAYMENT_GROUNDS
            .into_iter()
            .find(|g| g.code() == code)
            .ok_or(Error::UnknownCode)
    }

    /// The stable code: the act, the article and the part.
    pub fn code(self) -> &'static str {
        match self {
            PaymentGround::FirstAction => "payment_8_3_4",
            PaymentGround::SecondAction => "payment_8_3_10",
            PaymentGround::InstrumentSuspended => "payment_9_11_6",
            PaymentGround::InstrumentSuspendedOnPoliceInformation => "payment_9_11_7",
        }
    }

    /// The source, article and part the ground is.
    pub fn basis(self) -> (Source, &'static str, &'static str) {
        match self {
            PaymentGround::FirstAction => (sources::PAYMENT_LAW_8, "8", "3.4"),
            PaymentGround::SecondAction => (sources::PAYMENT_LAW_8, "8", "3.10"),
            PaymentGround::InstrumentSuspended => (sources::PAYMENT_LAW_9, "9", "11.6"),
            PaymentGround::InstrumentSuspendedOnPoliceInformation => {
                (sources::PAYMENT_LAW_9, "9", "11.7")
            }
        }
    }

    /// The ground of a suspended card or online banking: part 11.7 with
    /// the Ministry of Internal Affairs' information, part 11.6 without.
    pub fn of_instrument_suspension(police_information: bool) -> PaymentGround {
        if police_information {
            PaymentGround::InstrumentSuspendedOnPoliceInformation
        } else {
            PaymentGround::InstrumentSuspended
        }
    }
}

/// The law a reason belongs to.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Family {
    /// 161-FZ, antifraud.
    Antifraud,
    /// 115-FZ, anti-money-laundering.
    Aml,
}

/// A reason: a sign of Order No. OD-2506 or a 115-FZ category.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Reason {
    Sign(&'static Sign),
    Aml(AmlReason),
}

impl Reason {
    /// The reason with a code, or [`Error::UnknownCode`].
    pub fn parse(code: &str) -> Result<Reason, Error> {
        if let Some(s) = SIGNS.iter().find(|s| s.code == code) {
            return Ok(Reason::Sign(s));
        }
        AML_REASONS
            .iter()
            .find(|r| r.code() == code)
            .map(|r| Reason::Aml(*r))
            .ok_or(Error::UnknownCode)
    }

    /// The reason code.
    pub fn code(self) -> &'static str {
        match self {
            Reason::Sign(s) => s.code,
            Reason::Aml(r) => r.code(),
        }
    }

    /// The law it belongs to.
    pub fn family(self) -> Family {
        match self {
            Reason::Sign(_) => Family::Antifraud,
            Reason::Aml(_) => Family::Aml,
        }
    }
}
