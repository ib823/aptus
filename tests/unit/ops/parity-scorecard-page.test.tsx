/**
 * The parity scorecard page (roadmap P1.9): "the page shows the build SHA and
 * matches the CI JSON".
 *
 * WHAT "MATCHES" IS CHECKED AGAINST. The page renders the committed
 * docs/coreedge/parity-scorecard.json, and CI fails when that file is not the
 * simulator's output (gap-simulator.test.ts, `pnpm coreedge:check`). This test
 * closes the other half: it renders the real page, as a platform
 * administrator, from the committed file, and compares every figure in its
 * tables with a FRESH simulator run made here, formatted the way the roadmap
 * formats it. A page that dropped a row, swapped two columns or formatted a
 * figure its own way fails here, whatever the file says.
 *
 * THE BUILD SHA comes from the serving deployment's environment, as
 * /api/build's does, so it is stubbed rather than read from git.
 *
 * THE GATE. The page renders its figures on the server, and a layout renders
 * concurrently with its page, so the page must refuse by itself: no session
 * redirects to sign-in, a non-administrator gets the platform-scoped refusal
 * with no figure in it, and an administrator who owes an MFA step-up is sent
 * to it before anything renders.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error("NEXT_REDIRECT:" + path);
  }),
}));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

import ParityScorecardPage from "@/app/(control-tower)/control-tower/parity/page";
import { formatCount, formatPct, PARITY_SCORECARD } from "@/lib/coreedge/parity-scorecard";

import { loadInputs, simulateAll } from "../../../scripts/coreedge/simulate-gap-matrix.mjs";

/** The parts of the simulator's (untyped, plain-Node) output this test reads. */
interface Figures {
  validScenarios: number;
  fullySupported: number;
  atLeastPartial: number;
  fullPct: number;
  partialPct: number;
  lifecycleFull: number;
  lifecycle: Record<string, number>;
  topBlockers: { cell: string; level: string; leverage: number; leveragePct: number; soleBlocker: number }[];
}
interface Fresh {
  totalPermutations: number;
  headlineHosting: string;
  integrationSuite: Figures;
  coreedgeToday: Figures;
  coreedgeTodayByHosting: Record<string, { fullySupported: number; atLeastPartial: number; fullPct: number; partialPct: number; network: Record<string, string> }>;
  phases: (Figures & { id: string })[];
}

// One fresh run of the simulator, independent of the committed file.
const fresh = simulateAll(loadInputs()) as unknown as Fresh;

const SHA = "3c15c8bf29c48267ce51f7865e83959cd51e3c17";
const share = (count: number, pct: number) => `${formatCount(count)} (${formatPct(pct)})`;
const LEVEL = ["none", "partial", "full"];
/** The roadmap's wording of a cell (render-roadmap-figures.mjs prettyCell). */
const label = (cell: string) => {
  const [t, rest] = cell.split(/:(.*)/) as [string, string];
  return `${t} ${rest.replace("|", " / ")}`;
};

const ADMIN = { id: "u1", role: "platform_admin", mfaVerified: true };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue(ADMIN);
  for (const name of ["VERCEL_GIT_COMMIT_SHA", "VERCEL_GIT_COMMIT_REF", "VERCEL_DEPLOYMENT_ID", "VERCEL_ENV"]) vi.stubEnv(name, "");
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

async function renderPage() {
  return render((await ParityScorecardPage()) as ReactElement);
}

/** A labelled table's body rows, as the text of their cells. */
function rowsOf(region: string): string[][] {
  const box = screen.getByRole("region", { name: region });
  return within(box)
    .getAllByRole("row")
    .slice(1)
    .map((tr) => within(tr).getAllByRole("cell").map((td) => td.textContent ?? ""));
}

