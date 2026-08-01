/**
 * Once a bundle is issued, it reads its OWN copy of every question.
 *
 * Question wording lives on the global AffirmQuestion bank, shared by every
 * bundle. Before the freeze, editing a question in any bundle's editor rewrote
 * it everywhere — including bundles already issued and already answered — so a
 * client could affirm "Adopt SAP standard" against wording that later changed
 * underneath the signed record.
 *
 * getAffirmSetForBundle is the read path for the client view and the review
 * screen, so this is where the guarantee has to hold.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const bundleFindUnique = vi.fn();
  const questionFindMany = vi.fn();
  return {
    bundleFindUnique,
    questionFindMany,
    prismaMock: {
      affirmBundle: { findUnique: bundleFindUnique },
      affirmQuestion: { findMany: questionFindMany },
    },
  };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }));

import { getAffirmSetForBundle } from "@/lib/affirm/queries";

/** What the shared bank says TODAY — i.e. possibly edited since issue. */
function bankRow(over: Record<string, unknown> = {}) {
  return {
    id: "L2-001",
    streamId: "finance",
    subProcessId: "finance::ap",
    scopeItemRefs: ["J60"],
    sapVerbatim: "SAP verbatim",
    plainLanguageSuggested: "bank suggested",
    consultantWording: "BANK WORDING TODAY",
    aboutText: "BANK ABOUT TODAY",
    standardMeans: "BANK STANDARD TODAY",
    sapArea: null,
    sapTopic: null,
    sscuiRef: null,
    status: "confirmed",
    flag: null,
    displayOrder: 1,
    isCustom: false,
    stream: { name: "Finance" },
    subProcess: { name: "Accounts Payable" },
    ...over,
  };
}

function joinRow(over: Record<string, unknown> = {}) {
  return {
    questionId: "L2-001",
    enabled: true,
    displayOrder: 1,
    format: "decision",
    frozenWording: null,
    frozenAboutText: null,
    frozenStandardMeans: null,
    frozenAt: null,
    ...over,
  };
}

function serveBundle(joins: Record<string, unknown>[]) {
  mocks.bundleFindUnique.mockResolvedValue({
    scopeItems: [{ scopeItemId: "J60", scopeItem: { streamId: "finance" } }],
    questions: joins,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.questionFindMany.mockResolvedValue([bankRow()]);
});

describe("a draft bundle", () => {
  it("reads live from the question bank, because the consultant is still curating", async () => {
    serveBundle([joinRow()]);
    const [q] = await getAffirmSetForBundle("b1");
    expect(q!.consultantWording).toBe("BANK WORDING TODAY");
    expect(q!.aboutText).toBe("BANK ABOUT TODAY");
    expect(q!.standardMeans).toBe("BANK STANDARD TODAY");
  });
});

describe("an issued bundle", () => {
  it("shows the words frozen at issue, not the bank's current text", async () => {
    serveBundle([
      joinRow({
        frozenAt: new Date("2026-07-01T00:00:00Z"),
        frozenWording: "WORDING THE CLIENT SAW",
        frozenAboutText: "ABOUT THE CLIENT SAW",
        frozenStandardMeans: "STANDARD THE CLIENT SAW",
      }),
    ]);
    const [q] = await getAffirmSetForBundle("b1");
    expect(q!.consultantWording).toBe("WORDING THE CLIENT SAW");
    expect(q!.aboutText).toBe("ABOUT THE CLIENT SAW");
    expect(q!.standardMeans).toBe("STANDARD THE CLIENT SAW");
  });

  it("keeps a legitimately empty frozen field empty rather than falling back to the bank", async () => {
    // The freeze is keyed on frozenAt, not on frozenWording being truthy. A
    // question issued with no aboutText must stay that way; falling back would
    // show the client explanatory text that was not there when they answered.
    serveBundle([
      joinRow({
        frozenAt: new Date("2026-07-01T00:00:00Z"),
        frozenWording: "WORDING THE CLIENT SAW",
        frozenAboutText: null,
        frozenStandardMeans: null,
      }),
    ]);
    const [q] = await getAffirmSetForBundle("b1");
    expect(q!.aboutText).toBeNull();
    expect(q!.standardMeans).toBeNull();
  });

  it("is unaffected by a later edit to the shared bank", async () => {
    // The whole point: another bundle's editor rewrites L2-001, and this
    // already-answered bundle does not move.
    serveBundle([
      joinRow({
        frozenAt: new Date("2026-07-01T00:00:00Z"),
        frozenWording: "WORDING THE CLIENT SAW",
      }),
    ]);
    mocks.questionFindMany.mockResolvedValue([
      bankRow({ consultantWording: "REWRITTEN BY ANOTHER BUNDLE" }),
    ]);
    const [q] = await getAffirmSetForBundle("b1");
    expect(q!.consultantWording).toBe("WORDING THE CLIENT SAW");
  });

  it("still reads sapVerbatim from the bank, which is locked and never edited", async () => {
    serveBundle([
      joinRow({ frozenAt: new Date("2026-07-01T00:00:00Z"), frozenWording: "frozen" }),
    ]);
    const [q] = await getAffirmSetForBundle("b1");
    expect(q!.sapVerbatim).toBe("SAP verbatim");
  });
});
