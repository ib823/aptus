# ABeam Workbench — Design Restoration Brief

**Audience:** Claude Code CLI (CCC), implementing on the existing Next.js 15 / App Router repo
**Source of truth (long form):** `ABeam-Workbench-Design-System.docx` (9-pass spec, 715 paragraphs)
**Purpose of this brief:** make the live UI match that spec
**Status:** mandatory pass before any new feature work
**Author:** Ikmal Baharudin (ABeam Malaysia) — single owner / approver

---

## 0. Why this brief exists

The 9-pass design system was authored and reviewed before the implementation began. The live deployment at `aptus-sandy.vercel.app` was built against default Tailwind primitives instead of the agreed tokens, type ramp, component library, or layout shells.

Specific defects observed on the live deployment (2026-05-20):

1. Product wordmark still reads **"Aptus"** in the top bar, page titles, page metadata, and SVG favicon. We agreed on **"ABeam Workbench"** (memory: 2026-05-19).
2. Page backgrounds are Tailwind `bg-slate-50` (cool gray). Spec calls for the warm Claude-style cream surface.
3. Display headings are in the default sans stack. Spec calls for a serif display face (Tiempos Headline preferred, Source Serif Pro fallback).
4. No decision-color accent bars on decision cards. The teal / blue / amber semantic system from Pass 1 is absent from the workbench and preview pages.
5. Side rail is a generic gray icon column. Spec is a deep navy rail with white icons and a 3-px red active indicator.
6. Status pills use unstyled defaults (`bg-emerald-100` for Active, undefined gray for Revoked). Spec is the tinted-bg + saturated-text taxonomy in §2.4 below.
7. Recent Activity renders raw ISO timestamps (`2026-05-20T13:41:54.009Z`). Spec is the dual-line relative-plus-absolute render in §2.7.
8. Terminal pages (`/c/expired`, `/c/ended`) use hardcoded fixture contact data ("Sarah Tan · sarah.tan@abeam.com · +60 3 1234 5678") instead of the bundle's actual owning consultant pulled from the database.

This brief lists each defect, the target end-state, and the file the change lands in. It is meant to be applied in one design-restoration pass before the next feature ships.

---

## 1. Design tokens (paste-ready)

### 1.1 CSS variables — `src/app/globals.css`

Add these at the top of the file, inside `:root`. Remove any prior conflicting `--*` declarations.

```css
:root {
  /* ---------- Brand ---------- */
  --brand-navy:         #002B5C;
  --brand-navy-hover:   #001E40;
  --brand-navy-soft:    #E6EBF1;   /* tint for nav highlight, breadcrumb hover */

  /* ---------- Call-to-action ---------- */
  --cta-red:            #C8102E;
  --cta-red-hover:      #A30D26;
  --cta-red-focus:      #FBE9EC;   /* focus-ring tint, danger banner bg */

  /* ---------- Surfaces (Claude warm) ---------- */
  --surface-cream:      #FAF9F5;   /* page background */
  --surface-paper:      #FFFFFE;   /* cards, modals */
  --surface-ink-tint:   #F4F2EB;   /* secondary surface, table zebra, hover */
  --surface-banner-warn:#FDF7E6;   /* preview banner, soft-warning bg */

  /* ---------- Ink ---------- */
  --ink-primary:        #1A1A1A;
  --ink-secondary:      #4A4A4A;
  --ink-muted:          #8A8A8A;
  --ink-disabled:       #C4C4C4;
  --ink-on-navy:        #FFFFFF;
  --ink-on-navy-muted:  rgba(255,255,255,0.72);

  /* ---------- Borders ---------- */
  --border-default:     #E5E1D6;   /* warm gray — pairs with cream */
  --border-strong:      #C4BFAE;
  --border-focus:       var(--brand-navy);

  /* ---------- Status pills ---------- */
  --status-draft-bg:    #F4F2EB;  --status-draft-fg:    #4A4A4A;
  --status-sent-bg:     #E0EBF4;  --status-sent-fg:     #1A4D6F;
  --status-awaiting-bg: #FBE9D1;  --status-awaiting-fg: #8B5A00;
  --status-signed-bg:   #DCEBE3;  --status-signed-fg:   #166534;
  --status-expired-bg:  #EAEAE6;  --status-expired-fg:  #6B6B6B;
  --status-revoked-bg:  #F4DEDB;  --status-revoked-fg:  #8E2A26;

  /* ---------- Decision colors (Pass 1 — keep) ---------- */
  --decision-standard:  #0F766E;   /* teal */
  --decision-configure: #1D4ED8;   /* blue */
  --decision-custom:    #B45309;   /* amber */
  --decision-open:      #8A8A8A;   /* ink-muted, "no choice yet" */

  /* ---------- Functional ---------- */
  --success:            #166534;
  --warning:            #B45309;
  --danger:             #991B1B;
  --info:               #1E40AF;

  /* ---------- Shadows ---------- */
  --shadow-card:        0 1px 2px rgba(20,20,20,0.04), 0 1px 0 rgba(20,20,20,0.02);
  --shadow-card-hover:  0 4px 10px rgba(20,20,20,0.06), 0 2px 4px rgba(20,20,20,0.04);
  --shadow-pop:         0 10px 24px rgba(20,20,20,0.10), 0 4px 10px rgba(20,20,20,0.06);
  --shadow-focus-ring:  0 0 0 3px var(--cta-red-focus);

  /* ---------- Motion ---------- */
  --ease-snap:          cubic-bezier(0.2, 0, 0.13, 1);
  --ease-calm:          cubic-bezier(0.4, 0, 0.2, 1);
  --ease-hero:          cubic-bezier(0.16, 1, 0.3, 1);
  --dur-snap:           100ms;
  --dur-calm:           200ms;
  --dur-hero:           320ms;

  /* ---------- Radius ---------- */
  --radius-input:       8px;
  --radius-card:        12px;
  --radius-pill:        9999px;
}

html, body {
  background: var(--surface-cream);
  color: var(--ink-primary);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
}
```

