// Aptus extras — 13 follow-up explorations.
// Surfaces: EmptyCatalog, LoadingErrorCatalog, ClientShareView, MobileShell, BulkOps,
//           OnboardingTour, FileUpload, CmdKStates, ToastCatalog, ExportDarkPair,
//           ComplexityScales, ArchiveView, BundleVsPerReport.
const { useState: xS, useEffect: xE, useMemo: xM, useRef: xR, Fragment: XF } = React;

/* ───────────────────────────────── shared bits ───────────────────────────────── */

const PageWrap = ({ title, subtitle, children, back, max = 1280 }) => (
  <div style={{ maxWidth: max, margin: "0 auto" }}>
    <PageHeader title={title} subtitle={subtitle} back={back} />
    {children}
  </div>
);

// muted card label used for catalog cells
const CellLabel = ({ children }) => (
  <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-subtle)", marginBottom: 8 }}>{children}</div>
);

// preview frame so catalog tiles share a visual rhythm
const Frame = ({ children, h = 240, label, className = "", style = {} }) => (
  <div className={className} style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", background: "var(--surface)", display: "flex", flexDirection: "column", ...style }}>
    {label && <div style={{ padding: "8px 12px", fontSize: 11, color: "var(--text-muted)", borderBottom: "1px solid var(--border)", background: "var(--surface-2)", display: "flex", alignItems: "center", justifyContent: "space-between" }}><span>{label}</span></div>}
    <div style={{ flex: 1, minHeight: h, padding: 16, overflow: "hidden" }}>{children}</div>
  </div>
);

/* ─────────────────────────── #1  Empty-state catalog ─────────────────────────── */

function EmptyCatalog() {
  const scenarios = window.APTUS_DATA.emptyScenarios;
  return (
    <PageWrap
      title="Empty-state catalog"
      subtitle="11 surfaces, tactical/instructive copy. Each has an icon, a primary CTA and a secondary path."
    >
      <div className="t-small" style={{ marginBottom: 16, display: "flex", gap: 16 }}>
        <span><strong style={{ color: "var(--text)" }}>{scenarios.length}</strong> empty states</span>
        <span>· Tone: tactical / instructive</span>
        <span>· Pattern: <span className="t-mono">icon + title + helper + primary + secondary</span></span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 16 }}>
        {scenarios.map((s) => <EmptyCard key={s.id} s={s} />)}
      </div>
    </PageWrap>
  );
}

function EmptyCard({ s }) {
  const ICON_FOR = {
    "no-assessments":  <I.FileText size={28} />,
    "no-scope":        <I.Folder size={28} />,
    "no-reqs":         <I.List size={28} />,
    "no-gaps":         <I.Check size={28} />,
    "no-pending":      <I.Sparkles size={28} />,
    "no-integrations": <I.Layers size={28} />,
    "no-reports":      <I.Download size={28} />,
    "no-templates":    <I.Layers size={28} />,
    "no-search":       <I.Search size={28} />,
    "no-archive":      <I.Folder size={28} />,
    "no-team":         <I.Users size={28} />,
  };
  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)", background: "var(--surface-2)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span className="t-small" style={{ color: "var(--text-muted)" }}>{s.surface}</span>
        <span className="t-mono" style={{ fontSize: 10, color: "var(--text-subtle)" }}>{s.id}</span>
      </div>
      <div style={{ padding: "32px 20px 24px", textAlign: "center" }}>
        <div style={{
          width: 72, height: 72, margin: "0 auto 16px",
          borderRadius: 18, background: "var(--surface-2)", border: "1px solid var(--border)",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          color: "var(--text-muted)",
        }}>{ICON_FOR[s.id]}</div>
        <div className="t-h2" style={{ marginBottom: 6 }}>{s.title}</div>
        <div className="muted" style={{ fontSize: 13, marginBottom: 18, maxWidth: 320, margin: "0 auto 18px" }}>{s.desc}</div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          {s.cta && <button className="btn btn-primary btn-sm">{s.cta}</button>}
          {s.secondary && <button className="btn btn-secondary btn-sm">{s.secondary}</button>}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────── #2  Loading + error state catalog ─────────────────────── */

const Skel = ({ w = "100%", h = 12, r = 999, mt = 0, color = "var(--surface-2)" }) => (
  <div style={{ width: w, height: h, borderRadius: r, background: color, marginTop: mt }} />
);

function LoadingErrorCatalog() {
  return (
    <PageWrap
      title="Loading & error catalog"
      subtitle="Shimmer-free skeletons (rounded muted blocks). Errors cover network, permission, not-found, validation and save-conflict."
    >
      <div className="t-small" style={{ marginBottom: 16, color: "var(--text-muted)" }}>
        Pattern: <span className="t-mono">solid muted blocks · 12px tall · 999px radius · no shimmer</span>
      </div>

      <CellLabel>List skeletons</CellLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 16, marginBottom: 32 }}>
        <Frame label="Assessments list — loading" h={220}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 0", borderBottom: i < 3 ? "1px solid var(--border)" : "none" }}>
              <Skel w={36} h={36} r={6} />
              <div style={{ flex: 1 }}>
                <Skel w={`${50 + i * 8}%`} />
                <Skel w={`${30 + i * 5}%`} mt={6} h={10} />
              </div>
              <Skel w={60} h={20} r={999} />
            </div>
          ))}
        </Frame>
        <Frame label="Scope catalog — loading" h={220}>
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 0", borderBottom: i < 4 ? "1px solid var(--border)" : "none" }}>
              <Skel w={40} h={20} r={4} />
              <Skel w={`${40 + (i % 3) * 12}%`} />
              <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}><Skel w={64} h={20} r={999} /><Skel w={48} h={20} r={999} /></div>
            </div>
          ))}
        </Frame>
        <Frame label="Requirements list — loading" h={220}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{ padding: "10px 0", borderBottom: i < 3 ? "1px solid var(--border)" : "none" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <Skel w={64} h={10} />
                <Skel w={48} h={16} r={4} />
                <div style={{ marginLeft: "auto" }}><Skel w={72} h={20} r={999} /></div>
              </div>
              <Skel w={`${75 - i * 8}%`} mt={8} h={10} />
            </div>
          ))}
        </Frame>
      </div>

      <CellLabel>Detail skeletons</CellLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 16, marginBottom: 32 }}>
        <Frame label="Assessment detail — loading" h={260}>
          <Skel w="60%" h={20} />
          <Skel w="35%" mt={8} h={10} />
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <Skel w={80} h={28} r={6} /><Skel w={80} h={28} r={6} /><Skel w={80} h={28} r={6} />
          </div>
          <div style={{ marginTop: 20 }}><Skel w="100%" h={8} /></div>
          <div style={{ marginTop: 24 }}>
            {[0,1,2].map(i => <div key={i}><Skel w={`${80 - i*15}%`} mt={i ? 10 : 0} /></div>)}
          </div>
        </Frame>
        <Frame label="Scope drawer — loading" h={260}>
          <Skel w="50%" h={18} />
          <Skel w="80%" mt={8} h={10} />
          <div style={{ marginTop: 16, display: "flex", gap: 6 }}>
            <Skel w={64} h={20} r={999} /><Skel w={56} h={20} r={999} />
          </div>
          <div style={{ marginTop: 20 }}>
            {[0,1,2,3].map(i => <div key={i} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: i < 3 ? "1px solid var(--border)" : "none" }}>
              <Skel w={48} h={10} /><Skel w={`${50 - i*8}%`} h={10} /><div style={{ marginLeft: "auto" }}><Skel w={56} h={18} r={999} /></div>
            </div>)}
          </div>
        </Frame>
        <Frame label="Step 5 export — loading" h={260}>
          <Skel w="40%" h={18} />
          <Skel w="70%" mt={8} h={10} />
          <div style={{ marginTop: 16 }}>
            {[0,1,2,3].map(i => <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: i < 3 ? "1px solid var(--border)" : "none" }}>
              <Skel w={20} h={20} r={4} />
              <Skel w={`${40 + i*5}%`} h={10} />
              <div style={{ marginLeft: "auto" }}><Skel w={36} h={10} /></div>
            </div>)}
          </div>
        </Frame>
      </div>

      <CellLabel>Error states</CellLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 16 }}>
        <ErrorCard
          icon={<I.AlertCircle size={28} />}
          tone="danger"
          title="We couldn't reach Aptus."
          desc="Your network dropped, or our service is having a moment. We'll keep your draft locally."
          cta="Try again"
          secondary="Work offline"
          meta="GET /assessments/bursa-malaysia · ERR_NETWORK"
          surface="Network failure"
        />
        <ErrorCard
          icon={<I.AlertCircle size={28} />}
          tone="warning"
          title="You can't open this assessment."
          desc="Tenaga Nasional Group is restricted to its assigned team. Ask David Park or your workspace owner for access."
          cta="Request access"
          secondary="Back to Home"
          meta="403 — owner-restricted"
          surface="Permission denied"
        />
        <ErrorCard
          icon={<I.Search size={28} />}
          tone="neutral"
          title="That assessment doesn't exist."
          desc="It may have been deleted, or the link is wrong. Check Recent or search for the client name."
          cta="Search by client"
          secondary="Back to Home"
          meta="404 — /a/p3tro-archived"
          surface="Not found"
        />
        <ErrorCard
          icon={<I.AlertCircle size={28} />}
          tone="warning"
          title="Some fields need attention."
          desc="3 requirements are missing a Scope ID, and 1 has an invalid SAP code. Fix them to continue to Adjust."
          cta="Show 4 errors"
          secondary="Save anyway"
          meta="Validation failed: 4 issues"
          surface="Validation error"
          extras={(
            <div className="card" style={{ padding: 10, marginTop: 14, fontSize: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}><span style={{ color: "var(--danger-700)" }}>Row 312 · REQ-A038</span><span className="muted">Missing scope</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderTop: "1px solid var(--border)" }}><span style={{ color: "var(--danger-700)" }}>Row 408 · REQ-A044</span><span className="muted">Missing scope</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderTop: "1px solid var(--border)" }}><span style={{ color: "var(--danger-700)" }}>Row 511 · REQ-A067</span><span className="muted">Missing scope</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderTop: "1px solid var(--border)" }}><span style={{ color: "var(--danger-700)" }}>Row 612 · ZZX-99</span><span className="muted">Invalid SAP code</span></div>
            </div>
          )}
        />
        <ErrorCard
          icon={<I.AlertCircle size={28} />}
          tone="warning"
          title="Aliya edited this scope item too."
          desc="You both changed J60 Accounts Payable. Pick which version to keep, or merge field-by-field."
          cta="Compare changes"
          secondary="Keep mine · Keep theirs"
          meta="409 — Save conflict · 2 minutes apart"
          surface="Save conflict"
        />
        <ErrorCard
          icon={<I.AlertCircle size={28} />}
          tone="warning"
          title="Export failed mid-way."
          desc="11 of 14 reports generated; 3 timed out. You can retry just the missing ones."
          cta="Retry 3"
          secondary="Download partial bundle"
          meta="3 of 14 reports failed"
          surface="Partial failure"
        />
      </div>
    </PageWrap>
  );
}

