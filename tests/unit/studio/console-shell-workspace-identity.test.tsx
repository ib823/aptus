/**
 * The whole shell agrees about which workspace you are in.
 *
 * THE DEFECT THIS CLOSES, and why the existing breadcrumb test did not.
 *
 * PR #173 fixed the top bar: the breadcrumb was `STUDIO_SECTIONS.find(...)`
 * with a literal "Developer Studio" fallback, so it announced Developer Studio
 * on every page of the other two workspaces. The fix threaded `workspaceLabel`
 * into `StudioTopBar` as a required prop — and the test written for it mounts
 * `StudioTopBar` ALONE.
 *
 * The rail was never touched. It carried three more literals:
 *
 *   const active = enabled && w.href === "/studio";      // always Studio
 *   <section aria-label="Developer Studio sections">
 *   <h2>Developer Studio</h2>
 *
 * So Control Tower rendered a Developer Studio highlight and a "DEVELOPER
 * STUDIO" heading directly above Control Tower's own section list. Half the
 * shell learned which workspace it was in; half did not. Nobody saw it because
 * both workspaces were unreachable in production until #177, and nothing opened
 * Control Tower until the owner did — and reported it immediately.
 *
 * A COMPONENT TEST IS NOT A SHELL TEST. That is the lesson worth encoding, so
 * this mounts `StudioShell` — rail, top bar and all — and asserts the three
 * surfaces that name a workspace agree with each other. Any one of them going
 * stale fails here.
 */

import { readFileSync } from "fs";
import path from "path";

import { describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import { RoleGatedEmptyState } from "@/components/studio/RoleGatedEmptyState";
import { StudioShell } from "@/components/studio/StudioShell";
import {
  CONTROL_TOWER_SECTIONS,
  OPERATIONS_SECTIONS,
  STUDIO_SECTIONS,
  type StudioSection,
} from "@/components/studio/StudioRail";
import { WORKSPACES, type StudioWorkspace } from "@/lib/studio/rbac";
import { stripSource } from "../../helpers/source";

const mockPath = vi.hoisted(() => ({ value: "/studio" }));

vi.mock("next/navigation", () => ({
  usePathname: () => mockPath.value,
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

const ALL: readonly StudioWorkspace[] = [
  "developer-studio",
  "operations-center",
  "control-tower",
];

const SECTIONS: Record<StudioWorkspace, readonly StudioSection[]> = {
  "developer-studio": STUDIO_SECTIONS,
  "operations-center": OPERATIONS_SECTIONS,
  "control-tower": CONTROL_TOWER_SECTIONS,
};

function mount(workspace: StudioWorkspace, pathname: string) {
  mockPath.value = pathname;
  return render(
    <StudioShell
      accessibleWorkspaces={ALL}
      sections={SECTIONS[workspace]}
      activeWorkspace={workspace}
      tenants={[]}
      activeTenantKey={null}
      roleLabel="Platform Admin"
      userEmail="platform-admin@abeam.test"
    >
      <div>content</div>
    </StudioShell>,
  );
}

/** The label the product uses for a workspace, from its single source. */
function labelOf(workspace: StudioWorkspace): string {
  const found = WORKSPACES.find((w) => w.key === workspace);
  if (!found) throw new Error(`no descriptor for ${workspace}`);
  return found.label;
}

describe("every workspace names itself consistently in all three places", () => {
  it.each(ALL)("%s", (workspace) => {
    cleanup();
    const label = labelOf(workspace);
    const home = SECTIONS[workspace][0]!;
    mount(workspace, home.href);

    // 1 — the workspace switcher highlights THIS workspace, and only it.
    const current = screen.getAllByRole("link", { current: "page" });
    const switcherCurrent = current.filter((el) =>
      WORKSPACES.some((w) => w.label === el.textContent?.trim()),
    );
    expect(switcherCurrent, `${label}: exactly one workspace may be current`).toHaveLength(1);
    expect(switcherCurrent[0]?.textContent?.trim()).toBe(label);

    // 2 — the section-group heading names this workspace, not another.
    const sectionNav = screen.getByLabelText(`${label} sections`);
    expect(within(sectionNav).getByRole("heading", { level: 2 }).textContent).toBe(label);

    // 3 — the breadcrumb agrees. On a home page it is the bare label.
    expect(screen.getByLabelText("Breadcrumb").textContent).toContain(label);
  });
});

describe("no other workspace's name leaks into the chrome", () => {
  it.each(ALL)("%s shows no sibling workspace as current or as its heading", (workspace) => {
    cleanup();
    const label = labelOf(workspace);
    mount(workspace, SECTIONS[workspace][0]!.href);

    for (const other of WORKSPACES) {
      if (other.key === workspace) continue;
      // The sibling appears in the switcher as a LINK — that is correct and is
      // how you navigate. What it must never be is current, or the heading.
      expect(
        screen.queryByLabelText(`${other.label} sections`),
        `${label} must not render ${other.label}'s section heading`,
      ).toBeNull();
    }
  });
});

describe("a section deeper than home still names its workspace", () => {
  it("Control Tower's credential register says Control Tower, not Developer Studio", () => {
    // The exact screen the defect was reported on.
    cleanup();
    const section = CONTROL_TOWER_SECTIONS.find((s) => s.key === "tokens")!;
    mount("control-tower", section.href);

    const breadcrumb = screen.getByLabelText("Breadcrumb").textContent ?? "";
    expect(breadcrumb).toContain("Control Tower");
    expect(breadcrumb).toContain(section.label);
    expect(breadcrumb).not.toContain("Developer Studio");

    const current = screen
      .getAllByRole("link", { current: "page" })
      .map((el) => el.textContent?.trim());
    expect(current).toContain("Control Tower");
    expect(current).not.toContain("Developer Studio");
  });
});

describe("a refusal names the workspace that was refused", () => {
  it.each(ALL)("%s", (workspace) => {
    cleanup();
    const label = labelOf(workspace);
    render(<RoleGatedEmptyState roleLabel="Support" activeWorkspace={workspace} />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(`${label} is role-gated`);

    // And it explains what THIS workspace is for, not what another one is for.
    const body = document.body.textContent ?? "";
    for (const other of WORKSPACES) {
      if (other.key === workspace) continue;
      expect(body, `${label}'s refusal must not describe ${other.label}`).not.toContain(other.purpose);
    }
  });

  it("tells a support user turned away from Control Tower about Control Tower", () => {
    // The exact screen a support persona hits, and the one that used to say
    // "Developer Studio is role-gated".
    cleanup();
    render(<RoleGatedEmptyState roleLabel="Support" activeWorkspace="control-tower" />);
    const body = document.body.textContent ?? "";
    expect(body).toContain("Control Tower is role-gated");
    expect(body).toContain("whether the portfolio is governed");
    expect(body).not.toContain("Developer Studio");
  });
});

describe("no shared chrome component hardcodes a workspace name", () => {
  /**
   * THE CLASS, not the instances.
   *
   * Three components in `components/studio` are rendered by all three
   * workspaces: the rail, the top bar and the refusal screen. Every one of them
   * had a Developer Studio literal at some point, and each was found by a person
   * looking at a screen rather than by a test — the breadcrumb in review, the
   * rail and the refusal by the owner opening Control Tower.
   *
   * A workspace name in shared chrome must come from `WORKSPACES`. Comments and
   * strings are stripped first, because these files explain the defect at length
   * and a guard that fires on its own documentation gets deleted.
   */
  const SHARED_CHROME = [
    "src/components/studio/StudioRail.tsx",
    "src/components/studio/StudioTopBar.tsx",
    "src/components/studio/StudioShell.tsx",
    "src/components/studio/RoleGatedEmptyState.tsx",
  ];

  /**
   * Strip comments only — a workspace name in a string or in JSX text is exactly
   * the defect, so strings must survive.
   *
   * `stripSource` walks the file rather than applying two regexes. The regex
   * version of this guard passed vacuously: these files explain the defect using
   * the paths `/operations/*` and `/control-tower/*` inside line comments, and a
   * block-comment regex applied first matched that `/*` forward to the next
   * `*​/` two hundred lines away — deleting the code it was meant to inspect.
   */
  function code(file: string): string {
    return stripSource(readFileSync(path.resolve(process.cwd(), file), "utf8"), "comments");
  }

  it.each(SHARED_CHROME)("%s", (file) => {
    const src = code(file);
    for (const w of WORKSPACES) {
      expect(
        src.includes(w.label),
        `${file} hardcodes "${w.label}". Shared chrome is rendered by every workspace — ` +
          `take the label from WORKSPACES via activeWorkspace instead.`,
      ).toBe(false);
    }
  });
});