### 1.2 Tailwind config — `tailwind.config.ts`

Extend the theme so utility classes pick up the tokens.

```ts
import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        navy:    { DEFAULT: "var(--brand-navy)", hover: "var(--brand-navy-hover)", soft: "var(--brand-navy-soft)" },
        cta:     { DEFAULT: "var(--cta-red)",    hover: "var(--cta-red-hover)",    focus: "var(--cta-red-focus)" },
        cream:   "var(--surface-cream)",
        paper:   "var(--surface-paper)",
        inkTint: "var(--surface-ink-tint)",
        ink:     { DEFAULT: "var(--ink-primary)", soft: "var(--ink-secondary)", muted: "var(--ink-muted)", disabled: "var(--ink-disabled)" },
        border:  { DEFAULT: "var(--border-default)", strong: "var(--border-strong)" },
        decision:{ standard: "var(--decision-standard)", configure: "var(--decision-configure)", custom: "var(--decision-custom)", open: "var(--decision-open)" },
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Tiempos Headline", "Source Serif Pro", "Georgia", "serif"],
        sans:  ["var(--font-sans)",  "Inter", "system-ui", "sans-serif"],
        mono:  ["var(--font-mono)",  "JetBrains Mono", "ui-monospace", "SF Mono", "monospace"],
      },
      borderRadius: {
        input: "var(--radius-input)",
        card:  "var(--radius-card)",
        pill:  "var(--radius-pill)",
      },
      boxShadow: {
        card:       "var(--shadow-card)",
        cardHover:  "var(--shadow-card-hover)",
        pop:        "var(--shadow-pop)",
        focus:      "var(--shadow-focus-ring)",
      },
      transitionTimingFunction: { snap: "var(--ease-snap)", calm: "var(--ease-calm)", hero: "var(--ease-hero)" },
      transitionDuration: { snap: "100ms", calm: "200ms", hero: "320ms" },
    },
  },
} satisfies Config;
```

### 1.3 Fonts — `src/app/layout.tsx`

Load Source Serif Pro (free) as the display face. Anthropic's Tiempos Headline is licensed; Source Serif is the agreed fallback.

