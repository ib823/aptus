"""Release-compatibility gate: every SAP object the code references must be released on every
target product, so that what is built side by side on BTP also runs on-stack.

Targets (from SAP's Cloudification Repository, github.com/SAP/abap-atc-cr-cv-s4hc):
  BTP ABAP environment (development system), S/4HANA Cloud Public Edition, and
  S/4HANA Private Edition / on-premise 2023 and 2025 (every feature package listed).

Profiles:
  core  engine and application code; must be released on every target, BTP included (default)
  s4    on-stack S/4 connector code; must be released on Public, Private 2023 and Private 2025

Usage:
  python3 -I tools/portability_check.py [--profile core|s4] [--repo DIR] [--src DIR] [--json]

Without --repo, the repository is fetched (sparse, release files only) at the pinned commit into
./.cloudification. Exit code 1 when any referenced SAP object is not released on every target.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

REPO_URL = "https://github.com/SAP/abap-atc-cr-cv-s4hc.git"
PINNED_COMMIT = "cd34bed"
TARGETS = {
    "BTP": ["objectReleaseInfo_BTPLatest.json"],
    "Public": ["objectReleaseInfoLatest.json"],
    "Private 2023": ["objectReleaseInfo_PCE2023_0.json", "objectReleaseInfo_PCE2023_1.json",
                     "objectReleaseInfo_PCE2023_2.json", "objectReleaseInfo_PCE2023_3.json"],
    "Private 2025": ["objectReleaseInfo_PCE2025_0.json", "objectReleaseInfo_PCE2025_1.json",
                     "objectReleaseInfo_PCE2025_2.json"],
}
PROFILES = {"core": ["BTP", "Public", "Private 2023", "Private 2025"],
            "s4": ["Public", "Private 2023", "Private 2025"]}
OWN = re.compile(r"^(Z|Y|LCL_|LTC_|LTD_|LIF_|LHC_|LSC_)")


def fetch(dest: Path) -> Path:
    if not (dest / "src").exists():
        subprocess.run(["git", "clone", "-q", "--filter=blob:none", "--sparse", REPO_URL, str(dest)], check=True)
        subprocess.run(["git", "-C", str(dest), "sparse-checkout", "set", "--no-cone", "src/objectReleaseInfo*.json"],
                       check=True)
    subprocess.run(["git", "-C", str(dest), "checkout", "-q", PINNED_COMMIT], check=True)
    return dest


def release_states(repo: Path, targets: list[str]) -> dict[str, list[dict[str, str]]]:
    """target -> one {object name: state} map per feature package."""
    out = {}
    for target in targets:
        files = TARGETS[target]
        maps = []
        for fn in files:
            rows = json.loads((repo / "src" / fn).read_text())["objectReleaseInfo"]
            maps.append({(r.get("tadirObjName") or "").upper(): r.get("state", "") for r in rows})
        out[target] = maps
    return out


ID = r"([A-Za-z_/][A-Za-z0-9_/]*)"
# Positions where ABAP, CDS and BDEF sources name a global object.
ABAP_POSITIONS = [
    rf"\b(?:TYPE|LIKE)\s+(?:REF\s+TO\s+|(?:STANDARD\s+|SORTED\s+|HASHED\s+)?TABLE\s+OF\s+(?:REF\s+TO\s+)?|RANGE\s+OF\s+)?{ID}",
    rf"\b(?:NEW|CAST|CONV|VALUE|REF|CORRESPONDING|EXACT|REDUCE|COND|SWITCH|FILTER)\s+{ID}\s*\(",
    rf"(?<![-~>A-Za-z0-9_/]){ID}\s*=>",
    rf"\bINHERITING\s+FROM\s+{ID}",
    rf"\bINTERFACES\s+{ID}",
    rf"\bRAISE\s+EXCEPTION\s+(?:TYPE|NEW)\s+{ID}",
    rf"\b(?:FROM|JOIN|UPDATE|INSERT\s+INTO|MODIFY|DELETE\s+FROM)\s+{ID}",
    rf"\bFOR\s+(?:BEHAVIOR\s+OF|TESTING\s+OF)\s+{ID}",
]
LIST_POSITIONS = [r"\b(?:RAISING|CATCH)\s+((?:[A-Za-z_/][A-Za-z0-9_/]*\s+)+?)(?:INTO\b|\.|$)"]
CDS_POSITIONS = [
    rf"\b(?:from|join|projection\s+on)\s+{ID}",
    rf"\b(?:association|composition)\s*(?:\[[^\]]*\])?\s*(?:to|of)\s+(?:parent\s+)?{ID}",
    rf"\b(?:implementation\s+in\s+class|persistent\s+table|draft\s+table|define\s+behavior\s+for)\s+{ID}",
]
# Constants and types of the built-in type group ABAP are released with the type group itself.
TYPE_GROUP_MEMBERS = {"ABAP_BOOL": "ABAP", "ABAP_TRUE": "ABAP", "ABAP_FALSE": "ABAP", "ABAP_UNDEFINED": "ABAP"}


def strip(text: str) -> str:
    text = re.sub(r"(?m)^\*.*$", "", text)
    text = re.sub(r'"[^\n]*', "", text)
    text = re.sub(r"//[^\n]*", "", text)
    return re.sub(r"`[^`]*`|'[^']*'|\|[^|\n]*\|", "", text)


def referenced_names(src: Path) -> dict[str, set[str]]:
    """global object name -> files referring to it (comments and literals removed)."""
    found: dict[str, set[str]] = {}

    def add(name: str, fname: str) -> None:
        name = name.upper()
        found.setdefault(TYPE_GROUP_MEMBERS.get(name, name), set()).add(fname)

    for f in sorted(src.glob("*.abap")):
        text = strip(f.read_text(encoding="utf-8"))
        for pat in ABAP_POSITIONS:
            for m in re.finditer(pat, text, re.I):
                add(m.group(1), f.name)
        for pat in LIST_POSITIONS:
            for m in re.finditer(pat, text, re.I | re.M):
                for name in m.group(1).split():
                    add(name, f.name)
        for m in re.finditer(r"\b(ABAP_(?:BOOL|TRUE|FALSE|UNDEFINED))\b", text, re.I):
            add(m.group(1), f.name)
    for f in sorted(src.glob("*.asddls")) + sorted(src.glob("*.asbdef")):
        text = strip(f.read_text(encoding="utf-8"))
        for pat in CDS_POSITIONS:
            for m in re.finditer(pat, text, re.I):
                add(m.group(1), f.name)
    for f in sorted(src.glob("*.xml")):
        for m in re.finditer(r"<(?:ROLLNAME|DOMNAME|REFTABLE|CHECKTABLE)>([^<]+)</", f.read_text(encoding="utf-8")):
            add(m.group(1), f.name)
    return found


def main() -> int:
    ap = argparse.ArgumentParser()
    here = Path(__file__).resolve().parents[1]
    ap.add_argument("--profile", choices=sorted(PROFILES), default="core")
    ap.add_argument("--repo", type=Path)
    ap.add_argument("--src", type=Path, default=here / "src")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()

    repo = a.repo or fetch(here / ".cloudification")
    states = release_states(repo, PROFILES[a.profile])
    universe = set().union(*(m.keys() for maps in states.values() for m in maps))
    refs = {n: files for n, files in referenced_names(a.src).items() if n in universe and not OWN.match(n)}

    report, failures = [], 0
    for name in sorted(refs):
        row = {"object": name, "files": sorted(refs[name])}
        ok = True
        for target, maps in states.items():
            st = sorted({m.get(name, "not listed") for m in maps})
            row[target] = "/".join(st)
            ok &= st == ["released"]
        row["ok"] = ok
        failures += not ok
        report.append(row)

    if a.json:
        print(json.dumps({"pinned_commit": PINNED_COMMIT, "profile": a.profile, "objects": report,
                          "failures": failures}, indent=1))
    else:
        cols = PROFILES[a.profile]
        print(f"Cloudification Repository @ {PINNED_COMMIT}; profile {a.profile}: {', '.join(cols)}")
        print(f"{'SAP object':36s}" + "".join(f"{c:>14s}" for c in cols))
        for r in report:
            mark = "" if r["ok"] else "   <-- not released on every target"
            print(f"{r['object']:36s}" + "".join(f"{r[c]:>14s}" for c in cols) + mark)
        print(f"\n{len(report)} SAP objects referenced; {failures} not released on every target.")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
