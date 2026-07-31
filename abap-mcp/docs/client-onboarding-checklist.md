# Client Onboarding Checklist (per engagement)

## 1. Governance — do this FIRST
- [ ] Written client consent that custom ABAP source code may be processed
      by an external LLM API (name the provider and the no-training terms)
- [ ] Data-residency position confirmed (esp. government/bank clients)
- [ ] Scope limited to DEV system, custom (Y/Z + registered namespaces) only
- [ ] Agree in writing: AI proposes, humans review, nothing auto-activated
- [ ] **SAP API Policy position documented.** ADT is a *development tooling*
      API. Our usage must stay inside that scope — no programmatic reading of
      application tables, no business-data export, no free SQL. Confirm with
      counsel once, then reference the conclusion per engagement.
      https://help.sap.com/doc/sap-api-policy/latest/en-US/API_Policy_latest.pdf
- [ ] Treat retrieved ABAP source as **untrusted input**: a comment in a
      client's Z-program can carry instructions. No tool is invoked purely on
      the strength of retrieved content.

## 2. Basis / security setup
- [ ] Service user created (dialog-less), display authorizations:
      S_ADT, S_DEVELOP (ACTVT 03), ATC display
- [ ] SICF: /sap/bc/adt active; HTTPS reachable from consultant network
      (VPN / Cloud Connector / IP allowlist as applicable)
- [ ] TLS certificate valid (avoid verify_tls: false outside sandboxes)
- [ ] Password rotation & offboarding date agreed

## 3. ATC setup
- [ ] Prerequisite notes applied: **2436688** (S/4HANA custom code checks in
      ATC), **2364916** (remote analysis), **2241080** (Simplification Database
      CCMSIDB), **2672703** (RFC user authorizations in the checked system)
- [ ] Check variant confirmed (readiness variant matching target release,
      e.g. S4HANA_READINESS_2023; remote ATC via hub if ECC is too old)
- [ ] On a material-number engagement: BOTH the plain and the `_NO_FLE` variant
      agreed — the delta between them prices the MFLE activation decision
- [ ] Baseline run executed and exported — this is the findings inventory

## 3b. Runtime checks — ATC cannot find everything
SAP's own position: "ATC is not able to find all potential issues (for example,
dynamic coding is not covered by static code checks)."
- [ ] **SRTCM** (Runtime Check Monitor) active in the productive system, with
      `Empty table in FOR ALL ENTRIES clause` and
      `Missing ORDER BY or SORT after SELECT`
- [ ] **SQLM** (SQL Monitor) switched on; top 10–20 statements by execution
      time agreed as the optimisation scope (SAP: expect 2–3 iterations)
- [ ] Agreed that SRTCM/SQLM findings **outrank** static findings — they come
      from real traffic

## 4. Tool setup (your side)
- [ ] profiles/<client-id>.yaml created; creds in env vars only
- [ ] `python -m pytest` passes locally (offline sanity check)
- [ ] **`scripts/adt_probe.py` run against this system; all ten steps reviewed**
- [ ] Every probe failure turned into a parser fix plus a regression test, with
      the sanitized response added to `tests/fixtures/`
- [ ] `captures/` treated as client-confidential; sanitized before any sharing

## 5. Working agreement
- [ ] Dedicated remediation transport(s), never mixed with other changes
- [ ] Remediation log format agreed (object, SI/Note ref, fix pattern, reviewer)
- [ ] Review cadence and sign-off owner named on client side
