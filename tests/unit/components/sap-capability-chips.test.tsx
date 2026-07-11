import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { CapabilityChips } from "@/components/sap/capability/CapabilityChips";

function labels(el: HTMLElement): string[] {
  return [...el.querySelectorAll("span")].map((s) => s.textContent ?? "").filter(Boolean);
}

describe("CapabilityChips — never fabricates 'read'", () => {
  it("un-probed OData row (no capability) shows 'not probed', NEVER 'read'", () => {
    const { container } = render(<CapabilityChips contentType="API" apiType="ODATAV2" />);
    const text = container.textContent ?? "";
    expect(text).toContain("not probed");
    expect(text).not.toContain("read");
    expect(text).not.toContain("write");
  });

  it("SOAP row shows its modality, not 'read'", () => {
    const { container } = render(<CapabilityChips contentType="API" apiType="SOAP" />);
    const text = container.textContent ?? "";
    expect(text).toContain("SOAP");
    expect(text).not.toContain("read");
  });

  it("null apiType (unprobed) makes NO CRUD claim at all", () => {
    const { container } = render(<CapabilityChips contentType="API" apiType={null} />);
    expect(container.textContent).toBe("");
  });

  it("a confirmed CRUD capability shows read + write", () => {
    const { container } = render(<CapabilityChips contentType="API" apiType="ODATAV2" capability={{ read: true, write: true }} />);
    const text = container.textContent ?? "";
    expect(text).toContain("read");
    expect(text).toContain("write");
  });

  it("a read-only capability shows read WITHOUT write", () => {
    const { container } = render(<CapabilityChips contentType="API" capability={{ read: true, write: false }} />);
    const text = container.textContent ?? "";
    expect(text).toContain("read");
    expect(text).not.toContain("write");
  });

  it("a write-only capability shows write WITHOUT read (create/update/delete-only)", () => {
    const { container } = render(<CapabilityChips contentType="API" capability={{ read: false, write: true }} />);
    const text = container.textContent ?? "";
    expect(text).toContain("write");
    expect(text).not.toContain("read");
  });

  it("EVENT → subscribe; reference type → reference (unchanged)", () => {
    expect(labels(render(<CapabilityChips contentType="EVENT" />).container as HTMLElement)).toContain("subscribe");
    expect(labels(render(<CapabilityChips contentType="BADI" />).container as HTMLElement)).toContain("reference");
  });
});
