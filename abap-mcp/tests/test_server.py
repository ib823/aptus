"""Tool-layer tests.

The server layer previously had no coverage at all: the ATC orchestration in
`abap_run_atc` (worklist -> run -> findings, plus the TOOL_FAILURE and
NO_OBJECTS branches) and the error mapping were entirely unverified.
"""

from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest
import respx

from abap_mcp import server
from abap_mcp.server import (
    AtcRunInput,
    ProfileInput,
    SearchInput,
    SyntaxCheckInput,
    abap_check_connection,
    abap_run_atc,
    abap_search_objects,
    abap_syntax_check,
)

FIXTURES = Path(__file__).parent / "fixtures"
BASE = "https://sandbox.example.com:44300"
PROG_URI = "/sap/bc/adt/programs/programs/zsd_pricing_rpt"


def fixture(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


@pytest.fixture(autouse=True)
def profile_dir(tmp_path, monkeypatch):
    (tmp_path / "sandbox-dev.yaml").write_text(
        "id: sandbox-dev\n"
        'client_name: "Sandbox"\n'
        f'base_url: "{BASE}"\n'
        'sap_client: "100"\n'
        'atc_check_variant: "S4HANA_READINESS"\n',
        encoding="utf-8",
    )
    monkeypatch.setenv("ABAP_MCP_PROFILE_DIR", str(tmp_path))
    monkeypatch.setenv("ABAP_MCP_SANDBOX_DEV_USER", "SVC")
    monkeypatch.setenv("ABAP_MCP_SANDBOX_DEV_PASS", "secret")
    return tmp_path


def mock_csrf(router: respx.Router) -> None:
    router.get(f"{BASE}/sap/bc/adt/core/discovery").mock(
        return_value=httpx.Response(200, headers={"x-csrf-token": "T"}, text="<x/>")
    )


def mock_atc(router: respx.Router, run_fixture: str, worklist_fixture: str | None):
    """Wire up the three ATC calls. Returns the worklist-creation route so a
    test can assert on the query parameters it received."""
    mock_csrf(router)
    worklists = router.post(f"{BASE}/sap/bc/adt/atc/worklists").mock(
        return_value=httpx.Response(200, text="W1")
    )
    router.post(f"{BASE}/sap/bc/adt/atc/runs").mock(
        return_value=httpx.Response(200, text=fixture(run_fixture))
    )
    if worklist_fixture:
        router.get(url__startswith=f"{BASE}/sap/bc/adt/atc/worklists/").mock(
            return_value=httpx.Response(200, text=fixture(worklist_fixture))
        )
    return worklists


# --------------------------------------------------------------- happy paths


@pytest.mark.asyncio
async def test_run_atc_returns_findings_from_the_full_round_trip():
    with respx.mock as router:
        mock_atc(router, "atc_run_ok.xml", "atc_worklist_75x.xml")
        out = json.loads(
            await abap_run_atc(
                AtcRunInput(profile="sandbox-dev", object_uris=[PROG_URI])
            )
        )
    assert out["status"] == "OK"
    assert out["findingCount"] == 2
    assert out["checkVariant"] == "S4HANA_READINESS"
    assert out["findings"][0]["objectName"] == "ZSD_PRICING_RPT"
    assert "truncated" not in out


@pytest.mark.asyncio
async def test_run_atc_uses_the_check_variant_override():
    with respx.mock as router:
        worklists = mock_atc(router, "atc_run_ok.xml", "atc_worklist_75x.xml")
        out = json.loads(
            await abap_run_atc(
                AtcRunInput(
                    profile="sandbox-dev",
                    object_uris=[PROG_URI],
                    check_variant="S4HANA_READINESS_NO_FLE",
                )
            )
        )
    assert out["checkVariant"] == "S4HANA_READINESS_NO_FLE"
    assert (
        worklists.calls[0].request.url.params["checkVariant"]
        == "S4HANA_READINESS_NO_FLE"
    )


@pytest.mark.asyncio
async def test_search_returns_parsed_objects():
    with respx.mock as router:
        router.get(f"{BASE}/sap/bc/adt/repository/informationsystem/search").mock(
            return_value=httpx.Response(200, text=fixture("search_results.xml"))
        )
        out = json.loads(
            await abap_search_objects(SearchInput(profile="sandbox-dev", query="Z*"))
        )
    assert [o["name"] for o in out] == ["ZSD_PRICING_RPT", "ZCL_SD_HELPER"]


@pytest.mark.asyncio
async def test_syntax_check_reports_errors():
    with respx.mock as router:
        mock_csrf(router)
        router.post(f"{BASE}/sap/bc/adt/checkruns").mock(
            return_value=httpx.Response(200, text=fixture("checkrun_errors.xml"))
        )
        out = json.loads(
            await abap_syntax_check(
                SyntaxCheckInput(profile="sandbox-dev", object_uris=[PROG_URI])
            )
        )
    assert out["clean"] is False
    assert out["errorCount"] == 1


# --------------------------------------------------- ATC failure branches


@pytest.mark.asyncio
async def test_run_atc_surfaces_tool_failure_instead_of_pretending_zero_findings():
    with respx.mock as router:
        mock_atc(router, "atc_run_tool_failure.xml", None)
        out = json.loads(
            await abap_run_atc(
                AtcRunInput(profile="sandbox-dev", object_uris=[PROG_URI])
            )
        )
    assert out["status"] == "TOOL_FAILURE"
    assert "findingCount" not in out, "a failed run must not report a finding count"
    assert "missing prerequisites" in out["infos"][0]["description"]


@pytest.mark.asyncio
async def test_run_atc_surfaces_no_objects():
    with respx.mock as router:
        mock_atc(router, "atc_run_no_objects.xml", None)
        out = json.loads(
            await abap_run_atc(
                AtcRunInput(profile="sandbox-dev", object_uris=[PROG_URI])
            )
        )
    assert out["status"] == "NO_OBJECTS"
    assert "findingCount" not in out


@pytest.mark.asyncio
async def test_run_atc_flags_truncation_at_the_verdict_cap():
    """Counts feed the playbooks' effort estimates — a capped result must not
    read as the complete picture."""
    with respx.mock as router:
        mock_atc(router, "atc_run_ok.xml", "atc_worklist_75x.xml")
        out = json.loads(
            await abap_run_atc(
                AtcRunInput(
                    profile="sandbox-dev", object_uris=[PROG_URI], max_verdicts=2
                )
            )
        )
    assert out["truncated"] is True
    assert "max_verdicts" in out["warning"]


@pytest.mark.asyncio
async def test_run_atc_flags_an_incomplete_object_set():
    with respx.mock as router:
        mock_atc(router, "atc_run_ok.xml", "atc_worklist_s4h.xml")
        out = json.loads(
            await abap_run_atc(
                AtcRunInput(profile="sandbox-dev", object_uris=[PROG_URI])
            )
        )
    assert "objectSetIsComplete=false" in out["warning"]


# ------------------------------------------------------------- error mapping


@pytest.mark.asyncio
async def test_network_failure_returns_a_structured_error_not_an_exception():
    with respx.mock as router:
        router.get(f"{BASE}/sap/bc/adt/core/discovery").mock(
            side_effect=httpx.ConnectError("Network is unreachable")
        )
        out = json.loads(await abap_check_connection(ProfileInput(profile="sandbox-dev")))
    assert "error" in out
    assert "VPN" in out["error"] or "connect" in out["error"].lower()


@pytest.mark.asyncio
async def test_read_timeout_returns_a_structured_error():
    with respx.mock as router:
        router.get(f"{BASE}/sap/bc/adt/repository/informationsystem/search").mock(
            side_effect=httpx.ReadTimeout("timed out")
        )
        out = json.loads(
            await abap_search_objects(SearchInput(profile="sandbox-dev", query="Z*"))
        )
    assert "error" in out
    assert "timeout_seconds" in out["error"]


@pytest.mark.asyncio
async def test_unknown_profile_returns_a_structured_error_listing_the_known_ones():
    out = json.loads(await abap_search_objects(SearchInput(profile="nope", query="Z*")))
    assert "error" in out
    assert "sandbox-dev" in out["error"]


@pytest.mark.asyncio
async def test_missing_credentials_returns_a_structured_error(monkeypatch):
    monkeypatch.delenv("ABAP_MCP_SANDBOX_DEV_PASS")
    out = json.loads(await abap_search_objects(SearchInput(profile="sandbox-dev", query="Z*")))
    assert "error" in out
    assert "ABAP_MCP_SANDBOX_DEV_PASS" in out["error"]


@pytest.mark.asyncio
async def test_unparseable_response_returns_a_structured_error_not_a_clean_result():
    with respx.mock as router:
        mock_csrf(router)
        router.post(f"{BASE}/sap/bc/adt/checkruns").mock(
            return_value=httpx.Response(200, text="<html>Session expired</html>")
        )
        out = json.loads(
            await abap_syntax_check(
                SyntaxCheckInput(profile="sandbox-dev", object_uris=[PROG_URI])
            )
        )
    assert "error" in out
    assert "clean" not in out


@pytest.mark.asyncio
async def test_hostile_object_uri_is_rejected_at_the_tool_boundary():
    out = json.loads(
        await abap_syntax_check(
            SyntaxCheckInput(
                profile="sandbox-dev",
                object_uris=['/sap/bc/adt/x"/><chkrun:artifacts a="b'],
            )
        )
    )
    assert "error" in out
    assert "Refusing" in out["error"]


# ------------------------------------------------------------ read-only shape


def test_no_tool_writes():
    """The read-only guarantee is structural. If a write tool is ever added,
    this test should fail and force a conscious decision."""
    tool_names = {
        name for name in dir(server) if name.startswith("abap_") and callable(getattr(server, name))
    }
    forbidden = {"create", "write", "update", "delete", "activate", "lock", "transport", "set_"}
    for name in tool_names:
        assert not any(word in name for word in forbidden), f"{name} looks like a write tool"


def test_every_tool_is_annotated_read_only():
    assert server.READ_ONLY["readOnlyHint"] is True
    assert server.READ_ONLY["destructiveHint"] is False
