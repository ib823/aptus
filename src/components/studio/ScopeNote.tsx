/**
 * ScopeNote — says what CoreEdge is not, where someone is most likely to assume
 * otherwise.
 *
 * A console that governs SAP integrations sits close enough to "SAP development"
 * that people reasonably expect it to do more: edit ABAP, deploy, host their
 * app. Letting them find out otherwise mid-sprint is expensive, and the fix is
 * one sentence in the right place rather than a paragraph in a wiki nobody
 * opens.
 */

export type ScopeTopic = "abap" | "byo-stack" | "no-editor";

const NOTES: Record<ScopeTopic, { title: string; body: string }> = {
  abap: {
    title: "Building ABAP? That stays in ADT.",
    body:
      "CoreEdge governs the OData your ABAP exposes — it does not build, transport or deploy ABAP. " +
      "Publish an OData service (RAP or a CDS view) and it appears here like any other capability, " +
      "with status from a real probe against this tenant.",
  },
  "byo-stack": {
    title: "Your stack stays yours.",
    body:
      "The OpenAPI contract is the portable artifact — generate a client in Python, Go, Java or " +
      "anything else. Your database, framework and CI are not CoreEdge's business.",
  },
  "no-editor": {
    title: "This is a hand-off, not an editor.",
    body:
      "The scaffold produces files you download and take to your own repository. There is no " +
      "in-browser workspace, and the solution's application code never lives here.",
  },
};

export function ScopeNote({ topic }: { topic: ScopeTopic }) {
  const note = NOTES[topic];
  return (
    <aside
      style={{
        background: "var(--surface-ink-tint)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-card-warm, 12px)",
        padding: "12px 16px",
      }}
    >
      <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 600, color: "var(--ink-primary)" }}>
        {note.title}
      </p>
      <p style={{ margin: 0, fontSize: 13, lineHeight: "20px", color: "var(--ink-secondary)" }}>
        {note.body}{" "}
        <a href="/docs/coreedge-developer-guide.md" style={{ color: "var(--brand-navy)" }}>
          Developer guide
        </a>
      </p>
    </aside>
  );
}
