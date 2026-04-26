"use client";

/**
 * Design system showcase — the visible verification surface for Apps 1–8.
 *
 * Each phase adds a section. Wrapped in `.aptus-app` so the new tokens
 * activate without affecting any other route. Visit /design-system on
 * the Vercel preview URL to verify.
 *
 * Updated for App-2: replaces inline HTML with the new TSX components
 * (AptusMark, StatusPill, CoverageBar, StepRail). What you see here is
 * what subsequent phases (App-3..App-7) will compose into actual screens.
 */

import {
  AptusMark,
  AptusWordmark,
  CoverageBar,
  StatusPill,
  StepRail,
} from "@/components/aptus";

// Note: cannot export `metadata` from a Client Component — set in a parent
// layout if a route-specific title is needed.

export default function DesignSystemPage() {
  return (
    <div className="aptus-app" style={{ minHeight: "100vh", padding: "32px 24px" }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <header style={{ marginBottom: 32, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <p className="a-small">App-1 + App-2 of 8</p>
            <h1 className="a-display" style={{ margin: "4px 0 8px" }}>
              Aptus Design System
            </h1>
            <p className="a-body a-muted" style={{ maxWidth: 640 }}>
              Living showcase of the design tokens (App-1) and the four shared
              components (App-2). Every page redesigned in App-3 onwards
              composes these primitives.
            </p>
          </div>
          <AptusWordmark size={20} />
        </header>

        {/* App-2: Aptus mark */}
        <section className="a-card" style={{ padding: 24, marginBottom: 16 }}>
          <h2 className="a-h2" style={{ marginTop: 0 }}>AptusMark + AptusWordmark</h2>
          <p className="a-small" style={{ marginTop: 4, marginBottom: 16 }}>
            The brand mark — same path as <code className="a-mono">public/icons/aptus-mark.svg</code>.
            Single path with even-odd fill rule (the inner triangle is a cutout).
            Inherits color via <code className="a-mono">currentColor</code>.
          </p>
          <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ color: "var(--aptus-text)" }}>
              <AptusMark size={32} />
            </div>
            <div style={{ color: "var(--aptus-text)" }}>
              <AptusMark size={48} />
            </div>
            <div style={{ background: "var(--aptus-brand)", padding: 12, borderRadius: 8, color: "white" }}>
              <AptusMark size={48} />
            </div>
            <AptusWordmark size={14} />
            <AptusWordmark size={18} />
            <AptusWordmark size={24} />
          </div>
        </section>

        {/* Color tokens */}
        <section className="a-card" style={{ padding: 24, marginBottom: 16 }}>
          <h2 className="a-h2" style={{ marginTop: 0 }}>Color tokens</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 12, marginTop: 16 }}>
            {[
              { name: "bg", token: "--aptus-bg", hex: "#FAFAFA" },
              { name: "surface", token: "--aptus-surface", hex: "#FFFFFF" },
              { name: "surface-2", token: "--aptus-surface-2", hex: "#F4F4F6" },
              { name: "border", token: "--aptus-border", hex: "#E4E4E7" },
              { name: "text", token: "--aptus-text", hex: "#0B0B0F" },
              { name: "text-muted", token: "--aptus-text-muted", hex: "#52525B" },
              { name: "brand", token: "--aptus-brand", hex: "#0B0B0F" },
              { name: "success-700", token: "--aptus-success-700", hex: "#15803D" },
              { name: "warning-700", token: "--aptus-warning-700", hex: "#B45309" },
              { name: "info-700", token: "--aptus-info-700", hex: "#1D4ED8" },
              { name: "danger-700", token: "--aptus-danger-700", hex: "#B91C1C" },
              { name: "neutral-700", token: "--aptus-neutral-700", hex: "#3F3F46" },
            ].map((c) => (
              <div key={c.name} style={{ fontSize: 12 }}>
                <div style={{ height: 48, borderRadius: 6, border: "1px solid var(--aptus-border)", background: `var(${c.token})`, marginBottom: 6 }} />
                <div style={{ fontWeight: 500 }}>{c.name}</div>
                <div className="a-mono a-muted">{c.hex}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Typography */}
        <section className="a-card" style={{ padding: 24, marginBottom: 16 }}>
          <h2 className="a-h2" style={{ marginTop: 0 }}>Typography</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
            <div className="a-display">a-display — Display 32 px / 600</div>
            <div className="a-h1">a-h1 — Heading 1 22 px / 600</div>
            <div className="a-h2">a-h2 — Heading 2 18 px / 600</div>
            <div className="a-body">a-body — Body 14 px / 400</div>
            <div className="a-small">a-small — Small 12 px / muted</div>
            <div className="a-mono">a-mono — Mono 12 px / Geist Mono</div>
          </div>
        </section>

        {/* App-2: StatusPill */}
        <section className="a-card" style={{ padding: 24, marginBottom: 16 }}>
          <h2 className="a-h2" style={{ marginTop: 0 }}>StatusPill — the canonical one</h2>
          <p className="a-small" style={{ marginTop: 4, marginBottom: 16 }}>
            One component, all status types. Tone resolves from PILL_MAP by
            string, override with `tone` prop. Used everywhere — granularity,
            mandatory, gap-resolution, scope decisions, etc. (Spec §6.4.)
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <StatusPill status="Standard SAP" />
            <StatusPill status="Configurable" />
            <StatusPill status="Adapt to SAP" />
            <StatusPill status="Trusted add-on" />
            <StatusPill status="Power-user extension" />
            <StatusPill status="Cloud add-on (BTP)" />
            <StatusPill status="Custom build" />
            <StatusPill status="Out of scope" />
          </div>
          <p className="a-small a-muted" style={{ marginBottom: 8 }}>With chevron (clickable) + size variants:</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <StatusPill status="In Analyze" withChevron onClick={() => {}} />
            <StatusPill status="Mandatory" leftDot />
            <StatusPill status="Coarse" size="lg" />
          </div>
        </section>

        {/* Buttons */}
        <section className="a-card" style={{ padding: 24, marginBottom: 16 }}>
          <h2 className="a-h2" style={{ marginTop: 0 }}>Buttons</h2>
          <p className="a-small" style={{ marginTop: 4, marginBottom: 16 }}>
            Primary, secondary, ghost, danger — one of each per screen
            (spec §7.1: every screen has 0 or 1 primary action).
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="a-btn a-btn-primary">Primary action</button>
            <button className="a-btn a-btn-secondary">Secondary</button>
            <button className="a-btn a-btn-ghost">Ghost</button>
            <button className="a-btn a-btn-danger">Destructive</button>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            <button className="a-btn a-btn-primary a-btn-sm">Small primary</button>
            <button className="a-btn a-btn-secondary a-btn-sm">Small secondary</button>
          </div>
        </section>

        {/* Inputs */}
        <section className="a-card" style={{ padding: 24, marginBottom: 16 }}>
          <h2 className="a-h2" style={{ marginTop: 0 }}>Inputs</h2>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr", marginTop: 16 }}>
            <input className="a-input" placeholder="Input field — focus me" />
            <select className="a-select" defaultValue="">
              <option value="" disabled>Select…</option>
              <option value="a">Option A</option>
              <option value="b">Option B</option>
            </select>
            <textarea className="a-textarea" placeholder="Textarea — drag-resize the bottom-right corner" style={{ gridColumn: "1 / -1" }} />
          </div>
        </section>

        {/* App-2: CoverageBar — all 3 variants */}
        <section className="a-card" style={{ padding: 24, marginBottom: 16 }}>
          <h2 className="a-h2" style={{ marginTop: 0 }}>CoverageBar — three variants</h2>
          <p className="a-small" style={{ marginTop: 4, marginBottom: 16 }}>
            OOTB / Configure / Gap split. Used on Dashboard, assessment header,
            and Step 4 (Adjust).
          </p>

          <div style={{ marginBottom: 16 }}>
            <p className="a-small a-muted" style={{ marginBottom: 8 }}>variant=&quot;stacked&quot; (default):</p>
            <CoverageBar ootb={62} config={17} gap={21} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <p className="a-small a-muted" style={{ marginBottom: 8 }}>variant=&quot;donut&quot;:</p>
            <CoverageBar ootb={62} config={17} gap={21} variant="donut" />
          </div>

          <div>
            <p className="a-small a-muted" style={{ marginBottom: 8 }}>variant=&quot;numbers&quot;:</p>
            <CoverageBar ootb={62} config={17} gap={21} variant="numbers" />
          </div>
        </section>

        {/* App-2: StepRail — all 3 variants */}
        <section className="a-card" style={{ padding: 24, marginBottom: 16 }}>
          <h2 className="a-h2" style={{ marginTop: 0 }}>StepRail — three variants</h2>
          <p className="a-small" style={{ marginTop: 4, marginBottom: 16 }}>
            The 5-step flow inside an assessment (Profile → Scope → Analyze → Adjust → Export).
            Single source of truth — STEPS const exported from the same module.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 24, marginTop: 16 }}>
            <div>
              <p className="a-small a-muted" style={{ marginBottom: 8 }}>variant=&quot;rail&quot; (sidebar):</p>
              <StepRail current={3} completed={[1, 2]} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              <div>
                <p className="a-small a-muted" style={{ marginBottom: 8 }}>variant=&quot;progress&quot;:</p>
                <StepRail current={3} completed={[1, 2]} variant="progress" />
              </div>
              <div>
                <p className="a-small a-muted" style={{ marginBottom: 8 }}>variant=&quot;breadcrumb&quot;:</p>
                <StepRail current={3} completed={[1, 2]} variant="breadcrumb" />
              </div>
            </div>
          </div>
        </section>

        <footer className="a-small a-muted" style={{ marginTop: 32, textAlign: "center" }}>
          Aptus design system v1.2 · App-2 of 8 · Verify each phase by visiting this page on its preview URL.
        </footer>
      </div>
    </div>
  );
}
