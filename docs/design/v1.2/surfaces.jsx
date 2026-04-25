// Aptus surfaces — Login, Onboarding, Dashboard, AssessmentsList, Wizard, Settings, Templates
const { useState: uS, useEffect: uE, useMemo: uM, useRef: uR, Fragment: F } = React;

// ─── Login ────────────────────────
function Login({ onSignIn }) {
  const [email, setEmail] = uS("maya@abeam.com");
  const [sent, setSent] = uS(false);
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "var(--bg)" }}>
      <div style={{ width: "100%", maxWidth: 380, textAlign: "center" }}>
        <div style={{ display: "inline-flex", marginBottom: 32 }}><AptusMark size={40} /></div>
        {!sent ? (
          <>
            <div className="t-display" style={{ fontSize: 24, marginBottom: 8 }}>Sign in to Aptus</div>
            <div className="muted mb-6">Enter your work email to receive a sign-in link.</div>
            <form onSubmit={(e) => { e.preventDefault(); setSent(true); }}>
              <input className="input mb-3" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoFocus />
              <button className="btn btn-primary w-full" type="submit">Send sign-in link</button>
            </form>
            <div className="mt-4 t-small">
              <a style={{ color: "var(--text-muted)", textDecoration: "underline", cursor: "pointer" }}>Sign in with passkey instead</a>
            </div>
            <div className="mt-2 t-small">
              <a onClick={onSignIn} style={{ color: "var(--text-muted)", textDecoration: "underline", cursor: "pointer" }}>Use Dev Login</a>
            </div>
          </>
        ) : (
          <div className="card" style={{ padding: 24 }}>
            <div style={{ width: 40, height: 40, borderRadius: 999, background: "var(--success-50)", color: "var(--success-700)", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
              <I.Check size={20} />
            </div>
            <div className="t-h2 mb-2">Check your inbox</div>
            <div className="muted mb-4">We sent a link to <strong style={{ color: "var(--text)" }}>{email}</strong>. It expires in 15 minutes.</div>
            <button className="btn btn-secondary w-full" onClick={onSignIn}>Continue (demo)</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Onboarding ────────────────────────
function Onboarding({ onDone, user }) {
  const [step, setStep] = uS(0);
  const [role, setRole] = uS("Lead Consultant");
  const [vol, setVol] = uS(5);
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "var(--bg)" }}>
      <div style={{ width: "100%", maxWidth: 480 }}>
        <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 32 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ width: 32, height: 4, borderRadius: 999, background: i <= step ? "var(--brand)" : "var(--border)" }} />
          ))}
        </div>
        {step === 0 && (
          <div style={{ textAlign: "center" }}>
            <div style={{ marginBottom: 24, display: "inline-flex" }}><AptusMark size={48} /></div>
            <div className="t-display" style={{ marginBottom: 12 }}>Welcome, {user.name.split(" ")[0]}.</div>
            <div className="muted mb-8">Aptus turns your FIT-to-Standard analysis into a publish-ready deliverable. Let's spend 30 seconds setting up.</div>
            <button className="btn btn-primary" onClick={() => setStep(1)}>Continue <I.ArrowRight size={14} /></button>
          </div>
        )}
        {step === 1 && (
          <div className="card" style={{ padding: 32 }}>
            <div className="t-h1 mb-2">Tell us about your work</div>
            <div className="muted mb-6">We use this to personalize your defaults. You can change it later.</div>
            <div className="mb-6">
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>What's your role?</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {["Lead Consultant", "Solution Architect", "Project Manager", "Functional Lead", "Other"].map(r => (
                  <button key={r} className={role === r ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"} onClick={() => setRole(r)} style={{ height: 36 }}>{r}</button>
                ))}
              </div>
            </div>
            <div className="mb-6">
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>How many SAP engagements per year? <strong style={{ color: "var(--text)" }}>{vol}</strong></div>
              <input type="range" min="1" max="20" value={vol} onChange={(e) => setVol(Number(e.target.value))} style={{ width: "100%", accentColor: "var(--brand)" }} />
              <div className="t-small flex justify-between"><span>1</span><span>20+</span></div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <button className="btn btn-ghost" onClick={() => setStep(0)}>Back</button>
              <button className="btn btn-primary" onClick={() => setStep(2)}>Continue</button>
            </div>
          </div>
        )}
        {step === 2 && (
          <div style={{ textAlign: "center" }}>
            <div style={{ width: 64, height: 64, margin: "0 auto 24px", borderRadius: 16, background: "var(--success-50)", color: "var(--success-700)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <I.Check size={32} />
            </div>
            <div className="t-display" style={{ fontSize: 26, marginBottom: 12 }}>You're ready.</div>
            <div className="muted mb-8">Create your first assessment, or explore Aptus first.</div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <button className="btn btn-ghost" onClick={onDone}>Skip for now</button>
              <button className="btn btn-primary" onClick={() => onDone({ wizard: true })}>Create your first assessment</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────
function Dashboard({ onOpen, onNew, user, hasAssessments }) {
  const data = window.APTUS_DATA;
  if (!hasAssessments) {
    return (
      <div className="content-inner">
        <EmptyState
          variant="geometric"
          icon={<I.Triangle size={40} />}
          title={`Welcome to Aptus, ${user.name.split(" ")[0]}.`}
          description="Your first assessment takes about 5 minutes to set up."
          cta={<button className="btn btn-primary" onClick={onNew}><I.Plus size={14} /> Create your first assessment</button>}
          secondary={<button className="btn btn-secondary">Browse templates</button>}
        />
      </div>
    );
  }
  const active = data.assessments.filter(a => a.status === "Active");
  return (
    <div className="content-inner">
      <PageHeader
        title={`Welcome back, ${user.name.split(" ")[0]}`}
        subtitle="Pick up where you left off, or start something new."
      />
      <div className="mb-2 t-small" style={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)" }}>Active assessments</div>
      <div className="flex-col gap-3 mb-8">
        {active.map(a => (
          <div key={a.id} className="card" style={{ padding: 20, cursor: "pointer" }} onClick={() => onOpen(a.id)} onMouseEnter={(e) => e.currentTarget.style.borderColor = "var(--border-strong)"} onMouseLeave={(e) => e.currentTarget.style.borderColor = "var(--border)"}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ width: 44, height: 44, borderRadius: 8, background: "var(--surface-2)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                <I.Building size={22} style={{ color: "var(--text-muted)" }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{a.client}</div>
                  <StatusPill status={`In ${STEPS[a.step - 1].label}`} tone="info" />
                </div>
                <div className="t-small">Last touched {a.lastTouched} · {a.requirements} requirements · {a.scopeItems} scope items</div>
              </div>
              <div style={{ width: 200 }}>
                <CoverageBar ootb={a.coverage.ootb} config={a.coverage.config} gap={a.coverage.gap} showLabels={false} />
                <div className="t-small mt-2">{a.coverage.ootb}% OOTB · {a.coverage.config}% Config · {a.coverage.gap}% Gap</div>
              </div>
              <button className="btn btn-secondary btn-sm">Open <I.ArrowRight size={12} /></button>
            </div>
          </div>
        ))}
      </div>

      <div className="mb-2 t-small" style={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)" }}>Quick actions</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 32 }}>
        <button className="btn btn-primary" onClick={onNew}><I.Plus size={14} /> New assessment</button>
        <button className="btn btn-secondary"><I.Layers size={14} /> Browse templates</button>
      </div>

      <div className="mb-2 t-small" style={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)" }}>Recent reports</div>
      <div className="card" style={{ padding: 0 }}>
        {data.recentReports.map((r, i) => (
          <div key={i} className="row" style={{ height: 56 }}>
            <I.FileText size={18} style={{ color: "var(--text-muted)" }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>{r.name}</div>
              <div className="t-small">{r.size} · {r.time} · {r.assessment}</div>
            </div>
            <button className="btn btn-ghost btn-icon btn-sm" style={{ width: 32, height: 32 }}><I.Download size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Assessments List ────────────────────────
function AssessmentsList({ onOpen, onNew, initialFilter }) {
  const data = window.APTUS_DATA;
  const [q, setQ] = uS(initialFilter === "empty" ? "zzzzzznoresults" : "");
  const [status, setStatus] = uS("All");
  const filtered = data.assessments.filter(a =>
    (status === "All" || a.status === status) &&
    (q === "" || a.client.toLowerCase().includes(q.toLowerCase()))
  );
  return (
    <div className="content-inner">
      <PageHeader
        title="Assessments"
        subtitle={`${data.assessments.length} engagements across ${new Set(data.assessments.map(a => a.country)).size} country`}
        actions={<button className="btn btn-primary" onClick={onNew}><I.Plus size={14} /> New assessment</button>}
      />

      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 360 }}>
          <I.Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input className="input" placeholder="Search assessments…" value={q} onChange={e => setQ(e.target.value)} style={{ paddingLeft: 36 }} />
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {["All", "Draft", "Active", "Done"].map(s => (
            <button key={s} className={status === s ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"} onClick={() => setStatus(s)}>{s}</button>
          ))}
        </div>
        <div className="spacer" />
        <span className="t-small">Showing {filtered.length} of {data.assessments.length}</span>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1.5fr 1fr 1fr 80px", gap: 16, padding: "12px 16px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid var(--border)" }}>
          <span>Client</span><span>Status</span><span>Coverage</span><span>Last touched</span><span>Owner</span><span></span>
        </div>
        {filtered.length === 0 && (
          <div style={{ padding: 64, textAlign: "center" }}>
            <div style={{ width: 48, height: 48, margin: "0 auto 12px", borderRadius: 999, background: "var(--surface-2)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <I.Search size={20} style={{ color: "var(--text-muted)" }} />
            </div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>No matching assessments</div>
            <div className="t-small mb-4">Try a different search or status filter.</div>
            <button className="btn btn-secondary btn-sm" onClick={() => { setQ(""); setStatus("All"); }}>Clear filters</button>
          </div>
        )}
        {filtered.map(a => (
          <div key={a.id} className="row" onClick={() => onOpen(a.id)} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1.5fr 1fr 1fr 80px", gap: 16, height: 64 }}>
            <div>
              <div style={{ fontWeight: 600 }}>{a.client}</div>
              <div className="t-small">{a.industry} · {a.country}</div>
            </div>
            <span><StatusPill status={a.status} tone={a.status === "Active" ? "info" : a.status === "Draft" ? "neutral" : "success"} /></span>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, justifyContent: "center" }}>
              {a.requirements > 0 ? (
                <>
                  <CoverageBar ootb={a.coverage.ootb} config={a.coverage.config} gap={a.coverage.gap} showLabels={false} height="thin" />
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{a.coverage.ootb}% / {a.coverage.config}% / {a.coverage.gap}%</div>
                </>
              ) : <span className="t-small">—</span>}
            </div>
            <span className="t-small" style={{ alignSelf: "center" }}>{a.lastTouched}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div className="avatar" style={{ width: 24, height: 24, fontSize: 10 }}>{a.owner.initials}</div>
              <span className="t-small">{a.owner.name.split(" ")[0]}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
              <I.More size={16} style={{ color: "var(--text-muted)" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── New Assessment Wizard ────────────────────────
function Wizard({ onCreate, onCancel }) {
  const [step, setStep] = uS(0);
  const [data, setData] = uS({ client: "", country: "Malaysia", industry: "Financial Services", edition: "Public Cloud", source: null });

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <div style={{ display: "flex", alignItems: "center", padding: "16px 24px", borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
        <AptusWordmark size={15} />
        <div className="spacer" />
        <button className="btn btn-ghost btn-sm" onClick={onCancel}><I.X size={14} /> Cancel</button>
      </div>
      <div style={{ flex: 1, display: "grid", placeItems: "center", padding: 24 }}>
        <div style={{ width: "100%", maxWidth: 600 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 32 }}>
            {["Basics", "Starting point", "Review"].map((label, i) => (
              <F key={i}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: i === step ? "var(--text)" : i < step ? "var(--text-muted)" : "var(--text-subtle)" }}>
                  <span style={{
                    width: 22, height: 22, borderRadius: 999,
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    background: i < step ? "var(--brand)" : i === step ? "var(--surface)" : "var(--surface-2)",
                    color: i < step ? "var(--brand-text)" : "var(--text)",
                    border: `1.5px solid ${i <= step ? "var(--brand)" : "var(--border-strong)"}`,
                    fontSize: 11, fontWeight: 600,
                  }}>{i < step ? <I.Check size={12} /> : i + 1}</span>
                  <span style={{ fontSize: 13, fontWeight: i === step ? 600 : 500 }}>{label}</span>
                </div>
                {i < 2 && <div style={{ flex: 1, height: 1.5, background: i < step ? "var(--brand)" : "var(--border)" }} />}
              </F>
            ))}
          </div>

          {step === 0 && (
            <div className="card" style={{ padding: 32 }}>
              <div className="t-h1 mb-2">Engagement basics</div>
              <div className="muted mb-6">We'll use this to set defaults across the assessment. You can change everything later.</div>
              <div className="flex-col gap-4">
                <Field label="Company name"><input className="input" value={data.client} onChange={e => setData({ ...data, client: e.target.value })} placeholder="e.g. Bursa Malaysia Berhad" autoFocus /></Field>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <Field label="Country"><select className="select" value={data.country} onChange={e => setData({ ...data, country: e.target.value })}>
                    {["Malaysia", "Singapore", "Indonesia", "Thailand", "Vietnam", "Philippines", "Other"].map(c => <option key={c}>{c}</option>)}
                  </select></Field>
                  <Field label="Industry"><select className="select" value={data.industry} onChange={e => setData({ ...data, industry: e.target.value })}>
                    {["Financial Services", "Energy", "Manufacturing", "Retail", "Telecommunications", "Public Sector", "Healthcare", "Other"].map(c => <option key={c}>{c}</option>)}
                  </select></Field>
                </div>
                <Field label="Edition"><select className="select" value={data.edition} onChange={e => setData({ ...data, edition: e.target.value })}>
                  <option>Public Cloud</option><option>Private Cloud</option><option>On-Premise</option>
                </select></Field>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
                <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
                <button className="btn btn-primary" disabled={!data.client} onClick={() => setStep(1)} style={{ opacity: data.client ? 1 : 0.5 }}>Continue <I.ArrowRight size={14} /></button>
              </div>
            </div>
          )}

          {step === 1 && (
            <div>
              <div className="t-h1 mb-2">Where are you starting from?</div>
              <div className="muted mb-6">Pick the path that matches what you have in hand. You can switch later.</div>
              <div className="flex-col gap-3">
                {[
                  { key: "spreadsheet", icon: <I.FileText size={20} />, title: "I have a requirements spreadsheet", desc: "Upload an RFP, RFI, or functional spec — Aptus parses requirements and maps them to scope items." },
                  { key: "discover",    icon: <I.Search size={20} />,   title: "We'll discover scope as we go", desc: "Consultant-led discovery. Browse the 2602 catalog and add scope items manually." },
                  { key: "template",    icon: <I.Copy size={20} />,     title: "Use a template",          desc: "Start from a prior engagement (e.g. 'APAC FSI default')." },
                ].map(opt => (
                  <div key={opt.key} className={`radio-card ${data.source === opt.key ? "selected" : ""}`} onClick={() => setData({ ...data, source: opt.key })}>
                    <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                      <div style={{ width: 40, height: 40, borderRadius: 8, background: "var(--surface-2)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{opt.icon}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>{opt.title}</div>
                        <div className="t-small">{opt.desc}</div>
                      </div>
                      <div style={{
                        width: 18, height: 18, borderRadius: 999,
                        border: `2px solid ${data.source === opt.key ? "var(--brand)" : "var(--border-strong)"}`,
                        flexShrink: 0, marginTop: 2,
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {data.source === opt.key && <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--brand)" }} />}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
                <button className="btn btn-ghost" onClick={() => setStep(0)}>Back</button>
                <button className="btn btn-primary" disabled={!data.source} onClick={() => setStep(2)} style={{ opacity: data.source ? 1 : 0.5 }}>Continue <I.ArrowRight size={14} /></button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="card" style={{ padding: 32 }}>
              <div className="t-h1 mb-2">Review & create</div>
              <div className="muted mb-6">Here's what we'll set up. You can adjust anything later in the assessment.</div>
              <div className="flex-col gap-3 mb-6">
                <SummaryRow label="Client" value={data.client} />
                <SummaryRow label="Country" value={data.country} />
                <SummaryRow label="Industry" value={data.industry} />
                <SummaryRow label="Edition" value={data.edition} />
                <SummaryRow label="Target SAP release" value="2602 (Feb 2026)" />
                <SummaryRow label="Starting point" value={
                  data.source === "spreadsheet" ? "Upload requirements spreadsheet" :
                  data.source === "discover" ? "Discover scope as we go" : "Use a template"
                } />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <button className="btn btn-ghost" onClick={() => setStep(1)}>Back</button>
                <button className="btn btn-primary" onClick={() => onCreate(data)}>Create assessment <I.ArrowRight size={14} /></button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}
function SummaryRow({ label, value }) {
  return (
    <div style={{ display: "flex", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ width: 180, color: "var(--text-muted)", fontSize: 13 }}>{label}</div>
      <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{value}</div>
    </div>
  );
}

// ─── Templates ────────────────────────
function Templates({ onUse }) {
  const templates = [
    { name: "APAC FSI default", desc: "Banking & financial services, ~580 scope items, 71% OOTB baseline.", tags: ["Finance", "Treasury", "Compliance"] },
    { name: "Energy & utilities", desc: "Upstream, midstream, downstream coverage. Includes IS-Oil add-ons.", tags: ["Finance", "Operations", "Asset Management"] },
    { name: "Manufacturing — discrete", desc: "MTO/ATO scenarios, full PP/QM/MM module set.", tags: ["Manufacturing", "Supply Chain"] },
    { name: "Retail & consumer", desc: "Multi-channel commerce, store ops, merchandise planning.", tags: ["Sales", "Inventory", "Pricing"] },
  ];
  return (
    <div className="content-inner">
      <PageHeader title="Templates" subtitle="Start a new assessment from a curated baseline." />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
        {templates.map(t => (
          <div key={t.name} className="card" style={{ padding: 20 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--surface-2)", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
              <I.Layers size={18} />
            </div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{t.name}</div>
            <div className="t-small mb-3">{t.desc}</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 16 }}>
              {t.tags.map(tag => <span key={tag} className="pill pill-neutral">{tag}</span>)}
            </div>
            <button className="btn btn-secondary btn-sm w-full" onClick={onUse}>Use template</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Settings ────────────────────────
function Settings({ user, theme, toggleTheme, density, setDensity }) {
  const [section, setSection] = uS("profile");
  return (
    <div className="content-inner">
      <PageHeader title="Settings" subtitle="Account-level preferences." />
      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 32 }}>
        <div>
          {[
            { key: "profile", label: "Profile", icon: <I.Cog size={14} /> },
            { key: "notif", label: "Notifications", icon: <I.Bell size={14} /> },
            { key: "theme", label: "Theme & display", icon: <I.Sun size={14} /> },
            { key: "account", label: "Account", icon: <I.Briefcase size={14} /> },
          ].map(s => (
            <div key={s.key} onClick={() => setSection(s.key)} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "8px 12px", borderRadius: 6, cursor: "pointer",
              background: section === s.key ? "var(--surface-2)" : "transparent",
              fontSize: 13, fontWeight: section === s.key ? 600 : 400,
              color: section === s.key ? "var(--text)" : "var(--text-muted)",
              marginBottom: 2,
            }}>{s.icon}{s.label}</div>
          ))}
        </div>
        <div className="card" style={{ padding: 32, maxWidth: 560 }}>
          {section === "profile" && (
            <>
              <div className="t-h1 mb-4">Profile</div>
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
                <div className="avatar avatar-lg" style={{ width: 56, height: 56, fontSize: 18 }}>{user.initials}</div>
                <button className="btn btn-secondary btn-sm">Upload photo</button>
              </div>
              <div className="flex-col gap-4">
                <Field label="Full name"><input className="input" defaultValue={user.name} /></Field>
                <Field label="Email"><input className="input" defaultValue={user.email} /></Field>
                <Field label="Role"><input className="input" defaultValue={user.role} /></Field>
              </div>
            </>
          )}
          {section === "notif" && (
            <>
              <div className="t-h1 mb-4">Notifications</div>
              {["Assessment updates", "Weekly digest", "AI analysis complete", "Report exports"].map((n, i) => (
                <div key={n} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: i < 3 ? "1px solid var(--border)" : "none" }}>
                  <span>{n}</span>
                  <Toggle defaultOn={i < 2} />
                </div>
              ))}
            </>
          )}
          {section === "theme" && (
            <>
              <div className="t-h1 mb-4">Theme & display</div>
              <Field label="Theme">
                <div style={{ display: "flex", gap: 8 }}>
                  {[{k:"light",l:"Light",i:<I.Sun size={14} />},{k:"dark",l:"Dark",i:<I.Moon size={14} />}].map(t => (
                    <button key={t.k} className={theme === t.k ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"} onClick={() => theme !== t.k && toggleTheme()}>{t.i}{t.l}</button>
                  ))}
                </div>
              </Field>
              <div className="mt-4" />
              <Field label="Density">
                <div style={{ display: "flex", gap: 8 }}>
                  {["tight", "medium", "relaxed"].map(d => (
                    <button key={d} className={density === d ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"} onClick={() => setDensity(d)}>{d[0].toUpperCase() + d.slice(1)}</button>
                  ))}
                </div>
              </Field>
            </>
          )}
          {section === "account" && (
            <>
              <div className="t-h1 mb-4">Account</div>
              <div className="flex-col gap-3">
                <SummaryRow label="Plan" value="Pro · Annual" />
                <SummaryRow label="Seats" value="1 of 5 used" />
                <SummaryRow label="Renews" value="March 12, 2027" />
              </div>
              <div className="mt-6" style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-secondary">Manage subscription</button>
                <button className="btn btn-ghost" style={{ color: "var(--danger-700)" }}>Sign out</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
function Toggle({ defaultOn }) {
  const [on, setOn] = uS(defaultOn);
  return (
    <button onClick={() => setOn(!on)} style={{
      width: 36, height: 20, borderRadius: 999,
      background: on ? "var(--brand)" : "var(--border-strong)",
      border: "none", padding: 2, position: "relative", transition: "background 150ms",
    }}>
      <span style={{
        position: "absolute", top: 2, left: on ? 18 : 2,
        width: 16, height: 16, borderRadius: 999, background: "white",
        transition: "left 150ms",
        boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
      }} />
    </button>
  );
}

Object.assign(window, { Login, Onboarding, Dashboard, AssessmentsList, Wizard, Templates, Settings, Field, SummaryRow });
