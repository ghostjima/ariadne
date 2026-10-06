//! The README lists every source the code cites, with its link and
//! revision, and the code cites nothing the README does not list.

use ariadne_rules::sources;

const README: &str = include_str!("../README.md");

#[test]
fn every_source_is_in_the_readme_with_its_link_and_revision() {
    for s in sources::ALL {
        assert!(
            README.contains(s.url),
            "{} link missing from the README",
            s.id
        );
        let row = README
            .lines()
            .find(|l| l.contains(s.url))
            .expect("a row with the link");
        assert!(
            row.contains(s.revision),
            "{} revision missing from its row",
            s.id
        );
    }
}

#[test]
fn sources_are_unique_and_dated() {
    for (i, a) in sources::ALL.iter().enumerate() {
        for b in &sources::ALL[i + 1..] {
            assert_ne!(a.id, b.id);
            assert_ne!(a.url, b.url);
        }
        for date in [a.revision, a.checked] {
            assert!(ariadne_rules::Date::parse(date).is_ok(), "{}: {date}", a.id);
        }
        assert!(a.revision <= a.checked, "{}", a.id);
    }
}

#[test]
fn every_year_of_the_calendar_cites_its_decree() {
    for year in ariadne_rules::calendar::CALENDAR {
        assert!(sources::ALL.contains(&year.decree), "{}", year.year);
        assert!(year.decree.title.contains(&format!("в {} году", year.year)));
    }
}