describe("the page shows the build SHA", () => {
  it("prints the serving commit in full, with its branch, environment and deployment", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", SHA);
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "main");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_DEPLOYMENT_ID", "dpl_FPPFkFn53QZdAbRpYSfxJV3zR95w");
    await renderPage();

    const card = screen.getByRole("region", { name: "This build" });
    // The full SHA: the release protocol compares full SHAs, never a prefix.
    expect(within(card).getByText(SHA)).toBeTruthy();
    expect(card.textContent).toContain("main");
    expect(card.textContent).toContain("production");
    expect(card.textContent).toContain("dpl_FPPFkFn53QZdAbRpYSfxJV3zR95w");
    // The build card is the first thing after the heading, so the commit is never below the fold.
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings[0]).toBe("This build");
  });

  it("says no commit is recorded off Vercel, rather than printing a guess", async () => {
    const { container } = await renderPage();
    expect(screen.getByText(/No commit recorded: this is not a Vercel deployment/)).toBeTruthy();
    // The input digests are 64 characters; no 40-character commit appears anywhere.
    expect(container.textContent).not.toMatch(/(?<![0-9a-f])[0-9a-f]{40}(?![0-9a-f])/);
  });

  it("prints the input digests CI prints, and the matrix's revision date", async () => {
    await renderPage();
    const card = screen.getByRole("region", { name: "This build" });
    expect(card.textContent).toContain(PARITY_SCORECARD.inputs.matrix.sha256);
    expect(card.textContent).toContain(PARITY_SCORECARD.inputs.registry.sha256);
    expect(card.textContent).toContain(`revised ${PARITY_SCORECARD.inputs.matrix.revisedOn}`);
  });
});

describe("the page matches a fresh simulator run", () => {
  it("states the permutation and valid-scenario counts", async () => {
    await renderPage();
    expect(
      screen.getByText(
        new RegExp(`Of ${formatCount(fresh.totalPermutations)} permutations, ${formatCount(fresh.coreedgeToday.validScenarios)} are valid`),
      ),
    ).toBeTruthy();
  });

  it("headline: Integration Suite, CoreEdge today and after the last phase", async () => {
    await renderPage();
    const IS = fresh.integrationSuite;
    const CE = fresh.coreedgeToday;
    const last = fresh.phases[fresh.phases.length - 1]!;
    expect(rowsOf("Headline: Integration Suite and CoreEdge")).toEqual([
      ["Valid scenarios fully supported", share(IS.fullySupported, IS.fullPct), share(CE.fullySupported, CE.fullPct), share(last.fullySupported, last.fullPct)],
      ["Valid scenarios at least partly supported", share(IS.atLeastPartial, IS.partialPct), share(CE.atLeastPartial, CE.partialPct), share(last.atLeastPartial, last.partialPct)],
      ["Lifecycle stages full (of 18)", String(IS.lifecycleFull), String(CE.lifecycleFull), String(last.lifecycleFull)],
    ]);
  });

  it("phase by phase: every step's full, partial and lifecycle figures, then Integration Suite", async () => {
    await renderPage();
    const rows = rowsOf("CoreEdge phase by phase against Integration Suite");
    const steps = [{ ...fresh.coreedgeToday, id: "Today" }, ...fresh.phases];
    expect(rows).toHaveLength(steps.length + 1);
    steps.forEach((s, i) => {
      const [after, full, partial, lifecycle, , , , blockers] = rows[i]!;
      expect(after!.startsWith(s.id), `row ${i}`).toBe(true);
      expect([full, partial, lifecycle], s.id).toEqual([share(s.fullySupported, s.fullPct), share(s.atLeastPartial, s.partialPct), String(s.lifecycleFull)]);
      // The biggest remaining blockers, in the simulator's order.
      const named = s.topBlockers.slice(0, 3).map((b) => `${label(b.cell)} ${formatPct(b.leveragePct)} (sole ${formatCount(b.soleBlocker)})`);
      expect(blockers, s.id).toBe(named.join(""));
    });
    const IS = fresh.integrationSuite;
    expect(rows[steps.length]!.slice(0, 4)).toEqual([
      "Integration Suite (reference)",
      share(IS.fullySupported, IS.fullPct),
      share(IS.atLeastPartial, IS.partialPct),
      String(IS.lifecycleFull),
    ]);
  });

  it("ranked blockers: all of them, in the simulator's order, with its leverage and sole counts", async () => {
    await renderPage();
    const rows = rowsOf("Ranked blockers today");
    expect(rows.map((r) => r.slice(0, 5))).toEqual(
      fresh.coreedgeToday.topBlockers.map((b, i) => [
        String(i + 1),
        label(b.cell),
        b.level,
        share(b.leverage, b.leveragePct),
        formatCount(b.soleBlocker),
      ]),
    );
  });

  it("lifecycle stages: both platforms' levels, in the matrix's order", async () => {
    await renderPage();
    const rows = rowsOf("Lifecycle stages, Integration Suite and CoreEdge");
    const stages = Object.keys(fresh.coreedgeToday.lifecycle);
    expect(rows.map((r) => [r[0], r[2], r[3]])).toEqual(
      stages.map((s) => [s, LEVEL[fresh.integrationSuite.lifecycle[s]!], LEVEL[fresh.coreedgeToday.lifecycle[s]!]]),
    );
  });

  it("hosting: every mode's network reach and coverage, the headline marked", async () => {
    await renderPage();
    const rows = rowsOf("CoreEdge today by hosting mode");
    const networks = PARITY_SCORECARD.model.networks;
    expect(rows).toEqual(
      Object.entries(fresh.coreedgeTodayByHosting).map(([h, s]) => [
        h === fresh.headlineHosting ? `${h} (headline)` : h,
        ...networks.map((n) => s.network[n] ?? "none"),
        share(s.fullySupported, s.fullPct),
        share(s.atLeastPartial, s.partialPct),
      ]),
    );
  });

  it("says when each cell was last proved: not recorded", async () => {
    await renderPage();
    expect(screen.getByText("Last proved: not recorded")).toBeTruthy();
  });

  it("names a table's scroll box and lets the keyboard reach it, and reads a rating without a live region", async () => {
    const { container } = await renderPage();
    for (const box of screen.getAllByRole("region").filter((r) => r.tagName === "DIV")) {
      expect(box.getAttribute("tabindex"), box.getAttribute("aria-label") ?? "").toBe("0");
    }
    // Eighty-odd ratings in tables; none of them announces itself.
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(0);
  });
});

