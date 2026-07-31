"""Parsers for ADT XML responses -> plain dicts for tool output.

Design rules, learned from comparing captured responses across release levels:

1. Match by NAMESPACE URI + local name, never by prefix string. ADT declares
   namespaces on descendant elements, not only on the document root, and the
   prefixes are not stable across releases.
2. Every release-dependent attribute is optional. A finding on NW 7.5x has no
   `processor`/`checksum`/`quickfixes`; one on S/4HANA 2022+ does. Neither
   absence is an error.
3. Never assume a source location. On older releases `atcfinding:location` is
   an ADT source URI with a `#start=line,col` fragment; on newer ones it is a
   verdict URI with no line information at all. Parse the fragment only if it
   is there.

Namespace URIs (stable across the releases seen):
    atc         http://www.sap.com/adt/atc
    atcworklist http://www.sap.com/adt/atc/worklist
    atcobject   http://www.sap.com/adt/atc/object
    atcfinding  http://www.sap.com/adt/atc/finding
    atcinfo     http://www.sap.com/adt/atc/info
    adtcore     http://www.sap.com/adt/core
    chkrun      http://www.sap.com/adt/checkrun
    atom        http://www.w3.org/2005/Atom
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET

NS_ATC = "http://www.sap.com/adt/atc"
NS_ATC_WORKLIST = "http://www.sap.com/adt/atc/worklist"
NS_ATC_OBJECT = "http://www.sap.com/adt/atc/object"
NS_ATC_FINDING = "http://www.sap.com/adt/atc/finding"
NS_ATC_INFO = "http://www.sap.com/adt/atc/info"
NS_ADTCORE = "http://www.sap.com/adt/core"
NS_CHKRUN = "http://www.sap.com/adt/checkrun"
NS_ATOM = "http://www.w3.org/2005/Atom"

_LOCATION_RE = re.compile(
    r"#start=(?P<line>\d+)(?:,(?P<col>\d+))?"
    r"(?:;end=(?P<end_line>\d+)(?:,(?P<end_col>\d+))?)?"
)


class AdtParseError(Exception):
    """The response was not the XML document this parser expects."""


# --------------------------------------------------------------- primitives


def _split(tag: str) -> tuple[str | None, str]:
    """'{uri}local' -> (uri, local); 'local' -> (None, 'local')."""
    if tag.startswith("{"):
        uri, _, local = tag[1:].partition("}")
        return uri, local
    return None, tag


def _local(tag: str) -> str:
    return _split(tag)[1]


def _is(el: ET.Element, ns: str, local: str) -> bool:
    """True if the element is {ns}local, tolerating a missing namespace.

    Some releases emit inner elements unqualified (e.g. the <property>
    elements inside atc:customizing). Accepting an unqualified match keeps the
    parser working there without weakening the namespaced case.
    """
    el_ns, el_local = _split(el.tag)
    return el_local == local and (el_ns is None or el_ns == ns)


def _attrs(el: ET.Element, ns: str | None = None) -> dict[str, str]:
    """Attributes keyed by local name.

    With `ns`, only attributes in that namespace (or unqualified) are kept.

    Unqualified attributes are collected FIRST and namespaced ones overwrite
    them. Document order must not decide the winner: an element carrying both
    `adtcore:name` and a bare `name` would otherwise resolve to whichever
    happened to be written last.
    """
    unqualified: dict[str, str] = {}
    qualified: dict[str, str] = {}
    for key, value in el.attrib.items():
        key_ns, key_local = _split(key)
        if key_ns is None:
            unqualified[key_local] = value
            continue
        if ns is not None and key_ns != ns:
            continue
        qualified[key_local] = value
    return {**unqualified, **qualified}


def _root(xml_text: str, expected: str | None = None) -> ET.Element:
    """Parse and, when `expected` is given, assert the document type.

    The assertion matters more than it looks. Without it, an unrecognised 200
    response — a different release's schema, an ADT exception document, a
    re-authentication page — parses fine, matches nothing, and every summarising
    parser reports a confident, wrong "all clear": zero findings, zero syntax
    errors, zero search hits. A silent false negative on a client's remediation
    scope is the worst failure this tool can produce, so an unrecognised
    document is an error, never a clean result.
    """
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as exc:
        excerpt = xml_text[:300].replace("\n", " ")
        raise AdtParseError(
            f"Response is not well-formed XML ({exc}). First 300 chars: {excerpt!r}"
        ) from exc
    if expected is not None and _local(root.tag) != expected:
        excerpt = xml_text[:300].replace("\n", " ")
        raise AdtParseError(
            f"Expected an ADT <{expected}> document but the root element is "
            f"<{_local(root.tag)}>. This is not a parse failure to work around: "
            "the system returned a document shape this client does not know, so "
            "any summary would be wrong. Capture it with scripts/adt_probe.py "
            f"and add a fixture. First 300 chars: {excerpt!r}"
        )
    return root


def _outermost(root: ET.Element, ns: str, local: str) -> list[ET.Element]:
    """Matching elements that are not nested inside another match."""
    matches = [el for el in root.iter() if _is(el, ns, local)]
    nested: set[int] = set()
    for el in matches:
        for descendant in el.iter():
            if descendant is not el and _is(descendant, ns, local):
                nested.add(id(descendant))
    return [el for el in matches if id(el) not in nested]


def _descend_until(start: ET.Element, stop_ns: str, stop_local: str):
    """Walk `start`'s subtree, not entering a nested {stop_ns}stop_local."""
    yield start
    for child in start:
        if _is(child, stop_ns, stop_local):
            continue
        yield from _descend_until(child, stop_ns, stop_local)