```ts
import { Inter, Source_Serif_4, JetBrains_Mono } from "next/font/google";

const sans  = Inter({ subsets: ["latin"], variable: "--font-sans",  display: "swap" });
const serif = Source_Serif_4({ subsets: ["latin"], variable: "--font-serif", display: "swap", weight: ["400","500","600"] });
const mono  = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono",  display: "swap" });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

### 1.4 Type ramp

| Role | Class | Source |
|---|---|---|
| Display H1 | `font-serif text-[36px] leading-[44px] font-medium text-ink` | bundle hero, scope item title |
| H2 | `font-serif text-[28px] leading-[36px] font-medium text-ink` | section breaks |
| H3 | `font-serif text-[22px] leading-[30px] font-medium text-ink` | decision name, card title |
| H4 | `font-sans text-[18px] leading-[26px] font-semibold text-ink` | sub-card title |
| Body | `font-sans text-[16px] leading-[24px] text-ink` | paragraph copy |
| Body-sm | `font-sans text-[14px] leading-[20px] text-ink-soft` | helper text |
| Eyebrow | `font-sans text-[11px] leading-[16px] font-semibold tracking-[0.08em] uppercase text-ink-muted` | "PRESALES WORKBENCH", section numbers |
| Caption | `font-sans text-[12px] leading-[16px] text-ink-muted` | metadata, timestamps |
| Mono | `font-mono text-[13px] leading-[18px] text-ink-soft` | IDs, codes, payload JSON |

### 1.5 Spacing & layout

- Base unit: 4 px (Tailwind defaults — no change)
- Content max-width: `max-w-[1120px] mx-auto px-6 lg:px-10` for portal routes
- Client routes (`/c/*`) use `max-w-[720px]` centered
- Card padding: `p-6` (24 px) standard, `p-8` (32 px) hero card
- Stack rhythm: `space-y-6` between sections, `space-y-3` within a section

---

## 2. The component contract

These are shared primitives. Build them once under `src/components/ui/`, then use them everywhere. Replace ad-hoc Tailwind on existing pages with these components.

### 2.1 `<Button>` — `src/components/ui/button.tsx`

```tsx
type Variant = "primary" | "secondary" | "outlinedNavy" | "danger" | "ghost";
type Size = "sm" | "md" | "lg";

const base = "inline-flex items-center justify-center font-sans font-semibold rounded-input transition-all duration-snap ease-snap focus-visible:outline-none focus-visible:shadow-focus disabled:opacity-50 disabled:cursor-not-allowed";

const variants: Record<Variant, string> = {
  primary:      "bg-cta text-white hover:bg-cta-hover active:scale-[0.98]",
  secondary:    "bg-paper text-ink border border-border hover:bg-inkTint",
  outlinedNavy: "bg-paper text-navy border border-navy hover:bg-navy-soft",
  danger:       "bg-paper text-cta border border-cta hover:bg-cta-focus",
  ghost:        "bg-transparent text-ink-soft hover:bg-inkTint",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-10 px-4 text-[14px]",
  lg: "h-12 px-6 text-[15px]",
};

export function Button({ variant = "primary", size = "md", className, ...props }) {
  return <button className={`${base} ${variants[variant]} ${sizes[size]} ${className ?? ""}`} {...props} />;
}
```

**Mapping for existing buttons:**

| Existing | New variant |
|---|---|
| Send invitations, Confirm extend, Confirm revoke | `primary` |
| Save as draft, Cancel | `secondary` |
| Preview as client, Audit log, Extend window | `outlinedNavy` |
| Revoke (top toolbar) | `danger` |
| Reissue (recipient row) | `outlinedNavy` size="sm" |

### 2.2 `<StatusPill>` — `src/components/ui/status-pill.tsx`

```tsx
type Status = "draft" | "sent" | "awaiting_signoff" | "signed" | "expired" | "revoked" | "superseded";

const styles: Record<Status, string> = {
  draft:            "bg-[var(--status-draft-bg)]    text-[var(--status-draft-fg)]",
  sent:             "bg-[var(--status-sent-bg)]     text-[var(--status-sent-fg)]",
  awaiting_signoff: "bg-[var(--status-awaiting-bg)] text-[var(--status-awaiting-fg)]",
  signed:           "bg-[var(--status-signed-bg)]   text-[var(--status-signed-fg)]",
  expired:          "bg-[var(--status-expired-bg)]  text-[var(--status-expired-fg)]",
  revoked:          "bg-[var(--status-revoked-bg)]  text-[var(--status-revoked-fg)]",
  superseded:       "bg-[var(--status-expired-bg)]  text-[var(--status-expired-fg)]",
};

const labels: Record<Status, string> = {
  draft: "Draft",
  sent: "Sent",
  awaiting_signoff: "Awaiting signoff",
  signed: "Signed",
  expired: "Expired",
  revoked: "Revoked",
  superseded: "Superseded",
};

export function StatusPill({ status }: { status: Status }) {
  return (
    <span className={`inline-flex items-center h-7 px-3 rounded-pill text-[12px] font-semibold ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}
```

### 2.3 `<Card>` — `src/components/ui/card.tsx`

```tsx
export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-paper rounded-card border border-border shadow-card p-6 ${className ?? ""}`}>
      {children}
    </div>
  );
}

export function CardHeader({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-4">
      <div>
        {eyebrow && <div className="font-sans text-[11px] font-semibold tracking-[0.08em] uppercase text-ink-muted mb-1">{eyebrow}</div>}
        <h3 className="font-serif text-[22px] leading-[30px] font-medium text-ink">{title}</h3>
      </div>
      {action}
    </div>
  );
}
```

### 2.4 `<InlineErrorBanner>` — `src/components/ui/inline-error-banner.tsx`

Replace the current banner used in `BundleCreateForm.tsx` with this version. Keep the message + machine-code two-line layout, add the leading icon and the warmer red tint.

```tsx
import { AlertTriangle } from "lucide-react";

export function InlineErrorBanner({ message, code }: { message: string; code?: string }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-card border-l-4 border-cta bg-cta-focus p-4 mb-6">
      <AlertTriangle size={18} className="mt-0.5 text-cta shrink-0" />
      <div>
        <div className="font-sans text-[15px] font-semibold text-[#7F1D1D]">{message}</div>
        {code && <div className="font-mono text-[12px] text-ink-muted mt-0.5">{code}</div>}
      </div>
    </div>
  );
}
```

### 2.5 `<DecisionCard>` — `src/components/fts/DecisionCard.tsx` (refactor)

Three changes from the current implementation:

1. Add a 4-px-wide accent bar on the left edge, color = the current choice color.
2. Render the three options as their own sub-cards inside the decision card, each with its own decision-color label chip.
3. The SSCUI ID / config reference moves to a mono eyebrow at the top.

```tsx
const accentByChoice: Record<DecisionState["choice"], string> = {
  open:      "bg-decision-open",
  standard:  "bg-decision-standard",
  configure: "bg-decision-configure",
  custom:    "bg-decision-custom",
};

<div className="relative rounded-card bg-paper border border-border shadow-card overflow-hidden">
  {/* Accent bar */}
  <div className={`absolute left-0 top-0 bottom-0 w-1 ${accentByChoice[choice]} transition-colors duration-calm ease-calm`} aria-hidden />

  <div className="p-6 pl-7">
    {sscui && <div className="font-mono text-[12px] text-ink-muted mb-2">{sscui}</div>}
    <h3 className="font-serif text-[22px] leading-[30px] font-medium text-ink">{title}</h3>
    <p className="font-sans text-[16px] leading-[24px] text-ink-soft mt-2">{question}</p>

    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-5">
      <OptionCard kind="standard"  label="Standard"  description={std_desc}  selected={choice === "standard"}  onSelect={...} />
      <OptionCard kind="configure" label="Configure" description={cfg_desc}  selected={choice === "configure"} onSelect={...} />
      <OptionCard kind="custom"    label="Custom"    description={cst_desc}  selected={choice === "custom"}    onSelect={...} />
    </div>
  </div>
</div>
```

`<OptionCard>` renders a sub-card with the decision-color label chip at top, the description as body copy, and a subtle ring + tinted bg when `selected`. In preview mode, pass `disabled` to render as read-only.

### 2.6 `<RelativeTime>` — `src/components/ui/relative-time.tsx`

Replace raw ISO timestamps in Recent Activity and the audit table with this. Renders dual-line: relative on top, absolute below in mono.

```tsx
import { formatDistanceToNow, format } from "date-fns";

