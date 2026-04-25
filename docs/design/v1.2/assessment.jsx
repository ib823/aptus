// Aptus Assessment Shell — the canonical 5-step surface
const { useState: usS, useEffect: usE, useMemo: usM, useRef: usR, Fragment: sF } = React;

function AssessmentShell({ assessment, onBack, onUpdate, initialStep, openScopeId, runAIInitial, drawerSave, stepRailVariant, scopeRowVariant, coverageVariant, drawerWide }) {
  const [step, setStep] = usS(initialStep || assessment.step || 1);
  const [openScope, setOpenScope] = usS(null);
  const [a, setA] = usS(assessment);
  const completed = usM(() => Array.from({ length: a.step - 1 }, (_, i) => i + 1), [a.step]);
  const toast = useToast();

  usE(() => {
    if (openScopeId) {
      const s = window.APTUS_DATA.scopeItems.find(x => x.id === openScopeId);
      if (s) setOpenScope(s);
    }
  }, [openScopeId]);

  usE(() => {
    if (initialStep) setStep(initialStep);
  }, [initialStep]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Assessment top bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 16,
        padding: "12px 24px", borderBottom: "1px solid var(--border)",
        background: "var(--surface)",
      }}>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={onBack} style={{ width: 32, height: 32 }}><I.ArrowLeft size={16} /></button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="t-h1" style={{ fontSize: 20 }}>{a.client}</div>
            <StatusPill status={`In ${STEPS[step - 1].label}`} tone="info" withChevron />
          </div>
          <div className="t-small mt-1">
            {a.coverage.ootb}% OOTB · {a.coverage.config}% Config · {a.coverage.gap}% Gap · Last touched {a.lastTouched}
          </div>
        </div>
        <button className="btn btn-secondary btn-sm"><I.Share size={14} /> Share with client</button>
        <button className="btn btn-primary btn-sm" onClick={() => setStep(5)}><I.Download size={14} /> Export</button>
      </div>

      {stepRailVariant === "progress" && (
        <div style={{ padding: "16px 24px 0" }}><StepRail current={step} completed={completed} onSelect={setStep} variant="progress" /></div>
      )}
      {stepRailVariant === "breadcrumb" && (
        <div style={{ padding: "0 24px", borderBottom: "1px solid var(--border)" }}>
          <StepRail current={step} completed={completed} onSelect={setStep} variant="breadcrumb" />
        </div>
      )}

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {(!stepRailVariant || stepRailVariant === "rail") && (
          <div style={{ borderRight: "1px solid var(--border)", background: "var(--surface)" }}>
            <StepRail current={step} completed={completed} onSelect={setStep} />
          </div>
        )}
        <div style={{ flex: 1, overflowY: "auto", padding: "32px 32px 64px" }}>
          {step === 1 && <StepProfile a={a} onChange={setA} />}
          {step === 2 && <StepScope a={a} onOpenScope={setOpenScope} scopeRowVariant={scopeRowVariant} />}
          {step === 3 && <StepAnalyze a={a} runAIInitial={runAIInitial} onOpenScope={setOpenScope} />}
          {step === 4 && <StepAdjust a={a} onOpenScope={setOpenScope} coverageVariant={coverageVariant} scopeRowVariant={scopeRowVariant} />}
          {step === 5 && <StepExport a={a} step={step} setStep={setStep} ready={a.step >= 5} />}
        </div>
      </div>

      <ScopeDrawer scope={openScope} onClose={() => setOpenScope(null)} drawerSave={drawerSave} drawerWide={drawerWide} fullDetail={step === 4} onSaved={() => toast.push({ kind: "success", message: `Saved ${openScope?.id}` })} />
    </div>
  );
}

