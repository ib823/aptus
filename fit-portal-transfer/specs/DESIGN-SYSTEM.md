# Design System — Apple HIG-Inspired Enterprise Portal

---

## Design Philosophy

1. **Clarity**: Content is the interface. Chrome disappears. Data speaks.
2. **Deference**: The UI serves the content, not the other way around.
3. **Depth**: Visual layers create hierarchy without decoration.

The portal must feel like a native Apple application — not a "web app". Every pixel must be intentional.

---

## Color Palette

### Primary Colors

| Name | Hex | Usage |
|------|-----|-------|
| `blue-500` (Primary) | `#007AFF` | Primary actions, active states, links |
| `blue-600` | `#0066D6` | Hover states |
| `blue-50` | `#F0F7FF` | Selected backgrounds |
| `gray-950` | `#1D1D1F` | Primary text |
| `gray-600` | `#6E6E73` | Secondary text |
| `gray-400` | `#AEAEB2` | Placeholder text |
| `gray-200` | `#E5E5EA` | Borders, dividers |
| `gray-100` | `#F2F2F7` | Background (secondary) |
| `gray-50` | `#F9F9FB` | Background (tertiary) |
| `white` | `#FFFFFF` | Surface, cards |

### Semantic Colors (Resolution Status)

| Name | Hex | Tailwind Class | Usage |
|------|-----|---------------|-------|
| FIT | `#34C759` | `text-green-500` | Steps that match SAP best practice |
| CONFIGURE | `#007AFF` | `text-blue-500` | Steps needing SAP configuration |
| EXTEND | `#FF9500` | `text-amber-500` | Steps needing extension (KUE/BTP) |
| BUILD | `#FF3B30` | `text-red-500` | Steps needing 3rd party/custom |
| ADAPT | `#AF52DE` | `text-purple-500` | Steps where client adapts process |
| PENDING | `#8E8E93` | `text-gray-400` | Steps not yet reviewed |
| NA | `#C7C7CC` | `text-gray-300` | Steps not applicable |

### Backgrounds for Status Cards

| Status | Background | Border |
|--------|-----------|--------|
| FIT | `bg-green-50` | `border-green-200` |
| CONFIGURE | `bg-blue-50` | `border-blue-200` |
| EXTEND | `bg-amber-50` | `border-amber-200` |
| BUILD | `bg-red-50` | `border-red-200` |
| ADAPT | `bg-purple-50` | `border-purple-200` |
| PENDING | `bg-gray-50` | `border-gray-200` |

---

## Typography

### Font Stack

```css
font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text',
             'Helvetica Neue', Helvetica, Arial, sans-serif;

/* Monospace (for codes, data) */
font-family: 'SF Mono', SFMono-Regular, ui-monospace, Menlo, monospace;
```

### Type Scale

| Name | Size | Weight | Line Height | Letter Spacing | Usage |
|------|------|--------|-------------|----------------|-------|
| `display` | 34px | 700 | 1.12 | -0.02em | Page titles (h1) |
| `title-1` | 28px | 700 | 1.14 | -0.015em | Section headers (h2) |
| `title-2` | 22px | 700 | 1.18 | -0.01em | Card headers (h3) |
| `title-3` | 20px | 600 | 1.2 | -0.01em | Subsection headers |
| `headline` | 17px | 600 | 1.29 | -0.005em | Emphasized body |
| `body` | 17px | 400 | 1.47 | 0 | Primary body text |
| `callout` | 16px | 400 | 1.31 | 0 | Secondary body text |
| `subhead` | 15px | 400 | 1.33 | 0 | Supporting text |
| `footnote` | 13px | 400 | 1.38 | 0 | Metadata, timestamps |
| `caption-1` | 12px | 500 | 1.33 | 0 | Labels, badges |
| `caption-2` | 11px | 400 | 1.27 | 0.01em | Fine print |

### Usage Rules

- **NEVER** use font sizes outside this scale
- **NEVER** use font weights not specified (only 400, 500, 600, 700)
- **ALWAYS** use `gray-950` for primary text, `gray-600` for secondary
- **NEVER** use pure black (`#000000`) for text
- Headlines and titles use negative letter-spacing for optical tightening

---

## Spacing System

Base unit: 4px. All spacing must be multiples of 4.

| Token | Value | Usage |
|-------|-------|-------|
| `space-1` | 4px | Tight internal padding |
| `space-2` | 8px | Between inline elements |
| `space-3` | 12px | Between related items |
| `space-4` | 16px | Standard padding |
| `space-5` | 20px | Card internal padding |
| `space-6` | 24px | Between sections |
| `space-8` | 32px | Between major sections |
| `space-10` | 40px | Page margins (mobile) |
| `space-12` | 48px | Page margins (tablet) |
| `space-16` | 64px | Page margins (desktop) |