def parse_source_location(location: str | None) -> dict:
    """Split an ADT location into uri + line/column, when a fragment exists.

    Returns {"uri": ..., "line": int|None, "column": int|None}. Callers must
    treat a missing line as normal: newer releases put a verdict URI here that
    carries no position at all.
    """
    if not location:
        return {"uri": "", "line": None, "column": None}
    uri = location.split("#", 1)[0]
    match = _LOCATION_RE.search(location)
    if not match:
        return {"uri": uri, "line": None, "column": None}
    col = match.group("col")
    return {
        "uri": uri,
        "line": int(match.group("line")),
        "column": int(col) if col is not None else None,
    }


# ------------------------------------------------------------------ search


_NAME_WITH_TYPE_RE = re.compile(r"^(\S+)\s+\((.*)\)$")


def parse_search_results(xml_text: str) -> list[dict]:
    """Parse repository quick-search results.

    Older systems return adtcore:name as 'ZREPORT (PROGRAM)' and omit the
    description; split that apart so callers see a clean object name.
    """
    root = _root(xml_text, expected="objectReferences")
    results: list[dict] = []
    for el in root.iter():
        if not _is(el, NS_ADTCORE, "objectReference"):
            continue
        attrs = _attrs(el, NS_ADTCORE)
        name = attrs.get("name", "")
        description = attrs.get("description", "")
        match = _NAME_WITH_TYPE_RE.match(name)
        if match:
            name = match.group(1)
            description = description or match.group(2)
        results.append(
            {
                "name": name,
                "type": attrs.get("type", ""),
                "package": attrs.get("packageName", ""),
                "description": description,
                "uri": attrs.get("uri", ""),
            }
        )
    return results


# ----------------------------------------------------------- object outline


def parse_object_structure(xml_text: str) -> list[dict]:
    """Flatten an abapsource:objectStructureElement tree into components.

    Only classes and interfaces serve this document. Matched by local name
    because the abapsource namespace URI is not stable across releases.
    """
    root = _root(xml_text, expected="objectStructureElement")
    items: list[dict] = []
    for el in root.iter():
        if _local(el.tag) != "objectStructureElement":
            continue
        if el is root:
            continue  # the wrapper element describes the object itself
        core = _attrs(el, NS_ADTCORE)
        if not core.get("name"):
            continue
        entry = {
            "name": core.get("name", ""),
            "type": core.get("type", ""),
            "description": core.get("description", ""),
        }
        extra = _attrs(el)
        for flag in ("visibility", "level", "final", "redefinition", "testmethod"):
            if flag in extra:
                entry[flag] = extra[flag]
        items.append(entry)
    return items


def parse_object_metadata(xml_text: str) -> dict:
    """adtcore attributes + atom:link targets from a bare object GET."""
    root = _root(xml_text)
    meta = {"attributes": _attrs(root, NS_ADTCORE), "links": []}
    for el in root.iter():
        if _is(el, NS_ATOM, "link"):
            link = _attrs(el)
            meta["links"].append(
                {
                    "href": link.get("href", ""),
                    "rel": link.get("rel", ""),
                    "type": link.get("type", ""),
                }
            )
    return meta


# --------------------------------------------------------------------- ATC


