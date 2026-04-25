// Aptus shared components — icons, pills, AptusMark, layouts, drawers, etc.
const { useState, useEffect, useRef, useMemo, useCallback, createContext, useContext, Fragment } = React;

// ─── Icons (Lucide-style, 1.5 stroke) ────────────────────────
const Icon = ({ d, size = 16, fill = "none", stroke = "currentColor", strokeWidth = 1.5, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...rest}>
    {typeof d === "string" ? <path d={d} /> : d}
  </svg>
);
const I = {
  Home:    (p) => <Icon {...p} d="M3 12 12 4l9 8M5 10v10h14V10" />,
  List:    (p) => <Icon {...p} d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  Layers:  (p) => <Icon {...p} d="m12 2 9 5-9 5-9-5 9-5Zm-9 11 9 5 9-5M3 18l9 5 9-5" />,
  Settings:(p) => <Icon {...p} d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.3l2-1.6-2-3.4-2.4.8a7.5 7.5 0 0 0-2.2-1.3l-.4-2.5h-4l-.4 2.5a7.5 7.5 0 0 0-2.2 1.3l-2.4-.8-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.6l-2 1.6 2 3.4 2.4-.8a7.5 7.5 0 0 0 2.2 1.3l.4 2.5h4l.4-2.5a7.5 7.5 0 0 0 2.2-1.3l2.4.8 2-3.4-2-1.6c.1-.4.1-.9.1-1.3Z" />,
  Help:    (p) => <Icon {...p} d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm-2-12a2 2 0 1 1 3 1.7c-.5.3-1 .8-1 1.5v.3M12 17h.01" />,
  Search:  (p) => <Icon {...p} d="m21 21-4.3-4.3M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" />,
  Plus:    (p) => <Icon {...p} d="M12 5v14M5 12h14" />,
  ChevronRight: (p) => <Icon {...p} d="m9 6 6 6-6 6" />,
  ChevronLeft:  (p) => <Icon {...p} d="m15 6-6 6 6 6" />,
  ChevronDown:  (p) => <Icon {...p} d="m6 9 6 6 6-6" />,
  ChevronUp:    (p) => <Icon {...p} d="m18 15-6-6-6 6" />,
  X:       (p) => <Icon {...p} d="M18 6 6 18M6 6l12 12" />,
  Check:   (p) => <Icon {...p} d="M20 6 9 17l-5-5" />,
  ArrowRight: (p) => <Icon {...p} d="M5 12h14M13 5l7 7-7 7" />,
  ArrowLeft:  (p) => <Icon {...p} d="M19 12H5M12 19l-7-7 7-7" />,
  Download: (p) => <Icon {...p} d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />,
  Upload:   (p) => <Icon {...p} d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />,
  FileText: (p) => <Icon {...p} d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 0v6h6M16 13H8M16 17H8M10 9H8" />,
  FilePlus: (p) => <Icon {...p} d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 0v6h6M12 18v-6M9 15h6" />,
  Folder:   (p) => <Icon {...p} d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />,
  Lock:     (p) => <Icon {...p} d="M5 11h14v10H5zM8 11V7a4 4 0 1 1 8 0v4" />,
  Edit:     (p) => <Icon {...p} d="M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />,
  Trash:    (p) => <Icon {...p} d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14Z" />,
  More:     (p) => <Icon {...p} d="M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" fill="currentColor" stroke="currentColor" />,
  Share:    (p) => <Icon {...p} d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13" />,
  Sparkles: (p) => <Icon {...p} d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2 2M16.4 16.4l2 2M5.6 18.4l2-2M16.4 7.6l2-2" />,
  Bell:     (p) => <Icon {...p} d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0" />,
  Sun:      (p) => <Icon {...p} d="M12 3v2M12 19v2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M3 12h2M19 12h2M5.6 18.4 7 17M17 7l1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" />,
  Moon:     (p) => <Icon {...p} d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />,
  Triangle: (p) => <Icon {...p} d="M12 4 22 20H2L12 4Z" />,
  Filter:   (p) => <Icon {...p} d="M3 4h18l-7 9v6l-4 2v-8L3 4Z" />,
  Bolt:     (p) => <Icon {...p} d="M13 2 3 14h8l-1 8 10-12h-8l1-8Z" />,
  Link:     (p) => <Icon {...p} d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />,
  Copy:     (p) => <Icon {...p} d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-2M16 4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2M16 4v2a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V4M6 8H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-2" />,
  Save:     (p) => <Icon {...p} d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2ZM17 21v-8H7v8M7 3v5h8" />,
  Building: (p) => <Icon {...p} d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4M9 9h.01M9 12h.01M9 15h.01M9 18h.01" />,
  Globe:    (p) => <Icon {...p} d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM2 12h20M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10 15 15 0 0 1 4-10Z" />,
  Briefcase:(p) => <Icon {...p} d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16M3 21h18a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2Z" />,
  Cog:      (p) => <Icon {...p} d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0-12 1 2.7 2.7-1 1.4 2.4-1.7 2.3 1.7 2.3-1.4 2.4-2.7-1L12 16l-1-2.7-2.7 1-1.4-2.4 1.7-2.3-1.7-2.3 1.4-2.4 2.7 1L12 3Z" />,
  LogOut:   (p) => <Icon {...p} d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />,
  Eye:      (p) => <Icon {...p} d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />,
  CheckCircle: (p) => <Icon {...p} d="M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4 12 14.01l-3-3" />,
  AlertCircle: (p) => <Icon {...p} d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 8v4M12 16h.01" />,
  Info:     (p) => <Icon {...p} d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 16v-4M12 8h.01" />,
  Database: (p) => <Icon {...p} d="M12 8c5 0 9-1.3 9-3s-4-3-9-3-9 1.3-9 3 4 3 9 3ZM3 5v6c0 1.7 4 3 9 3s9-1.3 9-3V5M3 11v6c0 1.7 4 3 9 3s9-1.3 9-3v-6" />,
  Workflow: (p) => <Icon {...p} d="M3 3h6v6H3zM15 15h6v6h-6zM21 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />,
  Users:    (p) => <Icon {...p} d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />,
  Layout:   (p) => <Icon {...p} d="M3 3h18v18H3zM3 9h18M9 21V9" />,
  Activity: (p) => <Icon {...p} d="M22 12h-4l-3 9L9 3l-3 9H2" />,
};