### Layout Rules

- Card padding: `space-5` (20px) on all sides
- Card gap (between cards): `space-4` (16px)
- Section gap: `space-8` (32px)
- Page max-width: 1200px, centered
- Sidebar width: 280px (fixed)
- Step review content max-width: 720px (readable line length)

---

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `radius-sm` | 6px | Small buttons, badges |
| `radius-md` | 10px | Cards, inputs |
| `radius-lg` | 14px | Modals, large cards |
| `radius-xl` | 20px | Hero sections |
| `radius-full` | 9999px | Pills, avatars |

---

## Shadows

| Token | Value | Usage |
|-------|-------|-------|
| `shadow-sm` | `0 1px 2px rgba(0,0,0,0.04)` | Subtle elevation (cards on white bg) |
| `shadow-md` | `0 4px 12px rgba(0,0,0,0.08)` | Cards, dropdowns |
| `shadow-lg` | `0 8px 24px rgba(0,0,0,0.12)` | Modals, popovers |
| `shadow-xl` | `0 16px 48px rgba(0,0,0,0.16)` | Full-page overlays |

---

## Components

### Button

```
Primary:   bg-blue-500, text-white, rounded-md, h-11 (44px), px-5, font-semibold
           hover: bg-blue-600
           active: bg-blue-700, scale-[0.98]
           disabled: opacity-50, cursor-not-allowed

Secondary: bg-gray-100, text-gray-950, rounded-md, h-11, px-5, font-semibold
           hover: bg-gray-200
           active: bg-gray-300, scale-[0.98]

Ghost:     bg-transparent, text-blue-500, rounded-md, h-11, px-5, font-semibold
           hover: bg-blue-50

Danger:    bg-red-500, text-white, rounded-md, h-11, px-5, font-semibold
           hover: bg-red-600

Small:     h-9 (36px), px-4, text-[15px]
```

Minimum touch target: 44x44px (Apple HIG requirement).

### Card

```
bg-white, rounded-lg (14px), shadow-sm, border border-gray-200
padding: 20px
hover (if interactive): shadow-md, border-blue-200, transition-all duration-200
```

### Input

```
h-11 (44px), px-4, rounded-md (10px), border border-gray-200
bg-white
text: body (17px), text-gray-950
placeholder: text-gray-400
focus: ring-2 ring-blue-500 ring-offset-2, border-blue-500
error: border-red-500, ring-red-500
```

### Select / Dropdown

Same dimensions as Input. Chevron icon on right.
Dropdown menu: bg-white, rounded-lg, shadow-lg, border border-gray-200, max-h-60 overflow-auto

### Radio / Checkbox Group

```
Each option: flex items-start gap-3, p-4, rounded-md, border border-gray-200, cursor-pointer
Selected: bg-blue-50, border-blue-300
Radio dot: w-5 h-5, rounded-full, border-2 border-gray-300
  Selected: border-blue-500, inner dot bg-blue-500
Label: headline (17px, 600)
Description: callout (16px, 400), text-gray-600
```

### Progress Bar

```
Track: h-2, rounded-full, bg-gray-200
Fill: h-2, rounded-full, bg-blue-500, transition-all duration-500
With percentage: subhead text-gray-600 right-aligned above bar
```

### Status Badge

```
inline-flex items-center, h-6, px-2.5, rounded-full
text: caption-1 (12px, 500)
FIT:       bg-green-100, text-green-700
CONFIGURE: bg-blue-100, text-blue-700
EXTEND:    bg-amber-100, text-amber-700
BUILD:     bg-red-100, text-red-700
ADAPT:     bg-purple-100, text-purple-700
PENDING:   bg-gray-100, text-gray-600
```

### Sidebar Navigation

```
width: 280px, fixed left
bg-gray-50, border-r border-gray-200
padding: space-4

Nav item: flex items-center gap-3, h-10, px-3, rounded-md
  text: callout (16px), text-gray-600
  icon: w-5 h-5, text-gray-400
  hover: bg-gray-200/50, text-gray-950
  active: bg-blue-50, text-blue-600, font-medium
    icon: text-blue-500

Section header: caption-1 (12px, 500), text-gray-400, uppercase, tracking-wider, px-3, mb-2, mt-6
```

### Step Review Card (Screen 3 specific)

