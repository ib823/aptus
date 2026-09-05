/**
 * 2608 WS6 — To-Be Process Pack: generate → view → export, as the consultant.
 *
 * REQUIREMENTS: server booted with TOBE_PACK_ENABLED=true; TOBE_E2E=1. Runs
 * on the `consultant` project (authenticated consultant storage state — the
 * (workbench) layout redirects anonymous users to /presales/login).
 *
 * The e2e database is `prisma db push` with no seed, so the spec creates its
 * own engagement: the four O2C scope items (as AffirmScopeItem rows, upserted
 * without touching seeded ones) and an affirm bundle owned by the e2e
 * consultant. Steps come from the 2608 BPD data files, which need no database.
 */
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

const RUN = process.env.TOBE_E2E === "1";
const CLIENT = "E2E · To-Be pilot";
const CODES = ["1IQ", "BDG", "BD9", "J59"] as const;
/** Fixed id so parallel workers upsert one engagement instead of racing to create two. */
const BUNDLE_ID = "e2e-tobe-pilot-bundle";

const prisma = new PrismaClient();

// The three tests are one journey (no pack → generate → pack exists), so they
// run in order in one worker.
test.describe.configure({ mode: "serial" });

test.describe("To-Be Process Pack (2608 WS6)", () => {
  test.skip(!RUN, "Set TOBE_E2E=1 and boot with TOBE_PACK_ENABLED=true");

  test.beforeAll(async () => {
    const consultant = await prisma.user.findUnique({
      where: { email: "e2e-consultant@abeam.test" },
      select: { id: true },
    });
    if (!consultant) throw new Error("[tobe e2e] e2e consultant user missing — global-setup did not run");
    await prisma.affirmValueStream.upsert({
      where: { id: "lead-to-cash" },
      update: {},
      create: { id: "lead-to-cash", name: "Lead to Cash", displayOrder: 1 },
    });
    const sub = "lead-to-cash::order-to-cash";
    await prisma.affirmSubProcess.upsert({
      where: { id: sub },
      update: {},
      create: { id: sub, streamId: "lead-to-cash", name: "Order to Cash" },
    });
    for (const code of CODES) {
      await prisma.affirmScopeItem.upsert({
        where: { id: code },
        update: {},
        create: { id: code, subProcessId: sub, streamId: "lead-to-cash", description: `${code} (e2e)` },
      });
    }
    // Fresh journey every run: no packs, no answers, the four scope items.
    await prisma.affirmBundle.deleteMany({ where: { client: CLIENT, id: { not: BUNDLE_ID } } });
    await prisma.affirmBundle.upsert({
      where: { id: BUNDLE_ID },
      update: { client: CLIENT, state: "issued", country: "MY", createdById: consultant.id },
      create: {
        id: BUNDLE_ID,
        client: CLIENT,
        state: "issued",
        country: "MY",
        createdById: consultant.id,
        issuedAt: new Date(),
      },
    });
    await prisma.tobePack.deleteMany({ where: { bundleId: BUNDLE_ID } });
    await prisma.affirmResponse.deleteMany({ where: { bundleId: BUNDLE_ID } });
    await prisma.affirmBundleScopeItem.deleteMany({ where: { bundleId: BUNDLE_ID } });
    await prisma.affirmBundleScopeItem.createMany({
      data: CODES.map((scopeItemId) => ({ bundleId: BUNDLE_ID, scopeItemId })),
      skipDuplicates: true,
    });
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("the list shows the engagement without a pack, the hub advertises the surface", async ({ page }) => {
    await page.goto("/workbench");
    await expect(page.getByRole("link", { name: /Open to-be packs/ })).toBeVisible();
    await page.goto("/tobe");
    await expect(page.getByRole("heading", { name: "To-Be Process Packs" })).toBeVisible();
    const row = page.getByRole("row", { name: new RegExp(CLIENT) });
    await expect(row).toBeVisible();
    await expect(row.getByText("not generated")).toBeVisible();
  });

  test("generate → the L1, one L2 per scope item and the L3 tables render; export serves SVG, PDF and PPTX", async ({
    page,
  }) => {
    await page.goto(`/tobe/${BUNDLE_ID}`);
    await expect(page.getByRole("heading", { name: CLIENT })).toBeVisible();
    await expect(page.getByTestId("tobe-empty")).toBeVisible();

    await page.getByTestId("tobe-generate").click();
    await expect(page.getByTestId("tobe-pack")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("tobe-l1").locator("svg")).toBeVisible();
    for (const code of CODES) {
      await expect(page.getByTestId(`tobe-l2-${code}`).locator("svg")).toBeVisible();
      await expect(page.getByTestId(`tobe-item-${code}`).getByRole("table")).toBeVisible();
    }
    // Every step is standard with no answers: the pack never guesses.
    await expect(page.getByText(/Gap/).first()).toBeVisible();
    const gapCount = page.getByTestId("tobe-pack").locator("dl dd").nth(5);
    await expect(gapCount).toHaveText("0");

    const svg = await page.request.get(`/api/tobe/${BUNDLE_ID}/export?format=svg&level=l1`);
    expect(svg.status()).toBe(200);
    expect(svg.headers()["content-type"]).toContain("image/svg+xml");
    expect(await svg.text()).toContain('data-scope="BDG"');

    const pdf = await page.request.get(`/api/tobe/${BUNDLE_ID}/export?format=pdf`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toContain("application/pdf");
    expect((await pdf.body()).subarray(0, 5).toString("latin1")).toBe("%PDF-");

    const pptx = await page.request.get(`/api/tobe/${BUNDLE_ID}/export?format=pptx`);
    expect(pptx.status()).toBe(200);
    expect(pptx.headers()["content-type"]).toContain("presentationml");
    expect((await pptx.body()).subarray(0, 2).toString("latin1")).toBe("PK");

    // The list now shows the pack.
    await page.goto("/tobe");
    await expect(page.getByRole("row", { name: new RegExp(CLIENT) }).getByText(/inputs [0-9a-f]{12}/)).toBeVisible();
  });

  test("an unknown engagement is a clean 404, and export without a pack is a 404 JSON", async ({ page }) => {
    const res = await page.goto("/tobe/does-not-exist");
    expect(res?.status()).toBe(404);
    const api = await page.request.get("/api/tobe/does-not-exist/export?format=svg");
    expect(api.status()).toBe(404);
  });
});