// ─── Aptus Mark ────────────────────────
const AptusMark = ({ size = 24, monochrome = false }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <defs>
      <linearGradient id="aptus-grad" x1="0" y1="0" x2="32" y2="32">
        <stop offset="0%" stopColor="currentColor" stopOpacity="1" />
        <stop offset="100%" stopColor="currentColor" stopOpacity="0.6" />
      </linearGradient>
    </defs>
    <path d="M16 4 L28 26 L4 26 Z" fill={monochrome ? "currentColor" : "url(#aptus-grad)"} />
    <path d="M16 13 L22 24 L10 24 Z" fill="var(--surface, #fff)" />
    <circle cx="16" cy="20" r="1.5" fill="currentColor" />
  </svg>
);

const AptusWordmark = ({ size = 18 }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
    <AptusMark size={size + 6} />
    <span style={{ fontSize: size, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--text)" }}>Aptus</span>
  </div>
);

// ─── Status Pill (one component, reused everywhere) ────────────────────────
const PILL_MAP = {
  // Coverage / classification
  "OOTB": "success", "FIT": "success", "Mostly FIT": "success", "OK": "success", "Coarse": "success",
  "Configuration": "warning", "Mostly Configuration": "warning", "Has Gaps": "warning", "Medium": "warning", "Pending": "warning",
  "In progress": "info", "Fine": "info", "In Analyze": "info", "In Adjust": "info", "Active": "info", "Information": "info",
  "Gap": "danger", "Mandatory missing": "danger", "Error": "danger", "Needs Workshop": "danger",
  "NA": "neutral", "Out of Scope": "neutral", "Inactive": "neutral", "Optional": "neutral", "Draft": "neutral", "Done": "neutral",
  "Mandatory": "warning",
};
const StatusPill = ({ status, tone, withChevron, onClick, size, leftDot }) => {
  const t = tone || PILL_MAP[status] || "neutral";
  return (
    <span
      className={`pill pill-${t}`}
      onClick={onClick}
      style={{ cursor: onClick ? "pointer" : "default", height: size === "lg" ? 28 : 24, padding: size === "lg" ? "0 10px" : "0 8px", fontSize: size === "lg" ? 13 : 12 }}
    >
      {leftDot && <span style={{ width: 6, height: 6, borderRadius: 999, background: "currentColor", marginRight: 2 }} />}
      {status}
      {withChevron && <I.ChevronDown size={12} />}
    </span>
  );
};

// ─── Coverage Bar (variants: stacked / donut / pie / numbers) ────────────────────────
const CoverageBar = ({ ootb = 0, config = 0, gap = 0, variant = "stacked", showLabels = true, height }) => {
  const total = ootb + config + gap || 1;
  if (variant === "donut" || variant === "pie") {
    const r = variant === "donut" ? 28 : 32;
    const c = 2 * Math.PI * r;
    const strokeWidth = variant === "donut" ? 8 : 64;
    const segs = [
      { v: ootb, c: "var(--success-500)" },
      { v: config, c: "var(--warning-500)" },
      { v: gap, c: "var(--danger-500)" },
    ];
    let offset = 0;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <svg width={80} height={80} viewBox="-40 -40 80 80" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="0" cy="0" r={r} fill="none" stroke="var(--surface-2)" strokeWidth={strokeWidth} />
          {segs.map((s, i) => {
            const len = (s.v / total) * c;
            const dasharray = `${len} ${c - len}`;
            const el = <circle key={i} cx="0" cy="0" r={r} fill="none" stroke={s.c} strokeWidth={strokeWidth} strokeDasharray={dasharray} strokeDashoffset={-offset} />;
            offset += len;
            return el;
          })}
        </svg>
        {showLabels && <CoverageLegend ootb={ootb} config={config} gap={gap} />}
      </div>
    );
  }
  if (variant === "numbers") {
    return (
      <div style={{ display: "flex", gap: 16 }}>
        <NumStat label="OOTB" value={`${ootb}%`} color="var(--success-700)" />
        <NumStat label="Config" value={`${config}%`} color="var(--warning-700)" />
        <NumStat label="Gap" value={`${gap}%`} color="var(--danger-700)" />
      </div>
    );
  }
  return (
    <div className="flex-col gap-2" style={{ width: "100%" }}>
      <div className={`coverage-bar ${height === "thin" ? "coverage-bar-thin" : ""}`} style={height ? { height: typeof height === "number" ? height : undefined } : {}}>
        <div className="coverage-seg ootb" style={{ width: `${(ootb / total) * 100}%` }} />
        <div className="coverage-seg config" style={{ width: `${(config / total) * 100}%` }} />
        <div className="coverage-seg gap" style={{ width: `${(gap / total) * 100}%` }} />
      </div>
      {showLabels && <CoverageLegend ootb={ootb} config={config} gap={gap} inline />}
    </div>
  );
};
const NumStat = ({ label, value, color }) => (
  <div>
    <div style={{ fontSize: 22, fontWeight: 600, color, lineHeight: 1.1 }}>{value}</div>
    <div className="t-small">{label}</div>
  </div>
);
const CoverageLegend = ({ ootb, config, gap, inline }) => (
  <div className="t-small" style={{ display: "flex", gap: 12, alignItems: "center" }}>
    <Dot c="var(--success-500)" /> {ootb}% OOTB
    <Dot c="var(--warning-500)" /> {config}% Config
    <Dot c="var(--danger-500)" /> {gap}% Gap
  </div>
);
const Dot = ({ c }) => <span style={{ width: 8, height: 8, borderRadius: 999, background: c, display: "inline-block", marginRight: 4 }} />;

