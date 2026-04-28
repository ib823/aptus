# AD-4: ClassificationProtocol as DB config

**Status:** Accepted (2026-04-27)

## Context

The SAP S/4HANA Cloud Public Edition 2602 best-practice protocol exists in
TWO places that have already drifted:

- `scripts/classify-batch.ts:74-119` — the `SAP_2602_PROTOCOL` const used by
  the orchestrator emit/apply workflow. This is the newer version (2026-04-27)
  with structured-fields guidance.
- `src/lib/analyzer/classifier.ts:51-79` — the SYSTEM_PROMPT used by the
  Anthropic API. References the older schema (no structured fields).

Verdicts cannot cite which protocol produced them. Different consultants
running the analyzer at different times might be using different protocol
text without knowing it.

## Decision

```
ClassificationProtocol {
  id, name ("SAP 2602 best-practice"), version ("1.0"),
  catalogVersionId FK,
  bucketDefinitions Json (O/C/G/N-A definitions),
  groundingRules text,
  systemPrompt text,
  isActive, deprecatedAt
  @@unique([name, version])
}
```

Both the analyzer and the orchestrator read from this table. Verdicts
(per AD-1) carry a `protocolVersionId` FK so the protocol used is
reconstructable forever.

Admin UI at `(portal)/admin/protocols` lets SI leads author + activate new
protocol versions tied to a catalog version.

## Consequences

### Positive

- Single source of truth for classification protocol text.
- Verdicts carry a stable reference to the protocol version that produced
  them — full reproducibility.
- New protocol versions don't require a code release.
- Protocol changes are auditable (admin UI captures who changed what when).

### Negative

- Protocol changes that break the analyzer's response-parsing (e.g. changing
  the JSON schema the AI emits) require coordinated code+protocol changes.
  Mitigated by storing schema version inside `bucketDefinitions` + a CI test
  that round-trips the analyzer against the active protocol.

### Neutral

- The seed migration captures the current protocol text verbatim. Semantic
  parity verified by the golden-file test (Phase 0).

## Alternatives Considered

- **Keep the protocol in code; just deduplicate the two copies.** Rejected:
  doesn't solve the "verdicts can't cite their protocol" problem.
- **Store protocol in env var.** Rejected: env vars don't version, don't have
  audit trail, and can't be edited without re-deploy.

## Related

- AD-1 (verdict carries protocolVersionId FK)
- AD-3 (protocol pins to a catalog version)