// ─── Step 1 — Profile ────────────────────────
function StepProfile({ a, onChange }) {
  const [showAll, setShowAll] = usS(false);
  const [savedAt, setSavedAt] = usS("Saved 2s ago");
  return (
    <div style={{ maxWidth: 640 }}>
      <div className="t-display" style={{ fontSize: 24, marginBottom: 4 }}>Profile</div>
      <div className="muted mb-6">Capture engagement basics. These set defaults for everything downstream.</div>

      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <div className="t-small"><strong style={{ color: "var(--text)" }}>5 of 5</strong> essential · 8 of 25 total</div>
        <div className="t-small" style={{ color: "var(--success-700)" }}>● {savedAt}</div>
      </div>

      <div className="card" style={{ padding: 24 }}>
        <div className="flex-col gap-4">
          <Field label="Company name"><input className="input" defaultValue={a.client} /></Field>
          <Field label="Industry"><select className="select" defaultValue={a.industry}><option>{a.industry}</option><option>Energy</option><option>Manufacturing</option></select></Field>
          <Field label="Country"><select className="select" defaultValue={a.country}><option>{a.country}</option><option>Singapore</option></select></Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Edition"><select className="select" defaultValue={a.edition}><option>{a.edition}</option><option>Private Cloud</option></select></Field>
            <Field label="Target SAP release"><input className="input" defaultValue="2602" /></Field>
          </div>

          {showAll && (
            <div className="flex-col gap-4 mt-4" style={{ paddingTop: 16, borderTop: "1px solid var(--border)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Company size"><select className="select"><option>Enterprise (10k+ employees)</option></select></Field>
                <Field label="Employee count"><input className="input" defaultValue="14,200" /></Field>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Annual revenue"><input className="input" defaultValue="$2.1B" /></Field>
                <Field label="Currency"><input className="input" defaultValue="MYR" /></Field>
              </div>
              <Field label="Target go-live date"><input className="input" defaultValue={a.goLive || "October 2026"} /></Field>
              <Field label="Current ERP"><input className="input" defaultValue="SAP ECC 6.0 EHP8" /></Field>
              <Field label="Migration approach"><select className="select"><option>Brownfield</option><option>Greenfield</option><option>Selective Data Transition</option></select></Field>
              <Field label="Operational sites"><input className="input" defaultValue="8 sites · Kuala Lumpur (HQ), Singapore, Jakarta, Bangkok, Manila, Hanoi, Sydney, Hong Kong" /></Field>
              <Field label="Regulatory frameworks"><input className="input" defaultValue="MFRS, IFRS, Bursa listing rules, BNM AML/CFT" /></Field>
              <Field label="Language requirements"><input className="input" defaultValue="English, Bahasa Malaysia" /></Field>
            </div>
          )}

          <button className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start", marginTop: 4 }} onClick={() => setShowAll(!showAll)}>
            {showAll ? <><I.ChevronUp size={14} /> Hide additional fields</> : <><I.ChevronDown size={14} /> Show all 25 fields</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Step 2 — Scope ────────────────────────
function StepScope({ a, onOpenScope, scopeRowVariant }) {
  const data = window.APTUS_DATA;
  const [q, setQ] = usS("");
  const [area, setArea] = usS("All");
  const areas = ["All", ...new Set(data.scopeItems.map(s => s.area))];
  const filtered = data.scopeItems.filter(s =>
    (area === "All" || s.area === area) &&
    (q === "" || (s.name + s.id).toLowerCase().includes(q.toLowerCase()))
  );
  const grouped = {};
  filtered.forEach(s => { (grouped[s.area] = grouped[s.area] || []).push(s); });

  return (
    <div>
      <div className="t-display" style={{ fontSize: 24, marginBottom: 4 }}>Scope</div>
      <div className="muted mb-6">Bring requirements in, or pick scope items from the SAP 2602 catalog.</div>

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 24 }}>
        {/* Left pane — sources */}
        <div>
          <div className="t-small mb-2" style={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)" }}>Sources</div>
          <div className="dropzone mb-3">
            <I.Upload size={24} style={{ color: "var(--text-muted)", marginBottom: 8 }} />
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Upload spreadsheet</div>
            <div className="t-small">RFP · RFI · Functional spec — drop here or browse</div>
          </div>
          <div className="card" style={{ padding: 0, marginBottom: 8 }}>
            <SourceItem icon={<I.Search size={16} />} title="Browse 2602 catalog" desc="582 scope items" />
            <SourceItem icon={<I.Edit size={16} />} title="Build manually" desc="Add items one at a time" />
            <SourceItem icon={<I.Copy size={16} />} title="Copy from another assessment" desc="e.g. Maybank Procurement" />
          </div>
          <div className="card" style={{ padding: 16 }}>
            <div className="t-small" style={{ fontWeight: 600, color: "var(--text)" }}>Imported requirements</div>
            <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>{a.requirements}</div>
            <div className="t-small">Across {a.scopeItems} scope items</div>
          </div>
        </div>

        {/* Right pane — scope grid */}
        <div>
          <FilterBar
            q={q} setQ={setQ}
            chips={[
              { value: area, set: setArea, label: "Module", options: areas },
              { value: "All", set: () => {}, label: "Granularity", options: ["All", "Coarse", "Medium", "Fine"] },
            ]}
            count={filtered.length}
          />

          <div className="card mt-3" style={{ padding: 0 }}>
            {Object.entries(grouped).map(([area, items], gi) => (
              <div key={area}>
                <div style={{ padding: "10px 16px", background: "var(--surface-2)", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", borderTop: gi > 0 ? "1px solid var(--border)" : "none", borderBottom: "1px solid var(--border)" }}>
                  {area} <span style={{ color: "var(--text-subtle)", marginLeft: 4 }}>({items.length})</span>
                </div>
                {items.map(s => <ScopeRow key={s.id} s={s} onOpen={() => onOpenScope(s)} variant={scopeRowVariant} />)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const SourceItem = ({ icon, title, desc }) => (
  <div className="row" style={{ height: "auto", padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
    <div style={{ width: 32, height: 32, borderRadius: 6, background: "var(--surface-2)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{icon}</div>
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 13, fontWeight: 500 }}>{title}</div>
      <div className="t-small">{desc}</div>
    </div>
    <I.ChevronRight size={14} style={{ color: "var(--text-muted)" }} />
  </div>
);

const FilterBar = ({ q, setQ, chips, count }) => (
  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
    <div style={{ position: "relative", flex: 1, maxWidth: 320 }}>
      <I.Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
      <input className="input" placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} style={{ paddingLeft: 36 }} />
    </div>
    {chips.map((c, i) => (
      <select key={i} className="select" style={{ width: "auto", maxWidth: 180 }} value={c.value} onChange={e => c.set(e.target.value)}>
        {c.options.map(o => <option key={o} value={o}>{c.label}: {o}</option>)}
      </select>
    ))}
    <div className="spacer" />
    <span className="t-small">Showing {count}</span>
  </div>
);

// ─── Scope row variants ────────────────────────
function ScopeRow({ s, onOpen, variant }) {
  if (variant === "compact") {
    return (
      <div className="row" onClick={onOpen} style={{ height: "44px" }}>
        <span className="t-mono" style={{ width: 48, color: "var(--text-muted)" }}>{s.id}</span>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{s.name}</span>
        <span className="t-small" style={{ width: 80 }}>{s.steps} steps</span>
        <StatusPill status={s.granularity} />
        <I.ChevronRight size={14} className="row-chevron" />
      </div>
    );
  }
  if (variant === "card") {
    return (
      <div onClick={onOpen} style={{ padding: 16, borderBottom: "1px solid var(--border)", cursor: "pointer", display: "flex", gap: 12, alignItems: "flex-start" }} onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface-2)"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
        <div style={{ width: 40, height: 40, borderRadius: 6, background: "var(--surface-2)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontFamily: "Geist Mono, monospace", fontSize: 11, fontWeight: 600 }}>{s.id}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{s.name}</div>
          <div className="t-small">{s.area} · {s.steps} steps · {s.reqs} requirements · last reviewed {s.lastReviewed}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <StatusPill status={s.granularity} />
          <StatusPill status={s.classification} />
        </div>
      </div>
    );
  }
  // §13.1 reference (default)
  return (
    <div className="row" onClick={onOpen}>
      <span className="t-mono" style={{ width: 56, color: "var(--text-muted)", flexShrink: 0 }}>{s.id}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{s.name}</div>
        <div className="t-small">{s.area} · {s.steps} steps · last reviewed {s.lastReviewed}</div>
      </div>
      <StatusPill status={s.granularity} />
      <I.ChevronRight size={16} className="row-chevron" />
    </div>
  );
}

// ─── Step 3 — Analyze ────────────────────────
function StepAnalyze({ a, runAIInitial, onOpenScope }) {
  const data = window.APTUS_DATA;
  const [filter, setFilter] = usS("All");
  const [running, setRunning] = usS(false);
  const [progress, setProgress] = usS(0);
  const [aiDone, setAiDone] = usS(false);
  const toast = useToast();

  usE(() => { if (runAIInitial) startAI(); }, [runAIInitial]);

  function startAI() {
    setRunning(true); setProgress(0);
    let p = 0;
    const iv = setInterval(() => {
      p += Math.random() * 12;
      if (p >= 100) { p = 100; clearInterval(iv); setRunning(false); setAiDone(true); toast.push({ kind: "success", message: "AI analysis complete · 778 requirements classified" }); }
      setProgress(p);
    }, 220);
  }

  const filtered = data.requirements.filter(r => filter === "All" || r.classification === filter);
  const counts = {
    All: data.requirements.length,
    Pending: 0,
    OOTB: data.requirements.filter(r => r.classification === "OOTB").length,
    Configuration: data.requirements.filter(r => r.classification === "Configuration").length,
    Gap: data.requirements.filter(r => r.classification === "Gap").length,
  };

  return (
    <div>
      <div className="t-display" style={{ fontSize: 24, marginBottom: 4 }}>Analyze</div>
      <div className="muted mb-6">Classify each requirement against the SAP 2602 inventory.</div>

      <div className="card" style={{ padding: 20, marginBottom: 16, display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ width: 44, height: 44, borderRadius: 8, background: "linear-gradient(135deg, #6366F1, #8B5CF6)", color: "white", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <I.Sparkles size={20} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>AI-assisted analysis</div>
          {!running && !aiDone && <div className="t-small">Anthropic API key set. We'll classify all 778 requirements in ~2 minutes.</div>}
          {running && <div className="t-small">Classifying requirements… {Math.round(progress)}%</div>}
          {aiDone && <div className="t-small" style={{ color: "var(--success-700)" }}>Complete — 778 requirements classified · 19 flagged for review</div>}
          {running && (
            <div className="coverage-bar mt-2" style={{ height: 4 }}>
              <div style={{ width: `${progress}%`, background: "var(--brand)", transition: "width 200ms" }} />
            </div>
          )}
        </div>
        {!running && !aiDone && <button className="btn btn-primary" onClick={startAI}><I.Sparkles size={14} /> Run AI Analysis</button>}
        {aiDone && <button className="btn btn-secondary btn-sm">Re-run</button>}
        <button className="btn btn-ghost btn-sm">Bulk paste from CSV</button>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {Object.entries(counts).map(([k, v]) => (
          <button key={k} className={filter === k ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"} onClick={() => setFilter(k)}>
            {k} <span style={{ marginLeft: 4, opacity: 0.7 }}>{v}</span>
          </button>
        ))}
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: "120px 1fr 160px 120px", gap: 12, padding: "10px 16px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid var(--border)" }}>
          <span>Code</span><span>Requirement</span><span>Classification</span><span>Mandatory</span>
        </div>
        {filtered.map(r => (
          <div key={r.id} className="row" style={{ display: "grid", gridTemplateColumns: "120px 1fr 160px 120px", gap: 12, height: 64, alignItems: "center" }} onClick={() => {
            const s = data.scopeItems.find(x => x.id === r.scopeId);
            if (s) onOpenScope(s);
          }}>
            <span className="t-mono" style={{ color: "var(--text-muted)" }}>{r.code}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.text}</div>
              <div className="t-small">{r.area} · {r.scopeId}</div>
            </div>
            <StatusPill status={r.classification} />
            <span><StatusPill status={r.mandatory ? "Mandatory" : "Optional"} /></span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Step 4 — Adjust ────────────────────────
function StepAdjust({ a, onOpenScope, coverageVariant, scopeRowVariant }) {
  const data = window.APTUS_DATA;
  const [classFilter, setClassFilter] = usS(null);
  const [q, setQ] = usS("");

  const filtered = data.scopeItems.filter(s =>
    (!classFilter || s.classification === classFilter) &&
    (q === "" || (s.id + s.name).toLowerCase().includes(q.toLowerCase()))
  );

  return (
    <div>
      <div className="t-display" style={{ fontSize: 24, marginBottom: 4 }}>Adjust</div>
      <div className="muted mb-6">Refine the analysis. Override AI, add notes, drill into specifics.</div>

      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div className="t-h2 mb-1">Coverage</div>
            <div className="t-small">Click a segment to filter the list below.</div>
          </div>
          <div className="t-small">{a.requirements} requirements · {a.scopeItems} scope items</div>
        </div>
        {coverageVariant === "donut" || coverageVariant === "pie" ? (
          <CoverageBar ootb={a.coverage.ootb} config={a.coverage.config} gap={a.coverage.gap} variant={coverageVariant} />
        ) : coverageVariant === "numbers" ? (
          <CoverageBar ootb={a.coverage.ootb} config={a.coverage.config} gap={a.coverage.gap} variant="numbers" />
        ) : (
          <>
            <div className="coverage-bar" style={{ height: 12, cursor: "pointer" }}>
              <div className="coverage-seg ootb" style={{ width: `${a.coverage.ootb}%` }} onClick={() => setClassFilter(classFilter === "OOTB" ? null : "OOTB")} />
              <div className="coverage-seg config" style={{ width: `${a.coverage.config}%` }} onClick={() => setClassFilter(classFilter === "Configuration" ? null : "Configuration")} />
              <div className="coverage-seg gap" style={{ width: `${a.coverage.gap}%` }} onClick={() => setClassFilter(classFilter === "Gap" ? null : "Gap")} />
            </div>
            <div style={{ display: "flex", gap: 24, marginTop: 12 }}>
              {[
                { k: "OOTB",          v: a.coverage.ootb,   c: "var(--success-500)" },
                { k: "Configuration", v: a.coverage.config, c: "var(--warning-500)" },
                { k: "Gap",           v: a.coverage.gap,    c: "var(--danger-500)" },
              ].map(s => (
                <button key={s.k} onClick={() => setClassFilter(classFilter === s.k ? null : s.k)} style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "6px 10px",
                  border: `1px solid ${classFilter === s.k ? "var(--brand)" : "var(--border)"}`,
                  borderRadius: 6, background: classFilter === s.k ? "var(--surface-2)" : "transparent",
                  cursor: "pointer", flex: 1,
                }}>
                  <span style={{ width: 10, height: 10, borderRadius: 999, background: s.c }} />
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.1 }}>{s.v}%</div>
                    <div className="t-small">{s.k}</div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 360 }}>
          <I.Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input className="input" placeholder="Search scope items…" value={q} onChange={e => setQ(e.target.value)} style={{ paddingLeft: 36 }} />
        </div>
        {classFilter && (
          <button className="btn btn-secondary btn-sm" onClick={() => setClassFilter(null)}>
            <I.X size={12} /> Clear: {classFilter}
          </button>
        )}
        <div className="spacer" />
        <span className="t-small">Showing {filtered.length}</span>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {filtered.map(s => <ScopeRow key={s.id} s={s} onOpen={() => onOpenScope(s)} variant={scopeRowVariant} />)}
      </div>
    </div>
  );
}

// ─── Step 5 — Export ────────────────────────
function StepExport({ a, step, setStep, ready }) {
  const [showAll, setShowAll] = usS(false);
  const [shareOpen, setShareOpen] = usS(false);
  const data = window.APTUS_DATA;
  const toast = useToast();

  if (!ready && false) {
    return (
      <div style={{ maxWidth: 560, margin: "40px auto", textAlign: "center" }}>
        <div className="card" style={{ padding: 40 }}>
          <div style={{ width: 56, height: 56, margin: "0 auto 16px", borderRadius: 12, background: "var(--surface-2)", color: "var(--text-muted)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <I.Lock size={24} />
          </div>
          <div className="t-h1 mb-2">Reports unlock once the assessment is reviewed.</div>
          <div className="muted mb-2">Currently: <strong style={{ color: "var(--text)" }}>In {STEPS[step - 1].label}</strong> (step {step} of 5)</div>
          <div className="muted mb-6">Next: complete Step 4 — Adjust</div>
          <button className="btn btn-primary" onClick={() => setStep(4)}>Continue to Adjust <I.ArrowRight size={14} /></button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <div className="t-display" style={{ fontSize: 24, marginBottom: 4 }}>Export</div>
      <div className="muted mb-6">Produce the deliverable bundle to send to the client.</div>

      <div className="card" style={{ padding: 40, textAlign: "center" }}>
        <div style={{ display: "inline-flex", padding: 12, borderRadius: 16, background: "var(--surface-2)", marginBottom: 16 }}>
          <I.Folder size={28} style={{ color: "var(--text-muted)" }} />
        </div>
        <div className="t-h1 mb-2">{a.client} — Ready to export</div>
        <div style={{ display: "flex", justifyContent: "center", gap: 20, marginBottom: 8, flexWrap: "wrap" }}>
          <span><strong>{a.coverage.ootb}%</strong> <span className="muted">OOTB</span></span>
          <span style={{ color: "var(--border-strong)" }}>·</span>
          <span><strong>{a.coverage.config}%</strong> <span className="muted">Config</span></span>
          <span style={{ color: "var(--border-strong)" }}>·</span>
          <span><strong>{a.coverage.gap}%</strong> <span className="muted">Gap</span></span>
        </div>
        <div className="t-small mb-6">{a.requirements} requirements analyzed · {a.scopeItems} scope items</div>

        <button className="btn btn-primary" style={{ height: 48, fontSize: 15, padding: "0 24px" }} onClick={() => toast.push({ kind: "success", message: "Bundle download started · 1.3 MB" })}>
          <I.Download size={16} /> Download report bundle (1.3 MB ZIP)
        </button>
        <div className="t-small mt-3">
          Includes 14 documents — Executive Summary, Gap Register, Scope Catalog, and 11 supporting reports.
        </div>

        <button className="btn btn-ghost btn-sm" style={{ marginTop: 20 }} onClick={() => setShowAll(!showAll)}>
          {showAll ? <><I.ChevronUp size={14} /> Hide individual reports</> : <><I.ChevronRight size={14} /> Individual reports</>}
        </button>
      </div>

      {showAll && (
        <div className="card mt-4" style={{ padding: 0 }}>
          {data.reports.map((r, i) => (
            <div key={r.id} className="row" style={{ height: 56 }}>
              <div style={{ width: 32, height: 32, borderRadius: 6, background: "var(--surface-2)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "var(--text-muted)" }}>{r.format}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{r.name}</div>
                <div className="t-small">{r.category} · {r.size}</div>
              </div>
              <button className="btn btn-ghost btn-sm"><I.Download size={12} /> Download</button>
            </div>
          ))}
        </div>
      )}

      <div className="card mt-4" style={{ padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div>
            <div className="t-h2 mb-1">Share with client</div>
            <div className="t-small">Generate a read-only link for client SMEs to review the assessment.</div>
          </div>
          <button className="btn btn-secondary" onClick={() => setShareOpen(true)}><I.Link size={14} /> Create share link</button>
        </div>
      </div>

      <ShareLinkDialog open={shareOpen} onClose={() => setShareOpen(false)} a={a} />
    </div>
  );
}

function ShareLinkDialog({ open, onClose, a }) {
  const [days, setDays] = usS(14);
  const url = `https://aptus.io/share/${a.id}/k7m9q2x4`;
  const toast = useToast();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Share with client"
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={() => { navigator.clipboard?.writeText(url); toast.push({ kind: "success", message: "Link copied to clipboard" }); onClose(); }}>
          <I.Copy size={14} /> Copy link
        </button>
      </>}
    >
      <div className="muted mb-4">Anyone with this link can view a read-only summary of {a.client}'s assessment. They cannot edit or download.</div>
      <Field label="Link expires in">
        <select className="select" value={days} onChange={e => setDays(Number(e.target.value))}>
          <option value={7}>7 days</option><option value={14}>14 days</option><option value={30}>30 days</option><option value={90}>90 days</option>
        </select>
      </Field>
      <div className="mt-4" />
      <Field label="Link">
        <div style={{ display: "flex", gap: 4 }}>
          <input className="input" readOnly value={url} style={{ fontFamily: "Geist Mono, monospace", fontSize: 12 }} />
          <button className="btn btn-secondary btn-icon" onClick={() => { navigator.clipboard?.writeText(url); toast.push({ kind: "success", message: "Copied" }); }}><I.Copy size={14} /></button>
        </div>
      </Field>
    </Modal>
  );
}

// ─── Scope Drawer ────────────────────────
function ScopeDrawer({ scope, onClose, drawerSave, drawerWide, fullDetail, onSaved }) {
  const [tab, setTab] = usS("verdict");
  const [granularity, setGranularity] = usS(scope?.granularity || "Coarse");
  const [verdict, setVerdict] = usS(scope?.verdict || "Mostly FIT");
  const [notes, setNotes] = usS("");

  usE(() => {
    if (scope) {
      setGranularity(scope.granularity);
      setVerdict(scope.verdict);
      setNotes(scope.id === "J60" ? "Bursa AP processes are well-covered by J60 + 2EJ. Vendor portal needs Ariba SLP — flagged as Gap." :
               scope.id === "BFA" ? "FX hedging is the open question. Need workshop with Treasury team to confirm hedge accounting needs." : "");
      setTab("verdict");
    }
  }, [scope]);

  if (!scope) return null;

  const tabs = fullDetail ? [
    { key: "verdict", label: "Verdict" },
    { key: "steps", label: "Step-level", count: scope.steps },
    { key: "integrations", label: "Integrations", count: 3 },
    { key: "migration", label: "Data Migration", count: 2 },
    { key: "ocm", label: "OCM", count: 4 },
    { key: "gaps", label: "Gaps", count: scope.classification === "Gap" ? 2 : 0 },
  ] : null;

  return (
    <Drawer
      open={!!scope}
      onClose={onClose}
      wide={drawerWide || fullDetail}
      title={
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="t-mono" style={{ padding: "2px 8px", background: "var(--surface-2)", borderRadius: 4, fontSize: 12 }}>{scope.id}</span>
          <span>{scope.name}</span>
        </div>
      }
      tabs={tabs}
      activeTab={tab}
      onTab={setTab}
      footer={drawerSave === "explicit" ? <>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={() => { onSaved?.(); onClose(); }}><I.Save size={14} /> Save</button>
      </> : <div className="t-small" style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--success-500)" }} />
        Auto-saved · last change 2s ago
      </div>}
    >
      {tab === "verdict" && (
        <div className="flex-col gap-6">
          <div className="t-small">{scope.area} · {scope.steps} process steps · {scope.reqs} linked requirements</div>

          <Field label="Granularity">
            <div className="flex-col gap-2 mt-1">
              {[
                { k: "Coarse", desc: "Auto-FIT — accept SAP standard for this scope item." },
                { k: "Medium", desc: "Reviewed at the verdict + notes level." },
                { k: "Fine",   desc: "Drilled into individual process steps." },
              ].map(g => (
                <label key={g.k} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: 12, border: `1.5px solid ${granularity === g.k ? "var(--brand)" : "var(--border)"}`, borderRadius: 6, cursor: "pointer", background: granularity === g.k ? "var(--surface-2)" : "transparent" }}>
                  <input type="radio" checked={granularity === g.k} onChange={() => setGranularity(g.k)} style={{ marginTop: 2, accentColor: "var(--brand)" }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{g.k}</div>
                    <div className="t-small">{g.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </Field>

          <Field label="Verdict">
            <select className="select" value={verdict} onChange={e => setVerdict(e.target.value)}>
              <option>Mostly FIT</option>
              <option>Mostly Configuration</option>
              <option>Has Gaps</option>
              <option>Needs Workshop</option>
            </select>
          </Field>

          <Field label="Notes">
            <textarea className="textarea" rows={5} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Free-form notes — context for the team and the deliverable." />
          </Field>

          {granularity === "Fine" && (
            <button className="btn btn-secondary btn-sm" style={{ alignSelf: "flex-start" }}>
              Drill into {scope.steps} steps <I.ChevronRight size={12} />
            </button>
          )}

          <div className="card" style={{ padding: 16, background: "var(--surface-2)", border: "none" }}>
            <div className="t-small mb-2" style={{ fontWeight: 600, color: "var(--text)" }}>Linked requirements</div>
            {window.APTUS_DATA.requirements.filter(r => r.scopeId === scope.id).slice(0, 3).map(r => (
              <div key={r.id} style={{ display: "flex", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                <span className="t-mono" style={{ color: "var(--text-muted)", flexShrink: 0 }}>{r.code}</span>
                <span style={{ flex: 1, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.text}</span>
                <StatusPill status={r.classification} />
              </div>
            ))}
            <div className="t-small mt-2" style={{ color: "var(--text-muted)" }}>Showing 3 of {scope.reqs}</div>
          </div>
        </div>
      )}

      {tab === "steps" && (
        <div>
          <div className="muted mb-4">Process steps for {scope.name}. Click any step to inspect its FIT/Config/Gap mapping.</div>
          <div className="card" style={{ padding: 0 }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="row" style={{ height: 48 }}>
                <span className="t-mono" style={{ color: "var(--text-muted)" }}>{scope.id}-{String(i + 1).padStart(3, "0")}</span>
                <span style={{ flex: 1, fontSize: 13 }}>{["Create vendor master record","Process invoice receipt","3-way match validation","Approval workflow routing","Payment proposal run","Bank file generation","Reconciliation","Reporting"][i]}</span>
                <StatusPill status={i % 5 === 4 ? "Gap" : i % 3 === 1 ? "Configuration" : "OOTB"} />
              </div>
            ))}
          </div>
          <button className="btn btn-ghost btn-sm mt-3">Show all {scope.steps} steps</button>
        </div>
      )}

      {tab === "integrations" && (
        <RegisterEntries title="Integration points" cols={["System", "Type", "Status"]} rows={[
          ["S/4 → SuccessFactors", "API · OData", "OOTB"],
          ["S/4 → Ariba SLP",      "iFlow · CPI", "Configuration"],
          ["S/4 → Bank API",       "MT940 · sFTP", "Gap"],
        ]} />
      )}
      {tab === "migration" && (
        <RegisterEntries title="Data migration objects" cols={["Object", "Volume", "Strategy"]} rows={[
          ["Vendor master", "~14k records", "LSMW + cleanup"],
          ["Open AP items", "~38k records", "Migration Cockpit"],
        ]} />
      )}
      {tab === "ocm" && (
        <RegisterEntries title="OCM impacts" cols={["Stakeholder group", "Impact", "Severity"]} rows={[
          ["AP processors", "New approval flow",  "Medium"],
          ["Vendors",       "New invoice portal", "Configuration"],
          ["Treasury",      "FX revaluation chg", "Has Gaps"],
          ["Audit",         "New reports",        "OOTB"],
        ]} />
      )}
      {tab === "gaps" && (
        <RegisterEntries title="Identified gaps" cols={["Gap", "Resolution", "Owner"]} rows={[
          ["Vendor portal", "Implement Ariba SLP — separate product", "Gap"],
          ["Custom approvals matrix", "Configuration via SSCUI", "Configuration"],
        ]} />
      )}
    </Drawer>
  );
}

function RegisterEntries({ title, cols, rows }) {
  return (
    <div>
      <div className="t-h2 mb-3">{title}</div>
      <div className="card" style={{ padding: 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: cols.map(() => "1fr").join(" "), gap: 12, padding: "10px 16px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid var(--border)" }}>
          {cols.map(c => <span key={c}>{c}</span>)}
        </div>
        {rows.map((r, i) => (
          <div key={i} className="row" style={{ display: "grid", gridTemplateColumns: cols.map(() => "1fr").join(" "), gap: 12, height: 48 }}>
            {r.map((cell, j) => (
              <span key={j} style={{ fontSize: 13 }}>
                {j === r.length - 1 ? <StatusPill status={cell} /> : cell}
              </span>
            ))}
          </div>
        ))}
      </div>
      <button className="btn btn-secondary btn-sm mt-3"><I.Plus size={12} /> Add entry</button>
    </div>
  );
}

Object.assign(window, { AssessmentShell, ScopeDrawer, ScopeRow });
