# Architecture Decision Records

This directory captures the load-bearing architecture decisions for the Aptus rebuild plan
(see `~/.claude/plans/swirling-kindling-rainbow.md` for the full plan; the live working
copy is in the project at `docs/plans/` if/when promoted from the personal plan dir).

Each ADR follows the lightweight format:

- **Status** — Proposed / Accepted / Superseded
- **Context** — what's the situation that motivates this decision
- **Decision** — what we will do
- **Consequences** — positive, negative, neutral
- **Alternatives considered** — what we rejected and why

ADRs are immutable once accepted. Subsequent decisions supersede prior ones explicitly.

## Index

| ID | Title | Status |
|---|---|---|
| [AD-1](./AD-1-classification-verdict-first-class.md) | ClassificationVerdict as first-class entity | Accepted |
| [AD-2](./AD-2-vendor-response-separation.md) | Vendor responses live in their own table | Accepted |
| [AD-3](./AD-3-scope-catalog-version.md) | ScopeCatalogVersion + edition partition | Accepted |
| [AD-4](./AD-4-classification-protocol-db.md) | ClassificationProtocol as DB config | Accepted |
| [AD-5](./AD-5-classification-pass.md) | ClassificationPass as the unit of work | Accepted |
| [AD-6](./AD-6-catalog-fk-enforcement.md) | Catalog FK enforcement, not free text | Accepted |
| [AD-7](./AD-7-frozen-verdicts.md) | Sign-off freezes via DB row-level guard | Accepted |
| [AD-8](./AD-8-five-step-ia-stays.md) | 5-step IA stays; sub-tab structure rebuilt | Accepted |
| [AD-9](./AD-9-portfolio-surfaces.md) | Portfolio surfaces above the assessment shell | Accepted |
| [AD-10](./AD-10-curation-to-db.md) | Curation moves to DB tables | Accepted |
