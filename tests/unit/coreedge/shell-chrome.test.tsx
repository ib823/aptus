/**
 * The console chrome: a rail that reaches the bottom, and a theme a user can pick.
 *
 * Both were defects nobody could see from the code alone. The rail's height is a
 * CSS fact measured in a browser (see the note on the wrapper class below); the
 * theme's unreachability is an absence, which is the hardest kind of bug to
 * notice — the dark palette exists, is correct, is contrast-checked, and was
 * reachable only by typing into a browser console.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const ROOT = process.cwd();
const SHELL = path.resolve(ROOT, "src/app/(coreedge)/coreedge/CoreEdgeShell.tsx");

const setTheme = vi.fn();
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", setTheme }),
}));

describe("the rail runs the full height of the shell", () => {
  it("wraps the rail in a flex container, not a block", () => {
    /*
     * MEASURED, not reasoned about. With `hidden sm:block` the wrapper stretched
     * — it is a flex item — and the `nav` inside a block container did not, so
     * the navy band stopped after six links:
     *
     *   1440×900   rail 260  shell 900   short by 640
     *   1920×1080  rail 260  shell 1080  short by 820
     *
     * With `sm:flex` the nav stretches and both come back 900 and 1080 exactly.
     */
    const src = readFileSync(SHELL, "utf8");
    expect(src).toContain('className="hidden sm:flex"');
    expect(src).not.toContain('className="hidden sm:block"');
  });

  it("keeps the shell itself a full-height flex row", () => {
    // The wrapper's stretch depends on this; changing it silently un-fixes the
    // rail without touching the line above.
    expect(readFileSync(SHELL, "utf8")).toContain("flex min-h-screen flex-col sm:flex-row");
  });
});

describe("a person can reach the dark console", () => {
  it("offers system, light and dark — not a two-way switch", async () => {
    // `enableSystem` is on and the product default is light, so "follow my
    // computer" is a real state. A two-way toggle hides it and leaves "why
    // doesn't this follow my system?" unanswerable.
    const { ThemeToggle } = await import("@/components/coreedge/primitives/ThemeToggle");
    render(<ThemeToggle />);
    const group = screen.getByRole("radiogroup", { name: "Theme" });
    expect(group).toBeTruthy();
    for (const label of ["System", "Light", "Dark"]) {
      expect(screen.getByRole("radio", { name: label })).toBeTruthy();
    }
  });

  it("actually sets the theme, which nothing in this product did", async () => {
    /*
     * THE WHOLE BUG. `coreedge-tokens.css` carries a complete dark block behind
     * `.dark .coreedge`, and that selector always worked — but next-themes runs
     * with attribute="class" and NOTHING called setTheme, so the only route to
     * the dark console was localStorage.setItem("theme", "dark") by hand.
     */
    setTheme.mockClear();
    const { ThemeToggle } = await import("@/components/coreedge/primitives/ThemeToggle");
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(setTheme).toHaveBeenCalledWith("dark");
  });

  it("announces which one is current", async () => {
    // Legible to a screen reader, not only to the eye — the same rule the
    // status chips follow.
    const { ThemeToggle } = await import("@/components/coreedge/primitives/ThemeToggle");
    render(<ThemeToggle />);
    expect(screen.getByRole("radio", { name: "Light" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "Dark" }).getAttribute("aria-checked")).toBe("false");
  });

  it("is in the header, not a seventh place in the rail", () => {
    // The rail is the six places, always all six, and a test holds it to exactly
    // that list. A theme control there would be a nav item that navigates
    // nowhere.
    const src = readFileSync(SHELL, "utf8");
    expect(src).toContain("<ThemeToggle />");
    expect(
      readFileSync(path.resolve(ROOT, "src/components/coreedge/Rail.tsx"), "utf8"),
    ).not.toContain("ThemeToggle");
  });
});
