"""Client tests against a mocked ADT service (respx). No SAP system needed.

The point of these is the protocol, not the HTTP library: they pin the ATC
step order, the fact that `worklistId` on /atc/runs carries the worklist id
and not the check variant, CSRF retry behaviour, and the checkruns media-type
fallback.
"""

from __future__ import annotations

from pathlib import Path

import httpx
import pytest
import respx

from abap_mcp.adt_client import AdtClient, AdtError
from abap_mcp.profiles import Profile

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
        release="S4HANA-2023",
        atc_check_variant="S4HANA_READINESS_2023",
        _user="SVC_REMEDIATE",
        _password="secret",
    )


def mock_csrf(router: respx.Router) -> None:
    router.get(f"{BASE}/sap/bc/adt/core/discovery").mock(
        return_value=httpx.Response(200, headers={"x-csrf-token": "TOKEN123"}, text="<x/>")
    )


# ----------------------------------------------------------------- URI rules


def test_object_uri_is_lowercased_and_percent_encoded():
    assert (
        AdtClient.object_uri("PROG", "ZSD_PRICING_RPT")
        == "/sap/bc/adt/programs/programs/zsd_pricing_rpt"
    )
    assert (
        AdtClient.object_uri("CLAS", "ZCL_SD_Helper")
        == "/sap/bc/adt/oo/classes/zcl_sd_helper"
    )
    assert (
        AdtClient.object_uri("FUNC", "Z_GET_PRICE", "ZFG_SD")
        == "/sap/bc/adt/functions/groups/zfg_sd/fmodules/z_get_price"
    )


def test_object_uri_rejects_func_without_group():
    with pytest.raises(AdtError, match="function_group"):
        AdtClient.object_uri("FUNC", "Z_GET_PRICE")


def test_object_uri_rejects_unknown_type_with_a_useful_message():
    with pytest.raises(AdtError, match="Supported"):
        AdtClient.object_uri("TABL", "MARA")


# ------------------------------------------------------------- request bodies


def test_atc_run_body_structure():
    body = AdtClient.build_atc_run_body(
        ["/sap/bc/adt/programs/programs/zsd_pricing_rpt"], max_verdicts=42
    )
    assert 'xmlns:atc="http://www.sap.com/adt/atc"' in body
    assert 'maximumVerdicts="42"' in body
    assert 'xmlns:adtcore="http://www.sap.com/adt/core"' in body
    assert '<objectSet kind="inclusive">' in body
    assert (
        '<adtcore:objectReference adtcore:uri="/sap/bc/adt/programs/programs/'
        'zsd_pricing_rpt"/>' in body
    )
    # a bare object URI: no /source/main, no fragment
    assert "source/main" not in body
    assert "#start=" not in body


def test_checkrun_body_omits_artifacts():
    """Artifacts mean 'check this source I am sending you' — a read-only
    client never does that, so the element must not appear."""
    body = AdtClient.build_checkrun_body(["/sap/bc/adt/oo/classes/zcl_sd_helper"])
    assert 'chkrun:version="active"' in body
    assert "chkrun:artifacts" not in body
    assert "chkrun:content" not in body


# --------------------------------------------------------------- ATC protocol


@pytest.mark.asyncio
async def test_atc_flow_sends_worklist_id_not_variant_to_runs(profile):
    with respx.mock(assert_all_called=True) as router:
        mock_csrf(router)
        worklists = router.post(f"{BASE}/sap/bc/adt/atc/worklists").mock(
            return_value=httpx.Response(200, text="  ABC123WORKLIST\n")
        )
        runs = router.post(f"{BASE}/sap/bc/adt/atc/runs").mock(
            return_value=httpx.Response(200, text=fixture("atc_run_ok.xml"))
        )

        client = AdtClient(profile)
        try:
            worklist_id = await client.create_atc_worklist("S4HANA_READINESS_2023")
            await client.execute_atc_run(
                worklist_id, ["/sap/bc/adt/programs/programs/zsd_pricing_rpt"]
            )
        finally:
            await client.aclose()

        # step 1 carries the variant...
        assert (
            worklists.calls[0].request.url.params["checkVariant"]
            == "S4HANA_READINESS_2023"
        )
        # ...step 2 carries the ID, NOT the variant. This is the bug that
        # abap-adt-api's parameter naming propagates.
        assert runs.calls[0].request.url.params["worklistId"] == "ABC123WORKLIST"
        assert worklist_id == "ABC123WORKLIST"


