// @vitest-environment node
/** Generate with Node's binary types; use a separate DOM only to inspect XML. */
import { afterAll, beforeAll, expect, it } from "vitest";
import { createRequire } from "node:module";
import { generateTobePack } from "@/lib/tobe/engine";
import { generateTobePackPptx } from "@/lib/tobe/export-pptx";
import { fixtureInput } from "./fixtures";

const doc = generateTobePack(fixtureInput());
let parser: DOMParser;
let closeDom: () => void;
beforeAll(() => {
  const require = createRequire(import.meta.url);
  const { JSDOM } = require("jsdom") as { JSDOM: new () => { window: Window & typeof globalThis } };
  const dom = new JSDOM();
  parser = new dom.window.DOMParser();
  closeDom = () => dom.window.close();
}, 60_000);
afterAll(() => closeDom?.());

it("preserves slide text, native geometry and relationships without image parsing", async () => {
  const AdmZip = (await import("adm-zip")).default;
  const zip = new AdmZip(await generateTobePackPptx(doc, { clientName: "Pilot Client", consultantView: true }));
  const slideEntries = zip.getEntries().filter((entry) => /^ppt\/slides\/slide\d+\.xml$/.test(entry.entryName));
  const slides = slideEntries.map((entry) => parser.parseFromString(entry.getData().toString("utf8"), "application/xml"));
  const texts = slides.map((slide) => Array.from(slide.getElementsByTagName("a:t")).map((node) => node.textContent).join(" ").replace(/\s+/g, " "));
  expect(texts[0]).toContain("To-Be Process Pack");
  expect(texts[0]).toContain("Pilot Client");
  expect(texts.join(" ")).toContain("Create Sales Quotation");
  const presentation = parser.parseFromString(zip.readAsText("ppt/presentation.xml"), "application/xml");
  const dimensions = presentation.getElementsByTagName("p:sldSz")[0]!;
  const width = Number(dimensions.getAttribute("cx"));
  const height = Number(dimensions.getAttribute("cy"));
  expect(width).toBeGreaterThan(height);
  let nativeShapes = 0;
  for (const slide of slides) {
    expect(slide.getElementsByTagName("p:pic")).toHaveLength(0);
    for (const shape of Array.from(slide.getElementsByTagName("p:sp"))) {
      const offset = shape.getElementsByTagName("a:off")[0];
      const extent = shape.getElementsByTagName("a:ext")[0];
      if (!offset || !extent) continue;
      nativeShapes++;
      const x = Number(offset.getAttribute("x"));
      const y = Number(offset.getAttribute("y"));
      const w = Number(extent.getAttribute("cx"));
      const h = Number(extent.getAttribute("cy"));
      expect([x, y, w, h].every(Number.isFinite)).toBe(true);
      expect(Math.min(x, y, w, h)).toBeGreaterThanOrEqual(0);
      // One point of tolerance for XML rounding at the slide edge.
      expect(x + w).toBeLessThanOrEqual(width + 12700);
      expect(y + h).toBeLessThanOrEqual(height + 12700);
    }
  }
  expect(nativeShapes).toBeGreaterThan(10);
  const relationships = parser.parseFromString(zip.readAsText("ppt/_rels/presentation.xml.rels"), "application/xml");
  const slideRelationships = Array.from(relationships.getElementsByTagName("Relationship"))
    .filter((rel) => rel.getAttribute("Type")?.endsWith("/slide"));
  expect(slideRelationships).toHaveLength(slideEntries.length);
  for (const rel of slideRelationships) {
    expect(zip.getEntry(`ppt/${rel.getAttribute("Target")}`)).not.toBeNull();
  }
}, 30_000);