describe("the page gates itself, because the layout cannot", () => {
  it("sends a caller with no session to sign in before rendering anything", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    await expect(ParityScorecardPage()).rejects.toThrow("NEXT_REDIRECT:/presales/login");
  });

  it.each(["partner_lead", "executive_sponsor", "project_manager", "support", "consultant"])(
    "refuses %s with the platform-scoped panel and not one figure",
    async (role) => {
      mocks.getCurrentUser.mockResolvedValue({ id: "u2", role, mfaVerified: true });
      const { container } = await renderPage();
      expect(screen.getByRole("heading", { name: "The parity scorecard is platform-scoped" })).toBeTruthy();
      const text = container.textContent ?? "";
      expect(text).not.toContain(formatCount(fresh.integrationSuite.fullySupported));
      expect(text).not.toContain(PARITY_SCORECARD.inputs.matrix.sha256);
      expect(text).not.toMatch(/\d%/);
      expect(screen.queryByRole("table")).toBeNull();
    },
  );

  it("renders for the legacy admin role, which is a platform administrator", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u3", role: "admin", mfaVerified: true });
    await renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Parity scorecard" })).toBeTruthy();
  });

  it("sends an administrator who owes a step-up to verify before any figure renders", async () => {
    mocks.getCurrentUser.mockResolvedValue({ ...ADMIN, mfaVerified: false, organizationMfaPolicy: "required", hasWebAuthn: true });
    await expect(ParityScorecardPage()).rejects.toThrow("NEXT_REDIRECT:/verify-mfa?next=%2Fcontrol-tower%2Fparity");
  });

  it("sends one who must enrol first to enrolment", async () => {
    mocks.getCurrentUser.mockResolvedValue({ ...ADMIN, mfaVerified: false, organizationMfaPolicy: "required", hasWebAuthn: false });
    await expect(ParityScorecardPage()).rejects.toThrow(
      "NEXT_REDIRECT:/settings/security?mfa=required&next=%2Fcontrol-tower%2Fparity",
    );
  });
});