```
Container: bg-white, rounded-lg, border border-gray-200, overflow-hidden

Header: px-5, py-4, border-b border-gray-100
  Step number: caption-1, text-gray-400
  Action title: title-3 (20px, 600), text-gray-950
  Step type badge: right-aligned

SAP Content Section: px-5, py-4, bg-gray-50
  Label: caption-1, text-gray-400, uppercase, "WHAT SAP BEST PRACTICE SAYS"
  Content: body (17px), text-gray-950
  Expected result: callout, text-gray-600, italic

Client Response Section: px-5, py-4
  Label: caption-1, text-gray-400, uppercase, "HOW DOES YOUR COMPANY DO THIS?"
  Radio options: (see Radio component above)
  Text area: when gap selected, required, min-h-24

Resolution Section (if gap): px-5, py-4, bg-amber-50/50, border-t border-amber-100
  Label: caption-1, text-amber-600, uppercase, "RESOLUTION OPTIONS"
  Option cards: flex flex-col gap-3
    Each option: p-4, rounded-md, border border-gray-200, cursor-pointer
      Selected: border-blue-500, bg-blue-50
      Type badge + title: headline
      Description: callout, text-gray-600
      Effort/cost: footnote, text-gray-500
      Risk badge: caption-2
```

---

## Layout Templates

### Assessment Wizard (Screens 1-2)

```
┌──────────────────────────────────────────┐
│  Narrow center column (max-w-2xl, 672px) │
│  Vertically centered                     │
│  Logo at top                             │
│  Step indicator below logo               │
│  Content section                         │
│  Action buttons at bottom                │
└──────────────────────────────────────────┘
```

### Process Review (Screen 3)

```
┌──────────┬───────────────────────────────┐
│ Sidebar  │  Main Content                 │
│ 280px    │  max-w-3xl (720px) centered   │
│          │                               │
│ Scope    │  Step Card                    │
│ items    │  (one at a time)              │
│ list     │                               │
│          │  Navigation                   │
│ Progress │  (prev/next + step picker)    │
│ per item │                               │
└──────────┴───────────────────────────────┘
```

### Report View (Screen 6)

```
┌──────────────────────────────────────────┐
│  Full width with max-w-5xl (1024px)      │
│  Print-optimized layout                  │
│  Each report section is a card           │
│  PDF download triggers server-side gen   │
└──────────────────────────────────────────┘
```

---

## Animation

- **Transitions**: `transition-all duration-200 ease-out` for hover/focus states
- **Page transitions**: None — instant navigation (no page transition animations)
- **Loading**: Skeleton screens with `animate-pulse` (never spinners for data loading)
- **Progress updates**: `transition-all duration-500 ease-out` for progress bars
- **Card interactions**: `scale-[0.98]` on active press, `duration-100`
- **Step navigation**: Smooth scroll to top of step card

**NEVER use:**
- Bounce animations
- Slide-in/slide-out page transitions
- Confetti or celebration animations
- Tooltip delays > 200ms
- Loading spinners (use skeletons)

---

## Responsive Breakpoints

| Name | Min Width | Layout |
|------|-----------|--------|
| `mobile` | 375px | Single column, no sidebar, bottom nav |
| `tablet` | 768px | Single column, collapsible sidebar |
| `desktop` | 1024px | Sidebar + main content (PRIMARY) |
| `wide` | 1440px | Sidebar + wider main content |

**Primary design target**: 1024px (tablet landscape / small laptop).
The portal is designed to be used on a laptop during workshops or at a desk.

---

## Accessibility (WCAG 2.1 AA)

1. All interactive elements have visible focus indicators (`ring-2 ring-blue-500 ring-offset-2`)
2. Color contrast ratio minimum 4.5:1 for body text, 3:1 for large text
3. All images have `alt` text
4. All form inputs have associated `<label>` elements
5. All custom controls are keyboard navigable (Tab, Enter, Space, Arrow keys)
6. Skip-to-content link as first focusable element
7. ARIA landmarks: `<main>`, `<nav>`, `<aside>`, `<header>`
8. Live regions for dynamic content updates (`aria-live="polite"`)
9. Reduced motion: respect `prefers-reduced-motion` media query

---

## Icons

Use Lucide React icons exclusively. No custom SVG icons except the Bound "≈" logo mark.

| Context | Icon | Size |
|---------|------|------|
| Navigation | `lucide-react` | 20px (`w-5 h-5`) |
| Inline with text | `lucide-react` | 16px (`w-4 h-4`) |
| Empty states | `lucide-react` | 48px (`w-12 h-12`) |
| Status indicators | Filled circles | 8px (`w-2 h-2`) |

---

## Dark Mode

**Not in initial release.** The portal ships with light mode only. The design system uses semantic tokens that can be extended for dark mode in a future phase.
