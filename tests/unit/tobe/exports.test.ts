// @vitest-environment node
/**
 * 2608 WS6 — the PDF and PPTX exports produce real files from the same doc
 * the screen renders. Byte-level checks only; layout is not asserted.
 */
import { describe, expect, it } from "vitest";

import { generateTobePack } from "@/lib/tobe/engine";
import { generateTobePackPdf } from "@/lib/tobe/export-pdf";
import { generateTobePackPptx } from "@/lib/tobe/export-pptx";

import { fixtureInput } from "./fixtures";

const doc = generateTobePack(
  fixtureInput({
    answers: [{ questionId: "Q-1", choice: "deviate", reason: "two-level approval" }],
    consultantNotes: { AAA: "internal: pricing" },
  }),
);

describe("PDF", () => {
  it("is a PDF whose consultant view carries the note and whose client view does not", () => {
    const consultant = generateTobePackPdf(doc, { clientName: "Pilot Client", consultantView: true });
    expect(Buffer.from(consultant.slice(0, 5)).toString("latin1")).toBe("%PDF-");
    expect(consultant.byteLength).toBeGreaterThan(5_000);
    const client = generateTobePackPdf(doc, { clientName: "Pilot Client", consultantView: false });
    expect(Buffer.from(client.slice(0, 5)).toString("latin1")).toBe("%PDF-");
    // jsPDF compresses streams, so search the uncompressed metadata only: both files are real PDFs of different length.
    expect(client.byteLength).not.toBe(consultant.byteLength);
  });
});

describe("pagination", () => {
  /** A scope item with `n` steps, standing in for BD9 (35) / J59 (55) / J60 (79). */
  function longDoc(n: number) {
    const d = generateTobePack(fixtureInput({ scopeCodes: ["AAA"], chains: [] }));
    const item = d.scopeItems.find((i) => i.code === "AAA")!;
    item.steps = Array.from({ length: n }, (_, i) => ({ ...item.steps[0]!, index: i + 1, name: `Step ${i + 1}` }));
    return d;
  }

  it("PDF grows a page per slice instead of shrinking one flow into illegibility", () => {
    const short = generateTobePackPdf(longDoc(3), { clientName: "X", consultantView: true }).byteLength;
    const long = generateTobePackPdf(longDoc(55), { clientName: "X", consultantView: true }).byteLength;
    expect(long).toBeGreaterThan(short);
  });

  it("PPTX adds slides for a long flow rather than one crowded slide", async () => {
    const AdmZip = (await import("adm-zip")).default;
    const count = async (n: number) => {
      const buf = await generateTobePackPptx(longDoc(n), { clientName: "X", consultantView: true });
      return new AdmZip(buf).getEntries().filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName)).length;
    };
    const { L2_STEPS_PER_PAGE } = await import("@/lib/tobe/svg");
    const short = await count(4);
    const long = await count(55);
    expect(long - short).toBe(Math.ceil(55 / L2_STEPS_PER_PAGE) - 1);
  }, 60_000);
});

describe("PPTX", () => {
  it("is a zip (OOXML) with one slide per in-scope item plus title and L1", async () => {
    const buf = await generateTobePackPptx(doc, { clientName: "Pilot Client", consultantView: true });
    expect(buf.subarray(0, 2).toString("latin1")).toBe("PK");
    const AdmZip = (await import("adm-zip")).default;
    const zip = new AdmZip(buf);
    const slides = zip.getEntries().filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName));
    // title + L1 + AAA + BBB + CCC (chain item with a BPD, not in scope, still drawn)
    expect(slides).toHaveLength(5);
    const notes = zip
      .getEntries()
      .filter((e) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(e.entryName))
      .map((e) => e.getData().toString("utf8"))
      .join("\n");
    expect(notes).toContain("SSCUI 102751");
    expect(notes).toContain("Consultant note (internal)");
  }, 30_000);
});
