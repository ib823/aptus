"""abap_mcp — read-only MCP server for ABAP remediation work.

Run:  python -m abap_mcp.server   (stdio transport, for Claude Code/Desktop)

Every tool here is read-only by construction. There is no write, activate,
lock, or transport tool, and adding one is a separate gated phase — see
docs/client-onboarding-checklist.md. The real security boundary is the SAP
service user's display-only authorizations, not this tool list.
"""

from __future__ import annotations

import json
from typing import Optional

import httpx
from mcp.server.fastmcp import FastMCP
from pydantic import BaseModel, ConfigDict, Field

from .adt_client import AdtClient, AdtError
from .profiles import ProfileError, get_profile, load_profiles
from .xml_parsers import (
    AdtParseError,
    parse_atc_customizing,
    parse_atc_findings,
    parse_atc_run,
    parse_check_reports,
    parse_object_metadata,
    parse_object_structure,
    parse_search_results,
)

mcp = FastMCP("abap_mcp")

READ_ONLY = {
    "readOnlyHint": True,
    "destructiveHint": False,
    "idempotentHint": True,
    "openWorldHint": True,  # talks to an external SAP system
}

# httpx.HTTPError belongs here: a VPN drop, a TLS failure, or an ATC run that
# overruns the read timeout must come back as a structured tool error, not as
# an unhandled exception out of the MCP layer.
HANDLED = (AdtError, ProfileError, AdtParseError, httpx.HTTPError)


def _json(payload: object) -> str:
    return json.dumps(payload, ensure_ascii=False, indent=2)


def _err(exc: Exception) -> str:
    return _json({"error": str(exc), "errorType": type(exc).__name__})


async def _with_client(profile_id: str, fn):
    client = AdtClient(get_profile(profile_id))
    try:
        return await fn(client)
    finally:
        await client.aclose()


# ---------------------------------------------------------------------- tools


@mcp.tool(
    name="abap_list_profiles",
    annotations={"title": "List client system profiles", **READ_ONLY},
)
async def abap_list_profiles() -> str:
    """List configured client system profiles (id, client name, release,
    ATC variant, write-allowed flag). Use the profile id in all other tools.
    Touches no SAP system — run this first when diagnosing setup problems."""
    try:
        profiles = load_profiles()
    except ProfileError as exc:
        return _err(exc)
    return _json(
        [
            {
                "id": p.id,
                "client_name": p.client_name,
                "base_url": p.base_url,
                "sap_client": p.sap_client,
                "release": p.release,
                "atc_check_variant": p.atc_check_variant,
                "allow_write": p.allow_write,
                "notes": p.notes,
            }
            for p in profiles.values()
        ]
    )


class ProfileInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    profile: str = Field(..., description="Profile id (see abap_list_profiles)")


@mcp.tool(
    name="abap_check_connection",
    annotations={"title": "Check ADT connectivity", **READ_ONLY},
)
async def abap_check_connection(params: ProfileInput) -> str:
    """Verify that the ADT services are reachable and the service user can
    authenticate. Cheapest call that touches SAP — use it to isolate a
    network/SICF/authorization problem from a parsing problem."""
    try:

        async def op(c: AdtClient):
            resp = await c.discovery()
            atc = None
            try:
                atc = parse_atc_customizing((await c.get_atc_customizing()).text)
            except HANDLED as exc:  # ATC may not be configured; not fatal here
                atc = {"error": str(exc)}
            return _json(
                {
                    "reachable": True,
                    "status": resp.status_code,
                    "base_url": c.profile.base_url,
                    "sap_client": c.profile.sap_client,
                    "atcCustomizing": atc,
                }
            )

        return await _with_client(params.profile, op)
    except HANDLED as exc:
        return _err(exc)


class SearchInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    profile: str = Field(..., description="Profile id, e.g. 'acme-dev'")
    query: str = Field(
        ..., min_length=2, description="Object name pattern, e.g. 'ZSD_*' or 'Z*PRICING*'"
    )
    object_type: Optional[str] = Field(
        default=None,
        description="Optional filter: PROG, CLAS, INTF, FUGR, TABL, DEVC ...",
    )
    max_results: int = Field(default=25, ge=1, le=100)


