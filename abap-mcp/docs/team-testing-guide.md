# abap-mcp — Team Testing Guide (v0.2, read-only)

Audience: senior ABAP/technical team members validating this internally
before any client-facing use. Nothing here can write, activate, or
transport — the toolset is display-only by construction.

---

## 1. What this is (and is not)

- A small local program (Python, ~700 lines) that lets Claude Code call
  the standard ADT REST services (`/sap/bc/adt/...`) — the same APIs
  Eclipse ADT uses.
- It contains **no AI**. The model runs in Claude Code, under the
  operator's existing Claude subscription. This adapter only translates
  "tool calls" into HTTPS requests to the SAP system and returns the
  responses as text.
- It does **not** replace ATC, the Custom Code Migration app, SUM/DMO,
  or transport discipline. It reads via the service user's display
  authorizations, nothing more.
- It is deliberately unvalidated against live systems. The point of
  this exercise is your scrutiny: connectivity assumptions, authorization
  scope, and the ADT XML parsing per release level.

**What changed since v0.1**, since some of you saw that version:

- The ATC tool was **wrong** in v0.1 — a single POST, which cannot work. It now
  runs the real worklist protocol (create worklist → execute run → fetch
  worklist) and returns findings in one call.
- Added a syntax-check tool over `/checkruns`, and a connection-check tool.
- Parsers are namespace-aware and tolerate release-level attribute drift; 37
  offline tests pin the behaviour against fixtures from two release
  generations.
- Added `scripts/adt_probe.py` — the capture tool described in §5.

## 2. Architecture

```
+-----------------------------+
|      ANTHROPIC CLOUD        |
|  +-----------------------+  |
|  |   Claude model        |  |   <- the "brain" (only place AI runs)
|  |   (operator's plan)   |  |
|  +----------^------------+  |
+-------------|---------------+
              |  internet (normal Claude Code traffic)
+-------------|-----------------------------------+
|  CONSULTANT |LAPTOP  (on client VPN)            |
|  +----------v------------+                      |
|  |  Claude Code CLI      |   <- the agent loop  |
|  |  (terminal / VSCode)  |                      |
|  +----------+------------+                      |
|             | stdio (auto-started subprocess)   |
|  +----------v------------+   +---------------+  |
|  |  abap-mcp server      |   |  playbooks/   |  |
|  |  (adapter, no AI)     |   |  profiles/    |  |
|  +----------+------------+   +---------------+  |
+-------------|-----------------------------------+
              | HTTPS + Basic auth + CSRF (via VPN)
+-------------v---------------+
|      CLIENT NETWORK         |
|  +-----------------------+  |
|  |  SAP DEV system       |  |   <- ABAP source lives here
|  |  /sap/bc/adt (SICF)   |  |      display-only service user
|  |  ECC 6 EhP7+ / S/4    |  |
|  +-----------------------+  |
+-----------------------------+
```

Operating loop (target state, after validation):

```
 Operator: "remediate the KONV findings per playbook"
      |
      v
 [model] -> abap_get_atc_findings ------> SAP
 [model] -> abap_get_source ------------> SAP
 [model applies playbook fix pattern]
 [model] -> syntax check (v0.2) --------> SAP
      |
      v
 Human review -> human transports  (nothing is auto-activated, ever)
```

## 3. Prerequisites

Per tester:
- Laptop with Python 3.11+ and Claude Code CLI installed
- Network path to the target sandbox (VPN as applicable)
- An active Claude subscription usable with Claude Code

On the SAP sandbox (Basis, once):
- Dialog-less service user with display-only authorizations:
  S_ADT, S_DEVELOP (ACTVT 03), ATC display
- SICF node `/sap/bc/adt` active, reachable over HTTPS
- ATC check variant available (readiness variant if testing that flow)

## 4. Installation (per laptop, ~10 minutes)

```bash
unzip abap-mcp-v0.2.zip -d ~/tools/
cd ~/tools/abap-mcp
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"

# Offline sanity check — no SAP system needed, takes about a second.
# If this fails, stop: the problem is the installation, not the sandbox.
python -m pytest -q
```

Create your profile:

```bash
cp profiles/example.profile.yaml profiles/sandbox-dev.yaml
# edit: base_url, sap_client, release, atc_check_variant
```

Set credentials (environment only — never in the YAML; profiles/ is
gitignored, but treat the whole folder as confidential regardless):

```bash
export ABAP_MCP_SANDBOX_DEV_USER=SVC_REMEDIATE
export ABAP_MCP_SANDBOX_DEV_PASS=********
```

Register with Claude Code:

```bash
claude mcp add abap -e ABAP_MCP_PROFILE_DIR=~/tools/abap-mcp/profiles \
  -- ~/tools/abap-mcp/.venv/bin/python -m abap_mcp.server
```

## 5. Smoke test — run the probe first, then the agent

### 5a. The probe (do this before anything else)

`scripts/adt_probe.py` walks the same ten calls the MCP server makes, stops at
the first failure, and saves every raw response. It is the fastest way to find
out what this release actually returns, and it produces the artefact that lets
the parsers be fixed properly.