// ─── Step Rail ────────────────────────
const STEPS = [
  { n: 1, key: "profile",   label: "Profile",      sub: "Engagement basics" },
  { n: 2, key: "scope",     label: "Scope",        sub: "Bring requirements" },
  { n: 3, key: "analyze",   label: "Analyze",      sub: "Classify FIT/Config/Gap" },
  { n: 4, key: "adjust",    label: "Adjust",       sub: "Refine & override" },
  { n: 5, key: "export",    label: "Export",       sub: "Download bundle" },
];

const StepRail = ({ current, completed = [], onSelect, variant = "rail" }) => {
  if (variant === "progress") {
    return (
      <div className="step-progress" style={{ width: "100%" }}>
        {STEPS.map(s => (
          <div key={s.key} className={`step-progress-seg ${completed.includes(s.n) ? "complete" : ""} ${current === s.n ? "active" : ""}`} />
        ))}
      </div>
    );
  }
  if (variant === "breadcrumb") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 0" }}>
        {STEPS.map((s, i) => {
          const isComplete = completed.includes(s.n);
          const isCurrent = current === s.n;
          const isLocked = !isComplete && !isCurrent && s.n > Math.max(current, ...completed) + 1;
          return (
            <Fragment key={s.key}>
              <button
                className="btn-ghost"
                disabled={isLocked}
                onClick={() => !isLocked && onSelect(s.n)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 10px", borderRadius: 6, border: "none",
                  background: isCurrent ? "var(--surface-2)" : "transparent",
                  color: isLocked ? "var(--text-subtle)" : isCurrent ? "var(--text)" : "var(--text-muted)",
                  fontSize: 13, fontWeight: isCurrent ? 600 : 500,
                  cursor: isLocked ? "not-allowed" : "pointer",
                }}
              >
                <span style={{
                  width: 20, height: 20, borderRadius: 999,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  background: isComplete ? "var(--brand)" : "var(--surface-2)",
                  border: `1.5px solid ${isComplete ? "var(--brand)" : isCurrent ? "var(--brand)" : "var(--border-strong)"}`,
                  color: isComplete ? "var(--brand-text)" : "var(--text-muted)",
                  fontSize: 11, fontWeight: 600,
                }}>
                  {isComplete ? <I.Check size={12} /> : s.n}
                </span>
                {s.label}
              </button>
              {i < STEPS.length - 1 && <I.ChevronRight size={14} style={{ color: "var(--text-subtle)" }} />}
            </Fragment>
          );
        })}
      </div>
    );
  }
  // default rail
  return (
    <div className="step-rail">
      {STEPS.map((s, i) => {
        const isComplete = completed.includes(s.n);
        const isCurrent = current === s.n;
        const isLocked = !isComplete && !isCurrent && s.n > Math.max(current, ...completed) + 1;
        return (
          <div
            key={s.key}
            className={`step-item ${isCurrent ? "active" : ""} ${isComplete ? "complete" : ""} ${isLocked ? "locked" : ""}`}
            onClick={() => !isLocked && onSelect(s.n)}
            style={{ position: "relative" }}
          >
            <div className="step-marker">
              {isLocked ? <I.Lock size={11} /> : isComplete ? <I.Check size={12} /> : s.n}
            </div>
            <div className="step-label">
              {s.label}
              <small>{s.sub}</small>
            </div>
            {i < STEPS.length - 1 && <span className="step-rail-line" />}
          </div>
        );
      })}
    </div>
  );
};

