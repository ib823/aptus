// Aptus — Main App Router
const { useState: aS, useEffect: aE, useMemo: aM, useCallback: aC } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "density": "medium",
  "stepRailVariant": "rail",
  "scopeRowVariant": "default",
  "coverageVariant": "stacked",
  "drawerWide": false,
  "drawerSave": "auto",
  "showOnboarding": false,
  "skipLogin": true
}/*EDITMODE-END*/;

// Read hash params for canvas embedding: e.g. #view=assessment&step=4&theme=dark&coverage=donut&scope=card&rail=progress&drawer=wide
function readHashParams() {
  const h = (window.location.hash || "").replace(/^#/, "");
  if (!h) return {};
  const out = {};
  h.split("&").forEach(p => { const [k, v] = p.split("="); if (k) out[k] = decodeURIComponent(v || ""); });
  return out;
}

function App() {
  const hp = readHashParams();
  const [v, setTweak] = useTweaks({
    ...TWEAK_DEFAULTS,
    ...(hp.theme ? { theme: hp.theme } : {}),
    ...(hp.density ? { density: hp.density } : {}),
    ...(hp.rail ? { stepRailVariant: hp.rail } : {}),
    ...(hp.scope ? { scopeRowVariant: hp.scope } : {}),
    ...(hp.coverage ? { coverageVariant: hp.coverage } : {}),
    ...(hp.drawer ? { drawerWide: hp.drawer === "wide" } : {}),
    ...(hp.drawerSave ? { drawerSave: hp.drawerSave } : {}),
    ...(hp.skipLogin === "false" ? { skipLogin: false } : {}),
    ...(hp.onboarding === "true" ? { showOnboarding: true } : {}),
  });
  const EXTRA_VIEWS = ["empty-catalog", "loading-error", "client-share", "mobile-shell", "tablet-shell", "bulk-ops", "onboarding-tours", "file-upload", "cmdk-states", "toasts", "export-pair", "complexity", "archive", "bundle-vs"];
  const initialView = hp.view === "assessment" ? { name: "assessment", id: hp.id || "bursa-malaysia", step: parseInt(hp.step) || 1, openScope: hp.openScope, runAI: hp.runAI === "true" }
    : hp.view === "wizard" ? { name: "wizard" }
    : hp.view === "templates" ? { name: "templates" }
    : hp.view === "settings" ? { name: "settings" }
    : hp.view === "assessments" ? { name: "assessments", filter: hp.filter }
    : EXTRA_VIEWS.includes(hp.view) ? { name: hp.view }
    : { name: "home" };
  const [view, setView] = aS(initialView);
  const inFrame = hp.embed === "1";
  const forceEmpty = hp.empty === "true";
  const [authed, setAuthed] = aS(v.skipLogin !== false);
  const [onboarded, setOnboarded] = aS(!v.showOnboarding);
  const [cmdkOpen, setCmdkOpen] = aS(false);
  const [hasAssessments, setHasAssessments] = aS(true);

  aE(() => { document.documentElement.dataset.theme = v.theme; }, [v.theme]);
  aE(() => { document.documentElement.dataset.density = v.density; }, [v.density]);
  aE(() => { if (v.skipLogin) setAuthed(true); }, [v.skipLogin]);
  aE(() => { setOnboarded(!v.showOnboarding); }, [v.showOnboarding]);

  // Re-read view from hash on hash change so canvas iframes can target specific surfaces.
  aE(() => {
    const onHash = () => {
      const hp2 = readHashParams();
      if (!hp2.view) return;
      if (hp2.view === "assessment") setView({ name: "assessment", id: hp2.id || "bursa-malaysia", step: parseInt(hp2.step) || 1, openScope: hp2.openScope, runAI: hp2.runAI === "true" });
      else if (["wizard","templates","settings","home"].includes(hp2.view)) setView({ name: hp2.view });
      else if (hp2.view === "assessments") setView({ name: "assessments", filter: hp2.filter });
      else if (EXTRA_VIEWS.includes(hp2.view)) setView({ name: hp2.view });
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const toggleTheme = aC(() => setTweak("theme", v.theme === "dark" ? "light" : "dark"), [v.theme, setTweak]);
  const setDensity = aC((d) => setTweak("density", d), [setTweak]);
  aE(() => { window.__aptusToggleTheme = toggleTheme; }, [toggleTheme]);

  aE(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setCmdkOpen(true); }
      if ((e.metaKey || e.ctrlKey) && e.key === ".") { e.preventDefault(); toggleTheme(); }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [toggleTheme]);

  const user = window.APTUS_DATA.user;

  if (!authed) return <><Login onSignIn={() => setAuthed(true)} /><AptusTweaks v={v} setTweak={setTweak} /></>;
  if (!onboarded) return <><Onboarding user={user} onDone={(opts) => { setOnboarded(true); if (opts?.wizard) setView({ name: "wizard" }); }} /><AptusTweaks v={v} setTweak={setTweak} /></>;
  if (view.name === "wizard") return <><Wizard onCreate={() => { setHasAssessments(true); setView({ name: "assessment", id: "bursa-malaysia", step: 1 }); }} onCancel={() => setView({ name: "home" })} /><AptusTweaks v={v} setTweak={setTweak} /></>;

  const isExtraView = EXTRA_VIEWS.includes(view.name);
  const sideNav = view.name === "home" ? "home" : view.name === "assessments" || view.name === "assessment" ? "assessments" : isExtraView ? "explorations" : view.name;

  return (
    <div className="shell">
      <Topbar onSearch={() => setCmdkOpen(true)} user={user} theme={v.theme} toggleTheme={toggleTheme} />
      <div className="shell-body">
        <SideRail current={sideNav} onNav={(k) => setView({ name: k })} expanded={false} />
        <div className="content" style={{ padding: view.name === "assessment" ? 0 : "32px 24px 64px", overflow: view.name === "assessment" ? "hidden" : "auto" }}>
          {view.name === "home" && <Dashboard user={user} hasAssessments={hasAssessments && !forceEmpty} onOpen={(id) => setView({ name: "assessment", id })} onNew={() => setView({ name: "wizard" })} />}
          {view.name === "assessments" && <AssessmentsList initialFilter={view.filter} onOpen={(id) => setView({ name: "assessment", id })} onNew={() => setView({ name: "wizard" })} />}
          {view.name === "templates" && <Templates onUse={() => setView({ name: "wizard" })} />}
          {view.name === "settings" && <Settings user={user} theme={v.theme} toggleTheme={toggleTheme} density={v.density} setDensity={setDensity} />}
          {view.name === "empty-catalog"     && <EmptyCatalog />}
          {view.name === "loading-error"     && <LoadingErrorCatalog />}
          {view.name === "client-share"      && <ClientShareView />}
          {view.name === "mobile-shell"      && <MobileShell />}
          {view.name === "tablet-shell"      && <MobileShell tablet />}
          {view.name === "bulk-ops"          && <BulkOps />}
          {view.name === "onboarding-tours"  && <OnboardingTours />}
          {view.name === "file-upload"       && <FileUploadStates />}
          {view.name === "cmdk-states"       && <CmdKStates />}
          {view.name === "toasts"            && <ToastCatalog />}
          {view.name === "export-pair"       && <ExportLightDarkPair />}
          {view.name === "complexity"        && <ComplexityScales />}
          {view.name === "archive"           && <ArchiveView />}
          {view.name === "bundle-vs"         && <BundleVsPerReport />}
          {view.name === "assessment" && (
            <AssessmentShell
              assessment={window.APTUS_DATA.assessments.find(x => x.id === view.id)}
              initialStep={view.step}
              openScopeId={view.openScope}
              runAIInitial={view.runAI}
              onBack={() => setView({ name: "assessments" })}
              drawerSave={v.drawerSave}
              drawerWide={v.drawerWide}
              stepRailVariant={v.stepRailVariant}
              scopeRowVariant={v.scopeRowVariant}
              coverageVariant={v.coverageVariant}
            />
          )}
        </div>
      </div>

      <CmdK
        open={cmdkOpen}
        onClose={() => setCmdkOpen(false)}
        onNav={(t) => {
          if (t.view === "home") setView({ name: "home" });
          else if (t.view === "assessments") setView({ name: "assessments" });
          else if (t.view === "templates") setView({ name: "templates" });
          else if (t.view === "settings") setView({ name: "settings" });
          else if (t.view === "wizard") setView({ name: "wizard" });
          else if (t.view === "assessment") setView({ name: "assessment", id: t.id, step: t.step, openScope: t.openScope, runAI: t.runAI });
        }}
      />

      <AptusTweaks v={v} setTweak={setTweak} hidden={inFrame} />
    </div>
  );
}

function AptusTweaks({ v, setTweak, hidden }) {
  if (hidden) return null;
  return (
    <TweaksPanel title="Tweaks">
      <TweakSection label="Theme & density" />
      <TweakRadio label="Theme" value={v.theme} options={[{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} onChange={(x) => setTweak("theme", x)} />
      <TweakRadio label="Density" value={v.density} options={[{ value: "tight", label: "Tight" }, { value: "medium", label: "Medium" }, { value: "relaxed", label: "Relaxed" }]} onChange={(x) => setTweak("density", x)} />

      <TweakSection label="Step rail" />
      <TweakRadio label="Style" value={v.stepRailVariant} options={[{ value: "rail", label: "Rail" }, { value: "progress", label: "Bar" }, { value: "breadcrumb", label: "Crumbs" }]} onChange={(x) => setTweak("stepRailVariant", x)} />

      <TweakSection label="Scope rows" />
      <TweakRadio label="Layout" value={v.scopeRowVariant} options={[{ value: "default", label: "Default" }, { value: "compact", label: "Compact" }, { value: "card", label: "Card" }]} onChange={(x) => setTweak("scopeRowVariant", x)} />

      <TweakSection label="Coverage viz (Step 4)" />
      <TweakRadio label="Variant" value={v.coverageVariant} options={[{ value: "stacked", label: "Bar" }, { value: "donut", label: "Donut" }, { value: "pie", label: "Pie" }, { value: "numbers", label: "Nums" }]} onChange={(x) => setTweak("coverageVariant", x)} />

      <TweakSection label="Drawer" />
      <TweakRadio label="Width" value={v.drawerWide ? "wide" : "default"} options={[{ value: "default", label: "480" }, { value: "wide", label: "640" }]} onChange={(x) => setTweak("drawerWide", x === "wide")} />
      <TweakRadio label="Save" value={v.drawerSave} options={[{ value: "auto", label: "Auto" }, { value: "explicit", label: "Button" }]} onChange={(x) => setTweak("drawerSave", x)} />

      <TweakSection label="Flow" />
      <TweakToggle label="Show login" value={!v.skipLogin} onChange={(x) => setTweak("skipLogin", !x)} />
      <TweakToggle label="Show onboarding" value={v.showOnboarding} onChange={(x) => setTweak("showOnboarding", x)} />
    </TweaksPanel>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <ToastProvider>
    <App />
  </ToastProvider>
);