export function RelativeTime({ iso }: { iso: string }) {
  const d = new Date(iso);
  return (
    <div className="leading-tight">
      <div className="font-sans text-[14px] text-ink">{formatDistanceToNow(d, { addSuffix: true })}</div>
      <div className="font-mono text-[11px] text-ink-muted">{format(d, "yyyy-MM-dd HH:mm:ss")}</div>
    </div>
  );
}
```

### 2.7 `<Input>` / `<Textarea>` / `<Select>` — `src/components/ui/input.tsx`

All form fields share:

```
h-10 (or auto for textarea)
px-3
rounded-input
border border-border
bg-paper
font-sans text-[14px] text-ink
placeholder:text-ink-muted
focus-visible:outline-none
focus-visible:border-navy
focus-visible:shadow-focus
disabled:bg-inkTint disabled:text-ink-disabled
```

Field labels: `font-sans text-[13px] font-medium text-ink-soft mb-1.5`
Helper text: `font-sans text-[12px] text-ink-muted mt-1.5`
Error text: `font-sans text-[12px] text-cta mt-1.5`

### 2.8 `<TopBar>` and `<SideRail>` — `src/components/shell/`

**Top bar (`top-bar.tsx`):**

```
h-14 bg-paper border-b border-border
Left  : "ABeam Workbench" lockup (replaces "Aptus")
Center: search input, max-w-[480px], ⌘K hint pill on right
Right : notification bell icon-button (ghost), user avatar dropdown
```

The wordmark lockup: a 24-px square containing the ABeam mark (an A glyph in `--brand-navy`) followed by the text "ABeam Workbench" in `font-serif text-[16px] font-medium text-navy`.

**Side rail (`side-rail.tsx`):**

```
w-14 bg-navy
Icons: white at 72% opacity, scale-down on click 0.94
Active item:
  - full-width bg-navy-hover
  - 3 px wide cta-red bar pinned to left edge
  - icon at 100% white
Hover (not active):
  - bg-navy-hover (no bar)
