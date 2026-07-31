"""Clean-room client for SAP ADT REST APIs (read-only subset).

Implements only what the read-only toolset needs:
- session with Basic auth, sap-client, stateless session header
- CSRF token fetch + retry for POST endpoints (ATC, checkruns)
- object-type -> ADT URI mapping for source retrieval
- the REAL multi-step ATC flow
- ABAP syntax check via /checkruns

Endpoints used (all under /sap/bc/adt):
  core/discovery                           GET   CSRF bootstrap / reachability
  repository/informationsystem/search      GET   quick search
  programs/programs/{name}                 GET   program metadata
  programs/programs/{name}/source/main     GET   report source
  programs/includes/{name}/source/main     GET   include source
  oo/classes/{name}/source/main            GET   class pool source
  oo/classes/{name}/objectstructure        GET   class outline (OO only)
  oo/interfaces/{name}/source/main         GET   interface source
  functions/groups/{grp}/fmodules/{fm}/source/main  GET  function module
  atc/customizing                          GET   default check variant
  atc/worklists?checkVariant=              POST  create worklist -> id (text/plain)
  atc/runs?worklistId=                     POST  execute the run
  atc/worklists/{id}                       GET   findings
  checkruns?reporters=abapCheckRun         POST  syntax check

ATC FLOW — this is a multi-step protocol, not one POST. Cross-checked against
two independent open-source ADT clients (jfilak/sapcli sap/adt/atc.py and
marcellourbani/abap-adt-api src/api/atc.ts) plus sapcli's captured-response
test fixtures:

  0. (optional) GET  atc/customizing              -> systemCheckVariant
  1.            POST atc/worklists?checkVariant=X  -> worklist id as PLAIN TEXT
  2.            POST atc/runs?worklistId=<id>      -> atcworklist:worklistRun
  3.            GET  atc/worklists/<id>            -> the findings

The `worklistId` query parameter on step 2 is the ID from step 1 — NOT the
check variant name. (abap-adt-api names that parameter `variant` at the call
site, which is a naming bug in that library and the most common way this
flow gets implemented wrongly.)

Response shapes vary by release level. The parsers in xml_parsers.py are
namespace-aware and treat release-dependent attributes as optional, but every
parser must still be sandbox-validated. Use scripts/adt_probe.py to capture
raw responses from a target system before trusting any of this.
"""

from __future__ import annotations

import re
from urllib.parse import quote
from xml.sax.saxutils import quoteattr

import httpx

from .profiles import Profile

ADT_ROOT = "/sap/bc/adt"

# Object URIs reach us from MCP tool input. They are interpolated into XML
# request bodies and into request paths, so they are validated before use:
# an unescaped '"' can inject elements into the body (including the
# chkrun:artifacts element a read-only client must never send), and an '&'
# produces a malformed request.
_SAFE_OBJECT_URI = re.compile(r"^/sap/bc/adt/[A-Za-z0-9_%./$-]+$")
_SAFE_WORKLIST_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")

# Object type (as users say it) -> object URI template (no /source/main)
OBJECT_URI = {
    "PROG": ADT_ROOT + "/programs/programs/{name}",
    "INCL": ADT_ROOT + "/programs/includes/{name}",
    "CLAS": ADT_ROOT + "/oo/classes/{name}",
    "INTF": ADT_ROOT + "/oo/interfaces/{name}",
    "FUNC": ADT_ROOT + "/functions/groups/{group}/fmodules/{name}",
}

# Object types that expose the /objectstructure outline endpoint.
# abap-adt-api hard-gates this on /oo/classes/ and /oo/interfaces/ and swallows
# errors for everything else ("older servers or non-class objects").
OUTLINE_TYPES = {"CLAS", "INTF"}

ACCEPT_ATC_CUSTOMIZING = (
    "application/xml, "
    "application/vnd.sap.atc.customizing-v1+xml, "
    "application/atc.customizing.v1+xml"
)
ACCEPT_ATC_WORKLIST = "application/atc.worklist.v1+xml"
CT_CHECKOBJECTS = "application/vnd.sap.adt.checkobjects+xml"
ACCEPT_CHECKMESSAGES = "application/vnd.sap.adt.checkmessages+xml"


class AdtError(Exception):
    """HTTP/protocol error talking to the ABAP system, with guidance."""


class AtcToolFailure(AdtError):
    """The ATC run itself reported a failure (atcinfo:type = TOOL_FAILURE)."""