// ─── Topbar ────────────────────────
const Topbar = ({ onSearch, onUserMenu, theme, toggleTheme, user }) => (
  <div className="topbar">
    <AptusWordmark size={15} />
    <div className="topbar-search" onClick={onSearch} role="button" tabIndex={0}>
      <I.Search size={14} />
      <span>Search assessments, scope items, commands…</span>
      <kbd>⌘K</kbd>
    </div>
    <div className="spacer" />
    <button className="btn btn-ghost btn-icon btn-sm" onClick={toggleTheme} aria-label="Toggle theme" style={{ width: 32, height: 32 }}>
      {theme === "dark" ? <I.Sun size={16} /> : <I.Moon size={16} />}
    </button>
    <button className="btn btn-ghost btn-icon btn-sm" aria-label="Notifications" style={{ width: 32, height: 32 }}>
      <I.Bell size={16} />
    </button>
    <UserMenuButton user={user} theme={theme} toggleTheme={toggleTheme} />
  </div>
);

const UserMenuButton = ({ user, theme, toggleTheme }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{ display: "flex", alignItems: "center", gap: 8, padding: 4, borderRadius: 999, border: "1px solid var(--border)", background: "var(--surface)" }}
      >
        <div className="avatar">{user.initials}</div>
        <I.ChevronDown size={14} style={{ color: "var(--text-muted)", marginRight: 4 }} />
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", right: 0,
          background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8,
          boxShadow: "var(--shadow-md)", minWidth: 220, padding: 6, zIndex: 30,
        }}>
          <div style={{ padding: "8px 10px 12px" }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{user.name}</div>
            <div className="t-small">{user.email}</div>
          </div>
          <div className="divider" style={{ margin: "4px 0" }} />
          <MenuItem icon={<I.Cog size={14} />} label="Profile" />
          <MenuItem icon={<I.Bell size={14} />} label="Notifications" />
          <MenuItem
            icon={theme === "dark" ? <I.Sun size={14} /> : <I.Moon size={14} />}
            label={`Theme: ${theme === "dark" ? "Dark" : "Light"}`}
            onClick={toggleTheme}
          />
          <div className="divider" style={{ margin: "4px 0" }} />
          <MenuItem icon={<I.Help size={14} />} label="Help & docs" />
          <MenuItem icon={<I.FileText size={14} />} label="Keyboard shortcuts" trailing="?" />
          <div className="divider" style={{ margin: "4px 0" }} />
          <MenuItem icon={<I.LogOut size={14} />} label="Sign out" />
        </div>
      )}
    </div>
  );
};
const MenuItem = ({ icon, label, onClick, trailing }) => (
  <div
    onClick={onClick}
    style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "8px 10px", borderRadius: 6, cursor: "pointer", fontSize: 13,
    }}
    onMouseEnter={e => e.currentTarget.style.background = "var(--surface-2)"}
    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
  >
    <span style={{ color: "var(--text-muted)" }}>{icon}</span>
    {label}
    {trailing && <kbd style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-muted)", padding: "1px 5px", border: "1px solid var(--border)", borderRadius: 4 }}>{trailing}</kbd>}
  </div>
);

