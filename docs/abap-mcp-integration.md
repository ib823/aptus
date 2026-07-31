# ABAP MCP × CoreEdge — integration decision record

**Date:** 2026-07-31 · **Status:** adopted (vendoring), hosted mode deferred with a named condition

## What was decided

`abap-mcp/` (v0.2, Python, FastMCP over stdio) is vendored into this repository
as a sibling deliverable: versioned with the solution, tested in CI
(`.github/workflows/abap-mcp.yml`, path-filtered), **not** part of the Next.js
build. Its 73-test offline suite passes here under `mcp>=1.2,<2` — the 2.x SDK
moved `mcp.server.fastmcp` and does not import; the pin is load-bearing and
recorded in `abap-mcp/pyproject.toml`.

## Why stdio-on-a-laptop is the CORRECT current architecture, not a compromise

The server's targets are client ECC / on-prem S/4 systems reachable only from
inside client networks (VPN). This deployment cannot reach them either — the
same Cloud Connector / static-IP wall that blocks Private and on-prem
connections from Vercel (see `SapConnection` and the connection-test TIMEOUT
guidance). A "hosted" MCP here today would be a URL whose every tool times
out. The consultant's laptop, on the client VPN, running the server over
stdio for Claude Code/Desktop, is the only topology that works now — and it is
exactly what v0.2 was designed for.

## The hosted mode, and its trigger

When the AWS/static-IP era lands **and** a client network path exists
(site-to-site VPN or an agreed allowlist), the server graduates to a remote
MCP endpoint:

- **Transport:** FastMCP's Streamable HTTP (`mcp.run(transport=...)`) — the
  same tool code, different mount. It stays a separate Python service beside
  the Next app; it does not move into a Vercel function.
- **Credentials:** profiles stop reading env vars and read `SapConnection`
  rows — the schema is already congruent (`baseUrl`, `client` = profile
  `sap_client`, sealed secrets, environment binding). One credential store,
  one audit trail, for humans and AI clients alike.
- **Auth to the endpoint:** MCP clients authenticate with bearer tokens issued
  by the northbound credential system — never SAP credentials.
- **Authorization:** the read-only tool list plus the service user's
  display-only ABAP roles remain the real boundary, per the server's own
  design principle #3.

## What CoreEdge uses today, without hosting anything

- **Playbooks** (`abap-mcp/playbooks/*.md`) are the IP — versioned fix
  patterns per Simplification Item (KONV→PRCD_ELEMENTS, MATNR length,
  VBUK/VBUP/VBFA, Open SQL strict mode). Candidates for surfacing in the
  Workbench as reference content; deliberately not auto-ingested yet.
- **ATC output** is the bridge artifact: a consultant runs `abap_run_atc`
  locally and the findings JSON can be imported into CoreEdge for per-client
  remediation tracking. That import path is the natural next build item and
  needs no connectivity to SAP at all.

## The strategic frame (from the project's own decision paper)

`abap-mcp/docs/build-vs-adopt.md` (2026-07-30) found SAP now ships its own ADT
MCP server inside ADT/Eclipse and VS Code — the pipe is being commoditised by
the vendor. Consequence for this repo: the **pipe** (`adt_client.py`) is kept
working but is not the investment surface; the **playbooks, profiles,
governance and the CoreEdge linkage above are**. Re-read that paper before
extending the ADT client materially.

## Standing rules carried over from the server's README

- Credentials never in profile files; `profiles/*.yaml` stays gitignored
  (`example.profile.yaml` is the only committed profile).
- Read-only toolset until the write phase is deliberately opened
  (`allow_write` is reserved, and the real gate is the service user's roles).
- Not yet validated against a live system — run `scripts/adt_probe.py` first
  on every new engagement; fixtures are not a sandbox.
