import { readFile } from "node:fs/promises";
import path from "node:path";

import type { Metadata } from "next";

import { splitMarkdownBlocks, stripInlineMarkdown as plain } from "@/lib/help/markdown-blocks";

export const metadata: Metadata = { title: "Developer guide" };

/**
 * /help/developer-guide — the CoreEdge developer guide, served.
 *
 * WHY THIS PAGE EXISTS. Studio's ScopeNote linked to
 * `/docs/coreedge-developer-guide.md` — a path no route and no public/ file has
 * ever served. The one document written to stop developers misreading the
 * product's boundary 404'd from the two screens (Discover, Test Console) where
 * that misreading starts. A dead link teaches people the links are decorative,
 * which is the same lesson a rail entry that 404s teaches — and this codebase
 * has a rule about those.
 *
 * THE SOURCE OF TRUTH STAYS docs/coreedge-developer-guide.md, read at request
 * time — not copied into a constant that would drift from the file the repo
 * reviews. `outputFileTracingIncludes` in next.config.ts ships the file with
 * this function on Vercel. The renderer (lib/help/markdown-blocks) is
 * deliberately minimal and dependency-free: headings, paragraphs, fences and
 * tables — enough to read, nothing to maintain.
 *
 * Session-gated by the (help) layout, like the rest of the manual.
 */
export const dynamic = "force-dynamic";

export default async function DeveloperGuidePage() {
  const file = path.join(process.cwd(), "docs", "coreedge-developer-guide.md");
  let markdown: string;
  try {
    markdown = await readFile(file, "utf8");
  } catch {
    // The honest failure: say the document could not be read, never render a
    // stale copy baked in at some earlier build.
    return (
      <p style={{ fontSize: 14, color: "var(--ink-secondary)" }}>
        The developer guide could not be read from this deployment
        (docs/coreedge-developer-guide.md). It exists in the repository — this
        page serves it and found nothing to serve.
      </p>
    );
  }

  const blocks = splitMarkdownBlocks(markdown);
  return (
    <article style={{ maxWidth: 780 }}>
      {blocks.map((b, idx) => {
        switch (b.kind) {
          case "heading": {
            const sizes: Record<number, number> = { 1: 26, 2: 20, 3: 16, 4: 14 };
            return (
              <h2
                key={idx}
                style={{
                  margin: b.depth === 1 ? "0 0 8px" : "26px 0 8px",
                  fontSize: sizes[b.depth] ?? 14,
                  fontWeight: 700,
                  letterSpacing: "-0.01em",
                }}
              >
                {plain(b.text)}
              </h2>
            );
          }
          case "paragraph":
            return (
              <p key={idx} style={{ margin: "0 0 12px", fontSize: 14, lineHeight: "22px", color: "var(--ink-secondary)" }}>
                {plain(b.text)}
              </p>
            );
          case "pre":
            return (
              <pre
                key={idx}
                style={{
                  margin: "0 0 12px",
                  padding: 12,
                  overflowX: "auto",
                  fontSize: 12.5,
                  lineHeight: "19px",
                  background: "var(--surface-ink-tint)",
                  border: "1px solid var(--border-default)",
                  borderRadius: 8,
                }}
              >
                {b.text}
              </pre>
            );
          case "list":
            return (
              <ul key={idx} style={{ margin: "0 0 12px", paddingLeft: 20, fontSize: 14, lineHeight: "22px", color: "var(--ink-secondary)" }}>
                {b.items.map((item, j) => (
                  <li key={j}>{plain(item)}</li>
                ))}
              </ul>
            );
          case "rule":
            return <hr key={idx} style={{ margin: "20px 0", border: "none", borderTop: "1px solid var(--border-default)" }} />;
        }
      })}
    </article>
  );
}
