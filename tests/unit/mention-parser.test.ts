import { describe, it, expect } from "vitest";
import { parseMentions, extractMentionIds, escapeHtml } from "@/lib/collaboration/mention-parser";

describe("escapeHtml", () => {
  it("escapes ampersands", () => {
    expect(escapeHtml("A & B")).toBe("A &amp; B");
  });

  it("escapes angle brackets", () => {
    expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
  });

  it("escapes double quotes", () => {
    expect(escapeHtml('say "hello"')).toBe("say &quot;hello&quot;");
  });

  it("handles empty string", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("handles string with no special characters", () => {
    expect(escapeHtml("hello world")).toBe("hello world");
  });

  it("escapes multiple special characters in one string", () => {
    expect(escapeHtml('<a href="x">A & B</a>')).toBe(
      "&lt;a href=&quot;x&quot;&gt;A &amp; B&lt;/a&gt;"
    );
  });
});

describe("parseMentions", () => {
  it("extracts user IDs and generates HTML for mentions", () => {
    const input = "Hello @[John Doe](abc123), please review";
    const result = parseMentions(input);
    expect(result.userIds).toEqual(["abc123"]);
    expect(result.contentHtml).toContain('data-user-id="abc123"');
    expect(result.contentHtml).toContain("@John Doe");
  });

  it("handles multiple mentions", () => {
    const input = "@[Alice](user1) and @[Bob](user2) should check this";
    const result = parseMentions(input);
    expect(result.userIds).toEqual(["user1", "user2"]);
    expect(result.contentHtml).toContain("@Alice");
    expect(result.contentHtml).toContain("@Bob");
  });

  it("deduplicates user IDs", () => {
    const input = "@[Alice](user1) and @[Alice](user1) again";
    const result = parseMentions(input);
    expect(result.userIds).toEqual(["user1"]);
  });

  it("handles text with no mentions", () => {
    const input = "No mentions here";
    const result = parseMentions(input);
    expect(result.userIds).toEqual([]);
    expect(result.contentHtml).toBe("No mentions here");
  });

  it("handles empty string", () => {
    const result = parseMentions("");
    expect(result.userIds).toEqual([]);
    expect(result.contentHtml).toBe("");
  });

  it("escapes HTML in mention names", () => {
    const input = '@[<script>alert("xss")</script>](abc123)';
    const result = parseMentions(input);
    expect(result.userIds).toEqual(["abc123"]);
    expect(result.contentHtml).not.toContain("<script>");
    expect(result.contentHtml).toContain("&lt;script&gt;");
  });
});

describe("extractMentionIds", () => {
  it("returns user IDs from mentions", () => {
    const input = "Hey @[Alice](user1) and @[Bob](user2)";
    const ids = extractMentionIds(input);
    expect(ids).toEqual(["user1", "user2"]);
  });

  it("deduplicates IDs", () => {
    const input = "@[Alice](user1) @[Alice](user1)";
    const ids = extractMentionIds(input);
    expect(ids).toEqual(["user1"]);
  });

  it("returns empty array for no mentions", () => {
    expect(extractMentionIds("no mentions")).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(extractMentionIds("")).toEqual([]);
  });
});