const ErrorCard = ({ icon, tone = "danger", title, desc, cta, secondary, meta, surface, extras }) => {
  const toneClass = tone === "warning" ? "pill-warning" : tone === "neutral" ? "pill-neutral" : "pill-danger";
  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)", background: "var(--surface-2)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span className="t-small" style={{ color: "var(--text-muted)" }}>{surface}</span>
        <span className={`pill ${toneClass}`} style={{ height: 18, fontSize: 10, padding: "0 6px" }}>{tone === "warning" ? "Warning" : tone === "neutral" ? "Neutral" : "Error"}</span>
      </div>
      <div style={{ padding: "24px 20px" }}>
        <div style={{ color: tone === "danger" ? "var(--danger-700)" : tone === "warning" ? "var(--warning-700)" : "var(--text-muted)", marginBottom: 12 }}>{icon}</div>
        <div className="t-h2" style={{ marginBottom: 6 }}>{title}</div>
        <div className="muted" style={{ fontSize: 13, marginBottom: 14 }}>{desc}</div>
        <div className="t-mono" style={{ color: "var(--text-subtle)", fontSize: 11, marginBottom: 14 }}>{meta}</div>
        {extras}
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          {cta && <button className="btn btn-primary btn-sm">{cta}</button>}
          {secondary && <button className="btn btn-secondary btn-sm">{secondary}</button>}
        </div>
      </div>
    </div>
  );
};

/* ─────────────────────── #3 Aliya client share-link view ─────────────────────── */

