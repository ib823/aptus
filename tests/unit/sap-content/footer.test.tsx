/**
 * 2608 WS0 — the SAP content release footer renders the resolved release.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { SapContentReleaseFooter } from "@/components/sap-content/SapContentReleaseFooter";

const ORIGINAL = process.env.SAP_CONTENT_RELEASE;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.SAP_CONTENT_RELEASE;
  else process.env.SAP_CONTENT_RELEASE = ORIGINAL;
});

describe("SapContentReleaseFooter", () => {
  it("shows the 2602 default when SAP_CONTENT_RELEASE is unset", () => {
    delete process.env.SAP_CONTENT_RELEASE;
    const html = renderToStaticMarkup(<SapContentReleaseFooter />);
    expect(html).toContain("SAP content release 2602 · MY");
    expect(html).toContain('data-release="2602"');
  });

  it("shows 2608 · MY when SAP_CONTENT_RELEASE=2608", () => {
    process.env.SAP_CONTENT_RELEASE = "2608";
    const html = renderToStaticMarkup(<SapContentReleaseFooter />);
    expect(html).toContain("SAP content release 2608 · MY");
    expect(html).toContain('data-release="2608"');
    expect(html).toContain('data-localisation="MY"');
  });
});
