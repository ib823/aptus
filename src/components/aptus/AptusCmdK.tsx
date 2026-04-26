"use client";

/**
 * AptusCmdK — global command palette (⌘K / Ctrl+K) per spec §7.3.
 * Source: docs/design/v1.2/components.jsx (the prototype's CmdK).
 *
 * Renders a modal with a search input + grouped, keyboard-navigable results:
 *   - ↑↓ to navigate
 *   - ↵ to activate
 *   - esc to close
 *
 * Item types:
 *   - Navigate:  go to a route (Home, Assessments, Templates, Settings)
 *   - Commands:  trigger an action (New assessment, Export, Toggle theme)
 *   - Recent:    recently-viewed assessments (out-of-scope for v1 — placeholder)
 *
 * Provider pattern: <AptusCmdKProvider> mounts the modal + listens for the
 * keyboard shortcut. Use the `useAptusCmdK()` hook anywhere to programmatically
 * open the palette (e.g., from the topbar search trigger click).
 */

import {
  Download,
  FileText,
  Home,
  LayoutTemplate,
  ListChecks,
  Plus,
  Search,
  Settings as SettingsIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

interface CmdKItem {
  group: "Navigate" | "Commands";
  icon: React.ReactNode;
  label: string;
  /** Keyboard shortcut (display only — not actually bound). */
  kbd?: string;
  action: () => void;
}

// ── Provider + hook ────────────────────────────────────────────────────────

interface CmdKContextValue {
  open: () => void;
  close: () => void;
  isOpen: boolean;
}

const CmdKContext = createContext<CmdKContextValue | null>(null);

export function useAptusCmdK(): CmdKContextValue {
  const ctx = useContext(CmdKContext);
  if (!ctx) {
    // Allow no-op outside of provider so callers don't need to guard.
    return { open: () => {}, close: () => {}, isOpen: false };
  }
  return ctx;
}

interface AptusCmdKProviderProps {
  children: React.ReactNode;
}

export function AptusCmdKProvider({ children }: AptusCmdKProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  // Bind the global keyboard shortcut (⌘K on Mac, Ctrl+K elsewhere)
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  return (
    <CmdKContext.Provider value={{ open, close, isOpen }}>
      {children}
      <AptusCmdK open={isOpen} onClose={close} />
    </CmdKContext.Provider>
  );
}

// ── The palette modal ──────────────────────────────────────────────────────

interface AptusCmdKProps {
  open: boolean;
  onClose: () => void;
}

function AptusCmdK({ open, onClose }: AptusCmdKProps) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state on open + autofocus
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
      setQ("");
      setIdx(0);
    }
  }, [open]);

  const allItems = useMemo<CmdKItem[]>(
    () => [
      {
        group: "Commands",
        icon: <Plus size={14} />,
        label: "New assessment",
        kbd: "⌘N",
        action: () => router.push("/assessments/new"),
      },
      {
        group: "Commands",
        icon: <Download size={14} />,
        label: "Browse assessments",
        kbd: "⌘E",
        action: () => router.push("/assessments"),
      },
      {
        group: "Navigate",
        icon: <Home size={14} />,
        label: "Home",
        action: () => router.push("/"),
      },
      {
        group: "Navigate",
        icon: <ListChecks size={14} />,
        label: "Assessments",
        action: () => router.push("/assessments"),
      },
      {
        group: "Navigate",
        icon: <LayoutTemplate size={14} />,
        label: "Templates",
        action: () => router.push("/templates"),
      },
      {
        group: "Navigate",
        icon: <SettingsIcon size={14} />,
        label: "Settings",
        action: () => router.push("/settings"),
      },
      {
        group: "Navigate",
        icon: <FileText size={14} />,
        label: "Design system",
        action: () => router.push("/design-system"),
      },
    ],
    [router],
  );

  const filtered = useMemo(() => {
    if (!q) return allItems;
    const lc = q.toLowerCase();
    return allItems.filter(
      (it) => it.label.toLowerCase().includes(lc) || it.group.toLowerCase().includes(lc),
    );
  }, [q, allItems]);

  // Reset selection when query changes
  useEffect(() => {
    setIdx(0);
  }, [q]);

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIdx((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const it = filtered[idx];
      if (it) {
        it.action();
        onClose();
      }
    }
  };

  if (!open) return null;

  // Group items by section
  const groups = filtered.reduce<Record<string, Array<CmdKItem & { _i: number }>>>(
    (acc, it, i) => {
      const list = acc[it.group] ?? [];
      list.push({ ...it, _i: i });
      acc[it.group] = list;
      return acc;
    },
    {},
  );

  return (
    <div
      className="aptus-app a-modal-overlay"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        zIndex: 60,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "12vh",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 600,
          maxWidth: "90vw",
          background: "var(--aptus-surface)",
          border: "1px solid var(--aptus-border)",
          borderRadius: 12,
          boxShadow: "var(--aptus-shadow-lg)",
          overflow: "hidden",
          color: "var(--aptus-text)",
        }}
      >
        {/* Search input */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "0 16px",
            borderBottom: "1px solid var(--aptus-border)",
            gap: 8,
          }}
        >
          <Search size={16} style={{ color: "var(--aptus-text-muted)", flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Type a command or search…"
            style={{
              width: "100%",
              height: 48,
              border: "none",
              background: "transparent",
              outline: "none",
              fontSize: 15,
              color: "var(--aptus-text)",
              fontFamily: "inherit",
            }}
          />
        </div>

        {/* Results */}
        <div style={{ maxHeight: 360, overflowY: "auto", padding: 8 }}>
          {Object.keys(groups).length === 0 && (
            <div className="a-muted" style={{ padding: 24, textAlign: "center", fontSize: 13 }}>
              No results.
            </div>
          )}
          {Object.entries(groups).map(([gname, items]) => (
            <div key={gname}>
              <div
                style={{
                  padding: "8px 10px 4px",
                  fontSize: 11,
                  color: "var(--aptus-text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  fontWeight: 600,
                }}
              >
                {gname}
              </div>
              {items.map((it) => (
                <button
                  key={it._i}
                  type="button"
                  onMouseEnter={() => setIdx(it._i)}
                  onClick={() => {
                    it.action();
                    onClose();
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 10px",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontSize: 13,
                    width: "100%",
                    background: it._i === idx ? "var(--aptus-surface-2)" : "transparent",
                    border: "none",
                    color: "var(--aptus-text)",
                    fontFamily: "inherit",
                    textAlign: "left",
                  }}
                >
                  <span style={{ color: "var(--aptus-text-muted)" }}>{it.icon}</span>
                  {it.label}
                  {it.kbd && (
                    <kbd
                      style={{
                        marginLeft: "auto",
                        fontSize: 11,
                        color: "var(--aptus-text-muted)",
                      }}
                    >
                      {it.kbd}
                    </kbd>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Footer with shortcuts */}
        <div
          style={{
            display: "flex",
            gap: 12,
            padding: "8px 16px",
            borderTop: "1px solid var(--aptus-border)",
            fontSize: 11,
            color: "var(--aptus-text-muted)",
          }}
        >
          <span>
            <kbd style={kbdStyle}>↑↓</kbd> navigate
          </span>
          <span>
            <kbd style={kbdStyle}>↵</kbd> open
          </span>
          <span>
            <kbd style={kbdStyle}>esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}

const kbdStyle: React.CSSProperties = {
  padding: "1px 5px",
  border: "1px solid var(--aptus-border)",
  borderRadius: 3,
  marginRight: 4,
};