@mcp.tool(
    name="abap_search_objects",
    annotations={"title": "Search repository objects", **READ_ONLY},
)
async def abap_search_objects(params: SearchInput) -> str:
    """Quick-search the ABAP repository by object name pattern. Returns name,
    type, package, description and ADT URI for each hit. Use the URI with
    abap_run_atc / abap_syntax_check; use name+type with abap_get_source."""
    try:

        async def op(c: AdtClient):
            resp = await c.search_objects(
                params.query, params.max_results, params.object_type
            )
            return _json(parse_search_results(resp.text))

        return await _with_client(params.profile, op)
    except HANDLED as exc:
        return _err(exc)


class SourceInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    profile: str = Field(..., description="Profile id")
    object_type: str = Field(..., description="One of PROG, INCL, CLAS, INTF, FUNC")
    name: str = Field(..., min_length=1, description="Object name, e.g. 'ZSD_PRICING_RPT'")
    function_group: Optional[str] = Field(
        default=None, description="Required for FUNC only"
    )


@mcp.tool(name="abap_get_source", annotations={"title": "Get ABAP source", **READ_ONLY})
async def abap_get_source(params: SourceInput) -> str:
    """Fetch the full source code of a program, include, class, interface, or
    function module. Returns raw ABAP source as plain text."""
    try:

        async def op(c: AdtClient):
            return await c.get_source(
                params.object_type, params.name, params.function_group
            )

        return await _with_client(params.profile, op)
    except HANDLED as exc:
        return _err(exc)


class StructureInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    profile: str = Field(..., description="Profile id")
    object_type: str = Field(..., description="CLAS or INTF")
    name: str = Field(..., min_length=1)


@mcp.tool(
    name="abap_get_object_structure",
    annotations={"title": "Get class/interface outline", **READ_ONLY},
)
async def abap_get_object_structure(params: StructureInput) -> str:
    """Get the component outline (methods, attributes, events) of a class or
    interface — useful before fetching a large object's full source. Only
    /oo/ objects expose this endpoint; for a program use abap_get_source or
    abap_get_object_metadata."""
    try:

        async def op(c: AdtClient):
            resp = await c.get_object_structure(params.object_type, params.name)
            return _json(parse_object_structure(resp.text))

        return await _with_client(params.profile, op)
    except HANDLED as exc:
        return _err(exc)


class MetadataInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    profile: str = Field(..., description="Profile id")
    object_type: str = Field(..., description="One of PROG, INCL, CLAS, INTF, FUNC")
    name: str = Field(..., min_length=1)
    function_group: Optional[str] = Field(default=None)


@mcp.tool(
    name="abap_get_object_metadata",
    annotations={"title": "Get object metadata and links", **READ_ONLY},
)
async def abap_get_object_metadata(params: MetadataInput) -> str:
    """Get an object's adtcore attributes (package, author, changed-at,
    version) and the atom:link list showing which sub-resources this release
    actually exposes for it. Release-tolerant: use this when a more specific
    tool returns HTTP 404/406 and you need to see what the system offers."""
    try:

        async def op(c: AdtClient):
            resp = await c.get_object_metadata(
                params.object_type, params.name, params.function_group
            )
            return _json(parse_object_metadata(resp.text))

        return await _with_client(params.profile, op)
    except HANDLED as exc:
        return _err(exc)


class AtcRunInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    profile: str = Field(..., description="Profile id")
    object_uris: list[str] = Field(
        ...,
        min_length=1,
        max_length=50,
        description=(
            "ADT object URIs from abap_search_objects, e.g. "
            "'/sap/bc/adt/programs/programs/zsd_pricing_rpt'. Bare object URIs "
            "— no '/source/main' suffix, no '#start=' fragment."
        ),
    )
    check_variant: Optional[str] = Field(
        default=None,
        description="Override the profile's ATC check variant, e.g. 'S4HANA_READINESS_2023'",
    )
    max_verdicts: int = Field(default=100, ge=1, le=1000)
    include_exempted: bool = Field(default=False)