@pytest.mark.asyncio
async def test_create_worklist_rejects_empty_body(profile):
    with respx.mock as router:
        mock_csrf(router)
        router.post(f"{BASE}/sap/bc/adt/atc/worklists").mock(
            return_value=httpx.Response(200, text="   \n")
        )
        client = AdtClient(profile)
        try:
            with pytest.raises(AdtError, match="check variant"):
                await client.create_atc_worklist("NO_SUCH_VARIANT")
        finally:
            await client.aclose()


@pytest.mark.asyncio
async def test_worklist_get_uses_the_atc_accept_type(profile):
    with respx.mock as router:
        route = router.get(f"{BASE}/sap/bc/adt/atc/worklists/ABC123").mock(
            return_value=httpx.Response(200, text=fixture("atc_worklist_75x.xml"))
        )
        client = AdtClient(profile)
        try:
            await client.get_atc_worklist("ABC123")
        finally:
            await client.aclose()
        request = route.calls[0].request
        assert request.headers["accept"] == "application/atc.worklist.v1+xml"
        assert request.url.params["includeExemptedFindings"] == "false"


# ---------------------------------------------------------------------- CSRF


@pytest.mark.asyncio
async def test_csrf_token_is_fetched_once_and_reused(profile):
    with respx.mock as router:
        discovery = router.get(f"{BASE}/sap/bc/adt/core/discovery").mock(
            return_value=httpx.Response(200, headers={"x-csrf-token": "T1"}, text="<x/>")
        )
        posts = router.post(f"{BASE}/sap/bc/adt/atc/worklists").mock(
            return_value=httpx.Response(200, text="W1")
        )
        client = AdtClient(profile)
        try:
            await client.create_atc_worklist("V1")
            await client.create_atc_worklist("V1")
        finally:
            await client.aclose()
        assert discovery.call_count == 1
        assert posts.calls[1].request.headers["x-csrf-token"] == "T1"


@pytest.mark.asyncio
async def test_expired_csrf_token_is_refetched_and_the_post_retried(profile):
    responses = [
        httpx.Response(403, headers={"x-csrf-token": "Required"}, text="CSRF token validation failed"),
        httpx.Response(200, text="W2"),
    ]
    with respx.mock as router:
        router.get(f"{BASE}/sap/bc/adt/core/discovery").mock(
            side_effect=[
                httpx.Response(200, headers={"x-csrf-token": "OLD"}, text="<x/>"),
                httpx.Response(200, headers={"x-csrf-token": "NEW"}, text="<x/>"),
            ]
        )
        posts = router.post(f"{BASE}/sap/bc/adt/atc/worklists").mock(
            side_effect=responses
        )
        client = AdtClient(profile)
        try:
            worklist_id = await client.create_atc_worklist("V1")
        finally:
            await client.aclose()
        assert worklist_id == "W2"
        assert posts.calls[0].request.headers["x-csrf-token"] == "OLD"
        assert posts.calls[1].request.headers["x-csrf-token"] == "NEW"


@pytest.mark.asyncio
async def test_missing_csrf_token_gives_a_sicf_hint(profile):
    with respx.mock as router:
        router.get(f"{BASE}/sap/bc/adt/core/discovery").mock(
            return_value=httpx.Response(200, text="<x/>")
        )
        router.get(f"{BASE}/sap/bc/adt/discovery").mock(
            return_value=httpx.Response(200, text="<x/>")
        )
        client = AdtClient(profile)
        try:
            with pytest.raises(AdtError, match="SICF"):
                await client.create_atc_worklist("V1")
        finally:
            await client.aclose()


