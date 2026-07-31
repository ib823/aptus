# abap-mcp — Proprietary ABAP Remediation MCP Server

An MCP (Model Context Protocol) server that connects AI clients (Claude Code,
Claude Desktop) to SAP ABAP systems via the **ADT REST APIs** — built for
multi-client consulting work: custom code remediation, brownfield S/4HANA
conversion, and version upgrades.

**Status: v0.2 — read-only toolset, offline-tested, not yet validated against a
live system.** 73 tests cover the parsers, the ADT protocol and the tool layer,
but fixtures are not a sandbox. Run `scripts/adt_probe.py` against the target
system before trusting any output.

## Design principles

1. **Zero footprint in the client system.** Only requirements client-side: a
   service user with ADT authorizations (S_ADT, S_DEVELOP display) and
   `/sap/bc/adt` active in SICF.
2. **One server, many clients.** Per-engagement connection profiles in
   `profiles/`. Credentials come from environment variables — never stored in
   profile files.
3. **Read-only by default.** No write, activate, lock, or transport tools.
   Write capability is a deliberate later phase, gated per profile
   (`allow_write: true`) and always behind human review. The real boundary is
   the service user's display-only authorizations; the tool list is convenience.
4. **Playbooks carry the IP.** The remediation knowledge lives in
   `playbooks/*.md` — versioned fix patterns per Simplification Item. The
   server is plumbing; the playbooks are the asset.

## Architecture

```
Claude Code ──stdio──> abap-mcp (this server, your laptop)
                          │ HTTPS + Basic auth + CSRF
                          ▼
                Client SAP system  /sap/bc/adt/...
                (ECC 6 EhP7+ / S/4HANA, NW 7.4+)
```

## Tools (all read-only)

| Tool | Purpose |
|---|---|
| `abap_list_profiles` | Show configured client systems. Touches no SAP system |
| `abap_check_connection` | Verify reachability, auth, and ATC customizing |
| `abap_search_objects` | Repository quick search by name/type |
| `abap_get_source` | Fetch source of program/include/class/interface/function module |
| `abap_get_object_structure` | Outline (methods, attributes) of a class or interface |
| `abap_get_object_metadata` | adtcore attributes + atom:links — the release-tolerant fallback |
| `abap_run_atc` | Full ATC round trip on one or more objects, returning findings |
| `abap_get_atc_findings` | Re-read an existing worklist by id (e.g. a central baseline run) |
| `abap_syntax_check` | ABAP syntax check of the stored version via `/checkruns` |

## What changed in v0.2

- **`abap_run_atc` now implements the real ADT protocol.** v0.1 used a
  single-shot POST that could not work. The actual flow is
  `POST /atc/worklists?checkVariant=` (returns a worklist id as **plain text**)
  → `POST /atc/runs?worklistId=` → `GET /atc/worklists/{id}`. Critically, the
  `worklistId` parameter on `/atc/runs` carries the **worklist id, not the check
  variant** — the most common way this flow is implemented wrongly, including in
  a widely-used community library whose parameter is misnamed at that call site.
  The tool now runs the whole round trip and returns findings in one call.
- **`abap_syntax_check` added** (`/checkruns`), with a media-type fallback for
  releases that reject the specific `vnd.sap.*` types.
- **Parsers are namespace-aware.** ADT declares namespaces on descendant
  elements, not just roots, and prefixes are not stable. Matching by prefix
  string silently finds zero findings.
- **`atcfinding:location` is handled in both shapes.** On NW 7.5x it is a
  source URI with `#start=line,col`; on S/4HANA 2022+ it is a verdict URI with
  **no line information at all**. A null line is normal, not a parse failure.
- **Release-dependent attributes are optional** (`processor`, `checksum`,
  `quickfixes`, `objectTypeId`) — absence on either side is not an error.
- **`scripts/adt_probe.py`** — captures raw responses from a sandbox, layer by
  layer, so parsers get fixed against real bytes.