def parse_atc_customizing(xml_text: str) -> dict:
    """Extract the configured check variants from atc:customizing."""
    root = _root(xml_text, expected="customizing")
    props: dict[str, str] = {}
    for el in root.iter():
        if not _is(el, NS_ATC, "property"):
            continue
        attrs = _attrs(el)
        if "name" in attrs:
            props[attrs["name"]] = attrs.get("value", "")
    return {
        "systemCheckVariant": props.get("systemCheckVariant", ""),
        "afterActivationCheckVariant": props.get("afterActivationCheckVariant", ""),
        "properties": props,
    }


def parse_atc_run(xml_text: str) -> dict:
    """Parse the atcworklist:worklistRun returned by POST /atc/runs.

    Note the asymmetry with the worklist document: here worklistId and
    worklistTimestamp are CHILD ELEMENTS; in the worklist they are ATTRIBUTES.
    Both spellings are accepted anyway, so a release that flips them does not
    break the client.
    """
    root = _root(xml_text, expected="worklistRun")
    info: dict = {"worklistId": "", "worklistTimestamp": "", "infos": []}

    for key, value in _attrs(root, NS_ATC_WORKLIST).items():
        if key in ("worklistId", "id"):
            info["worklistId"] = value
        elif key in ("worklistTimestamp", "timestamp"):
            info["worklistTimestamp"] = value

    for el in root.iter():
        if _is(el, NS_ATC_WORKLIST, "worklistId") and el.text:
            info["worklistId"] = el.text.strip()
        elif _is(el, NS_ATC_WORKLIST, "worklistTimestamp") and el.text:
            info["worklistTimestamp"] = el.text.strip()
        elif _is(el, NS_ATC_INFO, "info"):
            entry = {"type": "", "description": ""}
            for child in el:
                if _is(child, NS_ATC_INFO, "type"):
                    entry["type"] = (child.text or "").strip()
                elif _is(child, NS_ATC_INFO, "description"):
                    entry["description"] = (child.text or "").strip()
            info["infos"].append(entry)

    info["failures"] = [i for i in info["infos"] if i["type"] == "TOOL_FAILURE"]
    info["noObjects"] = any(i["type"] == "NO_OBJS" for i in info["infos"])
    return info


def parse_atc_findings(xml_text: str) -> dict:
    """Parse an ATC worklist document into objects + a flat findings list.

    Structure (namespaces declared on descendants, hence namespace-aware
    matching throughout):

        atcworklist:worklist
          atcworklist:objects
            atcobject:object            <- adtcore:* attributes
              atcobject:findings
                atcfinding:finding      <- adtcore:uri + atcfinding:* attrs
                  atom:link             <- documentation long text
                  atcfinding:quickfixes <- newer releases only
    """
    root = _root(xml_text, expected="worklist")
    worklist_attrs = _attrs(root, NS_ATC_WORKLIST)
    if not any(_is(el, NS_ATC_WORKLIST, "objects") for el in root.iter()):
        raise AdtParseError(
            "The ATC worklist document has no <atcworklist:objects> element. "
            "Refusing to report zero findings from a document shape this client "
            "does not recognise. Capture it with scripts/adt_probe.py."
        )
    findings: list[dict] = []
    objects: list[dict] = []

    # Only top-level objects. Iterating root.iter() and then descending with
    # obj_el.iter() would count a finding once per ancestor object if a release
    # (or a package/transport-scoped worklist) nests them — inflating exactly
    # the counts that feed the playbooks' effort estimates.
    for obj_el in _outermost(root, NS_ATC_OBJECT, "object"):
        core = _attrs(obj_el, NS_ADTCORE)
        obj_extra = _attrs(obj_el, NS_ATC_OBJECT)
        obj_entry = {
            "name": core.get("name", ""),
            "type": core.get("type", ""),
            "package": core.get("packageName", ""),
            "uri": core.get("uri", ""),
            "author": obj_extra.get("author", ""),
            "findingCount": 0,
        }
        for find_el in _descend_until(obj_el, NS_ATC_OBJECT, "object"):
            if not _is(find_el, NS_ATC_FINDING, "finding"):
                continue
            fa = _attrs(find_el, NS_ATC_FINDING)
            ca = _attrs(find_el, NS_ADTCORE)
            location = parse_source_location(fa.get("location"))
            finding = {
                "objectName": obj_entry["name"],
                "objectType": obj_entry["type"],
                "package": obj_entry["package"],
                "priority": fa.get("priority", ""),
                "checkId": fa.get("checkId", ""),
                "checkTitle": fa.get("checkTitle", ""),
                "messageId": fa.get("messageId", ""),
                "messageTitle": fa.get("messageTitle", ""),
                "location": fa.get("location", ""),
                "sourceUri": location["uri"],
                "line": location["line"],
                "column": location["column"],
                "findingUri": ca.get("uri", ""),
                "exemptionApproval": fa.get("exemptionApproval", ""),
                "exemptionKind": fa.get("exemptionKind", ""),
            }
            # release-dependent, absent on older systems
            for optional in ("processor", "lastChangedBy", "checksum", "quickfixInfo"):
                if optional in fa:
                    finding[optional] = fa[optional]
            for child in find_el:
                if _is(child, NS_ATC_FINDING, "quickfixes"):
                    qa = _attrs(child, NS_ATC_FINDING)
                    finding["quickfixes"] = {
                        "manual": qa.get("manual", ""),
                        "automatic": qa.get("automatic", ""),
                        "pseudo": qa.get("pseudo", ""),
                    }
                elif _is(child, NS_ATOM, "link"):
                    link = _attrs(child)
                    if link.get("rel", "").endswith("/documentation"):
                        finding["documentationUri"] = link.get("href", "")
            findings.append(finding)
            obj_entry["findingCount"] += 1
        objects.append(obj_entry)

    by_priority: dict[str, int] = {}
    for finding in findings:
        by_priority[finding["priority"]] = by_priority.get(finding["priority"], 0) + 1

    return {
        "worklistId": worklist_attrs.get("id", ""),
        "timestamp": worklist_attrs.get("timestamp", ""),
        "objectSetIsComplete": worklist_attrs.get("objectSetIsComplete", ""),
        "objectCount": len(objects),
        "findingCount": len(findings),
        "findingsByPriority": dict(sorted(by_priority.items())),
        "objects": objects,
        "findings": findings,
    }