class AdtClient:
    def __init__(self, profile: Profile):
        self.profile = profile
        user, password = profile.credentials
        self._http = httpx.AsyncClient(
            base_url=profile.base_url,
            auth=(user, password),
            verify=profile.verify_tls,
            params={"sap-client": profile.sap_client, "sap-language": profile.language},
            headers={
                "Accept": "*/*",
                "Cache-Control": "no-cache",
                # read-only client: never hold a stateful ADT session
                "X-sap-adt-sessiontype": "stateless",
            },
            timeout=httpx.Timeout(30.0, read=profile.timeout_seconds),
            follow_redirects=True,
        )
        self._csrf: str | None = None

    async def aclose(self) -> None:
        await self._http.aclose()

    async def __aenter__(self) -> "AdtClient":
        return self

    async def __aexit__(self, *exc_info: object) -> None:
        await self.aclose()

    # ------------------------------------------------------------------ core

    async def get(
        self, path: str, accept: str, params: dict | None = None
    ) -> httpx.Response:
        try:
            resp = await self._http.get(path, headers={"Accept": accept}, params=params)
        except httpx.HTTPError as exc:
            raise self._transport_error(exc, path) from exc
        self._raise_for_status(resp, path)
        return resp

    @staticmethod
    def _transport_error(exc: httpx.HTTPError, path: str) -> AdtError:
        if isinstance(exc, httpx.TimeoutException):
            hint = (
                "Timed out. An ATC run over a large object set can take minutes "
                "— raise timeout_seconds in the profile. If even a small request "
                "times out, the host or port is not reachable from here."
            )
        elif isinstance(exc, httpx.ConnectError):
            hint = (
                "Could not connect. Check the VPN/network path, the host and "
                "port in the profile, and whether TLS verification is failing "
                "on a self-signed sandbox certificate (verify_tls)."
            )
        else:
            hint = "Transport-level failure before any HTTP response arrived."
        return AdtError(f"ADT request {path} failed: {type(exc).__name__}: {exc}. {hint}")

    async def post(
        self,
        path: str,
        content: str | None,
        content_type: str | None,
        accept: str,
        params: dict | None = None,
    ) -> httpx.Response:
        resp = await self._post_once(path, content, content_type, accept, params)
        if self._is_csrf_rejection(resp):
            self._csrf = None
            resp = await self._post_once(path, content, content_type, accept, params)
        self._raise_for_status(resp, path)
        return resp

    async def _post_once(
        self,
        path: str,
        content: str | None,
        content_type: str | None,
        accept: str,
        params: dict | None,
    ) -> httpx.Response:
        headers = {"Accept": accept, "x-csrf-token": await self._csrf_token()}
        if content_type:
            headers["Content-Type"] = content_type
        try:
            return await self._http.post(
                path,
                content=content.encode("utf-8") if content is not None else None,
                headers=headers,
                params=params,
            )
        except httpx.HTTPError as exc:
            raise self._transport_error(exc, path) from exc

    @staticmethod
    def _is_csrf_rejection(resp: httpx.Response) -> bool:
        """Only a genuine CSRF rejection, never a plain authorization failure.

        Matching any 403 body that merely mentions "CSRF" misclassifies
        "no authorization for object S_DEVELOP (CSRF-protected service)" as a
        token problem: the retry then fails at the discovery call and the
        operator is sent to look at SICF for what is actually an S_DEVELOP
        issue, with the real 403 body discarded.
        """
        if resp.status_code != 403:
            return False
        if resp.headers.get("x-csrf-token", "").lower() == "required":
            return True
        return "csrf token validation failed" in resp.text[:2000].lower()

    async def _csrf_token(self) -> str:
        if self._csrf:
            return self._csrf
        # /core/discovery is the canonical ADT service document (sapcli's
        # choice); /discovery is the fallback some releases serve instead.
        last_exc: Exception | None = None
        for path in (ADT_ROOT + "/core/discovery", ADT_ROOT + "/discovery"):
            try:
                resp = await self._http.get(
                    path,
                    headers={"x-csrf-token": "fetch", "Accept": "application/*"},
                )
            except httpx.HTTPError as exc:  # network-level, try the other path
                last_exc = exc
                continue
            token = resp.headers.get("x-csrf-token")
            if token and token.lower() not in {"required", "fetch"}:
                self._csrf = token
                return token
        raise AdtError(
            "Could not obtain a CSRF token from /sap/bc/adt/core/discovery or "
            "/sap/bc/adt/discovery. Check that the ADT services are active in "
            "SICF and that the service user has S_ADT authorization."
            + (f" Last transport error: {last_exc}" if last_exc else "")
        )

    @staticmethod
    def _raise_for_status(resp: httpx.Response, path: str) -> None:
        if resp.status_code < 400:
            return
        hints = {
            401: "Authentication failed — check profile credentials (env vars).",
            403: "Authorization failed — service user lacks S_ADT/S_DEVELOP, "
                 "or the SICF node is inactive.",
            404: "Object or service not found — verify the object name/type and "
                 "that this ADT service exists at this release level.",
            406: "Content negotiation failed — this release does not serve the "
                 "requested Accept type. Capture the exchange with "
                 "scripts/adt_probe.py and adjust the Accept header.",
            415: "Unsupported media type — this release does not accept the "
                 "request Content-Type. See scripts/adt_probe.py.",
            500: "Server error in the ABAP stack — check ST22 for a short dump "
                 "under the service user.",
        }
        hint = hints.get(resp.status_code, "")
        raise AdtError(
            f"ADT request {path} failed with HTTP {resp.status_code}. {hint} "
            f"Response excerpt: {resp.text[:400]}"
        )

    # --------------------------------------------------------------- helpers

    @staticmethod
    def validate_object_uris(uris: list[str]) -> list[str]:
        """Reject anything that is not a plain ADT object URI.

        These strings come from tool input and end up inside XML attributes.
        Escaping alone is not enough — we also want to be sure we are not
        being pointed at a non-ADT path.
        """
        for uri in uris:
            if not _SAFE_OBJECT_URI.match(uri):
                raise AdtError(
                    f"Refusing to use {uri!r} as an ADT object URI. Expected a "
                    "path like '/sap/bc/adt/programs/programs/zfoo' — use the "
                    "'uri' value returned by abap_search_objects, with no "
                    "'/source/main' suffix and no '#start=' fragment."
                )
        return uris

    @staticmethod
    def object_uri(obj_type: str, name: str, group: str | None = None) -> str:
        """Build the bare ADT object URI (no /source/main suffix)."""
        obj_type = obj_type.upper()
        if obj_type not in OBJECT_URI:
            raise AdtError(
                f"Unsupported object type '{obj_type}'. Supported: "
                f"{', '.join(OBJECT_URI)}. (DDIC/CDS retrieval is a later item.)"
            )
        if obj_type == "FUNC" and not group:
            raise AdtError("Function modules require the 'function_group' parameter.")
        # ADT URIs are lower-case and percent-encoded ($TMP -> %24tmp)
        return OBJECT_URI[obj_type].format(
            name=quote(name.lower(), safe=""),
            group=quote((group or "").lower(), safe=""),
        )

    # ------------------------------------------------------------ operations

    async def discovery(self) -> httpx.Response:
        """Reachability / capability probe. Cheapest call that touches SAP."""
        return await self.get(ADT_ROOT + "/core/discovery", accept="application/*")

    async def search_objects(
        self, query: str, max_results: int, object_type: str | None = None
    ) -> httpx.Response:
        params: dict[str, object] = {
            "operation": "quickSearch",
            "query": query,
            "maxResults": max_results,
        }
        if object_type:
            # ADT wants the base type only: CLAS, not CLAS/OC
            params["objectType"] = object_type.split("/", 1)[0].upper()
        return await self.get(
            ADT_ROOT + "/repository/informationsystem/search",
            accept="application/*",
            params=params,
        )

    async def get_source(
        self, obj_type: str, name: str, group: str | None = None
    ) -> str:
        path = self.object_uri(obj_type, name, group) + "/source/main"
        resp = await self.get(path, accept="text/plain")
        # ABAP source on older systems is frequently ISO-8859-1 and the response
        # often carries no charset. httpx would then decode as UTF-8 with
        # replacement characters, silently corrupting umlauts in literals and
        # comments — which then get proposed back as a "fix".
        if resp.charset_encoding:
            return resp.text
        try:
            return resp.content.decode("utf-8")
        except UnicodeDecodeError:
            return resp.content.decode("iso-8859-1")

    async def get_object_structure(self, obj_type: str, name: str) -> httpx.Response:
        """Class/interface outline. Only /oo/* exposes /objectstructure."""
        obj_type = obj_type.upper()
        if obj_type not in OUTLINE_TYPES:
            raise AdtError(
                "Outline via /objectstructure is only available for "
                f"{', '.join(sorted(OUTLINE_TYPES))}. For a program, fetch the "
                "source with abap_get_source, or read the object metadata."
            )
        return await self.get(
            self.object_uri(obj_type, name) + "/objectstructure",
            accept="application/*",
            params={"version": "active", "withShortDescriptions": "true"},
        )

    async def get_object_metadata(
        self, obj_type: str, name: str, group: str | None = None
    ) -> httpx.Response:
        """GET on the bare object URI — adtcore attributes plus atom:links.

        Works for every supported object type and is the release-tolerant way
        to discover which sub-resources an object actually exposes.
        """
        return await self.get(
            self.object_uri(obj_type, name, group), accept="application/*"
        )

    # ------------------------------------------------------------------- ATC

    async def get_atc_customizing(self) -> httpx.Response:
        return await self.get(
            ADT_ROOT + "/atc/customizing", accept=ACCEPT_ATC_CUSTOMIZING
        )

    async def create_atc_worklist(self, check_variant: str) -> str:
        """ATC step 1. Returns the worklist id (the response body is plain text)."""
        resp = await self.post(
            ADT_ROOT + "/atc/worklists",
            content=None,
            content_type=None,
            accept="text/plain",
            params={"checkVariant": check_variant},
        )
        worklist_id = resp.text.strip()
        if worklist_id and not _SAFE_WORKLIST_ID.match(worklist_id):
            raise AdtError(
                "POST /atc/worklists returned something that is not a worklist "
                f"id: {worklist_id[:200]!r}. On some releases this is an HTML "
                "logon page, which means the session was not authenticated."
            )
        if not worklist_id:
            raise AdtError(
                f"POST /atc/worklists?checkVariant={check_variant} returned an "
                "empty body. The check variant most likely does not exist in "
                "this system — verify it in transaction ATC / SCI."
            )
        return worklist_id

    @staticmethod
    def build_atc_run_body(object_uris: list[str], max_verdicts: int = 100) -> str:
        """Body for ATC step 2. Namespaces and element casing are load-bearing."""
        AdtClient.validate_object_uris(object_uris)
        refs = "".join(
            f"<adtcore:objectReference adtcore:uri={quoteattr(uri)}/>"
            for uri in object_uris
        )
        return (
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<atc:run xmlns:atc="http://www.sap.com/adt/atc" '
            f'maximumVerdicts="{max_verdicts}">'
            '<objectSets xmlns:adtcore="http://www.sap.com/adt/core">'
            '<objectSet kind="inclusive">'
            f"<adtcore:objectReferences>{refs}</adtcore:objectReferences>"
            "</objectSet>"
            "</objectSets>"
            "</atc:run>"
        )

    async def execute_atc_run(
        self, worklist_id: str, object_uris: list[str], max_verdicts: int = 100
    ) -> httpx.Response:
        """ATC step 2."""
        return await self.post(
            ADT_ROOT + "/atc/runs",
            content=self.build_atc_run_body(object_uris, max_verdicts),
            content_type="application/xml",
            accept="application/xml",
            params={"worklistId": worklist_id},
        )

    async def get_atc_worklist(
        self, worklist_id: str, include_exempted: bool = False
    ) -> httpx.Response:
        """ATC step 3 — the findings."""
        if not _SAFE_WORKLIST_ID.match(worklist_id):
            raise AdtError(
                f"Refusing {worklist_id!r} as a worklist id — expected the "
                "alphanumeric id returned by abap_run_atc."
            )
        return await self.get(
            ADT_ROOT + f"/atc/worklists/{worklist_id}",
            accept=ACCEPT_ATC_WORKLIST,
            params={
                "includeExemptedFindings": "true" if include_exempted else "false"
            },
        )

    # ------------------------------------------------------------- checkruns

    @staticmethod
    def build_checkrun_body(object_uris: list[str], version: str = "active") -> str:
        """Body for a stored-version syntax check.

        chkrun:artifacts is deliberately omitted: it is optional, and supplying
        it means "check this candidate source I am sending you", which a
        read-only client never does.
        """
        AdtClient.validate_object_uris(object_uris)
        if version not in {"active", "inactive"}:
            raise AdtError("version must be 'active' or 'inactive'.")
        objects = "".join(
            f"<chkrun:checkObject adtcore:uri={quoteattr(uri)} "
            f'chkrun:version="{version}"/>'
            for uri in object_uris
        )
        return (
            '<?xml version="1.0" encoding="UTF-8"?>'
            "<chkrun:checkObjectList "
            'xmlns:chkrun="http://www.sap.com/adt/checkrun" '
            'xmlns:adtcore="http://www.sap.com/adt/core">'
            f"{objects}"
            "</chkrun:checkObjectList>"
        )

    async def run_syntax_check(
        self,
        object_uris: list[str],
        version: str = "active",
        reporter: str = "abapCheckRun",
    ) -> httpx.Response:
        """POST /checkruns, falling back to generic media types on 406/415.

        abap-adt-api ships with the specific vnd.sap.* types commented out,
        which is field evidence that some releases reject them.
        """
        body = self.build_checkrun_body(object_uris, version)
        try:
            return await self.post(
                ADT_ROOT + "/checkruns",
                content=body,
                content_type=CT_CHECKOBJECTS,
                accept=ACCEPT_CHECKMESSAGES,
                params={"reporters": reporter},
            )
        except AdtError as exc:
            if "HTTP 406" not in str(exc) and "HTTP 415" not in str(exc):
                raise
        return await self.post(
            ADT_ROOT + "/checkruns",
            content=body,
            content_type="application/*",
            accept="application/*",
            params={"reporters": reporter},
        )