- **`tests/`** — 73 offline tests over fixture XML from two release generations
  plus a mocked ADT service. `pytest` needs no SAP system.
- **An unrecognised response is now an error, never a clean result.** Previously
  a document this client did not understand — a different release's schema, an
  ADT exception, a re-authentication page — parsed fine, matched nothing, and
  was summarised as "no syntax errors" / "no ATC findings" / "no search hits".
  A silent false negative on a client's remediation scope is the worst failure
  this tool can produce, so the parsers now assert the document shape.
- **Object URIs from tool input are validated and XML-escaped.** A crafted URI
  could previously inject elements into the request body — including the
  `chkrun:artifacts` element a read-only client must never send.
- Network failures, TLS errors and read timeouts come back as structured tool
  errors with a diagnosis, not as unhandled exceptions.
- ABAP source is decoded correctly when the response carries no charset
  (common on older systems); previously non-ASCII literals were silently
  corrupted and could be proposed back as a "fix".

## Setup

```bash
cd abap-mcp
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"

# Credentials per profile (never in the YAML):
export ABAP_MCP_SANDBOX_DEV_USER=SVC_REMEDIATE
export ABAP_MCP_SANDBOX_DEV_PASS=********
```

Claude Code registration:

```bash
claude mcp add abap -e ABAP_MCP_PROFILE_DIR=/path/to/abap-mcp/profiles \
  -- /path/to/abap-mcp/.venv/bin/python -m abap_mcp.server
```

## Validate against a new system — do this before any client use

```bash
python -m pytest                      # offline: parsers and protocol

python scripts/adt_probe.py --profile sandbox-dev \
    --object-type PROG --object-name ZSD_PRICING_RPT --out captures/
```

The probe walks the same call sequence the server uses, stops at the first
failure, and writes every raw response to `captures/`. When a step fails, fix
the parser against the saved bytes and add the (sanitized) response to
`tests/fixtures/` with a test that pins it. That is how release coverage
accumulates.

⚠️ `captures/` contains client object names, package names, developer IDs and
ATC findings. It is gitignored — keep it that way, and sanitize before sharing.

## Known limitations / TODO

- **Nothing here has met a live system yet.** ADT XML parsing is validated
  against fixtures reconstructed from two release generations, not against a
  client's actual release. Expect drift; that is what the probe is for.
- Basic auth over HTTPS only. No SSO/SNC/JWT. Fine for dev systems; confirm
  with each client's Basis/security team.
- Self-signed certs: `verify_tls: false` in the profile for **sandboxes only**.
- Where-used / dependency analysis not implemented (next candidate).
- DDIC and CDS source retrieval not implemented.
- No write tools — by design, and permanently unless separately gated.

## Docs

- `docs/team-testing-guide.md` — architecture diagram, per-laptop installation,
  ordered smoke test, troubleshooting table
- `docs/client-onboarding-checklist.md` — governance-first onboarding. Do not
  skip the data-governance consent step: client ABAP source transits to the LLM
  provider, and that needs explicit written client consent per engagement
- `docs/build-vs-adopt.md` — assessment of community and SAP MCP servers, and
  the open question of whether we keep building our own ADT client

## Playbooks

| Playbook | Simplification item |
|---|---|
| `konv-prcd-elements.md` | Pricing condition data model, KONV → PRCD_ELEMENTS |
| `matnr-field-length.md` | Material number field length extension, 18 → 40 |
| `vbuk-vbup-vbfa.md` | SD status tables and document flow |
| `open-sql-strict-mode.md` | ABAP SQL strict mode, pool/cluster tables, clean-core |

Each playbook carries a **Provenance** section separating what is SAP-verified
(safe to cite to a client) from what is our engineering judgment. Keep that
discipline when adding new ones — a wrong SAP Note number in a client
deliverable costs more credibility than a missing playbook.