# --------------------------------------------------------------- checkruns


def parse_check_reports(xml_text: str) -> dict:
    """Parse chkrun:checkRunReports from POST /checkruns."""
    root = _root(xml_text, expected="checkRunReports")
    reports: list[dict] = []
    messages: list[dict] = []
    unknown_severities: set[str] = set()

    for rep_el in _outermost(root, NS_CHKRUN, "checkReport"):
        ra = _attrs(rep_el, NS_CHKRUN)
        report = {
            "reporter": ra.get("reporter", ""),
            "triggeringUri": ra.get("triggeringUri", ""),
            "status": ra.get("status", ""),
            "statusText": ra.get("statusText", ""),
            "messageCount": 0,
        }
        for msg_el in _descend_until(rep_el, NS_CHKRUN, "checkReport"):
            if not _is(msg_el, NS_CHKRUN, "checkMessage"):
                continue
            ma = _attrs(msg_el, NS_CHKRUN)
            location = parse_source_location(ma.get("uri"))
            message = {
                "reporter": report["reporter"],
                "severity": ma.get("type", ""),
                "shortText": ma.get("shortText", ""),
                "sourceUri": location["uri"],
                "line": location["line"],
                "column": location["column"],
            }
            for optional in ("code", "category"):
                if optional in ma:
                    message[optional] = ma[optional]
            for child in msg_el:
                if _is(child, NS_CHKRUN, "t100Key"):
                    ta = _attrs(child, NS_CHKRUN)
                    message["t100"] = {
                        "msgid": ta.get("msgid", ""),
                        "msgno": ta.get("msgno", ""),
                    }
            if message["severity"].upper() not in {"E", "W", "I", "S", "A", "X", ""}:
                unknown_severities.add(message["severity"])
            messages.append(message)
            report["messageCount"] += 1
        reports.append(report)

    if not reports:
        raise AdtParseError(
            "The checkrun response contained no <chkrun:checkReport> elements. "
            "Refusing to report the object as clean — an unrecognised document "
            "shape must not be summarised as 'no syntax errors'. Capture it "
            "with scripts/adt_probe.py."
        )

    errors = sum(1 for m in messages if m["severity"].upper() == "E")
    warnings = sum(1 for m in messages if m["severity"].upper() == "W")
    result = {
        # 'clean' means "checked, and no errors or warnings" — never
        # "we did not understand the response".
        "clean": errors == 0 and warnings == 0 and not unknown_severities,
        "errorCount": errors,
        "warningCount": warnings,
        "reports": reports,
        "messages": messages,
    }
    if unknown_severities:
        result["warning"] = (
            "Unrecognised severity codes "
            f"{sorted(unknown_severities)} — not counted as errors or warnings. "
            "Treat this object as UNVERIFIED and capture the response."
        )
    return result
