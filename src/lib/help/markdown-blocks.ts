/**
 * A minimal markdown block splitter — NOT a markdown engine.
 *
 * Serves /help/developer-guide, which renders docs/coreedge-developer-guide.md
 * at request time. Fences and tables render preformatted (the guide's tables
 * are aligned in the source, so monospace is faithful); inline emphasis is
 * stripped rather than half-parsed. Lives here and not in the page module
 * because a Next.js page may only export the fields Next defines — exporting
 * the splitter from the page failed the build, which is exactly what the
 * pre-push hook exists to catch.
 */

/** One markdown block: what it is decides how it renders. */
export type MarkdownBlock =
  | { kind: "heading"; depth: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "pre"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "rule" };

export function splitMarkdownBlocks(md: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = md.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.trim() === "") {
      i++;
      continue;
    }
    if (/^```/.test(line)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i] ?? "")) {
        buf.push(lines[i] ?? "");
        i++;
      }
      i++; // closing fence
      blocks.push({ kind: "pre", text: buf.join("\n") });
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ kind: "heading", depth: heading[1]!.length, text: heading[2]! });
      i++;
      continue;
    }
    if (/^---+\s*$/.test(line)) {
      blocks.push({ kind: "rule" });
      i++;
      continue;
    }
    if (/^\|/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\|/.test(lines[i] ?? "")) {
        buf.push(lines[i] ?? "");
        i++;
      }
      blocks.push({ kind: "pre", text: buf.join("\n") });
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^[-*]\s+/, ""));
        i++;
      }
      blocks.push({ kind: "list", items });
      continue;
    }
    const buf: string[] = [];
    while (i < lines.length && (lines[i] ?? "").trim() !== "" && !/^(#{1,4})\s|^```|^\||^---+\s*$|^[-*]\s/.test(lines[i] ?? "")) {
      buf.push(lines[i] ?? "");
      i++;
    }
    blocks.push({ kind: "paragraph", text: buf.join(" ") });
  }
  return blocks;
}

/** Strip the emphasis markers the paragraph renderer does not interpret. */
export function stripInlineMarkdown(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1");
}