function ClientShareView() {
  const a = window.APTUS_DATA.assessments[0];
  const [tab, setTab] = xS("scope");
  const scope = window.APTUS_DATA.scopeItems;
  return (
    <div style={{ background: "var(--surface-2)", minHeight: "100vh" }}>
      {/* External-style topbar — distinct from the internal Aptus chrome */}
      <div style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)", padding: "16px 32px", display: "flex", alignItems: "center", gap: 16 }}>
        <AptusMark size={24} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Bursa Malaysia · FIT-to-Standard preview</div>
          <div className="t-small">Shared by Maya Chen, ABeam Consulting · Read-only · Expires May 8, 2026</div>
        </div>
        <span className="pill pill-info" style={{ marginLeft: 12 }}><I.Eye size={12} /> Read-only</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <span className="t-small">Aliya Rahman · Bursa Malaysia</span>
          <div className="avatar" style={{ background: "linear-gradient(135deg,#F472B6,#A855F7)" }}>AR</div>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: "32px auto", padding: "0 32px" }}>
        <div style={{ fontSize: 36, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.15 }}>Welcome back, Aliya.</div>
        <div style={{ fontSize: 17, color: "var(--text-muted)", marginTop: 12, lineHeight: 1.55, maxWidth: 720 }}>
          Maya's team has finished the analysis of your 778 requirements. <strong style={{ color: "var(--text)" }}>62%</strong> work as standard,
          <strong style={{ color: "var(--text)" }}> 17%</strong> need configuration, and <strong style={{ color: "var(--text)" }}>21%</strong> are gaps your steering committee will need to decide on.
        </div>

        {/* Plain-language coverage */}
        <div className="card" style={{ padding: 24, marginTop: 28 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
            <CoverageBlockBig label="Works as standard" value="62%" desc="No changes needed — Aptus identified 482 of your 778 requirements as a direct fit with SAP S/4HANA." color="var(--success-500)" />
            <CoverageBlockBig label="Needs tuning" value="17%" desc="135 requirements where SAP needs to be adjusted in its settings — no custom code required." color="var(--warning-500)" />
            <CoverageBlockBig label="Gaps" value="21%" desc="161 requirements where standard SAP doesn't fit. We'll discuss options together." color="var(--danger-500)" />
          </div>
        </div>

        <div style={{ display: "flex", gap: 0, marginTop: 32, borderBottom: "1px solid var(--border)" }}>
          {[
            { id: "scope",  label: "Scope catalog" },
            { id: "gaps",   label: "Gaps to discuss" },
            { id: "what",   label: "What this means" },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              border: "none", background: "transparent",
              padding: "14px 20px", fontSize: 16, fontWeight: 500,
              color: tab === t.id ? "var(--text)" : "var(--text-muted)",
              borderBottom: tab === t.id ? "2px solid var(--brand)" : "2px solid transparent",
              marginBottom: -1, cursor: "pointer",
            }}>{t.label}</button>
          ))}
        </div>

        {tab === "scope" && (
          <div style={{ marginTop: 24 }}>
            <div className="muted" style={{ fontSize: 14, marginBottom: 16 }}>
              The 142 SAP capabilities included in your engagement. Hover or tap any technical term for a plain-language explanation.
            </div>
            <div className="card" style={{ overflow: "hidden" }}>
              {scope.slice(0, 8).map((s, i) => (
                <div key={s.id} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 16, alignItems: "center", padding: "16px 20px", borderBottom: i < 7 ? "1px solid var(--border)" : "none" }}>
                  <div className="t-mono" style={{ width: 48, color: "var(--text-muted)" }}>{s.id}</div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 500 }}>{s.name}</div>
                    <div className="t-small">{s.area} · {s.steps} process steps</div>
                  </div>
                  <PlainPill label={s.classification} />
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
              <button className="btn btn-secondary">Show all 142</button>
            </div>
          </div>
        )}
        {tab === "gaps" && (
          <div style={{ marginTop: 24 }}>
            <div className="muted" style={{ fontSize: 14, marginBottom: 16 }}>
              Each gap below is a requirement that standard SAP won't cover out-of-the-box. Aptus has suggested options; your team makes the call.
            </div>
            {window.APTUS_DATA.requirements.filter(r => r.classification === "Gap").slice(0,5).map((r, i) => (
              <div key={r.id} className="card" style={{ padding: 20, marginBottom: 12 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div style={{ width: 32, height: 32, borderRadius: 6, background: "var(--danger-50)", color: "var(--danger-700)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <I.AlertCircle size={16} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="t-mono" style={{ color: "var(--text-subtle)", marginBottom: 4 }}>{r.code}</div>
                    <div style={{ fontSize: 15, lineHeight: 1.5, marginBottom: 10 }}>{r.text}</div>
                    <div className="t-small" style={{ background: "var(--surface-2)", padding: "8px 12px", borderRadius: 6, lineHeight: 1.5 }}>
                      <strong style={{ color: "var(--text)" }}>What we recommend: </strong>{r.remarks || "Aptus will propose options before our next walkthrough."}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {tab === "what" && (
          <div style={{ marginTop: 24, fontSize: 15, lineHeight: 1.7, color: "var(--text-muted)" }}>
            <h3 style={{ color: "var(--text)", marginBottom: 8, fontSize: 18 }}>Your sign-off, in three steps</h3>
            <ol style={{ paddingLeft: 20 }}>
              <li style={{ marginBottom: 14 }}><strong style={{ color: "var(--text)" }}>Read through the scope catalog.</strong> If anything is missing — a process you do today that we haven't listed — flag it in the comments.</li>
              <li style={{ marginBottom: 14 }}><strong style={{ color: "var(--text)" }}>Decide on the 32 gaps.</strong> For each, your team chooses: change the process, build a custom extension, or accept the limitation.</li>
              <li><strong style={{ color: "var(--text)" }}>Approve.</strong> One click here unlocks the full deliverable bundle for your steering committee.</li>
            </ol>
          </div>
        )}

        <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 40, padding: 24, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)" }}>
          <I.Help size={20} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          <div style={{ flex: 1, fontSize: 14 }}>Have a question? Comment any item above, or reach out to <strong>Maya Chen</strong>.</div>
          <button className="btn btn-secondary btn-sm">Email Maya</button>
        </div>

        <div className="t-small" style={{ textAlign: "center", marginTop: 32, color: "var(--text-subtle)" }}>
          Powered by Aptus · This link expires May 8, 2026 · No login required
        </div>
      </div>
    </div>
  );
}

const CoverageBlockBig = ({ label, value, desc, color }) => (
  <div>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
      <div style={{ width: 10, height: 10, borderRadius: 999, background: color }} />
      <div className="t-small" style={{ fontWeight: 600, color: "var(--text)" }}>{label}</div>
    </div>
    <div style={{ fontSize: 36, fontWeight: 600, letterSpacing: "-0.02em" }}>{value}</div>
    <div className="muted" style={{ fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>{desc}</div>
  </div>
);

const PlainPill = ({ label }) => {
  const map = {
    OOTB:          { plain: "Works as standard", tone: "success" },
    FIT:           { plain: "Works as standard", tone: "success" },
    Configuration: { plain: "Needs tuning",      tone: "warning" },
    Gap:           { plain: "Gap",               tone: "danger" },
    Pending:       { plain: "Not yet reviewed",  tone: "neutral" },
  };
  const m = map[label] || { plain: label, tone: "neutral" };
  return <span className={`pill pill-${m.tone}`}>{m.plain}</span>;
};

/* ───────────────────────── #4 Mobile / responsive shell ──────────────────────── */

function MobileShell({ tablet }) {
  const [tab, setTab] = xS("analyze");
  const [sheet, setSheet] = xS(false);
  const w = tablet ? 768 : 375;

  return (
    <div style={{ background: "var(--surface-2)", minHeight: "100vh", padding: "32px 16px" }}>
      <PageWrap title={tablet ? "Tablet (768)" : "Phone (375)"} subtitle={tablet ? "Step rail collapses to top, drawer stays side." : "Table → cards. Bottom nav for steps. Drawer becomes full-screen sheet. Primary actions reachable with the thumb."}>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <div style={{ width: w, height: 720, borderRadius: 36, border: "10px solid #15151A", background: "var(--bg)", overflow: "hidden", boxShadow: "var(--shadow-lg)", display: "flex", flexDirection: "column", position: "relative" }}>
            {/* status bar */}
            <div style={{ background: "var(--surface)", padding: "10px 18px 6px", display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 600 }}>
              <span>9:41</span>
              <span>Aptus</span>
              <span style={{ display: "flex", gap: 4 }}>•••</span>
            </div>
            {/* assessment header */}
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", background: "var(--surface)", display: "flex", alignItems: "center", gap: 10 }}>
              <I.ArrowLeft size={18} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Bursa Malaysia Berhad</div>
                <div className="t-small">Step {tab === "scope" ? 2 : tab === "analyze" ? 3 : 4} · 778 reqs</div>
              </div>
              <button className="btn btn-ghost btn-icon btn-sm"><I.Search size={16} /></button>
            </div>

            {/* Tablet has a side rail; phone uses bottom nav */}
            {tablet ? (
              <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
                <div style={{ width: 180, borderRight: "1px solid var(--border)", background: "var(--surface)", padding: "12px 8px" }}>
                  {STEPS.map((s, i) => (
                    <div key={s.id} className={`step-item ${i + 1 === 3 ? "active" : ""} ${i < 2 ? "complete" : ""}`}>
                      <div className="step-marker">{i < 2 ? <I.Check size={12} /> : i + 1}</div>
                      <div className="step-label">{s.label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
                  {(tablet ? mobileScopeCards(8) : mobileScopeCards(4))}
                </div>
              </div>
            ) : (
              <>
                <div style={{ flex: 1, overflow: "auto", padding: 16, paddingBottom: 100 }}>
                  {tab === "analyze" && mobileScopeCards(4)}
                  {tab === "scope" && mobileScopeCards(3)}
                  {tab === "adjust" && mobileScopeCards(5)}
                  {tab === "export" && (
                    <div>
                      <div className="card" style={{ padding: 16, marginBottom: 12, textAlign: "center" }}>
                        <I.Download size={28} style={{ color: "var(--brand)", marginBottom: 12 }} />
                        <div className="t-h2">Bundle ready</div>
                        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>14 reports · 1.3 MB ZIP</div>
                        <button className="btn btn-primary w-full" style={{ marginTop: 14 }}>Download bundle</button>
                      </div>
                      <button className="btn btn-secondary w-full">Generate share link</button>
                    </div>
                  )}
                </div>
                <div style={{ position: "absolute", left: 16, right: 16, bottom: 16, padding: "8px 6px", borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-md)", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }}>
                  {[
                    { k: "scope",   l: "Scope",   ic: <I.Folder size={18} /> },
                    { k: "analyze", l: "Analyze", ic: <I.Sparkles size={18} /> },
                    { k: "adjust",  l: "Adjust",  ic: <I.List size={18} /> },
                    { k: "export",  l: "Export",  ic: <I.Download size={18} /> },
                  ].map(t => (
                    <button key={t.k} onClick={() => setTab(t.k)} style={{
                      border: "none", background: tab === t.k ? "var(--surface-2)" : "transparent",
                      padding: "8px 0", borderRadius: 10,
                      color: tab === t.k ? "var(--text)" : "var(--text-muted)",
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                      fontSize: 10, fontWeight: 500,
                    }}>{t.ic}<span>{t.l}</span></button>
                  ))}
                </div>
                {sheet && (
                  <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 10 }} onClick={() => setSheet(false)}>
                    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, top: 60, background: "var(--surface)", borderRadius: "16px 16px 0 0" }} onClick={e => e.stopPropagation()}>
                      <div style={{ width: 36, height: 4, background: "var(--border-strong)", borderRadius: 999, margin: "10px auto" }} />
                      <div style={{ padding: 16 }}>
                        <div className="t-h2">J60 · Accounts Payable</div>
                        <div className="muted" style={{ fontSize: 12 }}>Finance · 38 requirements</div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {!tablet && (
          <div className="t-small" style={{ marginTop: 24, textAlign: "center", color: "var(--text-muted)" }}>
            Tap a card to open the full-screen sheet · Cards replace the desktop table · Primary CTA hugs the thumb zone.
          </div>
        )}
      </PageWrap>
    </div>
  );
}

function mobileScopeCards(n) {
  return window.APTUS_DATA.scopeItems.slice(0, n).map(s => (
    <div key={s.id} className="card" style={{ padding: 14, marginBottom: 10 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div className="t-mono" style={{ background: "var(--surface-2)", padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>{s.id}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 2 }}>{s.name}</div>
          <div className="t-small">{s.area}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
        <StatusPill status={s.classification} />
        <StatusPill status={s.granularity} />
        <span className="t-small" style={{ marginLeft: "auto" }}>{s.reqs} reqs</span>
      </div>
    </div>
  ));
}

/* ───────────────────────────── #5 Bulk operations ────────────────────────────── */

function BulkOps() {
  const all = window.APTUS_DATA.scopeItems;
  const [filter, setFilter] = xS("All");
  const [selected, setSelected] = xS(new Set([all[2].id, all[4].id, all[7].id]));
  const filtered = filter === "All" ? all : all.filter(s => s.area === filter);
  const areas = ["All", ...Array.from(new Set(all.map(s => s.area)))];
  const allChecked = filtered.length > 0 && filtered.every(s => selected.has(s.id));
  const toggle = (id) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <PageWrap
      title="Bulk operations"
      subtitle="Selection persists across filter changes. Sticky bottom bar appears on first selection. Apply classify, granularity, archive, or export to N items."
    >
      <div className="t-small" style={{ marginBottom: 12, display: "flex", gap: 12 }}>
        <span><strong style={{ color: "var(--text)" }}>{selected.size}</strong> selected · persists across filters</span>
        <span style={{ marginLeft: "auto" }}><span className="t-mono">{filtered.length}</span> visible</span>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {areas.map(a => (
          <button key={a} className={filter === a ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"} onClick={() => setFilter(a)}>{a}</button>
        ))}
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <div className="row" style={{ height: 40, background: "var(--surface-2)", cursor: "default", fontWeight: 500, fontSize: 12, color: "var(--text-muted)" }}>
          <input type="checkbox" checked={allChecked} onChange={(e) => {
            const s = new Set(selected);
            if (e.target.checked) filtered.forEach(x => s.add(x.id));
            else filtered.forEach(x => s.delete(x.id));
            setSelected(s);
          }} />
          <div style={{ width: 56 }}>ID</div>
          <div style={{ flex: 1 }}>Scope item</div>
          <div style={{ width: 140 }}>Granularity</div>
          <div style={{ width: 140 }}>Classification</div>
          <div style={{ width: 60, textAlign: "right" }}>Reqs</div>
        </div>
        {filtered.map(s => {
          const isSel = selected.has(s.id);
          return (
            <div key={s.id} className="row" onClick={() => toggle(s.id)} style={{ background: isSel ? "var(--info-50)" : undefined }}>
              <input type="checkbox" checked={isSel} onChange={() => toggle(s.id)} />
              <div className="t-mono" style={{ width: 56 }}>{s.id}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500 }}>{s.name}</div>
                <div className="t-small">{s.area}</div>
              </div>
              <div style={{ width: 140 }}><StatusPill status={s.granularity} /></div>
              <div style={{ width: 140 }}><StatusPill status={s.classification} /></div>
              <div style={{ width: 60, textAlign: "right", color: "var(--text-muted)" }}>{s.reqs}</div>
            </div>
          );
        })}
      </div>

      {selected.size > 0 && (
        <div style={{ position: "sticky", bottom: 16, marginTop: 16, zIndex: 5 }}>
          <div className="card" style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, boxShadow: "var(--shadow-lg)", borderColor: "var(--brand)" }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}><strong>{selected.size}</strong> selected</span>
            <span className="muted" style={{ fontSize: 12 }}>· apply to all</span>
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <button className="btn btn-secondary btn-sm"><I.Layers size={14} /> Classify…</button>
              <button className="btn btn-secondary btn-sm"><I.List size={14} /> Set granularity…</button>
              <button className="btn btn-secondary btn-sm"><I.Folder size={14} /> Archive</button>
              <button className="btn btn-primary btn-sm"><I.Download size={14} /> Export {selected.size}</button>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setSelected(new Set())} title="Clear"><I.X size={14} /></button>
            </div>
          </div>
        </div>
      )}
    </PageWrap>
  );
}

/* ───────────────────────── #6 Onboarding tour A/B ───────────────────────── */

function OnboardingTours() {
  const [variant, setVariant] = xS("welcome");
  return (
    <PageWrap title="Onboarding A/B" subtitle="(a) Skippable 3-screen welcome (per spec §8.2). (b) Coach-marks fired contextually on first use of each step.">
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <button className={variant === "welcome" ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"} onClick={() => setVariant("welcome")}>A · Welcome screens</button>
        <button className={variant === "coach" ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"} onClick={() => setVariant("coach")}>B · Coach-marks</button>
      </div>

      {variant === "welcome" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {[
            { n: 1, title: "Aptus turns RFPs into deliverables.", body: "Drop in your client's RFP. We'll classify every requirement against SAP standard, surface the gaps, and produce all 14 reports your steering committee expects.", art: <ArtRfp /> },
            { n: 2, title: "5 steps. Always the same shape.", body: "Profile → Scope → Analyze → Adjust → Export. Every engagement follows the same path so your team always knows where they are.", art: <ArtSteps /> },
            { n: 3, title: "AI handles the boring 90%.", body: "We classify the obvious requirements. You spend your time on the 10% that needs judgement — the gaps that change deal economics.", art: <ArtAI /> },
          ].map((s, i) => (
            <div key={s.n} className="card" style={{ padding: 28, position: "relative" }}>
              <div style={{ display: "flex", gap: 4, marginBottom: 24 }}>
                {[0,1,2].map(d => <div key={d} style={{ width: 24, height: 4, borderRadius: 999, background: d <= i ? "var(--brand)" : "var(--border)" }} />)}
              </div>
              <div style={{ height: 140, marginBottom: 20, display: "grid", placeItems: "center", background: "var(--surface-2)", borderRadius: 8 }}>{s.art}</div>
              <div className="t-h1" style={{ fontSize: 20, marginBottom: 8 }}>{s.title}</div>
              <div className="muted" style={{ fontSize: 14, marginBottom: 24, lineHeight: 1.5 }}>{s.body}</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button className="btn btn-ghost btn-sm">Skip</button>
                <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                  {i > 0 && <button className="btn btn-secondary btn-sm">Back</button>}
                  <button className="btn btn-primary btn-sm">{i === 2 ? "Get started" : "Next"}</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {variant === "coach" && (
        <div>
          <div className="t-small" style={{ marginBottom: 16 }}>Each tooltip fires the first time a user lands on the corresponding step. Anchored to the actual UI element. Dismissable individually or via "Skip tour".</div>
          <div className="card" style={{ overflow: "hidden", padding: 0 }}>
            <div style={{ position: "relative", padding: 24, minHeight: 480, background: "var(--surface-2)" }}>
              {/* fake step rail */}
              <div className="card" style={{ position: "absolute", top: 24, left: 24, width: 220, padding: 12, background: "var(--surface)" }}>
                {STEPS.map((s, i) => (
                  <div key={s.id} className={`step-item ${i === 0 ? "active" : ""}`}>
                    <div className="step-marker">{i + 1}</div>
                    <div className="step-label">{s.label}</div>
                  </div>
                ))}
              </div>
              {/* coach mark */}
              <div style={{ position: "absolute", top: 60, left: 268, width: 280, padding: 16, background: "var(--brand)", color: "var(--brand-text)", borderRadius: 10, boxShadow: "var(--shadow-lg)" }}>
                <div style={{ position: "absolute", left: -7, top: 18, width: 14, height: 14, background: "var(--brand)", transform: "rotate(45deg)" }} />
                <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.6, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 6 }}>Tip 1 of 5</div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Steps stay visible.</div>
                <div style={{ fontSize: 13, opacity: 0.85, lineHeight: 1.5 }}>Click any completed step to revisit it. Locked steps unlock as you progress.</div>
                <div style={{ display: "flex", marginTop: 12, gap: 6 }}>
                  <button style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.2)", color: "inherit", padding: "4px 10px", borderRadius: 4, fontSize: 12, cursor: "pointer" }}>Skip tour</button>
                  <button style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "inherit", padding: "4px 10px", borderRadius: 4, fontSize: 12, cursor: "pointer", marginLeft: "auto" }}>Got it →</button>
                </div>
              </div>
              {/* mock content */}
              <div className="card" style={{ marginLeft: 240, marginTop: 280, padding: 24 }}>
                <Skel w={140} h={16} />
                <Skel mt={10} w="80%" h={10} />
                <Skel mt={8}  w="65%" h={10} />
              </div>
            </div>
          </div>
        </div>
      )}
    </PageWrap>
  );
}

const ArtRfp = () => (
  <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
    <rect x="20" y="14" width="64" height="84" rx="4" fill="var(--surface)" stroke="var(--border-strong)" />
    {[28,40,52,64,76].map((y,i) => <rect key={y} x="28" y={y} width={i===2?36:48} height="3" rx="1.5" fill="var(--border-strong)" />)}
    <rect x="62" y="56" width="44" height="44" rx="6" fill="var(--brand)" />
    <path d="M70 78l8 8 16-16" stroke="var(--brand-text)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);
const ArtSteps = () => (
  <svg width="220" height="80" viewBox="0 0 220 80" fill="none">
    {[0,1,2,3,4].map((i) => (
      <g key={i} transform={`translate(${i * 45}, 0)`}>
        <circle cx="20" cy="40" r="14" fill={i < 2 ? "var(--brand)" : i === 2 ? "var(--surface)" : "var(--surface-2)"} stroke={i === 2 ? "var(--brand)" : "var(--border-strong)"} strokeWidth={i === 2 ? 2 : 1} />
        <text x="20" y="44" fontSize="11" fontWeight="600" fill={i < 2 ? "var(--brand-text)" : "var(--text)"} textAnchor="middle">{i + 1}</text>
        {i < 4 && <line x1="34" y1="40" x2="50" y2="40" stroke={i < 1 ? "var(--brand)" : "var(--border-strong)"} strokeWidth="1.5" />}
      </g>
    ))}
  </svg>
);
const ArtAI = () => (
  <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
    <rect x="14" y="20" width="92" height="14" rx="3" fill="var(--success-200)" />
    <rect x="14" y="20" width="80" height="14" rx="3" fill="var(--success-500)" />
    <text x="20" y="30" fontSize="9" fontWeight="600" fill="var(--success-700)">AUTO 90%</text>
    <rect x="14" y="42" width="92" height="14" rx="3" fill="var(--surface-2)" />
    <rect x="14" y="64" width="60" height="12" rx="3" fill="var(--warning-500)" />
    <rect x="14" y="84" width="36" height="12" rx="3" fill="var(--danger-500)" />
  </svg>
);

/* ─────────────────────────── #7 File upload affordance ───────────────────────── */

function FileUploadStates() {
  return (
    <PageWrap title="File upload — every state" subtitle="Drag & drop, format hint, in-progress per file, success summary, format mismatch.">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
        {/* Idle */}
        <Frame label="Idle — drop or browse" h={280}>
          <div className="dropzone" style={{ padding: "40px 24px", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ width: 56, height: 56, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)", display: "inline-flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", color: "var(--text-muted)" }}>
              <I.Upload size={24} />
            </div>
            <div className="t-h2" style={{ marginBottom: 4 }}>Drop your requirements file here</div>
            <div className="muted" style={{ fontSize: 13, marginBottom: 14 }}>Or <a style={{ color: "var(--text)", textDecoration: "underline" }}>browse</a> from your computer</div>
            <div className="t-small">Accepts <span className="t-mono">.xlsx</span>, <span className="t-mono">.csv</span>, <span className="t-mono">.docx</span> · max 50 MB</div>
          </div>
        </Frame>

        {/* Hover/active */}
        <Frame label="Drag-active" h={280}>
          <div className="dropzone" style={{ padding: "40px 24px", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", borderColor: "var(--brand)", background: "var(--info-50)" }}>
            <I.Download size={32} style={{ color: "var(--brand)", margin: "0 auto 14px", transform: "rotate(180deg)" }} />
            <div className="t-h2" style={{ marginBottom: 4 }}>Drop to upload</div>
            <div className="muted" style={{ fontSize: 13 }}>Release to begin parsing.</div>
          </div>
        </Frame>

        {/* Uploading */}
        <Frame label="Uploading — file-by-file progress" h={280}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { n: "RFP_Bursa_2026.xlsx",            size: "1.4 MB", pct: 100, done: true },
              { n: "RFP_Bursa_2026_Annex_A.xlsx",    size: "742 KB", pct: 100, done: true },
              { n: "RFP_Bursa_2026_Annex_B.xlsx",    size: "612 KB", pct: 64 },
              { n: "Functional_Spec_Treasury.docx",  size: "1.1 MB", pct: 0,   queued: true },
            ].map((f, i) => (
              <div key={i} style={{ padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <I.FileText size={16} style={{ color: "var(--text-muted)" }} />
                  <div style={{ fontSize: 12, fontWeight: 500, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.n}</div>
                  <div className="t-small">{f.size}</div>
                  {f.done && <I.CheckCircle size={14} style={{ color: "var(--success-700)" }} />}
                  {f.queued && <span className="t-small">queued</span>}
                </div>
                <div style={{ height: 4, background: "var(--surface-2)", borderRadius: 999, overflow: "hidden" }}>
                  <div style={{ width: `${f.pct}%`, height: "100%", background: f.done ? "var(--success-500)" : "var(--brand)", transition: "width 200ms" }} />
                </div>
              </div>
            ))}
          </div>
        </Frame>

        {/* Success */}
        <Frame label="Success — parsed" h={280}>
          <div style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", textAlign: "center" }}>
            <div style={{ width: 56, height: 56, borderRadius: 999, background: "var(--success-50)", color: "var(--success-700)", display: "inline-flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
              <I.Check size={28} />
            </div>
            <div className="t-h2" style={{ marginBottom: 4 }}>We found 778 requirements across 12 sheets.</div>
            <div className="muted" style={{ fontSize: 13, marginBottom: 14 }}>Aptus auto-detected scope columns, classifications, and remarks. Review before continuing.</div>
            <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap", marginBottom: 14 }}>
              <span className="pill pill-neutral">12 sheets</span>
              <span className="pill pill-neutral">778 reqs</span>
              <span className="pill pill-info">8 columns mapped</span>
              <span className="pill pill-warning">3 ambiguous</span>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <button className="btn btn-secondary btn-sm">Review mapping</button>
              <button className="btn btn-primary btn-sm">Continue to Analyze →</button>
            </div>
          </div>
        </Frame>

        {/* Format mismatch */}
        <Frame label="Format mismatch — actionable" h={300} style={{ gridColumn: "span 2" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, height: "100%" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--warning-50)", color: "var(--warning-700)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                  <I.AlertCircle size={18} />
                </div>
                <div>
                  <div className="t-h2">This looks like a different format.</div>
                  <div className="t-small">RFP_Maybank_2024.xlsx · 412 KB</div>
                </div>
              </div>
              <div className="muted" style={{ fontSize: 13, marginBottom: 14 }}>We expected an SAP RFP template with a <span className="t-mono">Requirements</span> sheet. This file looks like a vendor evaluation matrix.</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-primary btn-sm">Map columns manually</button>
                <button className="btn btn-secondary btn-sm">Use a different file</button>
              </div>
            </div>
            <div className="card" style={{ padding: 12, background: "var(--surface-2)", overflow: "hidden" }}>
              <div className="t-small" style={{ marginBottom: 8, fontWeight: 600 }}>What we expected:</div>
              <div className="t-mono" style={{ fontSize: 11, lineHeight: 1.7, color: "var(--text-muted)" }}>
                Sheet 1: Requirements<br/>
                Columns: Code · Text · Area · Mandatory · Remarks<br/>
                <br/>
                <span style={{ color: "var(--success-700)" }}>Sheet 2: Scope (optional)</span><br/>
                <span style={{ color: "var(--success-700)" }}>Columns: ID · Name · Granularity</span>
              </div>
              <div className="t-small" style={{ marginTop: 12, marginBottom: 8, fontWeight: 600 }}>What we found:</div>
              <div className="t-mono" style={{ fontSize: 11, lineHeight: 1.7, color: "var(--danger-700)" }}>
                Sheet 1: Vendor Comparison<br/>
                Columns: Vendor · Score · Comments · Cost
              </div>
            </div>
          </div>
        </Frame>
      </div>
    </PageWrap>
  );
}

/* ───────────────────────── #8 Cmd-K palette in 4 states ──────────────────────── */

function CmdKStates() {
  return (
    <PageWrap title="Cmd-K · 4 states" subtitle="Empty, with-recent, with-results, no-results. 30 indexed scope items + 5 recent assessments + 8 commands.">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
        <Frame label="Empty (no recent activity)" h={420}>
          <CmdKMock state="empty" />
        </Frame>
        <Frame label="With recent items" h={420}>
          <CmdKMock state="recent" />
        </Frame>
        <Frame label="Search results — 'aliya'" h={420}>
          <CmdKMock state="results" q="aliya" />
        </Frame>
        <Frame label="No results — 'asdjklasd'" h={420}>
          <CmdKMock state="none" q="asdjklasd" />
        </Frame>
      </div>
    </PageWrap>
  );
}

const CmdKMock = ({ state, q = "" }) => {
  return (
    <div className="cmdk" style={{ width: "100%", maxWidth: "100%", boxShadow: "none", border: "1px solid var(--border)" }}>
      <div style={{ display: "flex", alignItems: "center", padding: "0 16px", borderBottom: "1px solid var(--border)" }}>
        <I.Search size={16} style={{ color: "var(--text-muted)" }} />
        <div className="cmdk-input" style={{ borderBottom: "none", display: "flex", alignItems: "center", color: q ? "var(--text)" : "var(--text-subtle)" }}>{q || "Type a command or search…"}</div>
      </div>
      <div className="cmdk-results" style={{ maxHeight: 320 }}>
        {state === "empty" && (
          <div style={{ padding: "40px 16px", textAlign: "center" }}>
            <I.Search size={20} style={{ color: "var(--text-subtle)", marginBottom: 10 }} />
            <div className="t-small" style={{ marginBottom: 4 }}>Start typing to search assessments, scope items, or commands.</div>
            <div className="t-small" style={{ color: "var(--text-subtle)", fontSize: 11 }}>30 scope items · 5 assessments · 8 commands indexed</div>
          </div>
        )}
        {state === "recent" && (
          <>
            <div className="cmdk-group-label">Recent</div>
            <CmdRow icon={<I.FileText size={14} />} label="Bursa Malaysia Berhad · Step 4 Adjust" hint="2h ago" active />
            <CmdRow icon={<I.Folder size={14} />}   label="J60 Accounts Payable" hint="Just now" />
            <CmdRow icon={<I.FileText size={14} />} label="Petronas Treasury · Step 3 Analyze" hint="Yesterday" />
            <div className="cmdk-group-label">Suggested</div>
            <CmdRow icon={<I.Plus size={14} />} label="New assessment" kbd="⌘N" />
            <CmdRow icon={<I.Sparkles size={14} />} label="Run AI Analysis" />
          </>
        )}
        {state === "results" && (
          <>
            <div className="cmdk-group-label">Assessments</div>
            <CmdRow icon={<I.FileText size={14} />} label="Bursa Malaysia · SME = Aliya Rahman" active />
            <div className="cmdk-group-label">People</div>
            <CmdRow icon={<I.Users size={14} />} label="Aliya Rahman · Head of Finance Transformation" />
            <div className="cmdk-group-label">Commands</div>
            <CmdRow icon={<I.Settings size={14} />} label="Open share-link as Aliya (preview client view)" />
          </>
        )}
        {state === "none" && (
          <div style={{ padding: "40px 16px", textAlign: "center" }}>
            <I.Search size={20} style={{ color: "var(--text-subtle)", marginBottom: 10 }} />
            <div className="t-h2" style={{ fontSize: 14 }}>No matches for "{q}"</div>
            <div className="t-small" style={{ marginTop: 8 }}>Try a client name, scope ID, or one of the indexed commands.</div>
            <button className="btn btn-secondary btn-sm" style={{ marginTop: 14 }}>Clear & start over</button>
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 12, padding: "8px 16px", borderTop: "1px solid var(--border)", fontSize: 11, color: "var(--text-muted)" }}>
        <span><kbd style={{ padding: "1px 5px", border: "1px solid var(--border)", borderRadius: 3 }}>↑↓</kbd> navigate</span>
        <span><kbd style={{ padding: "1px 5px", border: "1px solid var(--border)", borderRadius: 3 }}>↵</kbd> open</span>
        <span><kbd style={{ padding: "1px 5px", border: "1px solid var(--border)", borderRadius: 3 }}>esc</kbd> close</span>
      </div>
    </div>
  );
};
const CmdRow = ({ icon, label, kbd, hint, active }) => (
  <div className={`cmdk-item ${active ? "active" : ""}`}>
    <span style={{ color: "var(--text-muted)" }}>{icon}</span>
    {label}
    {hint && <span style={{ marginLeft: "auto", color: "var(--text-subtle)", fontSize: 11 }}>{hint}</span>}
    {kbd && <kbd>{kbd}</kbd>}
  </div>
);

/* ────────────────────────── #9 Toast variants catalog ────────────────────────── */

function ToastCatalog() {
  return (
    <PageWrap title="Toasts · all variants" subtitle="Info / success / warning / error · with undo · with action · with auto-dismiss progress · stacked (max 3).">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
        <Frame label="Info" h={120}><ToastV kind="info"    msg="Bursa Malaysia auto-saved." /></Frame>
        <Frame label="Success" h={120}><ToastV kind="success" msg="14 reports generated. Bundle ready for download." /></Frame>
        <Frame label="Warning" h={120}><ToastV kind="warning" msg="Aliya is also editing this scope item." /></Frame>
        <Frame label="Error" h={120}><ToastV kind="error" msg="Save failed — your network dropped. Retrying…" /></Frame>
        <Frame label="With undo (5s)" h={120}><ToastV kind="success" msg="J60 archived." action="Undo" progress={70} /></Frame>
        <Frame label="With action" h={120}><ToastV kind="info" msg="Aptus classified 723 requirements." action="Review 55 pending" /></Frame>
        <Frame label="With auto-dismiss progress" h={120}><ToastV kind="success" msg="Bundle exported." progress={40} /></Frame>
        <Frame label="Stack (max 3)" h={180}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <ToastV kind="success" msg="J60 reclassified to OOTB." />
            <ToastV kind="success" msg="J62 reclassified to OOTB." />
            <ToastV kind="info" msg="3 more changes saved silently." muted />
          </div>
        </Frame>
      </div>
    </PageWrap>
  );
}

const ToastV = ({ kind = "info", msg, action, progress, muted }) => {
  const ICON = { success: <I.CheckCircle size={16} style={{ color: "var(--success-700)" }} />, info: <I.Info size={16} style={{ color: "var(--info-700)" }} />, warning: <I.AlertCircle size={16} style={{ color: "var(--warning-700)" }} />, error: <I.AlertCircle size={16} style={{ color: "var(--danger-700)" }} /> };
  return (
    <div style={{ position: "relative", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)", padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, fontSize: 13, opacity: muted ? 0.6 : 1, overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
      {ICON[kind]}
      <span style={{ flex: 1 }}>{msg}</span>
      {action && <button className="btn btn-ghost btn-sm" style={{ marginLeft: 4, color: "var(--text)", textDecoration: "underline" }}>{action}</button>}
      <button className="btn btn-ghost btn-icon btn-sm"><I.X size={12} /></button>
      {progress !== undefined && <div style={{ position: "absolute", left: 0, bottom: 0, height: 2, width: `${progress}%`, background: "var(--brand)" }} />}
    </div>
  );
};

/* ───────────────────────── #10 Step 5 Export — light vs dark ─────────────────── */

function ExportLightDarkPair() {
  return (
    <PageWrap title="Step 5 Export — light & dark" subtitle="Single primary CTA, collapsed individual reports, share-link generator, locked state when prerequisites unmet.">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Frame label="Light" h={620}><ExportPanelMock theme="light" /></Frame>
        <Frame label="Dark"  h={620}><div data-theme="dark" style={{ background: "#0B0B0F", margin: -16, padding: 16, height: "calc(100% + 32px)" }}><ExportPanelMock theme="dark" /></div></Frame>
      </div>
    </PageWrap>
  );
}

function ExportPanelMock({ theme = "light" }) {
  const dark = theme === "dark";
  const [expanded, setExpanded] = xS(false);
  const reports = window.APTUS_DATA.reports;
  return (
    <div style={{ color: dark ? "#FAFAFA" : "var(--text)" }}>
      <div className="t-h1" style={{ marginBottom: 8 }}>Export & sign-off</div>
      <div className="muted" style={{ fontSize: 13, marginBottom: 20 }}>14 reports · 1.3 MB ZIP · ready for steering committee.</div>

      <div style={{ padding: 20, borderRadius: 12, background: dark ? "#15151A" : "var(--surface)", border: dark ? "1px solid #27272A" : "1px solid var(--border)", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: dark ? "#FAFAFA" : "var(--brand)", color: dark ? "#0B0B0F" : "var(--brand-text)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <I.Download size={20} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Bursa_Malaysia_Berhad_Bundle.zip</div>
            <div className="t-small">14 reports · executive, technical, audit · last regenerated 2h ago</div>
          </div>
          <button className="btn btn-primary">Download bundle</button>
        </div>
      </div>

      <div style={{ padding: 16, borderRadius: 12, background: dark ? "#15151A" : "var(--surface)", border: dark ? "1px solid #27272A" : "1px solid var(--border)", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }} onClick={() => setExpanded(x => !x)}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>Individual reports</div>
            <div className="t-small">Download a single report instead of the full bundle.</div>
          </div>
          <I.ChevronDown size={16} style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 100ms" }} />
        </div>
        {expanded && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: dark ? "1px solid #27272A" : "1px solid var(--border)" }}>
            {reports.slice(0, 6).map((r, i) => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: i < 5 ? (dark ? "1px solid #27272A" : "1px solid var(--border)") : "none" }}>
                <I.FileText size={14} style={{ color: dark ? "#A1A1AA" : "var(--text-muted)" }} />
                <span style={{ flex: 1, fontSize: 13 }}>{r.name}</span>
                <span className="t-small">{r.size} · {r.format}</span>
                <button className="btn btn-ghost btn-icon btn-sm"><I.Download size={12} /></button>
              </div>
            ))}
            <div className="t-small" style={{ textAlign: "center", marginTop: 8 }}>+ 8 more</div>
          </div>
        )}
      </div>

      <div style={{ padding: 16, borderRadius: 12, background: dark ? "#15151A" : "var(--surface)", border: dark ? "1px solid #27272A" : "1px solid var(--border)", marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Share with Bursa Malaysia</div>
        <div className="t-small" style={{ marginBottom: 12 }}>Generate a read-only link for Aliya's team. Expires in 14 days.</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input className="input" defaultValue="https://aptus.app/s/bma-7g4q-x9zk" readOnly style={{ flex: 1, fontFamily: "Geist Mono, monospace", fontSize: 12 }} />
          <button className="btn btn-secondary btn-sm">Copy</button>
          <button className="btn btn-secondary btn-sm">Settings…</button>
        </div>
      </div>

      <div style={{ padding: 16, borderRadius: 12, border: dark ? "1px dashed #27272A" : "1px dashed var(--border-strong)", background: dark ? "rgba(245,158,11,0.05)" : "var(--warning-50)", display: "flex", alignItems: "flex-start", gap: 12 }}>
        <I.AlertCircle size={18} style={{ color: dark ? "#FCD34D" : "var(--warning-700)", flexShrink: 0, marginTop: 1 }} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: dark ? "#FCD34D" : "var(--warning-700)" }}>4 reports are locked</div>
          <div className="t-small" style={{ marginTop: 4, color: dark ? "#A1A1AA" : "var(--text-muted)" }}>Test Strategy, Compliance Checklist, OCM Impact and Risk Register unlock once Step 4 Adjust is signed off.</div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────── #11 Three complexity levels (canvas-side) ───────────────── */

function ComplexityScales() {
  return (
    <PageWrap title="Complexity scaling test"
      subtitle="Same shell, three engagement sizes. Does the IA hold from 1-page form (Maya's first deal) to 3,000-req multi-engagement portfolio?">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16 }}>
        <SimpleAnalyzer />
        <StandardCard />
        <EnterpriseCard />
      </div>
    </PageWrap>
  );
}

function SimpleAnalyzer() {
  return (
    <Frame label="A · Simple — Maya's first engagement" h={540}>
      <div className="t-h2" style={{ marginBottom: 4 }}>Quick fit check</div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 16 }}>Single page. No tabs. ~24 requirements.</div>
      <div className="card" style={{ padding: 14, marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>Profile</span>
          <span className="t-small">Mid-market manufacturer</span>
        </div>
        <input className="input" defaultValue="Acme Manufacturing" style={{ height: 32 }} />
      </div>
      <div className="card" style={{ padding: 14, marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Requirements (24)</div>
        <div style={{ height: 8, background: "var(--surface-2)", borderRadius: 999, display: "flex", overflow: "hidden" }}>
          <div style={{ width: "75%", background: "var(--success-500)" }} />
          <div style={{ width: "20%", background: "var(--warning-500)" }} />
          <div style={{ width: "5%",  background: "var(--danger-500)" }} />
        </div>
        <div className="t-small" style={{ marginTop: 6 }}>18 OOTB · 5 Config · 1 Gap</div>
      </div>
      <button className="btn btn-primary w-full">Generate 1-page summary</button>
      <div className="t-small" style={{ marginTop: 12, fontStyle: "italic", color: "var(--text-subtle)" }}>
        IA verdict: collapsed — no tabs, no rail, no drawer.
      </div>
    </Frame>
  );
}

function StandardCard() {
  const a = window.APTUS_DATA.assessments[0];
  return (
    <Frame label="B · Standard — Bursa scale" h={540}>
      <div className="t-h2" style={{ marginBottom: 4 }}>{a.client}</div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>{a.requirements} requirements · {a.scopeItems} scope items · single engagement.</div>
      <div style={{ display: "grid", gridTemplateColumns: "60px 1fr", gap: 8, fontSize: 12 }}>
        {STEPS.flatMap((s, i) => [
          <div key={s.key+"n"} className="t-mono" style={{ color: "var(--text-muted)", paddingTop: 6 }}>0{i+1}</div>,
          <div key={s.key+"l"} style={{ padding: "6px 8px", borderRadius: 6, background: i+1 === a.step ? "var(--surface-2)" : "transparent", fontWeight: i+1 === a.step ? 500 : 400 }}>
            {s.label} {i < a.step - 1 && <I.Check size={12} style={{ color: "var(--success-700)", marginLeft: 4 }} />}
          </div>
        ])}
      </div>
      <div style={{ marginTop: 16 }}>
        <CoverageBar ootb={62} config={17} gap={21} variant="stacked" />
      </div>
      <div className="card" style={{ padding: 12, marginTop: 14 }}>
        <div className="t-small" style={{ marginBottom: 6 }}>Top 3 areas by gap volume</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[{ a: "Treasury", v: 18 }, { a: "Sales", v: 9 }, { a: "Finance", v: 7 }].map(x => (
            <div key={x.a} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ fontSize: 12, width: 80 }}>{x.a}</div>
              <div style={{ flex: 1, height: 4, background: "var(--surface-2)", borderRadius: 999, overflow: "hidden" }}>
                <div style={{ width: `${x.v * 4}%`, height: "100%", background: "var(--danger-500)" }} />
              </div>
              <div className="t-small" style={{ width: 24, textAlign: "right" }}>{x.v}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="t-small" style={{ marginTop: 14, fontStyle: "italic", color: "var(--text-subtle)" }}>
        IA verdict: works as designed — rail + table + drawer.
      </div>
    </Frame>
  );
}

function EnterpriseCard() {
  const a = window.APTUS_DATA.assessments.find(x => x.id === "tenaga-portfolio");
  return (
    <Frame label="C · Enterprise — multi-engagement portfolio" h={540}>
      <div className="t-h2" style={{ marginBottom: 4 }}>{a.client}</div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>4 engagements · {a.requirements.toLocaleString()} requirements · {a.scopeItems} scope items.</div>
      <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 12 }}>
        {a.portfolio.map((p, i) => (
          <div key={p.name} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", padding: "10px 12px", gap: 10, alignItems: "center", borderBottom: i < a.portfolio.length - 1 ? "1px solid var(--border)" : "none", fontSize: 12 }}>
            <div style={{ fontWeight: 500 }}>{p.name}</div>
            <div className="t-small">{p.reqs} reqs</div>
            <div style={{ width: 80, height: 6, borderRadius: 999, background: "var(--surface-2)", overflow: "hidden", display: "flex" }}>
              <div style={{ width: "54%", background: "var(--success-500)" }} />
              <div style={{ width: "24%", background: "var(--warning-500)" }} />
              <div style={{ width: "22%", background: "var(--danger-500)" }} />
            </div>
          </div>
        ))}
      </div>
      <div className="card" style={{ padding: 12, marginBottom: 12 }}>
        <div className="t-small" style={{ marginBottom: 6 }}>Cross-engagement filter</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <span className="pill pill-info">All engagements</span>
          <span className="pill pill-neutral">Finance only</span>
          <span className="pill pill-neutral">Gaps only</span>
        </div>
      </div>
      <div className="t-small" style={{ fontStyle: "italic", color: "var(--text-subtle)" }}>
        IA verdict: needs portfolio-level overview as a 0th step. Existing rail still works inside any one engagement.
      </div>
    </Frame>
  );
}

/* ─────────────────────────── #12 Post-signoff archive view ───────────────────── */

function ArchiveView() {
  const a = window.APTUS_DATA.assessments.find(x => x.id === "maybank-procurement");
  const decisions = window.APTUS_DATA.decisions;
  return (
    <PageWrap title="Archive view" subtitle="Read-only. Engagement signed off March 24. No edit affordances anywhere. Decisions timeline is the spine.">
      <div className="card" style={{ padding: 24, marginBottom: 16, background: "linear-gradient(0deg, var(--surface-2), var(--surface))" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
          <div style={{ width: 56, height: 56, borderRadius: 12, background: "var(--success-50)", color: "var(--success-700)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <I.Check size={28} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <span className="t-h1">{a.client}</span>
              <span className="pill pill-success">Done · Signed off</span>
              <span className="pill pill-neutral">Read-only</span>
            </div>
            <div className="muted" style={{ fontSize: 13 }}>Signed off by {a.signedOffBy} on {a.signedOffOn}. Owner: {a.owner.name}. {a.requirements} requirements · {a.scopeItems} scope items.</div>
          </div>
          <button className="btn btn-secondary"><I.Download size={14} /> Download bundle</button>
        </div>
        <div style={{ marginTop: 16 }}>
          <CoverageBar ootb={a.coverage.ootb} config={a.coverage.config} gap={a.coverage.gap} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
        <div className="card" style={{ padding: 24 }}>
          <div className="t-h2" style={{ marginBottom: 4 }}>Decisions timeline</div>
          <div className="t-small" style={{ marginBottom: 20 }}>Every meaningful action, with actor and date. Permanent record for audit.</div>
          <div style={{ position: "relative", paddingLeft: 24 }}>
            <div style={{ position: "absolute", left: 6, top: 6, bottom: 6, width: 1, background: "var(--border-strong)" }} />
            {decisions.map((d, i) => (
              <div key={i} style={{ position: "relative", marginBottom: 20 }}>
                <div style={{ position: "absolute", left: -24, top: 4, width: 13, height: 13, borderRadius: 999, background: "var(--surface)", border: "2px solid var(--brand)" }} />
                <div className="t-small" style={{ marginBottom: 2, color: "var(--text-muted)" }}>{d.date} · <strong style={{ color: "var(--text)" }}>{d.actor}</strong></div>
                <div style={{ fontSize: 14 }}>{d.action}</div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="card" style={{ padding: 16, marginBottom: 12 }}>
            <div className="t-small" style={{ marginBottom: 8, fontWeight: 600 }}>Final outcomes</div>
            <KV k="OOTB"          v={`${a.coverage.ootb}%`} />
            <KV k="Configuration" v={`${a.coverage.config}%`} />
            <KV k="Gaps"          v={`${a.coverage.gap}%`} />
            <KV k="Reports"       v="14 generated" />
            <KV k="Bundle size"   v="1.1 MB" />
          </div>
          <div className="card" style={{ padding: 16 }}>
            <div className="t-small" style={{ marginBottom: 8, fontWeight: 600 }}>What you can still do</div>
            <button className="btn btn-secondary btn-sm w-full mb-2"><I.Download size={12} /> Re-download bundle</button>
            <button className="btn btn-secondary btn-sm w-full mb-2"><I.Layers size={12} /> Save as template</button>
            <button className="btn btn-secondary btn-sm w-full"><I.FileText size={12} /> Open read-only client view</button>
          </div>
          <div className="t-small" style={{ marginTop: 12, color: "var(--text-subtle)", fontStyle: "italic" }}>
            Editing is permanently disabled. To make further changes, fork this assessment into a new engagement.
          </div>
        </div>
      </div>
    </PageWrap>
  );
}
const KV = ({ k, v }) => (
  <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13, borderBottom: "1px solid var(--border)" }}>
    <span className="muted">{k}</span><span>{v}</span>
  </div>
);

/* ───────────────────── #13 Bundle vs per-report opinion test ─────────────────── */

function BundleVsPerReport() {
  const reports = window.APTUS_DATA.reports;
  const grouped = { Executive: [], Technical: [], Audit: [] };
  reports.forEach(r => grouped[r.audience]?.push(r));

  return (
    <PageWrap title="Bundle vs per-report — opinion test"
      subtitle="Same 14 reports. Two presentations. Which feels more useful when you're 11pm the night before sign-off?">

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16, marginBottom: 24 }}>
        <Frame label="A · Single bundle (current spec)" h={520}>
          <div style={{ textAlign: "center", paddingTop: 24 }}>
            <div style={{ width: 96, height: 96, margin: "0 auto 18px", borderRadius: 16, background: "var(--brand)", color: "var(--brand-text)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 32, fontWeight: 600, position: "relative" }}>
              <I.Download size={32} />
              <div style={{ position: "absolute", bottom: -10, left: "50%", transform: "translateX(-50%)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 999, padding: "2px 10px", fontSize: 11, color: "var(--text)", fontWeight: 500, whiteSpace: "nowrap" }}>14 reports · 1.3 MB</div>
            </div>
            <div className="t-h1" style={{ fontSize: 22, marginBottom: 6 }}>Bursa_Malaysia_Bundle.zip</div>
            <div className="muted" style={{ fontSize: 13, marginBottom: 20, maxWidth: 320, margin: "0 auto 20px" }}>Everything your steering committee, delivery team and auditors need — one click.</div>
            <button className="btn btn-primary">Download bundle</button>
            <div style={{ marginTop: 32, display: "flex", justifyContent: "center", gap: 6 }}>
              <span className="pill pill-success">+ One CTA</span>
              <span className="pill pill-success">+ Versionable</span>
              <span className="pill pill-warning">– 1.3 MB for execs who only need 1 report</span>
              <span className="pill pill-warning">– Search inside ZIP is awkward</span>
            </div>
          </div>
        </Frame>

        <Frame label="B · Per-report, grouped by audience" h={520}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {Object.entries(grouped).map(([aud, items]) => (
              <div key={aud}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>{aud}</div>
                  <div className="t-small" style={{ color: "var(--text-subtle)" }}>· {items.length} reports</div>
                  <button className="btn btn-ghost btn-sm" style={{ marginLeft: "auto", height: 22, fontSize: 11 }}><I.Download size={11} /> Download {aud.toLowerCase()} pack</button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6 }}>
                  {items.slice(0, 4).map(r => (
                    <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }}>
                      <I.FileText size={12} style={{ color: "var(--text-muted)" }} />
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                      <span className="t-small" style={{ fontSize: 10 }}>{r.size}</span>
                      <I.Download size={11} style={{ color: "var(--text-muted)" }} />
                    </div>
                  ))}
                </div>
                {items.length > 4 && <div className="t-small" style={{ marginTop: 4 }}>+ {items.length - 4} more</div>}
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 8 }}>
              <span className="pill pill-success">+ Send execs only what they need</span>
              <span className="pill pill-success">+ Per-report download analytics</span>
              <span className="pill pill-warning">– 14+ CTAs to scan</span>
              <span className="pill pill-warning">– Audit needs reassembly</span>
            </div>
          </div>
        </Frame>
      </div>

      <div className="card" style={{ padding: 24 }}>
        <div className="t-h2" style={{ marginBottom: 12 }}>Recommendation</div>
        <div style={{ fontSize: 14, lineHeight: 1.7, color: "var(--text-muted)", maxWidth: 760 }}>
          Lead with <strong style={{ color: "var(--text)" }}>bundle as the primary CTA</strong> — it preserves the "one button, done" promise the spec was built around. But surface the <strong style={{ color: "var(--text)" }}>audience-grouped per-report list immediately below</strong>, not collapsed. The cost of the extra real-estate is small; the value to a steering committee chair who only ever opens the Executive Summary is large. Add per-report download counts to a future analytics view to validate whether the bundle is actually being opened or just downloaded.
        </div>
        <div style={{ marginTop: 16, padding: 12, background: "var(--info-50)", borderRadius: 6, fontSize: 13, color: "var(--info-700)", display: "flex", alignItems: "center", gap: 10 }}>
          <I.Info size={14} /> A/B candidate: track whether users with the per-report option still click the bundle button at the same rate.
        </div>
      </div>
    </PageWrap>
  );
}

/* ───────────────────────────── exports ───────────────────────────── */

Object.assign(window, {
  EmptyCatalog, LoadingErrorCatalog, ClientShareView, MobileShell, BulkOps,
  OnboardingTours, FileUploadStates, CmdKStates, ToastCatalog, ExportLightDarkPair,
  ComplexityScales, ArchiveView, BundleVsPerReport,
});
