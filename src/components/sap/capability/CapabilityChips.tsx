/**
 * CapabilityChips — capability KIND chips (design-token contract §1).
 * read→decision-standard, write→decision-custom, subscribe→decision-configure,
 * n/a→decision-open. With `entities` (from a live probe / item detail) the chips
 * reflect confirmed C/R/U/D; without them (the list) they reflect the kind by
 * content type. Colour via var(--token) only.
 */
import type { HubContentType } from "@/lib/sap-public/hub-content";
import { isRuntimeType } from "@/lib/sap-public/hub-content";

interface EntityCap {
  readable: boolean;
  creatable: boolean | null;
  updatable: boolean | null;
  deletable: boolean | null;
}

const CHIP: Record<string, string> = {
  read: "var(--decision-standard)",
  write: "var(--decision-custom)",
  subscribe: "var(--decision-configure)",
  na: "var(--decision-open)",
  reference: "var(--decision-open)",
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
  entities,
  subscribe,
}: {
  contentType: HubContentType;
  entities?: EntityCap[] | null;
  subscribe?: boolean;
}) {
  const chips: Array<{ label: string; key: string }> = [];

  if (contentType === "EVENT" || subscribe) {
    chips.push({ label: "subscribe", key: "subscribe" });
  } else if (!isRuntimeType(contentType)) {
    chips.push({ label: "reference", key: "reference" });
  } else if (entities && entities.length > 0) {
    // Confirmed capabilities from $metadata.
    if (entities.some((e) => e.readable)) chips.push({ label: "read", key: "read" });
    if (entities.some((e) => e.creatable === true)) chips.push({ label: "write", key: "write" });
    if (chips.length === 0) chips.push({ label: "n/a", key: "na" });
  } else {
    // List view (no probe yet): an OData runtime service is read-capable by kind.
    chips.push({ label: "read", key: "read" });
  }

  return (
    <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
      {chips.map((c) => (
        <Chip key={c.key} label={c.label} color={CHIP[c.key] ?? "var(--decision-open)"} />
      ))}
    </span>
  );
}