```

Icons (lucide-react): `Home`, `ClipboardList` (assessments), `FolderOpen` (presales — active), `Workflow` (engagements), `Sparkles` (insights), `Settings`.

The current generic gray rail must be replaced entirely.

---

## 3. Per-route restoration

For each route: current state, target state, files to touch. Each row is small enough for CCC to land as one commit.

### 3.1 `/presales` — bundles index

| Now | Target |
|---|---|
| Page bg `bg-slate-50` | `bg-cream` |
| H1 "Bundles" sans-serif navy | `font-serif text-[36px]` + same navy |
| Filter chips: All / Draft / Sent / ... in dark navy + outlined gray | When active: `bg-navy text-white rounded-pill h-9 px-4`; inactive: `bg-transparent text-ink-soft border border-border rounded-pill h-9 px-4` |
| Search input plain | Apply §2.7 input spec, prefix with `lucide:Search` icon at left, ⌘K hint right |
| Bundle row card | Card §2.3, scope chips top in eyebrow style, title H3 serif, metadata caption, `<StatusPill>` right-aligned |
| New bundle button | `<Button variant="primary">` |
| Empty state | Add `<EmptyState>` with illustration (a simple SVG of an open clipboard in navy outline, see §6.3) and copy "No bundles yet. Create one to get started." |

**Files:** `src/app/(portal)/presales/page.tsx`, `src/components/presales/BundleListItem.tsx` (new).

### 3.2 `/presales/new` — create bundle

| Now | Target |
|---|---|
| Section headers in sans-serif numerals "01 / 02 / 03" + bold title | Numerals stay, render as eyebrow; title as `font-serif text-[22px]` |
| Each section card | Card §2.3 with `space-y-4` inside |
| All inputs | §2.7 input spec |
| Stakeholder rows | Add a subtle border between rows, use mono for the email column to make addresses scannable |
| Signatory radio | Render as a custom radio (lucide:Check-Circle when selected) inside a sub-card; one signatory only |
| Date pickers (Starts at / Expires at) | §2.7 spec; add helper text below: "Bundle auto-expires at this time. Extendable up to 90 days from today." |
| Footer buttons | `<Button variant="secondary">Save as draft</Button>` + `<Button variant="primary">Send invitations</Button>` |
| Inline error banner | Use `<InlineErrorBanner>` §2.4 |

**Files:** `src/app/(portal)/presales/new/page.tsx`, `src/components/presales/BundleCreateForm.tsx`.

### 3.3 `/presales/[bundleId]` — bundle detail

| Now | Target |
|---|---|
| Hero header (PRESALES · 1IQ · BD9 · BDG eyebrow + H1 + subtitle + status pill) | Keep structure, restyle: eyebrow §1.4, H1 serif, subtitle caption, `<StatusPill>` |
| Action toolbar (Preview / Audit log / Extend / Revoke) | `<Button variant="outlinedNavy" size="sm">` for the first three; `<Button variant="danger" size="sm">` for Revoke |
| Decision Scorecard card | Card §2.3; the big "0" is `font-serif text-[64px] leading-none text-ink` when zero, `text-decision-standard` when decisions complete; "Total effort estimate" line in body-sm; Per-decision breakdown collapsed by default |
| Recipients card | Card §2.3; each row: avatar circle (initials in navy on `bg-navy-soft`), name in sans-medium, email in mono caption, role chip (Signatory = `bg-status-signed-bg text-status-signed-fg`), Reissue button §2.1 right-aligned. Superseded rows: faded to 60% opacity + "Superseded" pill |
| Recent Activity card | Card §2.3; each event row: `<RelativeTime>` + event chip (category color) + caption "details" link |
| Extend window inline panel | Card with `bg-inkTint`, helper text in body-sm |
| Revoke inline panel | Card with `border-l-4 border-cta bg-cta-focus`; required reason textarea (§2.7); `<Button variant="primary">Confirm revoke</Button>` switched to `variant="danger"` style — but keep filled (use bg-cta version): actually use a dedicated `variant="dangerFilled"` if needed — see §6.1 |

**Files:** `src/app/(portal)/presales/[bundleId]/page.tsx`, `ActionToolbar.tsx`, `RecipientRowActions.tsx`.

### 3.4 `/presales/[bundleId]/preview/[scopeCode]` — preview-as-client

| Now | Target |
|---|---|
| Top banner "PREVIEW — NOT A CLIENT SESSION" | Background `bg-surface-banner-warn`, border `border border-[#E0C97A]`, icon `lucide:Eye`, body-sm; sticky to top while scrolling |
| Scope title block | Client name caption, then H1 serif `text-[40px]` (slightly larger than portal H1 — this is the "client hero"), description body |
| Decisions section | H2 "Decisions" + count chip "8 decisions"; each decision uses `<DecisionCard>` §2.5 in disabled / read-only mode |
| Each option (Standard / Configure / Custom) | `<OptionCard>` §2.5; in preview, render full description, render the decision-color label chip at top, suppress the "(Recommended)" tag (keep simple) |
| "Disabled in preview — the real client sees these as choice buttons" footer | Move from below each card to an info pill at the page top alongside the preview banner — saves vertical noise |
| Process steps section | Render as a numbered timeline (vertical line with circles), each step: role caption + app/T-code in mono + step title; click expands details |

**Files:** `src/app/(portal)/presales/[bundleId]/preview/[scopeCode]/page.tsx`, `src/components/fts/DecisionCard.tsx`, `src/components/fts/OptionCard.tsx` (new), `src/components/fts/ProcessTimeline.tsx` (new).

### 3.5 `/presales/[bundleId]/audit` — audit log

| Now | Target |
|---|---|
| Page H1 "Bundle audit log" sans | `font-serif text-[36px]` |
| Filter dropdown | Replace with a pill row of event categories: All · Bundle · Grant · OTP · Decision · Signoff. Selected pill uses `bg-navy text-white` |
| Apply / Export CSV buttons | `<Button variant="secondary">Apply</Button>`, `<Button variant="outlinedNavy">Export CSV</Button>` |
| Event table | Card-wrapped; zebra rows `even:bg-inkTint`; first column `<RelativeTime>` §2.6; Event column as event-category-colored chip; Grant column as mono shortened `cmpe4…wp2` with hover-to-expand; IP column dim mono; Payload column rendered with mono + simple key-color highlighting (a tiny JSON formatter — see §6.4) |
| Empty state | "No audit events match these filters." in caption |

**Files:** `src/app/(portal)/presales/[bundleId]/audit/page.tsx`, `src/components/audit/EventChip.tsx` (new), `src/components/audit/PayloadView.tsx` (new).

### 3.6 `/c/[token]` — client landing

This page was previously designed in Pass 7 (Missing pages). Apply that spec verbatim, summarized here:

```
Background: bg-cream, full-bleed
Centered card max-w-[560px] mx-auto mt-24 p-10 rounded-card shadow-card bg-paper
Above the card: ABeam Workbench wordmark, centered, 36 px tall
Inside the card:
  - Eyebrow "PRESALES WORKBENCH"
  - H1 serif "Welcome, {firstName}" 32 px
  - Body "{ClientCompanyName} has been invited to review pre-onboarding decisions for the Fit-to-Standard workshop scope below."
  - Scope chips row (1IQ · BD9 · BDG)
  - Cross-border consent block (PDPA Malaysia s.129 — keep current copy verbatim, restyle the checkbox)
  - <Button variant="primary" size="lg">Continue</Button> full-width
  - Caption: "By continuing you agree to the cross-border data processing consent above."
```

**Files:** `src/app/(external)/c/[token]/page.tsx`.

### 3.7 `/c/verify` — OTP

```
Same centered card layout as 3.6
Eyebrow "VERIFY YOUR EMAIL"
H1 serif "Enter the 6-digit code we sent to {redactedEmail}"
6 box inputs: w-12 h-14 rounded-input border border-border text-center font-mono text-[20px] (one per digit, auto-advance)
Caption with countdown: "Resend code in 0:45"
<Button variant="ghost" disabled={countdownActive}>Resend code</Button>
After 5 failed attempts: render <InlineErrorBanner message="Too many incorrect codes. Try again in 15 minutes." code="OTP_LOCKED" />
```

**Files:** `src/app/(external)/c/verify/page.tsx`, `src/components/external/OtpInput.tsx`.

### 3.8 `/c/s/[scopeCode]` — workbench (client side)

Same as 3.4 preview, but interactive. Differences:

- Sticky scorecard at top: `<StickyScorecard>` shows "0 of 8 decisions made · X open" with a thin progress bar in `bg-navy` filling from left
- Decision cards are interactive: option clicks dispatch to the choices state, animate the accent bar (200ms calm easing)
- Bottom of page: `<Button variant="primary" size="lg">Lock and sign off →</Button>` enabled only when all decisions are made
- Side rail is replaced with a scope-item picker on the left: a vertical list of scope codes (1IQ · BD9 · BDG) with active state highlighting

**Files:** `src/app/(external)/c/s/[scopeCode]/page.tsx`, `src/components/external/ClientWorkbenchShell.tsx`, `src/components/fts/StickyScorecard.tsx`.

### 3.9 `/c/expired` and `/c/ended` — terminal pages

These are the most-broken pages in the current build. Currently they render hardcoded fixture data ("Sarah Tan"). Rebuild them per §5 below.

---

## 4. Brand rename — Aptus → ABeam Workbench

Apply globally before any other restoration step (one PR, mechanical):

| Surface | Change |
|---|---|
| Top bar wordmark | `Aptus` → `ABeam Workbench` |
| `<title>` tag | `Aptus` → `ABeam Workbench — Fit-to-Standard pre-onboarding` |
| `<meta name="description">` | New copy: "ABeam's pre-onboarding Fit-to-Standard workbench. Authored Tier 1 decisions, signed and audited, ready to drive Explore." |
| Favicon | Replace with the ABeam mark in navy on cream |
| OG image | New `public/og.png` — 1200×630, cream bg, navy "ABeam Workbench" wordmark, single subtitle |
| Email subject lines | "Your ABeam Workbench access" / "Reissued access — ABeam Workbench" / "Your signoff is recorded" |
| Email from-name | "ABeam Workbench" (not "Aptus") |
| PDF signoff cover page | Top-left "ABeam Workbench" wordmark, bottom-right "Generated by ABeam Workbench · {timestamp}" |
| All copy mentioning "Aptus" | grep and replace |

**Grep for:** `Aptus`, `aptus`, `APTUS` across `src/`, `prisma/`, `public/`, `tests/`, `package.json`'s `name` field, README.md.

Exception: leave the deployment URL `aptus-sandy.vercel.app` alone — it's a Vercel preview hostname tied to the GitHub project name, not user-facing. A custom domain rename comes later.

---

## 5. Terminal page contact card — fix the Sarah Tan bug

Currently `/c/expired?reason=revoked_grant` shows hardcoded contact data. The page must pull the actual owning consultant from the database.

### 5.1 Data wiring

`PresalesBundle` already has an `ownerUserId` relation. In the page's server component:

```ts
const bundle = await prisma.presalesBundle.findUnique({
  where: { id: bundleId },
  include: { owner: { select: { name: true, email: true, phone: true, avatarUrl: true } } },
});
```

If `ownerUserId` is null (older bundles), fall back to the ABeam practice contact — but make that fallback an environment variable, not a hardcoded "Sarah Tan":

```
ABEAM_PRACTICE_CONTACT_NAME=Ikmal Baharudin
ABEAM_PRACTICE_CONTACT_EMAIL=ibaharudin@abeam.com
ABEAM_PRACTICE_CONTACT_PHONE=+60 3 8688 5000
```

### 5.2 Rendering

```tsx
<div className="rounded-card border border-border p-6 bg-paper">
  <div className="font-sans text-[11px] font-semibold tracking-[0.08em] uppercase text-ink-muted mb-3">
    Your ABeam contact
  </div>
  <div className="flex items-center gap-4">
    {avatarUrl
      ? <img src={avatarUrl} className="w-12 h-12 rounded-pill object-cover" />
      : <div className="w-12 h-12 rounded-pill bg-navy-soft text-navy font-serif text-[18px] flex items-center justify-center">{initials(name)}</div>
    }
    <div className="flex-1">
      <div className="font-sans text-[16px] font-semibold text-ink">{name}</div>
      <div className="font-sans text-[14px] text-ink-soft">
        <a href={`mailto:${email}`} className="hover:underline">{email}</a>
        {phone && <> · <a href={`tel:${phone.replace(/\s/g,"")}`} className="hover:underline">{phone}</a></>}
      </div>
    </div>
  </div>
  <div className="mt-5">
    <a href={`mailto:${email}?subject=${encodeURIComponent("Re: " + bundle.clientCompanyName)}`} className="inline-flex items-center justify-center h-10 px-4 rounded-input bg-cta text-white text-[14px] font-semibold hover:bg-cta-hover">
      Email {firstName(name)}
    </a>
  </div>
</div>
```

### 5.3 Polymorphic copy per `reason`

| `?reason=` | Eyebrow | H1 | Body |
|---|---|---|---|
| `revoked_grant` | ACCESS WITHDRAWN | Access revoked | Your secure access to this workbench has been withdrawn. Your ABeam consultant has been notified and will contact you with next steps. |
| `expired` | ACCESS EXPIRED | This link has expired | The access window for this workbench has ended. If you still need to review the decisions, your consultant can extend or reissue the link. |
| `session_invalidated` | SESSION ENDED | Your session was signed out | You signed out, or this link was opened on a different device. For security, you'll need to start a new session. |
| `signed_off` | SIGNOFF RECORDED | Thank you — decisions are signed | This workbench is now sealed. A signed PDF has been emailed to you and your ABeam consultant. |

Each variant renders the same contact card and the same wordmark + container. Only eyebrow / H1 / body change.

**Files:** `src/app/(external)/c/expired/page.tsx`, `src/components/external/TerminalScreen.tsx` (new shared shell), `src/components/external/ConsultantContactCard.tsx` (new), `src/lib/presales/owner-contact.ts` (new — resolves bundle.owner with env fallback).

---

## 6. Supporting specs

### 6.1 Danger filled button

Add this variant to §2.1's `<Button>` for "Confirm revoke":

```
dangerFilled: "bg-cta text-white hover:bg-cta-hover active:scale-[0.98]"
```

(Visually identical to `primary` — keeps consistency. The semantic is "this commits a destructive action.")

### 6.2 Empty states

For any list that can be empty (`/presales` index, audit page with strict filter, etc.):

```tsx
<div className="text-center py-16">
  <{Icon} size={48} className="mx-auto text-ink-muted mb-4" strokeWidth={1.5} />
  <div className="font-serif text-[22px] text-ink mb-2">{title}</div>
  <div className="font-sans text-[14px] text-ink-soft max-w-[400px] mx-auto">{description}</div>
  {cta && <div className="mt-6">{cta}</div>}
</div>
```

Icons (lucide): `ClipboardList` for bundles, `Search` for filtered empty, `FileText` for audit, `Inbox` for client-side empty.

### 6.3 Wordmark / favicon

Build `src/components/brand/Wordmark.tsx`:

```tsx
export function Wordmark({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const dim = size === "sm" ? 20 : size === "lg" ? 32 : 24;
  return (
    <div className="inline-flex items-center gap-2">
      <svg width={dim} height={dim} viewBox="0 0 24 24" aria-hidden>
        <rect width="24" height="24" rx="4" fill="var(--brand-navy)" />
        <path d="M7 18 L12 6 L17 18 M9 14 L15 14" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
      <span className="font-serif text-[16px] font-medium text-navy">ABeam Workbench</span>
    </div>
  );
}
```

`public/favicon.svg`: same A glyph at 32×32, navy bg.

### 6.4 JSON payload view (audit page)

```tsx
function PayloadView({ json }: { json: Record<string, unknown> }) {
  return (
    <pre className="font-mono text-[12px] leading-[18px] text-ink-soft whitespace-pre-wrap break-all">
      {Object.entries(json).map(([k, v]) => (
        <span key={k}>
          <span className="text-navy">{k}</span>
          <span className="text-ink-muted">: </span>
          <span className={typeof v === "string" ? "text-decision-standard" : typeof v === "number" ? "text-decision-custom" : "text-ink"}>
            {typeof v === "string" ? `"${v}"` : JSON.stringify(v)}
          </span>
          <br />
        </span>
      ))}
    </pre>
  );
}
```

### 6.5 Motion rules (Pass 6 recap, applied)

| Surface | Animation | Duration · Easing |
|---|---|---|
| Button press | `scale 0.98` | snap (100 ms) |
| Pill / chip hover | bg fade | snap (100 ms) |
| Decision accent bar color change | color crossfade | calm (200 ms) |
| Card hover (in lists) | shadow lift from `card` → `cardHover` | calm (200 ms) |
| Modal / inline panel open | fade + translateY 4 px from below | hero (320 ms) |
| Status pill change | bg + text color crossfade | calm (200 ms) |
| Sticky scorecard reveal on scroll | shadow + bg opacity | calm (200 ms) |

`prefers-reduced-motion`: when set, drop all transitions to `0ms` except essential layout shifts.

### 6.6 Accessibility checklist (Pass 5 recap, applied)

- Every interactive element has a visible `focus-visible` state using `shadow-focus`
- Color contrast ≥ 4.5:1 for body, ≥ 3:1 for large text (verified for all token combinations in §1.1)
- `<StatusPill>` has `aria-label` matching the status label
- `<DecisionCard>` option buttons are real `<button>` elements with `aria-pressed`
- OTP input boxes: each is a real `<input>`, labelled with `aria-label="Digit {n} of 6"`
- Audit table is a real `<table>` with `<th scope="col">` headers (not a div grid)
- Terminal page H1 is `<h1>`, not styled span
- Skip-to-content link at top of every page

### 6.7 Naming collision to avoid — carried over from the HTML previews

The HTML design previews (`design-previews/PR5 Page Application.html` + `pr5.css`) contain a CSS class-name collision. **Do not port it into the real repo.**

In the previews, the OTP audit-event chip and the OTP one-time-code input box both use the class name `otp`:

- `.otp` — the OTP **input box** (`width:48px; height:56px; font-size:22px; border`)
- `.event-chip.otp` — the OTP **event chip** modifier (only overrides `background` + `color`)

Because the chip rule does not override `width`, `height`, `font-size`, `border`, or `font-family`, the input-box rule leaks into the chip. The result is a malformed 48×56 px box with oversized text overlapping the adjacent row — visible in the previews on route 3.3 (Recent Activity) and route 3.5 (audit table).

When implementing for real:
- The OTP code input is `<OtpInput>` (§3.7) — give it a scoped class such as `otp-box` or a Tailwind utility set, never a bare `otp`.
- The audit/activity event chip is `<EventChip>` (§3.5) — its category modifier for OTP events must be namespaced, e.g. `event-chip--otp` or a `variant="otp"` prop mapped to scoped styles, never a bare `otp`.

If the implementation uses Tailwind utilities or CSS Modules per this brief (as it should), no global `.otp` selector exists and the collision cannot occur — but the two component names are close enough that this note exists to keep them apart deliberately.

---

## 7. Roll-out order — 5 PRs in sequence

Each PR should land independently. The order matters: tokens first, then primitives, then page-by-page application.

| PR | Title | Scope | Estimated diff |
|---|---|---|---|
| 1 | Design tokens + Tailwind config + fonts | §1 in full. No visual change yet because no component consumes the tokens. Lands the foundation. | ~150 LOC across 3 files |
| 2 | Brand rename: Aptus → ABeam Workbench | §4 in full. Mechanical grep-replace + favicon + OG image. | ~30 file touches |
| 3 | Layout shell: TopBar, SideRail, Wordmark | §2.8 + §6.3. Applies to every portal route via root layout. Becomes visible improvement. | ~250 LOC, 5 new files |
| 4 | Shared primitives: Button, StatusPill, Card, InlineErrorBanner, RelativeTime, Input | §2.1–§2.4, §2.6–§2.7. Build the components. Replace ad-hoc Tailwind on every page that uses them. | ~600 LOC, 7 new files, ~10 files refactored |
| 5 | Page-level application | §3 in order: `/presales` → `/presales/new` → `/presales/[bundleId]` → preview → audit → client pages → terminal pages. Each route ships as its own commit inside this PR (or split into PRs 5a–5g if review bandwidth allows). | ~1500 LOC |

Each PR includes a screenshot in the description so review can verify visually.

---

## 8. Acceptance checklist

Apply this checklist on the live deployment after PR 5 lands. Each box must be checked before declaring the design restoration complete.

**Brand**
- [ ] No occurrence of the word "Aptus" anywhere on screen, in `<title>`, in any email subject or body, in the PDF, or in the favicon
- [ ] Top bar shows the ABeam Workbench wordmark (navy A glyph + serif text) on every portal route
- [ ] Terminal pages and client routes show the wordmark centered above the card

**Color**
- [ ] No `slate-50` or `gray-100` page backgrounds anywhere — every page uses `bg-cream`
- [ ] Primary CTAs are ABeam red `--cta-red` (#C8102E), not the default Tailwind red
- [ ] Side rail is `--brand-navy` (#002B5C) with white icons and red active indicator
- [ ] Status pills use the §1.1 tinted-bg + saturated-text taxonomy

**Typography**
- [ ] Every H1 and H2 uses `font-serif`
- [ ] No serif fonts in body copy
- [ ] All timestamps render via `<RelativeTime>` (dual-line) — no raw ISO strings on screen

**Components**
- [ ] Every button on the live UI uses one of the 5 `<Button>` variants
- [ ] Every status badge uses `<StatusPill>`
- [ ] Every card uses `<Card>` or matches its visual contract
- [ ] Decision cards in `/c/s/*` and `/presales/[id]/preview/*` show the 4-px accent bar in the correct decision color

**Terminal pages**
- [ ] `/c/expired?reason=revoked_grant` shows the actual bundle owner's name, email, phone — verified by visiting the link from a bundle owned by Ikmal and seeing "Ikmal Baharudin" not "Sarah Tan"
- [ ] All four `reason` variants (`revoked_grant`, `expired`, `session_invalidated`, `signed_off`) render distinct H1 + body
- [ ] No fixture data anywhere in the codebase — grep for "Sarah Tan", "sarah.tan@abeam.com" returns zero matches

**Accessibility**
- [ ] Tab through every page; every focusable element shows the `shadow-focus` ring
- [ ] `prefers-reduced-motion` disables all transitions when set
- [ ] Audit table renders as `<table>` not `<div>`; screen reader can navigate by column
- [ ] OTP inputs each have `aria-label="Digit {n} of 6"`

**Motion**
- [ ] Decision accent bars crossfade color on choice change (not instant)
- [ ] Cards in `/presales` lift shadow on hover
- [ ] Modals fade in with translateY (320 ms, hero easing)

**Print** (for the signoff PDF)
- [ ] PDF cover page is in cream, with ABeam Workbench wordmark top-left, scope title in serif, client name in caption
- [ ] Decision table on page 2 uses decision-color cells (not just text)
- [ ] Footer of each PDF page shows "Generated by ABeam Workbench · {ISO timestamp} · Page X of Y"

---

## 9. Explicitly out of scope for this restoration pass

To prevent scope creep, the following are **not** part of this brief:

1. New features. Every change here is visual restoration of agreed design. No new routes, no new database columns, no new business logic.
2. Localization activation. Pass 8 produced the Bahasa Malaysia and Simplified Chinese string tables, but actually wiring `next-intl` and the locale switcher is a separate workstream.
3. Dark mode. Pass 4 produced the dark palette, but dark mode is feature-flagged off until after the design restoration lands.
4. Brand rename of the Vercel project hostname. `aptus-sandy.vercel.app` stays; custom-domain migration is a separate decision.
5. Performance tuning. If the design changes happen to introduce regressions, fix them; but no LCP optimization, no image lazy-load, no bundle splitting work is part of this pass.
6. New analytics, new audit event types, or new payload shapes. Wire-fix only.

---

## 10. Quick test plan post-PR-5

After all 5 PRs land, run this 8-minute smoke test:

1. `/presales` — confirm cream bg, serif H1, navy side rail, red active indicator. Click a bundle.
2. `/presales/[id]` — confirm hero, action toolbar styles, scorecard typography, recipient avatars.
3. Click **Extend window** — confirm panel uses outlined card + correct buttons.
4. Click **Preview as client → BD9** — confirm warm tan banner sticky, decision cards with accent bars, three option sub-cards with decision-color chips.
5. Click **Audit log** — confirm event chips colored by category, payload JSON syntax-highlighted, dual-line timestamps.
6. Create a new bundle from `/presales/new` — confirm form sections, inline error banner styling on intentional NO_SIGNATORY submission.
7. Issue a grant, open the email, click the link — confirm `/c/[token]` landing card, OTP screen, workbench client view.
8. Revoke the bundle, re-click the email link — confirm `/c/expired?reason=revoked_grant` shows **your** name in the contact card, not Sarah Tan.

If all 8 pass, design restoration is complete and ready for the next feature pass.

---

*End of brief. One pass, five PRs, eight smoke tests, zero "Sarah Tan".*
