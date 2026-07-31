#!/usr/bin/env python3
"""adt_probe — capture raw ADT responses from a sandbox, layer by layer.

Why this exists: the ADT REST API has no published contract. Every parser in
this repo is written against responses observed on OTHER systems. The only way
to know what YOUR client's release actually returns is to capture it.

Run this before trusting any tool output on a new system. It walks the same
call sequence the MCP server uses, stops at the first failure, and writes every
raw response to a capture directory so the parsers can be fixed against real
bytes instead of guesses.

    python scripts/adt_probe.py --profile sandbox-dev \
        --object-type PROG --object-name ZSD_PRICING_RPT \
        --out captures/

Read-only: it issues the same GETs and the same two ATC POSTs the server does.
It never writes, locks, activates, or transports anything.

⚠️ Captures contain your client's object names, package names, developer IDs
and ATC findings. Treat the capture directory as client-confidential: sanitize
before sharing, and never commit it.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from abap_mcp.adt_client import AdtClient, AdtError  # noqa: E402
from abap_mcp.profiles import ProfileError, get_profile  # noqa: E402
from abap_mcp import xml_parsers as P  # noqa: E402

RESET, RED, GREEN, YELLOW, DIM = "\033[0m", "\033[31m", "\033[32m", "\033[33m", "\033[2m"


class Probe:
    def __init__(self, out_dir: Path):
        self.out_dir = out_dir
        self.out_dir.mkdir(parents=True, exist_ok=True)
        self.results: list[dict] = []

    def save(self, name: str, text: str, suffix: str = "xml") -> Path:
        path = self.out_dir / f"{name}.{suffix}"
        path.write_text(text, encoding="utf-8")
        return path

    async def step(self, number: str, title: str, fn):
        """Run one probe step; record outcome; never raise."""
        print(f"\n{DIM}[{number}]{RESET} {title}")
        try:
            summary = await fn()
        except (AdtError, ProfileError) as exc:
            print(f"  {RED}FAIL{RESET} {exc}")
            self.results.append({"step": number, "title": title, "ok": False, "error": str(exc)})
            return None
        except Exception as exc:  # parser bug, not a transport problem
            print(f"  {RED}PARSE FAIL{RESET} {type(exc).__name__}: {exc}")
            print(f"  {YELLOW}The raw response was saved — the parser needs work, not the client.{RESET}")
            self.results.append(
                {"step": number, "title": title, "ok": False, "error": f"{type(exc).__name__}: {exc}"}
            )
            return None
        print(f"  {GREEN}OK{RESET} {summary.get('summary', '')}")
        self.results.append({"step": number, "title": title, "ok": True, **summary})
        return summary


async def run(args: argparse.Namespace) -> int:
    probe = Probe(Path(args.out))
    profile = get_profile(args.profile)
    print(f"Probing {profile.client_name} ({profile.base_url}, client {profile.sap_client})")
    print(f"Declared release: {profile.release}   Captures -> {probe.out_dir}")

    client = AdtClient(profile)
    object_uri: str | None = None
    try:
        # ---------------------------------------------------------- 1 reach
        async def s1():
            resp = await client.discovery()
            probe.save("01_discovery", resp.text)
            return {"summary": f"HTTP {resp.status_code}, {len(resp.text)} bytes"}

        if await probe.step("1", "Reachability + auth (/core/discovery)", s1) is None:
            return _finish(probe, client)

        # --------------------------------------------------------- 2 search
        async def s2():
            resp = await client.search_objects(args.search, args.max_results)
            probe.save("02_search", resp.text)
            hits = P.parse_search_results(resp.text)
            if hits:
                print(f"  {DIM}first hit: {hits[0]['name']} ({hits[0]['type']}) -> {hits[0]['uri']}{RESET}")
            else:
                print(f"  {YELLOW}0 hits parsed — if the raw XML has results, the parser needs fixing{RESET}")
            return {"summary": f"{len(hits)} objects parsed", "parsed": len(hits)}

        await probe.step("2", f"Repository search ({args.search})", s2)

        # ------------------------------------------------------- 3 metadata
        async def s3():
            resp = await client.get_object_metadata(
                args.object_type, args.object_name, args.function_group
            )
            probe.save("03_object_metadata", resp.text)
            meta = P.parse_object_metadata(resp.text)
            return {
                "summary": f"{len(meta['links'])} atom:links, "
                f"package={meta['attributes'].get('packageName', '?')}"
            }

        await probe.step("3", f"Object metadata ({args.object_type} {args.object_name})", s3)

        # --------------------------------------------------------- 4 source
        async def s4():
            source = await client.get_source(
                args.object_type, args.object_name, args.function_group
            )
            probe.save("04_source", source, suffix="abap")
            return {"summary": f"{len(source.splitlines())} lines of ABAP"}

        await probe.step("4", "Source retrieval", s4)

        try:
            object_uri = AdtClient.object_uri(
                args.object_type, args.object_name, args.function_group
            )
        except AdtError as exc:
            # e.g. FUNC without --function-group, or an unsupported type. Record
            # it as a step rather than dying, so the report still gets written.
            print(f"\n{RED}Cannot build an object URI:{RESET} {exc}")
            probe.results.append(
                {"step": "4b", "title": "Object URI", "ok": False, "error": str(exc)}
            )
            return _finish(probe, client)

        # -------------------------------------------------------- 5 outline
        if args.object_type.upper() in {"CLAS", "INTF"}:
            async def s5():
                resp = await client.get_object_structure(args.object_type, args.object_name)
                probe.save("05_objectstructure", resp.text)
                items = P.parse_object_structure(resp.text)
                return {"summary": f"{len(items)} components parsed"}

            await probe.step("5", "Class/interface outline", s5)
        else:
            print(f"\n{DIM}[5]{RESET} Outline — skipped ({args.object_type} has no /objectstructure)")

        # --------------------------------------------------- 6 syntax check
        async def s6():
            resp = await client.run_syntax_check([object_uri])
            probe.save("06_checkrun", resp.text)
            report = P.parse_check_reports(resp.text)
            return {
                "summary": f"{report['errorCount']} errors, {report['warningCount']} warnings"
            }

        await probe.step("6", "Syntax check (/checkruns)", s6)

        # -------------------------------------------------- 7 ATC customizing
        variant = args.check_variant or profile.atc_check_variant

        async def s7():
            resp = await client.get_atc_customizing()
            probe.save("07_atc_customizing", resp.text)
            cust = P.parse_atc_customizing(resp.text)
            if cust["systemCheckVariant"]:
                print(f"  {DIM}system check variant: {cust['systemCheckVariant']}{RESET}")
            return {"summary": f"systemCheckVariant={cust['systemCheckVariant'] or '(none)'}"}

        await probe.step("7", "ATC customizing", s7)

        # ------------------------------------------------ 8 ATC create worklist
        worklist_id: str | None = None

        async def s8():
            nonlocal worklist_id
            worklist_id = await client.create_atc_worklist(variant)
            probe.save("08_atc_worklist_id", worklist_id, suffix="txt")
            return {"summary": f"worklist id {worklist_id}"}

        if await probe.step("8", f"ATC create worklist (variant {variant})", s8) is None:
            return _finish(probe, client)

        # --------------------------------------------------------- 9 ATC run
        async def s9():
            resp = await client.execute_atc_run(worklist_id, [object_uri], args.max_verdicts)
            probe.save("09_atc_run", resp.text)
            info = P.parse_atc_run(resp.text)
            if info["failures"]:
                print(f"  {YELLOW}TOOL_FAILURE: {info['failures'][0]['description']}{RESET}")
            if info["noObjects"]:
                print(f"  {YELLOW}NO_OBJS — ATC could not check this object{RESET}")
            return {"summary": f"id={info['worklistId'] or '(not echoed)'}, infos={len(info['infos'])}"}

        await probe.step("9", "ATC execute run", s9)

        # ---------------------------------------------------- 10 ATC findings
        async def s10():
            resp = await client.get_atc_worklist(worklist_id)
            probe.save("10_atc_worklist", resp.text)
            result = P.parse_atc_findings(resp.text)
            no_line = sum(1 for f in result["findings"] if f["line"] is None)
            if result["findings"]:
                print(f"  {DIM}by priority: {result['findingsByPriority']}{RESET}")
                if no_line:
                    print(
                        f"  {DIM}{no_line}/{result['findingCount']} findings have no source "
                        f"line — expected on newer releases (verdict URIs){RESET}"
                    )
            return {
                "summary": f"{result['objectCount']} objects, {result['findingCount']} findings",
                "findingCount": result["findingCount"],
            }

        await probe.step("10", "ATC fetch findings", s10)

    finally:
        await client.aclose()

    return _finish(probe, None)


def _finish(probe: Probe, client) -> int:
    passed = sum(1 for r in probe.results if r["ok"])
    total = len(probe.results)
    report = {
        "capturedAt": datetime.now(timezone.utc).isoformat(),
        "passed": passed,
        "total": total,
        "steps": probe.results,
    }
    (probe.out_dir / "probe_report.json").write_text(
        json.dumps(report, indent=2), encoding="utf-8"
    )
    print(f"\n{'=' * 60}")
    print(f"{passed}/{total} steps passed. Captures in {probe.out_dir}/")
    failed = [r for r in probe.results if not r["ok"]]
    if failed:
        print(f"\n{YELLOW}Next action:{RESET} for each failed step, open the saved raw")
        print("response and adjust src/abap_mcp/xml_parsers.py or adt_client.py, then")
        print("add the (sanitized) response to tests/fixtures/ with a test that pins it.")
        for r in failed:
            print(f"  - [{r['step']}] {r['title']}: {r['error']}")
    return 0 if not failed else 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--profile", required=True, help="Profile id from profiles/")
    parser.add_argument("--object-type", default="PROG", help="PROG, INCL, CLAS, INTF, FUNC")
    parser.add_argument("--object-name", required=True, help="A known custom object to probe")
    parser.add_argument("--function-group", default=None, help="Required for FUNC")
    parser.add_argument("--search", default="Z*", help="Search pattern for step 2")
    parser.add_argument("--max-results", type=int, default=10)
    parser.add_argument("--check-variant", default=None, help="Override the profile's ATC variant")
    parser.add_argument("--max-verdicts", type=int, default=100)
    parser.add_argument("--out", default="captures", help="Capture directory")
    args = parser.parse_args()
    try:
        return asyncio.run(run(args))
    except (ProfileError, AdtError) as exc:
        print(f"{RED}Setup error:{RESET} {exc}", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