// ─── Side Rail ────────────────────────
const SideRail = ({ current, onNav, expanded }) => {
  const items = [
    { key: "home",        icon: <I.Home size={18} />, label: "Home" },
    { key: "assessments", icon: <I.List size={18} />, label: "Assessments" },
    { key: "templates",   icon: <I.Layers size={18} />, label: "Templates" },
    { key: "settings",    icon: <I.Settings size={18} />, label: "Settings" },
  ];
  return (
    <div className="siderail" style={{ width: expanded ? 240 : 64 }}>
      {items.map(it => (
        <div
          key={it.key}
          className={`siderail-item ${current === it.key ? "active" : ""}`}
          onClick={() => onNav(it.key)}
          title={it.label}
        >
          {it.icon}
          {expanded && <span>{it.label}</span>}
        </div>
      ))}
      <div className="spacer" />
      <div className="siderail-item" title="Help">
        <I.Help size={18} />
        {expanded && <span>Help</span>}
      </div>
    </div>
  );
};

// ─── Drawer (with focus management) ────────────────────────
const Drawer = ({ open, onClose, title, footer, wide, children, tabs, activeTab, onTab }) => {
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return ReactDOM.createPortal(
    <Fragment>
      <div className="drawer-overlay" onClick={onClose} />
      <div className={`drawer ${wide ? "drawer-wide" : ""}`} role="dialog" aria-modal="true">
        <div className="drawer-header">
          <div className="t-h2">{title}</div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Close" style={{ width: 28, height: 28 }}>
            <I.X size={16} />
          </button>
        </div>
        {tabs && (
          <div className="drawer-tabs">
            {tabs.map(t => (
              <button key={t.key} className={`drawer-tab ${activeTab === t.key ? "active" : ""}`} onClick={() => onTab(t.key)}>
                {t.label}
                {t.count != null && <span style={{ marginLeft: 6, color: "var(--text-subtle)", fontWeight: 400 }}>{t.count}</span>}
              </button>
            ))}
          </div>
        )}
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-footer">{footer}</div>}
      </div>
    </Fragment>,
    document.body
  );
};

