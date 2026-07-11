/**
 * CapabilityChips — capability KIND chips (design-token contract §1).
 * read→decision-standard, write→decision-custom, subscribe→decision-configure,
 * n/a→decision-open. Read/write come ONLY from a real probe: the `capability`
 * {read,write} is derived server-side by the shared deriveReadWrite (list route
 * for the ~60 probed rows, detail route for an opened row) so the collapsed list
 * chip can never contradict the expanded detail. Without a probe there is NO
 * "read" claim — an un-probed OData row shows a muted "not probed", SOAP shows
 * its modality, and a null-apiType row makes no CRUD claim at all.
 * Colour via var(--token) only.
 */
import type { HubContentType } from "@/lib/sap-public/hub-content";
import { isRuntimeType } from "@/lib/sap-public/hub-content";

const CHIP: Record<string, string> = {
  read: "var(--decision-standard)",
  write: "var(--decision-custom)",
  subscribe: "var(--decision-configure)",
  na: "var(--decision-open)",
  reference: "var(--decision-open)",
  soap: "var(--ink-muted)",
  notprobed: "var(--ink-muted)",
};

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 20,
        padding: "0 8px",
        borderRadius: "var(--radius-pill)",
        fontSize: 11,
        fontWeight: 600,
        color,
        border: `1px solid ${color}`,
        background: "transparent",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

export function CapabilityChips({
  contentType,
  apiType,
  capability,
  subscribe,
}: {
  contentType: HubContentType;
  /** Backend apiType (ODATAV2/ODATAV4/SOAP/…), used only for the un-probed modality hint. */
  apiType?: string | null;
  /** Real read/write from a live probe (shared deriveReadWrite). null/absent = not probed. */
  capability?: { read: boolean; write: boolean } | null;
  subscribe?: boolean;
}) {
  const chips: Array<{ label: string; key: string; title?: string }> = [];

  if (contentType === "EVENT" || subscribe) {
    chips.push({ label: "subscribe", key: "subscribe" });
  } else if (!isRuntimeType(contentType)) {
    chips.push({ label: "reference", key: "reference" });
  } else if (capability) {
    // Confirmed by a live probe — never fabricated.
    if (capability.read) chips.push({ label: "read", key: "read" });
    if (capability.write) chips.push({ label: "write", key: "write" });
    if (chips.length === 0) chips.push({ label: "n/a", key: "na" });
  } else {
    // Runtime, but NOT probed → never claim "read". Show modality instead.
    const t = (apiType ?? "").toUpperCase();
    if (t === "SOAP") {
      chips.push({ label: "SOAP", key: "soap", title: "SOAP service — not OData-readable; direction/CRUD confirmed only via the service contract." });
    } else if (t) {
      chips.push({ label: "not probed", key: "notprobed", title: "Read/write unknown until a live probe runs — open the item to probe." });
    }
    // null apiType → no CRUD claim at all (render nothing).
  }

  return (
    <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
      {chips.map((c) => (
        <span key={c.key} title={c.title}>
          <Chip label={c.label} color={CHIP[c.key] ?? "var(--decision-open)"} />
        </span>
      ))}
    </span>
  );
}
