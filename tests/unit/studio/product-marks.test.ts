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
import { readdirSync, readFileSync } from "node:fs";
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

  it.each(Object.entries(all).map(([k, m]) => [k, m.glyph] as const))(
    "%s → %s",
    (_key, glyph) => {
      if (glyph === null) return; // null is a legitimate "no artwork"
      expect(
        existsSync(resolve(ROOT, "public", glyph.replace(/^\//, ""))),
        `${glyph} is referenced but not in public/`,
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
      if (!m.glyph) continue;
      const repoPath = `public${m.glyph}`;
      expect(tracked, `${repoPath} is on disk but not in the repository`).toContain(repoPath);
    }
  });

  it("keeps the marks small enough to serve", () => {
    // The originals are ~1.4MB each. Five of those on one screen is 7MB of
    // decorative payload, which is a performance defect dressed as branding.
    for (const m of Object.values(all)) {
      if (!m.glyph) continue;
      const bytes = readFileSync(resolve(ROOT, "public", m.glyph.replace(/^\//, ""))).length;
      expect(bytes, `${m.glyph} is ${(bytes / 1024).toFixed(0)}KB`).toBeLessThan(60 * 1024);
    }
  });
});

describe("every mark is the same square, and every tile the same box", () => {
  it("ships glyphs that are all one square size", async () => {
    /*
     * Different products have different symbols — a cloud is wide, a server
     * rack is tall — so the FILES must be a common square with the symbol
     * centred inside it. Otherwise a 56px render means a different optical
     * weight per product and the row of tiles looks ragged.
     */
    const sharp = (await import("sharp")).default;
    for (const m of Object.values({ ...PRODUCT_MARKS, ...UNSUPPORTED_PRODUCT_MARKS })) {
      if (!m.glyph) continue;
      const meta = await sharp(resolve(ROOT, "public", m.glyph.replace(/^\//, ""))).metadata();
      expect(meta.width, `${m.glyph} width`).toBe(128);
      expect(meta.height, `${m.glyph} height`).toBe(128);
      expect(meta.hasAlpha, `${m.glyph} must be transparent`).toBe(true);
    }
  });

  it("gives every product tile one fixed size", () => {
    /*
     * The tiles sized themselves to their contents, so "SAP SuccessFactors"
     * made a wider box than "SAP Ariba", and the edition line under Cloud ERP
     * made a taller one — three tiles, three shapes, conveying nothing.
     *
     * `all: unset` resets box-sizing to content-box, so without the explicit
     * border-box the padding and border are ADDED to the fixed numbers and the
     * tiles diverge again the moment either changes.
     */
    const client = readFileSync(
      resolve(ROOT, "src/components/studio/ConnectionsClient.tsx"),
      "utf8",
    );
    const tile = client.slice(client.indexOf("aria-pressed={selected}"));
    const box = tile.slice(0, tile.indexOf("</button>"));

    expect(box, "tile width is not fixed").toMatch(/width:\s*\d+/);
    expect(box, "tile height is not fixed").toMatch(/height:\s*\d+/);
    expect(box, "content-box would re-diverge the tiles").toContain('boxSizing: "border-box"');
    expect(box, "a content-sized tile is back").not.toContain("minWidth: 96");
  });

  it("reserves the edition line so tiles without one do not shift up", () => {
    const client = readFileSync(
      resolve(ROOT, "src/components/studio/ConnectionsClient.tsx"),
      "utf8",
    );
    // Rendered unconditionally — `?? ""` rather than a conditional that removes
    // the element on the two products that have no edition.
    expect(client).toContain('{mark?.edition ?? ""}');
    expect(client).not.toContain("{mark?.edition ? (");
  });
});

describe("the client-safe mirror agrees with the connector", () => {
  /*
   * PRODUCT_MARKS is imported by a browser bundle, so it cannot import
   * SAP_ODATA_PRODUCTS — that module reads env and performs fetches. The
   * duplication is deliberate and therefore has to be policed: a mirror nobody
   * checks is just a second list that drifts, which is the shape behind the
   * two-registry defect.
   */
  it.each(SAP_ODATA_PRODUCTS.map((p) => [p.key, p.addressesClient] as const))(
    "%s addressesClient=%s matches the mark",
    (key, addressesClient) => {
      expect(PRODUCT_MARKS[key]?.addressesClient, `${key} disagrees`).toBe(addressesClient);
    },
  );

  it("offers every connector product in the picker", () => {
    // PRODUCT_OPTIONS is derived from PRODUCT_MARKS, so a product present in
    // the connector and absent from the marks would be unofferable.
    for (const p of SAP_ODATA_PRODUCTS) {
      expect(Object.keys(PRODUCT_MARKS), `${p.key} cannot be selected`).toContain(p.key);
    }
  });

  it("shows the client field exactly where the API accepts one", () => {
    const client = readFileSync(
      resolve(ROOT, "src/components/studio/ConnectionsClient.tsx"),
      "utf8",
    );
    // Gated on the same flag the API validates against — not on a product list
    // written a third time in the component.
    expect(client).toContain("PRODUCT_MARKS[product]?.addressesClient");
    expect(client, "the picker enumerates products by hand again").not.toMatch(
      /PRODUCT_OPTIONS = \[\s*"/,
    );
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

describe("no surface renders the raw product key", () => {
  /*
   * THIS IS THE GUARD THAT WAS MISSING. The first pass fixed the Studio
   * connections table and left FIVE other surfaces printing `s4hana` — the
   * tenant switcher, two Ops tables and two Control Tower lines. The tenant
   * switcher is the most-seen control in the product.
   *
   * That is the same shape as the two-registry defect and the five routes that
   * knew only one of them: one concept, rendered from N inline expressions, and
   * nothing failing when N-1 of them are wrong. So this sweeps the tree rather
   * than pinning the one file that happened to be fixed first.
   */
  const SWEEP = ["src/components", "src/app"];

  function tsxFiles(dir: string): string[] {
    const out: string[] = [];
    for (const e of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) out.push(...tsxFiles(rel));
      else if (e.name.endsWith(".tsx")) out.push(rel);
    }
    return out;
  }

  const files = SWEEP.flatMap(tsxFiles);

  it("finds files to check, so a broken walk cannot pass vacuously", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("interpolates no bare `.product` into JSX text", () => {
    /*
     * Matches {c.product} / {t.product} / {product} sitting as rendered TEXT.
     * Not `product={...}` (a prop), not `${t.product}:${t.key}` (a React key),
     * and not `c.product ===` (a comparison) — those are legitimate.
     */
    const violations: string[] = [];

    for (const f of files) {
      const src = readFileSync(resolve(ROOT, f), "utf8")
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")   // JSX comments
        .replace(/\/\*[\s\S]*?\*\//g, "")         // block comments
        .replace(/\/\/[^\n]*/g, "");               // line comments

      for (const m of src.matchAll(/>\s*\{\s*(?:[A-Za-z_$][\w$]*\.)?product\s*\}/g)) {
        violations.push(`${f}: ${m[0].trim()}`);
      }
      // `{x.product} · {x.key}` — rendered text that does not start right after '>'
      for (const m of src.matchAll(/\{\s*[A-Za-z_$][\w$]*\.product\s*\}\s*(?:·|<\/)/g)) {
        violations.push(`${f}: ${m[0].trim()}`);
      }
    }

    expect(
      violations,
      `render the product NAME via <ProductLabel>, not the key:\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  it("routes every product render through the one component", () => {
    // Six surfaces showed the product. Six inline expressions is what drifted.
    const users = files.filter((f) =>
      readFileSync(resolve(ROOT, f), "utf8").includes("<ProductLabel"),
    );
    expect(users.length, "surfaces rendering a product").toBeGreaterThanOrEqual(4);
  });
});
