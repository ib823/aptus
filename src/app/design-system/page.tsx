/**
 * Design system showcase — the visible verification surface for App-1.
 *
 * Renders one of every Aptus design-system component using the new tokens.
 * Wrapped in `.aptus-app` so the new tokens activate without affecting any
 * other route. Visit /design-system on the Vercel preview URL to verify.
 *
 * As subsequent App-2…App-7 phases land, this page gets new sections
 * showcasing the new components/screens. App-8 pins this page in visual
 * regression as a single source of truth for the design system's state.
 */

export const metadata = {
  title: "Design System",
};

export default function DesignSystemPage() {
  return (
    <div className="aptus-app" style={{ minHeight: "100vh", padding: "32px 24px" }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <header style={{ marginBottom: 32 }}>
          <p className="a-small">App-1 — Foundation tokens</p>
          <h1 className="a-display" style={{ margin: "4px 0 8px" }}>
            Aptus Design System
          </h1>
          <p className="a-body a-muted" style={{ maxWidth: 640 }}>
            Living showcase of the design tokens, status pills, buttons,
            cards, and shell components. Every page redesigned in App-3
            onwards uses these primitives.
          </p>
        </header>

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

        {/* Status pills */}
        <section className="a-card" style={{ padding: 24, marginBottom: 16 }}>
          <h2 className="a-h2" style={{ marginTop: 0 }}>Status pills</h2>
          <p className="a-small" style={{ marginTop: 4, marginBottom: 16 }}>
            One canonical component used across every status surface (spec §6.4).
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span className="a-pill a-pill-success">Standard SAP</span>
            <span className="a-pill a-pill-warning">Configurable</span>
            <span className="a-pill a-pill-warning">Adapt to SAP</span>
            <span className="a-pill a-pill-info">Trusted add-on</span>
            <span className="a-pill a-pill-info">Power-user extension</span>
            <span className="a-pill a-pill-info">Cloud add-on</span>
            <span className="a-pill a-pill-danger">Custom build</span>
            <span className="a-pill a-pill-neutral">Out of scope</span>
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

        {/* Coverage bar */}
        <section className="a-card" style={{ padding: 24, marginBottom: 16 }}>
          <h2 className="a-h2" style={{ marginTop: 0 }}>Coverage bar</h2>
          <p className="a-small" style={{ marginTop: 4, marginBottom: 16 }}>
            Used to show OOTB / Configure / Gap split at-a-glance.
          </p>
          <div className="a-coverage-bar">
            <div className="a-coverage-seg a-ootb"   style={{ width: "62%" }} />
            <div className="a-coverage-seg a-config" style={{ width: "17%" }} />
            <div className="a-coverage-seg a-gap"    style={{ width: "21%" }} />
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 12, fontSize: 12 }}>
            <span className="a-muted">62% Standard</span>
            <span className="a-muted">17% Config</span>
            <span className="a-muted">21% Gap</span>
          </div>
        </section>

        {/* Step rail (preview of App-5) */}
        <section className="a-card" style={{ padding: 24, marginBottom: 16 }}>
          <h2 className="a-h2" style={{ marginTop: 0 }}>Step rail (preview)</h2>
          <p className="a-small" style={{ marginTop: 4, marginBottom: 16 }}>
            The 5-step flow inside an assessment. Will land in App-5.
          </p>
          <div className="a-step-rail">
            {[
              { n: 1, label: "Profile", state: "complete" },
              { n: 2, label: "Scope", state: "complete" },
              { n: 3, label: "Analyze", state: "active" },
              { n: 4, label: "Adjust", state: "" },
              { n: 5, label: "Export", state: "locked" },
            ].map((s) => (
              <div key={s.n} className={`a-step-item ${s.state ? `a-${s.state}` : ""}`}>
                <span className="a-step-marker">{s.n}</span>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{s.label}</span>
              </div>
            ))}
          </div>
        </section>

        <footer className="a-small a-muted" style={{ marginTop: 32, textAlign: "center" }}>
          Aptus design system v1.2 · App-1 of 8 · Verify each phase by visiting this page on its preview URL.
        </footer>
      </div>
    </div>
  );
}
