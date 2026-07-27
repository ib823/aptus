# CoreEdge Design Tokens — use these EXACT values (no invented colors)

Extracted verbatim from `aptus/src/app/globals.css` (`origin/main` #132). These are the real ABeam
tokens the production app already ships. Any design must use these — do not introduce new brand colors.

## Color — primitives

| Token | Value | Usage |
|---|---|---|
| `--brand-navy` | `#002B5C` | Primary brand · rail · primary buttons · headings |
| `--brand-navy-hover` | `#001E40` | Navy hover |
| `--brand-navy-soft` | `#E6EBF1` | Navy tint · selected · info badges |
| `--brand-navy-border` | `#CFD7E0` | Navy-tinted borders |
| `--cta-red` | `#C8102E` | CTA / irreversible commit ONLY (publish, delete, confirm) |
| `--cta-red-hover` | `#A30D26` | CTA hover |
| `--surface-cream` | `#FAF9F5` | App background |
| `--surface-paper` | `#FFFFFE` | Cards, panels, inputs |
| `--surface-ink-tint` | `#F4F2EB` | Table headers, subtle fills |
| `--surface-banner-warn` | `#FDF7E6` | Warning banners |
| `--ink-primary` | `#1A1A1A` | Primary text |
| `--ink-secondary` | `#4A4A4A` | Secondary text |
| `--ink-muted` | `#8A8A8A` | Muted / captions |
| `--ink-disabled` | `#C4C4C4` | Disabled |
| `--border-default` | `#E5E1D6` | Default borders (warm) |
| `--border-strong` | `#C4BFAE` | Input / emphasised borders |
| `--success` | `#166534` | Success |
| `--warning` | `#B45309` | Warning |
| `--danger` | `#991B1B` | Danger |
| `--info` | `#1E40AF` | Info |

## Color — decision palette (classification model)

| Token | Value | Meaning |
|---|---|---|
| `--decision-standard` | `#0F766E` | Standard |
| `--decision-configure` | `#1D4ED8` | Configure |
| `--decision-custom` | `#B45309` | Custom |
| `--decision-open` | `#8A8A8A` | Open |

## Color — status token pairs (bg / fg)

| Token | BG | FG |
|---|---|---|
| draft | `#F4F2EB` | `#4A4A4A` |
| sent | `#E0EBF4` | `#1A4D6F` |
| awaiting | `#FBE9D1` | `#8B5A00` |
| signed | `#DCEBE3` | `#166534` |
| expired | `#EAEAE6` | `#6B6B6B` |
| revoked | `#F4DEDB` | `#8E2A26` |

## Honest-status → token mapping (THE most-used signal — keep consistent everywhere)

| Honest status | Means | Token | Chip |
|---|---|---|---|
| ACTIVATED | live probe returned 200 (proven) | signed (green) | `#DCEBE3` / `#166534` |
| NEEDS_SETUP | 401/403 — comm arrangement not set up | awaiting (amber) | `#FBE9D1` / `#8B5A00` |
| AVAILABLE | event / subscribe-only (not pulled) | sent (blue) | `#E0EBF4` / `#1A4D6F` |
| NOT_PROBEABLE | no OData endpoint to probe | expired (grey) | `#EAEAE6` / `#6B6B6B` |
| REFERENCE | design-time content | draft (neutral) | `#F4F2EB` / `#4A4A4A` |
| NOT_CHECKED | not yet probed | muted | `#EFEDE6` / `#8A8A8A` |
| NOT_FOUND | 404 — not in this tenant | revoked (red) | `#F4DEDB` / `#8E2A26` |

## Type — fonts

- Sans (UI): **Geist** → `"Geist","Inter",system-ui,-apple-system,"Segoe UI",sans-serif`
- Mono (identifiers/code): **Geist Mono** → `"Geist Mono","SF Mono",Consolas,monospace`
- Serif (hero/section headlines): **Source Serif 4** → `"Source Serif 4","Tiempos Headline",Georgia,serif`

## Type — scale

| Role | Size / line-height | Weight | Notes |
|---|---|---|---|
| Display | 32 / 40 | 600 | Serif · tracking -0.01em · hero/section |
| H1 | 24 / 32 | 700 | tracking -0.01em |
| H2 | 20 / 28 | 600 | |
| H3 | 16 / 24 | 600 | |
| Body | 14 / 22 | 400 | default |
| Small | 13 / 20 | 400 | secondary |
| Caption | 12 / 16 | 500 | uppercase · tracking .05em |
| Mono | 13 | 400 | identifiers (apiId, SAP_COM codes, PO numbers) |

## Spacing — 8-pt system (4-pt for fine tuning)

`4, 8, 12, 16, 20, 24, 32, 40, 48, 64` px. Every gap/pad/margin snaps to this.

## Radius (real tokens)

| Token | Value | Usage |
|---|---|---|
| `--radius-input` | `8px` | Inputs, buttons |
| `--radius` / step | `10px` (0.625rem) | Base |
| `--radius-card` | `12px` | Cards, sheets |
| `--radius-pill` | `9999px` | Chips |

## Elevation (soft, warm — depth by shadow not heavy borders)

| Level | Shadow | Usage |
|---|---|---|
| sm | `0 1px 2px rgba(0,0,0,.04)` | Cards at rest |
| md | `0 2px 6px rgba(0,0,0,.06)` | Hover, popover |
| lg | `0 8px 24px rgba(0,0,0,.08)` | Drawers, menus |
| xl | `0 16px 40px rgba(0,0,0,.12)` | Dialogs |

## Component measurements (map 1:1 to the existing shadcn primitives)

| Component | Spec | shadcn |
|---|---|---|
| Button | h40 (sm 34 / xs 28) · radius 8 · pad-x 16 · 14/600. Variants: primary (navy), CTA (red, irreversible only), secondary (paper + border-strong), ghost, gated (dashed navy = needs approval) | `button` |
| Input | h40 · radius 8 · border-strong · focus = navy border + `#E6EBF1` ring | `input` |
| Card | radius 12 · border-default · paper bg · pad 20 · shadow sm | `card` |
| Badge | radius 6 · pad 2/8 · 11/600 | `badge` |
| Status chip | radius pill · pad 3/9 · 11.5/600 · dot + label | `status-pill` |
| Table | header ink-tint · row border-default · pad 9/12 | `table` |
| Side drawer | width 480 · left-border 4px navy · shadow lg | `sheet` |
| Dialog | width 520 · radius 12 · shadow xl | `dialog` |
| Toast | bottom-right | `sonner` |
| Loading | skeleton rows — never a spinner on data tables | `skeleton` |

## Shell measurements

- Top bar: height **56px**, paper bg, border-bottom default. Holds: product mark · breadcrumb · (spacer) · tenant switcher · environment badge · role badge · user avatar.
- Left rail: width **220px**, navy bg. Workspace switcher (Developer Studio / Operations Center / Control Tower) + the active workspace's sections. RBAC-gated (a role only sees its workspaces).
- Content: cream bg · pad 22–24.
