"""Regression tests — one per defect found in adversarial review.

Every test here failed before the corresponding fix. Do not relax one without
understanding which real failure it was pinning; several of these are silent
wrong-answer bugs, which are the worst kind this tool can produce.
"""

from __future__ import annotations

import xml.etree.ElementTree as ET
from pathlib import Path

import httpx
import pytest
import respx

from abap_mcp.adt_client import AdtClient, AdtError
from abap_mcp.profiles import Profile, ProfileError, load_profiles
from abap_mcp.xml_parsers import (
    AdtParseError,
    parse_atc_findings,
    parse_check_reports,
    parse_object_structure,
    parse_search_results,
)

FIXTURES = Path(__file__).parent / "fixtures"
BASE = "https://sandbox.example.com:44300"


def fixture(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


@pytest.fixture
def profile() -> Profile:
    return Profile(
        id="sandbox-dev",
        client_name="Sandbox",
        base_url=BASE,
        sap_client="100",
        atc_check_variant="S4HANA_READINESS",
        _user="SVC",
        _password="secret",
    )


def mock_csrf(router: respx.Router) -> None:
    router.get(f"{BASE}/sap/bc/adt/core/discovery").mock(
        return_value=httpx.Response(200, headers={"x-csrf-token": "T"}, text="<x/>")
    )


# ============================================================================
# Silent wrong answers — an unrecognised response must never read as "clean"
# ============================================================================


def test_unknown_document_is_not_reported_as_syntactically_clean():
    """A different release's checkrun namespace previously yielded clean:true
    while the document contained real syntax errors."""
    other_namespace = (
        '<?xml version="1.0"?>'
        '<chkrun:checkRunReports xmlns:chkrun="http://www.sap.com/adt/checkrun/v2">'
        '<chkrun:checkReport chkrun:reporter="abapCheckRun">'
        "<chkrun:checkMessageList>"
        '<chkrun:checkMessage chkrun:type="E" chkrun:shortText="syntax error"/>'
        "</chkrun:checkMessageList></chkrun:checkReport></chkrun:checkRunReports>"
    )
    with pytest.raises(AdtParseError, match="checkReport"):
        parse_check_reports(other_namespace)


def test_wrong_root_element_is_rejected_rather_than_summarised():
    exception_doc = (
        '<?xml version="1.0"?>'
        '<exc:exception xmlns:exc="http://www.sap.com/adt/exception">'
        "<localizedMessage>Object locked</localizedMessage></exc:exception>"
    )
    for parser in (parse_check_reports, parse_atc_findings, parse_search_results):
        with pytest.raises(AdtParseError, match="root element"):
            parser(exception_doc)


def test_atc_worklist_without_objects_element_is_rejected():
    """Zero findings must mean 'ATC found nothing', never 'we did not
    understand the document'."""
    doc = (
        '<?xml version="1.0"?>'
        '<atcworklist:worklist xmlns:atcworklist="http://www.sap.com/adt/atc/worklist" '
        'atcworklist:id="ABC"/>'
    )
    with pytest.raises(AdtParseError, match="objects"):
        parse_atc_findings(doc)


def test_unrecognised_severity_blocks_the_clean_verdict():
    doc = (
        '<?xml version="1.0"?>'
        '<chkrun:checkRunReports xmlns:chkrun="http://www.sap.com/adt/checkrun">'
        '<chkrun:checkReport chkrun:reporter="abapCheckRun" chkrun:status="processed">'
        "<chkrun:checkMessageList>"
        '<chkrun:checkMessage chkrun:type="error" chkrun:shortText="something"/>'
        "</chkrun:checkMessageList></chkrun:checkReport></chkrun:checkRunReports>"
    )
    result = parse_check_reports(doc)
    assert result["clean"] is False
    assert "Unrecognised severity" in result["warning"]


# ============================================================================
# XML injection through tool input
# ============================================================================


def test_object_uri_with_a_quote_cannot_inject_elements():
    """A crafted URI previously injected the chkrun:artifacts element — the
    one element a read-only client must never send."""
    hostile = '/sap/bc/adt/x"/><chkrun:artifacts chkrun:contentType="text/plain'
    with pytest.raises(AdtError, match="Refusing"):
        AdtClient.build_checkrun_body([hostile])


def test_object_uri_with_an_ampersand_cannot_produce_malformed_xml():
    with pytest.raises(AdtError, match="Refusing"):
        AdtClient.build_atc_run_body(["/sap/bc/adt/x?a=1&b=2"])


def test_valid_uris_still_build_well_formed_xml():
    for uri in (
        "/sap/bc/adt/programs/programs/zsd_pricing_rpt",
        "/sap/bc/adt/packages/%24tmp",
        "/sap/bc/adt/oo/classes/%2Facme%2Fzcl_x",
    ):
        ET.fromstring(AdtClient.build_atc_run_body([uri]))
        ET.fromstring(AdtClient.build_checkrun_body([uri]))


def test_non_adt_paths_are_refused():
    for uri in ("/etc/passwd", "https://evil.example.com/x", "../../secret"):
        with pytest.raises(AdtError, match="Refusing"):
            AdtClient.build_atc_run_body([uri])


@pytest.mark.asyncio
async def test_worklist_id_is_validated_before_it_reaches_the_path(profile):
    client = AdtClient(profile)
    try:
        with pytest.raises(AdtError, match="Refusing"):
            await client.get_atc_worklist("../../../other/endpoint")
    finally:
        await client.aclose()


# ============================================================================
# Attribute-namespace precedence
# ============================================================================


def test_namespaced_attribute_wins_over_an_unqualified_one_regardless_of_order():
    """Document order previously decided the winner, so an unqualified `name`
    could shadow `adtcore:name`."""
    for attrs in (
        'adtcore:name="REAL" name="ALIAS"',
        'name="ALIAS" adtcore:name="REAL"',
    ):
        doc = (
            '<abapsource:objectStructureElement '
            'xmlns:abapsource="http://www.sap.com/adt/abapsource" '
            'xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="ZCL_X">'
            f"<abapsource:objectStructureElement {attrs} adtcore:type=\"CLAS/OM\"/>"
            "</abapsource:objectStructureElement>"
        )
        assert parse_object_structure(doc)[0]["name"] == "REAL"


# ============================================================================
# Nested objects must not inflate finding counts
# ============================================================================


def test_nested_atc_objects_do_not_double_count_findings():
    """Counts here feed the effort estimates in the playbooks — inflating them
    misprices an engagement."""
    doc = (
        '<?xml version="1.0"?>'
        '<atcworklist:worklist xmlns:atcworklist="http://www.sap.com/adt/atc/worklist" '
        'atcworklist:id="W1"><atcworklist:objects>'
        '<atcobject:object xmlns:atcobject="http://www.sap.com/adt/atc/object" '
        'xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="OUTER" adtcore:type="DEVC">'
        "<atcobject:findings>"
        '<atcfinding:finding xmlns:atcfinding="http://www.sap.com/adt/atc/finding" '
        'atcfinding:priority="1" atcfinding:checkId="C1"/>'
        "</atcobject:findings>"
        '<atcobject:object adtcore:name="INNER" adtcore:type="PROG">'
        "<atcobject:findings>"
        '<atcfinding:finding xmlns:atcfinding="http://www.sap.com/adt/atc/finding" '
        'atcfinding:priority="2" atcfinding:checkId="C2"/>'
        "</atcobject:findings></atcobject:object>"
        "</atcobject:object></atcworklist:objects></atcworklist:worklist>"
    )
    result = parse_atc_findings(doc)
    assert result["findingCount"] == 1, "the inner object's finding was counted twice"
    assert result["findingsByPriority"] == {"1": 1}


# ============================================================================
# Diagnostics: a 403 authorization failure must not be reported as a CSRF issue
# ============================================================================


@pytest.mark.asyncio
async def test_authorization_failure_is_not_misdiagnosed_as_a_csrf_problem(profile):
    """Previously this sent the operator to SICF for an S_DEVELOP problem and
    discarded the real 403 body."""
    with respx.mock as router:
        mock_csrf(router)
        router.post(f"{BASE}/sap/bc/adt/atc/worklists").mock(
            return_value=httpx.Response(
                403,
                text="User SVC has no authorization for object S_DEVELOP "
                "(CSRF-protected service)",
            )
        )
        client = AdtClient(profile)
        try:
            with pytest.raises(AdtError) as exc:
                await client.create_atc_worklist("V1")
        finally:
            await client.aclose()
        assert "S_DEVELOP" in str(exc.value)
        assert "Could not obtain a CSRF token" not in str(exc.value)


@pytest.mark.asyncio
async def test_a_real_csrf_rejection_is_still_retried(profile):
    with respx.mock as router:
        router.get(f"{BASE}/sap/bc/adt/core/discovery").mock(
            side_effect=[
                httpx.Response(200, headers={"x-csrf-token": "OLD"}, text="<x/>"),
                httpx.Response(200, headers={"x-csrf-token": "NEW"}, text="<x/>"),
            ]
        )
        router.post(f"{BASE}/sap/bc/adt/atc/worklists").mock(
            side_effect=[
                httpx.Response(403, text="CSRF token validation failed"),
                httpx.Response(200, text="W1"),
            ]
        )
        client = AdtClient(profile)
        try:
            assert await client.create_atc_worklist("V1") == "W1"
        finally:
            await client.aclose()


@pytest.mark.asyncio
async def test_a_logon_page_instead_of_a_worklist_id_is_caught(profile):
    with respx.mock as router:
        mock_csrf(router)
        router.post(f"{BASE}/sap/bc/adt/atc/worklists").mock(
            return_value=httpx.Response(200, text="<html><body>Logon</body></html>")
        )
        client = AdtClient(profile)
        try:
            with pytest.raises(AdtError, match="not a worklist"):
                await client.create_atc_worklist("V1")
        finally:
            await client.aclose()


# ============================================================================
# Source encoding
# ============================================================================


@pytest.mark.asyncio
async def test_latin1_source_without_a_charset_is_not_corrupted(profile):
    """Corrupted umlauts in comments/literals would be handed to the model and
    proposed back as a 'fix'."""
    body = "WRITE: 'Preisänderung'.".encode("iso-8859-1")
    with respx.mock as router:
        router.get(
            f"{BASE}/sap/bc/adt/programs/programs/zsd_pricing_rpt/source/main"
        ).mock(
            return_value=httpx.Response(
                200, content=body, headers={"Content-Type": "text/plain"}
            )
        )
        client = AdtClient(profile)
        try:
            source = await client.get_source("PROG", "ZSD_PRICING_RPT")
        finally:
            await client.aclose()
    assert "Preisänderung" in source
    assert "�" not in source


# ============================================================================
# URI construction
# ============================================================================


def test_object_names_are_percent_encoded():
    """Package and customer-namespace names contain characters that must not
    appear raw in a URI."""
    assert AdtClient.object_uri("PROG", "$TMP_RPT").endswith("%24tmp_rpt")
    assert "%2Facme%2F" in AdtClient.object_uri("CLAS", "/ACME/ZCL_X")


# ============================================================================
# Profiles: malformed files must surface as ProfileError
# ============================================================================


@pytest.mark.parametrize(
    "content,expected",
    [
        ("- just\n- a list\n", "mapping"),
        ("id: x\nbase_url: https://h\nsap_client: '100'\ntimeout_seconds: fast\n", "wrong type"),
        ("id: x\nbase_url: https://h\n", "missing required key"),
        ("id: [unclosed\n", "valid YAML"),
    ],
)
def test_malformed_profiles_raise_profile_error(tmp_path, monkeypatch, content, expected):
    (tmp_path / "bad.yaml").write_text(content, encoding="utf-8")
    monkeypatch.setenv("ABAP_MCP_PROFILE_DIR", str(tmp_path))
    with pytest.raises(ProfileError, match=expected):
        load_profiles()
