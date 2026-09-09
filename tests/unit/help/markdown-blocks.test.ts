import { describe, expect, it } from "vitest";
import { splitMarkdownBlocks } from "@/lib/help/markdown-blocks";

describe("Markdown parsing across checkout line endings", () => {
  const lines = ["# Guide", "", "A paragraph", "continued.", "", "- One", "- Two", "", "---", "", "```ts", "const a = 1;", "```", "", "| A | B |", "| - | - |"];
  it.each(["\n", "\r\n", "\r"])("parses %j line endings identically and terminates", (eol) => {
    expect(splitMarkdownBlocks(lines.join(eol))).toEqual([
      { kind: "heading", depth: 1, text: "Guide" },
      { kind: "paragraph", text: "A paragraph continued." },
      { kind: "list", items: ["One", "Two"] },
      { kind: "rule" },
      { kind: "pre", text: "const a = 1;" },
      { kind: "pre", text: "| A | B |\n| - | - |" },
    ]);
  });
  it("consumes unsupported and malformed block starts without stalling", () => {
    expect(splitMarkdownBlocks("##### Unsupported\n#\n*\n---x")).toEqual([
      { kind: "paragraph", text: "##### Unsupported # * ---x" },
    ]);
    expect(splitMarkdownBlocks("# title\u2028suffix")[0]?.kind).toBe("paragraph");
  });
  it("handles an unclosed fence and mixed line endings", () => {
    expect(splitMarkdownBlocks("# A\r\n\r\n```\nx\ry")).toEqual([
      { kind: "heading", depth: 1, text: "A" }, { kind: "pre", text: "x\ny" },
    ]);
  });
});