@mcp.tool(
    name="abap_run_atc",
    annotations={"title": "Run ATC check and return findings", **READ_ONLY},
)
async def abap_run_atc(params: AtcRunInput) -> str:
    """Run an ATC check over one or more objects and return the findings in
    one call. Executes the full ADT worklist protocol (create worklist ->
    execute run -> fetch worklist). ATC executes checks in the SAP system but
    modifies nothing.

    Each finding carries object, priority, check id/title, message, and — where
    the release provides it — source line. Newer releases return a verdict URI
    with no line number; a null line is normal, not a parsing failure. Feed the
    findings into the remediation playbooks to propose fixes.

    Large object sets can take minutes; the profile's timeout_seconds governs
    how long the client waits."""
    try:

        async def op(c: AdtClient):
            variant = params.check_variant or c.profile.atc_check_variant
            worklist_id = await c.create_atc_worklist(variant)
            run_resp = await c.execute_atc_run(
                worklist_id, params.object_uris, params.max_verdicts
            )
            run_info = parse_atc_run(run_resp.text)
            # some releases echo the id back; prefer it when present
            effective_id = run_info.get("worklistId") or worklist_id

            if run_info["failures"]:
                return _json(
                    {
                        "checkVariant": variant,
                        "worklistId": effective_id,
                        "status": "TOOL_FAILURE",
                        "message": (
                            "The ATC run reported a tool failure — no findings were "
                            "produced. This usually means missing check prerequisites "
                            "or an unusable check variant."
                        ),
                        "infos": run_info["infos"],
                    }
                )
            if run_info["noObjects"]:
                return _json(
                    {
                        "checkVariant": variant,
                        "worklistId": effective_id,
                        "status": "NO_OBJECTS",
                        "message": (
                            "The object set contained nothing ATC can check. Verify "
                            "the object URIs came from abap_search_objects and are "
                            "bare object URIs."
                        ),
                        "infos": run_info["infos"],
                    }
                )

            worklist = await c.get_atc_worklist(effective_id, params.include_exempted)
            result = parse_atc_findings(worklist.text)
            result["checkVariant"] = variant
            result["status"] = "OK"
            result["runInfos"] = run_info["infos"]
            if not result["worklistId"]:
                result["worklistId"] = effective_id
            # A truncated worklist must never read as "that is all of them" —
            # these counts feed the effort estimates in the playbooks.
            if result["findingCount"] >= params.max_verdicts:
                result["truncated"] = True
                result["warning"] = (
                    f"Findings reached the max_verdicts cap ({params.max_verdicts}). "
                    "There are probably more. Re-run with a higher cap, or split "
                    "the object set, before using these counts for estimation."
                )
            if result.get("objectSetIsComplete") == "false":
                result["warning"] = (
                    (result.get("warning", "") + " ").strip()
                    + " ATC reported objectSetIsComplete=false — the checked set "
                    "is not the full set you asked for."
                ).strip()
            return _json(result)

        return await _with_client(params.profile, op)
    except HANDLED as exc:
        return _err(exc)


class AtcFindingsInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    profile: str = Field(..., description="Profile id")
    worklist_id: str = Field(..., description="Worklist id returned by abap_run_atc")
    include_exempted: bool = Field(default=False)


@mcp.tool(
    name="abap_get_atc_findings",
    annotations={"title": "Re-read an ATC worklist", **READ_ONLY},
)
async def abap_get_atc_findings(params: AtcFindingsInput) -> str:
    """Re-read the findings of an existing ATC worklist by id — for example a
    worklist produced by a central/baseline run rather than by abap_run_atc."""
    try:

        async def op(c: AdtClient):
            resp = await c.get_atc_worklist(params.worklist_id, params.include_exempted)
            return _json(parse_atc_findings(resp.text))

        return await _with_client(params.profile, op)
    except HANDLED as exc:
        return _err(exc)


class SyntaxCheckInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    profile: str = Field(..., description="Profile id")
    object_uris: list[str] = Field(
        ...,
        min_length=1,
        max_length=50,
        description="Bare ADT object URIs, as returned by abap_search_objects",
    )
    version: str = Field(
        default="active", description="'active' or 'inactive' source version"
    )


@mcp.tool(
    name="abap_syntax_check",
    annotations={"title": "Syntax-check stored objects", **READ_ONLY},
)
async def abap_syntax_check(params: SyntaxCheckInput) -> str:
    """Run the ABAP syntax check against the version stored in the system.

    This checks what is already in the SAP system — it cannot check candidate
    source, because that would mean sending code to the server, which this
    read-only server does not do. Use it to confirm an object is clean before
    proposing a fix, and to establish a baseline before a human applies one."""
    try:

        async def op(c: AdtClient):
            resp = await c.run_syntax_check(params.object_uris, params.version)
            return _json(parse_check_reports(resp.text))

        return await _with_client(params.profile, op)
    except HANDLED as exc:
        return _err(exc)


def main() -> None:
    mcp.run()  # stdio transport


if __name__ == "__main__":
    main()
