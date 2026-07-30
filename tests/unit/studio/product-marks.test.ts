/**
 * Product presentation — names everywhere, marks only where they can be read.
 *
 * THE ARTWORK IS NOT AN ICON SET. Each supplied file is 1024×1024 marketing
 * imagery: an opaque grey gradient, a glow, and the product name rendered INTO
 * the picture. Dropped into a table cell or a dropdown at 20px, the embedded
 * text becomes illegible, the grey background fights the cream surfaces, and it
 * repeats a label already sitting beside it — the opposite of the readability it
 * was supplied to improve.
 *
 * So the split: `name` is used everywhere, `logo` only in tiles at 64px+.
 *
 * AND THE ARTWORK REVEALED THE ACTUAL DEFECT. The Connections table rendered
 * `c.product` — the raw key, `s4hana` — with no label at all. SAP has also
 * renamed the product to "SAP Cloud ERP", which the connector's own label does
 * not reflect. A missing name was the readability problem; a missing picture
 * was not.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { SAP_ODATA_PRODUCTS } from "@/lib/sap-public/tdd-connector";
import {
  PRODUCT_MARKS,
  UNSUPPORTED_PRODUCT_MARKS,
  productName,
} from "@/lib/studio/product-marks";

const ROOT = resolve(__dirname, "../../..");

describe("every supported product has a name", () => {
  it.each(SAP_ODATA_PRODUCTS.map((p) => [p.key] as const))(
    "%s is presentable",
    (key) => {
      // A product the connector serves but the UI cannot name would render its
      // raw key to a consultant, which is what this replaced.
      expect(PRODUCT_MARKS[key], `${key} has no mark`).toBeDefined();
      expect(PRODUCT_MARKS[key]!.name.length).toBeGreaterThan(3);
    },
  );

  it("falls back to the key, never to 'Unknown'", () => {
    // A key with no mark is still a real product someone configured. "Unknown
    // product" would be a claim; the key is a fact.
    expect(productName("some-future-product")).toBe("some-future-product");
  });
});

describe("every referenced image exists", () => {
  const all = { ...PRODUCT_MARKS, ...UNSUPPORTED_PRODUCT_MARKS };

  it.each(Object.entries(all).map(([k, m]) => [k, m.logo] as const))(
    "%s → %s",
    (_key, logo) => {
      if (logo === null) return; // null is a legitimate "no artwork"
      expect(
        existsSync(resolve(ROOT, "public", logo.replace(/^\//, ""))),
        `${logo} is referenced but not in public/`,
      ).toBe(true);
    },
  );

  it("is tracked by git, not merely present on this disk", () => {
    /*
     * existsSync passes on the machine that created the file, which is exactly
     * the machine where nobody notices it was never committed. `.gitignore` had
     * a blanket `*.png`, so `git add` reported success, the build passed, and
     * five broken images would have reached production.
     *
     * The same file records this happening before with `*.html` and the design
     * contracts. Once is an accident; a second time with a rule one line away
     * from the first is a gap in what the tests check.
     */
    const tracked = execFileSync("git", ["ls-files", "public/icons/sap"], {
      cwd: ROOT,
      encoding: "utf8",
    })
      .split("\n")
      .filter(Boolean);

    for (const m of Object.values(all)) {
      if (!m.logo) continue;
      const repoPath = `public${m.logo}`;
      expect(tracked, `${repoPath} is on disk but not in the repository`).toContain(repoPath);
    }
  });

  it("keeps the marks small enough to serve", () => {
    // The originals are ~1.4MB each. Five of those on one screen is 7MB of
    // decorative payload, which is a performance defect dressed as branding.
    for (const m of Object.values(all)) {
      if (!m.logo) continue;
      const bytes = readFileSync(resolve(ROOT, "public", m.logo.replace(/^\//, ""))).length;
      expect(bytes, `${m.logo} is ${(bytes / 1024).toFixed(0)}KB`).toBeLessThan(60 * 1024);
    }
  });
});

describe("unsupported products stay out of the picker", () => {
  it("does not offer a product the connector cannot serve", () => {
    /*
     * SAP Cloud ERP Private and on-premise S/4HANA have artwork but no product
     * entry — see docs/coreedge-sap-target-expansion-spec.md. Merging the two
     * maps would let the picker offer a product that cannot be connected, which
     * is the same defect class as a rail entry pointing at a 404.
     */
    const supported = new Set(SAP_ODATA_PRODUCTS.map((p) => p.key));
    for (const key of Object.keys(UNSUPPORTED_PRODUCT_MARKS)) {
      expect(supported.has(key), `${key} is listed as unsupported but IS served`).toBe(false);
      expect(PRODUCT_MARKS[key], `${key} is in both maps`).toBeUndefined();
    }
  });
});

describe("the table shows a name, not a key", () => {
  it("renders productName rather than the raw product field", () => {
    const client = readFileSync(
      resolve(ROOT, "src/components/studio/ConnectionsClient.tsx"),
      "utf8",
    );
    expect(client).toContain("productName(c.product)");
    expect(
      client,
      "the raw key is back in the table cell",
    ).not.toMatch(/<Td>\{c\.product\}<\/Td>/);
  });
});