# ------------------------------------------------------------- content types


@pytest.mark.asyncio
async def test_checkruns_falls_back_to_generic_media_types_on_415(profile):
    with respx.mock as router:
        mock_csrf(router)
        route = router.post(f"{BASE}/sap/bc/adt/checkruns").mock(
            side_effect=[
                httpx.Response(415, text="Unsupported media type"),
                httpx.Response(200, text=fixture("checkrun_clean.xml")),
            ]
        )
        client = AdtClient(profile)
        try:
            resp = await client.run_syntax_check(
                ["/sap/bc/adt/programs/programs/zsd_pricing_rpt"]
            )
        finally:
            await client.aclose()
        assert resp.status_code == 200
        assert (
            route.calls[0].request.headers["content-type"]
            == "application/vnd.sap.adt.checkobjects+xml"
        )
        assert route.calls[1].request.headers["content-type"] == "application/*"


@pytest.mark.asyncio
async def test_checkruns_does_not_swallow_a_real_error(profile):
    with respx.mock as router:
        mock_csrf(router)
        router.post(f"{BASE}/sap/bc/adt/checkruns").mock(
            return_value=httpx.Response(403, text="No authorization")
        )
        client = AdtClient(profile)
        try:
            with pytest.raises(AdtError, match="S_ADT"):
                await client.run_syntax_check(["/sap/bc/adt/oo/classes/zcl_x"])
        finally:
            await client.aclose()


# ---------------------------------------------------------- session hygiene


@pytest.mark.asyncio
async def test_client_declares_a_stateless_session_and_sap_client(profile):
    with respx.mock as router:
        route = router.get(
            f"{BASE}/sap/bc/adt/repository/informationsystem/search"
        ).mock(return_value=httpx.Response(200, text=fixture("search_results.xml")))
        client = AdtClient(profile)
        try:
            await client.search_objects("Z*", 25)
        finally:
            await client.aclose()
        request = route.calls[0].request
        assert request.headers["x-sap-adt-sessiontype"] == "stateless"
        assert request.url.params["sap-client"] == "100"
        assert request.url.params["operation"] == "quickSearch"


@pytest.mark.asyncio
async def test_search_object_type_is_truncated_at_the_slash(profile):
    with respx.mock as router:
        route = router.get(
            f"{BASE}/sap/bc/adt/repository/informationsystem/search"
        ).mock(return_value=httpx.Response(200, text=fixture("search_results.xml")))
        client = AdtClient(profile)
        try:
            await client.search_objects("Z*", 25, object_type="CLAS/OC")
        finally:
            await client.aclose()
        assert route.calls[0].request.url.params["objectType"] == "CLAS"


@pytest.mark.asyncio
async def test_outline_is_refused_for_programs_with_a_pointer_to_the_alternative(
    profile,
):
    client = AdtClient(profile)
    try:
        with pytest.raises(AdtError, match="abap_get_source"):
            await client.get_object_structure("PROG", "ZSD_PRICING_RPT")
    finally:
        await client.aclose()


@pytest.mark.asyncio
async def test_http_errors_carry_actionable_hints(profile):
    cases = {
        401: "credentials",
        403: "S_ADT",
        404: "release level",
        500: "ST22",
    }
    for status, expected in cases.items():
        with respx.mock as router:
            router.get(
                f"{BASE}/sap/bc/adt/repository/informationsystem/search"
            ).mock(return_value=httpx.Response(status, text="boom"))
            client = AdtClient(profile)
            try:
                with pytest.raises(AdtError, match=expected):
                    await client.search_objects("Z*", 25)
            finally:
                await client.aclose()
