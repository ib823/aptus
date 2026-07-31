"""Offline parser tests against fixture XML.

These run with no SAP system. They pin the behaviour that release-level drift
is most likely to break: namespace handling, optional attributes, and the two
different shapes of atcfinding:location.

When a real sandbox response differs from a fixture here, ADD the captured
response as a new fixture (sanitize object names) rather than loosening a
test — the point is to record what each release actually returns.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from abap_mcp.xml_parsers import (
    AdtParseError,
    parse_atc_customizing,
    parse_atc_findings,
    parse_atc_run,
    parse_check_reports,
    parse_object_metadata,
    parse_object_structure,
    parse_search_results,
    parse_source_location,
)

FIXTURES = Path(__file__).parent / "fixtures"


def fixture(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


# ------------------------------------------------------------------- search


def test_search_results_basic():
    results = parse_search_results(fixture("search_results.xml"))
    assert len(results) == 2
    assert results[0] == {
        "name": "ZSD_PRICING_RPT",
        "type": "PROG/P",
        "package": "ZSD_REMED",
        "description": "SD pricing analysis report",
        "uri": "/sap/bc/adt/programs/programs/zsd_pricing_rpt",
    }


def test_search_results_legacy_name_with_type_in_parens():
    """Older systems return 'ZREPORT (PROGRAM)' and omit the description."""
    results = parse_search_results(fixture("search_results_legacy.xml"))
    assert results[0]["name"] == "ZSD_PRICING_RPT"
    assert results[0]["description"] == "PROGRAM"
    assert results[1]["name"] == "ZSD_PRICING_TOP"


def test_malformed_xml_raises_parse_error_with_excerpt():
    with pytest.raises(AdtParseError) as exc:
        parse_search_results("<html><body>Logon screen</body>")
    assert "Logon screen" in str(exc.value)


# --------------------------------------------------------- source locations


@pytest.mark.parametrize(
    "location,expected",
    [
        # older releases: real source URI + line,column
        (
            "/sap/bc/adt/programs/programs/z1/source/main#start=142,7",
            {"uri": "/sap/bc/adt/programs/programs/z1/source/main", "line": 142, "column": 7},
        ),
        # line only, no column — the regex must not require the comma
        (
            "/sap/bc/adt/ddic/tables/zexample/source/main#start=1",
            {"uri": "/sap/bc/adt/ddic/tables/zexample/source/main", "line": 1, "column": None},
        ),
        # start;end range
        (
            "/sap/bc/adt/oo/classes/zcl_x/source/main#start=27,2;end=27,15",
            {"uri": "/sap/bc/adt/oo/classes/zcl_x/source/main", "line": 27, "column": 2},
        ),
        # newer releases: verdict URI, NO position information at all
        (
            "/sap/bc/adt/vit/atc/runs/CB76/verdict/OBJ1/APIS/0050/0898/974362469",
            {
                "uri": "/sap/bc/adt/vit/atc/runs/CB76/verdict/OBJ1/APIS/0050/0898/974362469",
                "line": None,
                "column": None,
            },
        ),
        ("", {"uri": "", "line": None, "column": None}),
        (None, {"uri": "", "line": None, "column": None}),
    ],
)
def test_parse_source_location(location, expected):
    assert parse_source_location(location) == expected


# ---------------------------------------------------------------------- ATC


def test_atc_customizing_unqualified_property_elements():
    """<properties>/<property> come back WITHOUT a namespace prefix."""
    result = parse_atc_customizing(fixture("atc_customizing.xml"))
    assert result["systemCheckVariant"] == "S4HANA_READINESS_2023"
    assert result["afterActivationCheckVariant"] == "ACTIVATION"


def test_atc_run_reads_id_from_child_elements():
    """In worklistRun the id is a CHILD ELEMENT (it is an attribute in the
    worklist document) — the asymmetry is a classic source of empty ids."""
    info = parse_atc_run(fixture("atc_run_ok.xml"))
    assert info["worklistId"] == "0242AC1100021EE9AAE43D24739F1C3A"
    assert info["worklistTimestamp"] == "2026-07-20T19:18:57Z"
    assert info["failures"] == []
    assert info["noObjects"] is False


def test_atc_run_detects_no_objects():
    info = parse_atc_run(fixture("atc_run_no_objects.xml"))
    assert info["noObjects"] is True
    assert info["failures"] == []


def test_atc_run_detects_tool_failure():
    info = parse_atc_run(fixture("atc_run_tool_failure.xml"))
    assert len(info["failures"]) == 1
    assert "missing prerequisites" in info["failures"][0]["description"]
    # still parses the id so the caller can report which run failed
    assert info["worklistId"] == "0242AC1100021EE9AAE43D24739F1C3A"


def test_atc_findings_nw75x_shape():
    result = parse_atc_findings(fixture("atc_worklist_75x.xml"))
    assert result["worklistId"] == "0242AC1100021EE9AAE43D24739F1C3A"
    assert result["objectCount"] == 2
    assert result["findingCount"] == 2
    assert result["findingsByPriority"] == {"1": 1, "3": 1}

    first = result["findings"][0]
    assert first["objectName"] == "ZSD_PRICING_RPT"
    assert first["package"] == "ZSD_REMED"
    assert first["checkTitle"] == "S/4HANA: Search for database operations"
    assert first["priority"] == "1"
    assert first["line"] == 142
    assert first["column"] == 7
    assert first["sourceUri"] == "/sap/bc/adt/programs/programs/zsd_pricing_rpt/source/main"
    assert first["documentationUri"].startswith("/sap/bc/adt/documentation/atc/")
    # attributes this release does not emit must simply be absent
    assert "processor" not in first
    assert "checksum" not in first
    assert "quickfixes" not in first

    # a #start= with no column must still yield a line
    assert result["findings"][1]["line"] == 311
    assert result["findings"][1]["column"] is None

    # an object with <atcobject:findings/> contributes zero findings
    assert result["objects"][1]["name"] == "ZCL_SD_HELPER"
    assert result["objects"][1]["findingCount"] == 0


def test_atc_findings_s4hana_shape():
    result = parse_atc_findings(fixture("atc_worklist_s4h.xml"))
    assert result["findingCount"] == 1
    finding = result["findings"][0]
    assert finding["checkTitle"] == "S/4HANA: Field length extensions"
    # newer release: verdict URI, so NO line number. This is normal.
    assert finding["line"] is None
    assert finding["column"] is None
    # newer-release-only attributes are surfaced when present
    assert finding["processor"] == "ABAPDEV"
    assert finding["checksum"] == "974362469"
    assert finding["quickfixes"]["automatic"] == "true"
    assert finding["findingUri"].startswith("/sap/bc/adt/atc/findings/itemid/")


def test_atc_findings_priority_summary_helps_estimation():
    """Counts by priority feed the estimation model in the playbooks."""
    result = parse_atc_findings(fixture("atc_worklist_s4h.xml"))
    assert result["findingsByPriority"] == {"2": 1}


# ---------------------------------------------------------------- checkruns


def test_check_reports_with_errors_and_warnings():
    result = parse_check_reports(fixture("checkrun_errors.xml"))
    assert result["clean"] is False
    assert result["errorCount"] == 1
    assert result["warningCount"] == 1

    error = result["messages"][0]
    assert error["severity"] == "E"
    assert error["line"] == 27
    assert error["column"] == 2
    assert error["code"] == "SYNTAX(001)"
    assert "not type-compatible" in error["shortText"]

    warning = result["messages"][1]
    # `#start=41` with no column must not be dropped
    assert warning["line"] == 41
    assert warning["column"] is None
    assert warning["category"] == "Check1"
    assert warning["t100"] == {"msgid": "DT", "msgno": "242"}
    # code/category are mutually alternative in practice — neither is required
    assert "code" not in warning


def test_check_reports_clean_object():
    result = parse_check_reports(fixture("checkrun_clean.xml"))
    assert result["clean"] is True
    assert result["messages"] == []
    assert result["reports"][0]["status"] == "processed"


# ------------------------------------------------------------------ outline


def test_object_structure_lists_components_but_not_the_wrapper():
    items = parse_object_structure(fixture("object_structure_class.xml"))
    names = [i["name"] for i in items]
    assert names == ["READ_PRICING", "MAP_KONV", "GC_MAX_ROWS"]
    assert "ZCL_SD_HELPER" not in names  # the root describes the object itself
    assert items[0]["visibility"] == "public"
    assert items[1]["description"] == "Map KONV to PRCD_ELEMENTS"


def test_object_metadata_attributes_and_links():
    meta = parse_object_metadata(fixture("object_metadata_program.xml"))
    assert meta["attributes"]["name"] == "ZSD_PRICING_RPT"
    assert meta["attributes"]["packageName"] == "ZSD_REMED"
    rels = [link["rel"] for link in meta["links"]]
    assert "http://www.sap.com/adt/relations/source" in rels