```bash
python scripts/adt_probe.py --profile sandbox-dev \
    --object-type PROG --object-name <A KNOWN Z-PROGRAM> \
    --out captures/
```

| # | Step | Proves | Touches SAP? |
|---|---|---|---|
| 1 | Reachability (`/core/discovery`) | VPN, SICF, TLS, auth | Yes (read) |
| 2 | Repository search | Search endpoint + result parsing | Yes (read) |
| 3 | Object metadata | Object URI mapping, atom:links | Yes (read) |
| 4 | Source retrieval | `/source/main` mapping | Yes (read) |
| 5 | Class/interface outline | `/objectstructure` (skipped for PROG) | Yes (read) |
| 6 | Syntax check (`/checkruns`) | Media-type negotiation, CSRF on POST | Yes (read) |
| 7 | ATC customizing | ATC configured, default variant name | Yes (read) |
| 8 | ATC create worklist | Variant exists, worklist id returned | Yes (read) |
| 9 | ATC execute run | Run payload accepted for this release | Yes (read) |
| 10 | ATC fetch findings | Worklist XML parsing | Yes (read) |

**Expect a failure somewhere.** That is the point. Send back `captures/` and
which step failed.

⚠️ `captures/` contains object names, package names, developer IDs and ATC
findings from the system you pointed at. It is gitignored — sanitize before
sharing outside the team.

### 5b. Then the agent

Once the probe is green to at least step 4, start a Claude Code session and ask
in plain language:

| # | Ask Claude Code | Proves |
|---|---|---|
| 1 | "List the ABAP profiles" | Server starts, config readable (no SAP) |
| 2 | "Check the connection to sandbox-dev" | Reachability through the MCP layer |
| 3 | "Search for objects matching Z* on sandbox-dev" | Search tool + parsing |
| 4 | "Get the source of \<known Z-program\>" | Source retrieval |
| 5 | "Syntax-check it" | `/checkruns` round trip |
| 6 | "Run ATC on it with variant \<X\> and show me the findings by priority" | Full ATC protocol |
| 7 | "Now apply the KONV playbook to those findings and show me what you'd change" | The part that actually matters — see §7 |

## 6. Expected failure points (please log which one you hit)

| Symptom | Likely cause | Fix |
|---|---|---|
| `pytest` fails before you touch SAP | Bad install / wrong Python | Python 3.11+, `pip install -e ".[dev]"` |
| "List profiles" fails | Wrong `ABAP_MCP_PROFILE_DIR`, malformed YAML | Check paths and YAML syntax |
| Probe step 1: HTTP 401 | Env var names don't match the profile id | `ABAP_MCP_<ID>_USER/_PASS`, id uppercased, dashes → underscores |
| Probe step 1: HTTP 403 | SICF node inactive, or missing S_ADT | Basis: activate `/sap/bc/adt`; check SU53 for the service user |
| Probe step 1: TLS error | Self-signed cert on sandbox | `verify_tls: false` in the profile — sandbox only |
| Probe step 1: "Could not obtain a CSRF token" | Discovery reachable but no token header | Confirm `curl -k -H "x-csrf-token: fetch" https://<host>:<port>/sap/bc/adt/core/discovery -D-` returns the header |
| Step 2 OK but 0 objects parsed | Parser vs release-level XML drift | Open `captures/02_search.xml`; adjust `xml_parsers.py` |
| Step 6: HTTP 406 / 415 | Release rejects the `vnd.sap.*` media types | The client already retries with `application/*`; if that also fails, capture and report |
| Step 8: empty worklist id | Check variant does not exist in this system | Verify the variant in transaction ATC / SCI |
| Step 9: `TOOL_FAILURE` | ATC prerequisites missing, or the variant is unusable here | Read `atcinfo:description` in `captures/09_atc_run.xml` |
| Step 9: `NO_OBJS` | Object URI wrong (has `/source/main` or a fragment) | Use the bare URI from search output |
| Step 10: findings have no line number | **Not a bug on newer releases** | S/4HANA 2022+ returns a verdict URI with no position. Null line is expected |
| Timeouts | VPN routing / port not open, or a long ATC run | `curl -k https://<host>:<port>/sap/bc/adt/core/discovery`; raise `timeout_seconds` in the profile |

Parser adjustments on first contact with a given release level are expected.
That is validation working as intended, not a defect in the approach — and now
each one becomes a test, so it stays fixed.

## 7. What feedback is wanted

1. Which release level you tested against, and which steps passed/failed
2. Raw XML samples where parsing failed (sanitize object names if needed)
3. Authorization objects actually required beyond the documented set
4. Your view on the KONV playbook (`playbooks/konv-prcd-elements.md`):
   are the fix patterns and the F3 write-escalation rule correct and
   complete from your project experience?
5. Anything about the governance checklist
   (`docs/client-onboarding-checklist.md`) that would not survive contact
   with a real client security review

## 8. Ground rules for this test

- Sandbox / internal systems only. No client systems until governance
  consent exists per engagement (see onboarding checklist).
- Display-only service user. Do not grant change authorizations "to see
  what happens" — write tooling is a separate, gated, later phase.
- The AI proposes; humans review; humans transport. That rule is
  permanent, not a v0.1 limitation.