// ─── Modal ────────────────────────
const Modal = ({ open, onClose, title, children, footer }) => {
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return ReactDOM.createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div style={{ padding: 24, borderBottom: "1px solid var(--border)" }} className="t-h2">{title}</div>
        <div style={{ padding: 24 }}>{children}</div>
        {footer && <div style={{ padding: 16, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>{footer}</div>}
      </div>
    </div>,
    document.body
  );
};

// ─── Toast system ────────────────────────
const ToastContext = createContext(null);
const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((t) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { ...t, id }].slice(-3));
    setTimeout(() => setToasts(prev => prev.filter(x => x.id !== id)), 4000);
  }, []);
  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="toast-stack">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.kind === "success" ? "toast-success" : ""} ${t.kind === "error" ? "toast-error" : ""}`}>
            {t.kind === "success" && <I.CheckCircle size={16} style={{ color: "var(--success-700)" }} />}
            {t.kind === "error" && <I.AlertCircle size={16} style={{ color: "var(--danger-700)" }} />}
            {t.kind === "info" && <I.Info size={16} style={{ color: "var(--info-700)" }} />}
            {!t.kind && <I.CheckCircle size={16} style={{ color: "var(--text-muted)" }} />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
const useToast = () => useContext(ToastContext);

// ─── Empty State ────────────────────────
const EmptyState = ({ icon = <I.Triangle size={48} />, title, description, cta, secondary, variant = "centered" }) => {
  if (variant === "geometric") {
    return (
      <div style={{ textAlign: "center", padding: "80px 24px" }}>
        <div style={{
          width: 96, height: 96, margin: "0 auto 24px",
          background: "linear-gradient(135deg, var(--surface-2), var(--surface-3))",
          borderRadius: 24,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          color: "var(--text-muted)",
          border: "1px solid var(--border)",
        }}>{icon}</div>
        <div className="t-h1" style={{ marginBottom: 8 }}>{title}</div>
        {description && <div className="muted" style={{ maxWidth: 400, margin: "0 auto 24px" }}>{description}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          {cta}{secondary}
        </div>
      </div>
    );
  }
  if (variant === "dashed") {
    return (
      <div style={{
        border: "1.5px dashed var(--border-strong)", borderRadius: 12,
        padding: "64px 24px", textAlign: "center",
      }}>
        <div style={{ color: "var(--text-subtle)", marginBottom: 16 }}>{icon}</div>
        <div className="t-h2" style={{ marginBottom: 6 }}>{title}</div>
        {description && <div className="muted" style={{ maxWidth: 380, margin: "0 auto 20px" }}>{description}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>{cta}{secondary}</div>
      </div>
    );
  }
  // centered (default)
  return (
    <div style={{ textAlign: "center", padding: "80px 24px" }}>
      <div style={{ color: "var(--text-subtle)", marginBottom: 20, display: "inline-flex" }}>{icon}</div>
      <div className="t-h1" style={{ marginBottom: 8 }}>{title}</div>
      {description && <div className="muted" style={{ maxWidth: 420, margin: "0 auto 24px" }}>{description}</div>}
      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>{cta}{secondary}</div>
    </div>
  );
};

// ─── PageHeader ────────────────────────
const PageHeader = ({ title, subtitle, actions, back }) => (
  <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 24 }}>
    {back && (
      <button className="btn btn-ghost btn-icon" onClick={back} style={{ width: 36, height: 36, marginTop: 2 }} aria-label="Back">
        <I.ArrowLeft size={18} />
      </button>
    )}
    <div style={{ flex: 1, minWidth: 0 }}>
      <div className="t-display" style={{ fontSize: 28 }}>{title}</div>
      {subtitle && <div className="muted mt-1">{subtitle}</div>}
    </div>
    {actions && <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>{actions}</div>}
  </div>
);

// ─── Cmd-K Palette ────────────────────────
const CmdK = ({ open, onClose, onNav }) => {
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef();

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
    if (open) { setQ(""); setIdx(0); }
  }, [open]);

  const allItems = useMemo(() => {
    const data = window.APTUS_DATA;
    const items = [
      { group: "Recent",   icon: <I.FileText size={14} />, label: "Bursa Malaysia · Step 4 Adjust", action: () => onNav({ view: "assessment", id: "bursa-malaysia", step: 4 }) },
      { group: "Recent",   icon: <I.FileText size={14} />, label: "J60 Accounts Payable", action: () => onNav({ view: "assessment", id: "bursa-malaysia", step: 4, openScope: "J60" }) },
      { group: "Commands", icon: <I.Plus size={14} />,     label: "New assessment",      kbd: "⌘N", action: () => onNav({ view: "wizard" }) },
      { group: "Commands", icon: <I.Download size={14} />, label: "Export current assessment", kbd: "⌘E", action: () => onNav({ view: "assessment", id: "bursa-malaysia", step: 5 }) },
      { group: "Commands", icon: <I.Sparkles size={14} />, label: "Run AI Analysis", action: () => onNav({ view: "assessment", id: "bursa-malaysia", step: 3, runAI: true }) },
      { group: "Commands", icon: <I.Sun size={14} />,      label: "Toggle theme", kbd: "⌘.", action: () => window.__aptusToggleTheme && window.__aptusToggleTheme() },
      { group: "Navigate", icon: <I.Home size={14} />,     label: "Home",        action: () => onNav({ view: "home" }) },
      { group: "Navigate", icon: <I.List size={14} />,     label: "Assessments", action: () => onNav({ view: "assessments" }) },
      { group: "Navigate", icon: <I.Layers size={14} />,   label: "Templates",   action: () => onNav({ view: "templates" }) },
      { group: "Navigate", icon: <I.Settings size={14} />, label: "Settings",    action: () => onNav({ view: "settings" }) },
    ];
    data.scopeItems.slice(0, 8).forEach(s => {
      items.push({ group: "Scope items", icon: <I.Folder size={14} />, label: `${s.id} · ${s.name}`, action: () => onNav({ view: "assessment", id: "bursa-malaysia", step: 4, openScope: s.id }) });
    });
    return items;
  }, [onNav]);

  const filtered = useMemo(() => {
    if (!q) return allItems;
    const lc = q.toLowerCase();
    return allItems.filter(it => it.label.toLowerCase().includes(lc) || it.group.toLowerCase().includes(lc));
  }, [q, allItems]);

  useEffect(() => { setIdx(0); }, [q]);

  const handleKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx(i => Math.min(filtered.length - 1, i + 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setIdx(i => Math.max(0, i - 1)); }
    if (e.key === "Enter") { e.preventDefault(); const it = filtered[idx]; if (it) { it.action(); onClose(); } }
  };

  if (!open) return null;
  const groups = {};
  filtered.forEach((it, i) => { (groups[it.group] = groups[it.group] || []).push({ ...it, _i: i }); });

  return ReactDOM.createPortal(
    <div className="modal-overlay" onClick={onClose} style={{ alignItems: "flex-start", paddingTop: "12vh" }}>
      <div className="cmdk" onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", padding: "0 16px", borderBottom: "1px solid var(--border)" }}>
          <I.Search size={16} style={{ color: "var(--text-muted)" }} />
          <input
            ref={inputRef}
            className="cmdk-input"
            style={{ borderBottom: "none" }}
            placeholder="Type a command or search…"
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={handleKey}
          />
        </div>
        <div className="cmdk-results">
          {Object.keys(groups).length === 0 && <div style={{ padding: 24, textAlign: "center" }} className="muted">No results.</div>}
          {Object.entries(groups).map(([gname, items]) => (
            <div key={gname}>
              <div className="cmdk-group-label">{gname}</div>
              {items.map(it => (
                <div key={it._i} className={`cmdk-item ${it._i === idx ? "active" : ""}`} onMouseEnter={() => setIdx(it._i)} onClick={() => { it.action(); onClose(); }}>
                  <span style={{ color: "var(--text-muted)" }}>{it.icon}</span>
                  {it.label}
                  {it.kbd && <kbd>{it.kbd}</kbd>}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 12, padding: "8px 16px", borderTop: "1px solid var(--border)", fontSize: 11, color: "var(--text-muted)" }}>
          <span><kbd style={{ padding: "1px 5px", border: "1px solid var(--border)", borderRadius: 3 }}>↑↓</kbd> navigate</span>
          <span><kbd style={{ padding: "1px 5px", border: "1px solid var(--border)", borderRadius: 3 }}>↵</kbd> open</span>
          <span><kbd style={{ padding: "1px 5px", border: "1px solid var(--border)", borderRadius: 3 }}>esc</kbd> close</span>
        </div>
      </div>
    </div>,
    document.body
  );
};

// Export to window
Object.assign(window, {
  Icon, I, AptusMark, AptusWordmark, StatusPill, CoverageBar, StepRail, STEPS,
  Topbar, SideRail, Drawer, Modal, ToastProvider, useToast, EmptyState, PageHeader, CmdK,
});
