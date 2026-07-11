# SAP Capability Catalogue — design-token contract

The contract Claude Design refines against. **Every colour, radius and surface in
the catalogue components resolves to a `globals.css` token — zero hardcoded hex.**
Enforced by: `grep -RInE "#[0-9a-fA-F]{6}" src/components/sap/capability` → **must
return nothing.**

Reuse existing tokens (the presales `--status-*` / `--decision-*` set and the
brand/ink/surface set). No component may introduce a colour outside this table.
Any genuinely new value is added to `globals.css` as a **named token** and listed
here — never inlined.

## 1. Token mapping

| Element | Token(s) |
|---|---|
| Page background | `--surface-cream` |
| Card / panel background | `--surface-paper` |
| Card border | `1px solid --border-default` |
| Card radius | `--radius-card-warm` (12px) |
| Pill / chip radius | `--radius-pill` |
| Input / control radius | `--radius-input` |
| Headings / brand marks | `--brand-navy` |
| Primary links / CTAs | `--cta-red` |
| Text — primary | `--ink-primary` |
| Text — secondary | `--ink-secondary` |
| Text — muted | `--ink-muted` |
| **Status badge — ACTIVATED** | `--status-signed-bg` / `--status-signed-fg` |
| **Status badge — AVAILABLE** | `--status-sent-bg` / `--status-sent-fg` |
| **Status badge — REFERENCE** | `--status-draft-bg` / `--status-draft-fg` |
| **Status badge — NEEDS-SETUP** | `--status-awaiting-bg` / `--status-awaiting-fg` |
| **Capability chip — read** | `--decision-standard` |
| **Capability chip — write** | `--decision-custom` |
| **Capability chip — subscribe** | `--decision-configure` |
| **Capability chip — n/a** | `--decision-open` |
| Scorecard progress fill | `--brand-navy` |
| Scorecard progress track | `--surface-ink-tint` |

NEEDS-SETUP is the AVAILABLE variant shown when a runtime item has prerequisites
(comm scenario / scope items) — it rides the existing `--status-awaiting-*`.

## 2. Light + dark

The brand/ink/surface/`--status-*`/`--decision-*` tokens are defined at `:root`
(light only). To satisfy "every colour flips in dark," the catalogue root carries
`data-cap-catalogue`, and `globals.css` adds a **scoped** dark block that flips
exactly these tokens *within the catalogue* (no effect on presales UI):

```css
.dark [data-cap-catalogue] {
  --surface-cream: var(--background);   /* → app dark surfaces */
  --surface-paper: var(--card);
  --surface-ink-tint: var(--muted);
  --ink-primary: var(--foreground);
  --ink-secondary: var(--muted-foreground);
  --ink-muted: var(--muted-foreground);
  --border-default: var(--border);
  --brand-navy: oklch(0.78 0.09 250);   /* legible navy on dark */
  --cta-red: oklch(0.72 0.18 20);
  --status-signed-bg/fg, --status-sent-bg/fg, --status-draft-bg/fg,
  --status-awaiting-bg/fg  → dark tinted-bg / light-fg (oklch)
  --decision-standard/configure/custom/open → light-on-dark (oklch)
}
```

Structural tokens alias the shadcn semantic tokens (which already flip), so
surfaces/text track the app theme automatically. Full values live in
`src/app/globals.css` (search `data-cap-catalogue`).

## 3. Component inventory

All under `src/components/sap/capability/`. Colour is applied via inline
`style={{ … var(--token) }}` (the `status-pill.tsx` pattern) or Tailwind token
classes (`text-ink`, `bg-paper`, …) — never hex. Layout/spacing use Tailwind
utilities (no colour).

| Component | Props | Tokens used |
|---|---|---|
| `StatusBadge` | `status: "ACTIVATED"\|"AVAILABLE"\|"REFERENCE"\|"NEEDS_SETUP"`, `subscribe?: boolean` | `--status-signed/sent/draft/awaiting-{bg,fg}`, `--radius-pill` |
| `CapabilityChips` | `contentType`, `ladder?`, `entities?`, `subscribe?: boolean` | `--decision-standard` (read), `--decision-custom` (write), `--decision-configure` (subscribe), `--decision-open` (n/a), `--radius-pill` |
| `ReadinessScorecard` | `activated: number`, `probeable: number`, `available: number`, `reference: number` | `--brand-navy` (fill + heading), `--surface-ink-tint` (track), `--surface-paper`, `--border-default`, `--ink-*`, `--status-*` |
| `ContentTypeTiles` | `byType: Record<type,number>`, `activeType?`, `onSelect?` | `--surface-paper`, `--border-default`, `--brand-navy`, `--ink-*`, `--radius-card-warm` |
| `CapabilityDetail` | `id: string`, `product?: string`, `onClose?` | `--surface-paper`, `--ink-*`, `--status-*` (ladder), `--decision-*` (C/R/U/D table), `--cta-red` (Hub link) |
| `ProcessBlueprintView` | `steps: { name: string; description?: string }[]` | `--surface-ink-tint` (nodes), `--brand-navy` (connectors), `--ink-*` |
| `CatalogueList` (extends `SapCapabilityCatalogue`) | `product?` | all of the above; groups by `packageId` (line of business) |
| States | — | empty/loading(skeleton)/error via `--surface-*`, `--ink-muted`, `--border-default` |

## 4. Honest ReadinessScorecard metric

The metric counts **discrete probeable runtime services**, never the grouped
`itemCount` sum (which would repeat the Phase-0 "52.8%" inflation where a few
grouped CDS/BAdI rows dominated the total):

- **denominator** `probeable` = count of `SapHubContent` rows that are runtime AND
  individually probeable (`contentType ∈ {API, CDS_VIEW}` with `apiType = ODATAV2`)
  — excludes events (subscribe-only) and grouped CDS package rows.
- **numerator** `activated` = those probed live to a 200.
- Rendered plainly, denominator visible: **"16 of 39 runtime services activated."**

`available` and `reference` are shown as separate counts, not folded into the ratio.
