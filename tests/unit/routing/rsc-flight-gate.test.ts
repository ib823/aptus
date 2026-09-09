// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(), readFile: vi.fn(),
  manualScreen: vi.fn(), redirect: vi.fn((path: string) => { throw new Error("NEXT_REDIRECT:" + path); }),
}));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect, notFound: () => { throw new Error("NOT_FOUND"); },
}));
vi.mock("node:fs/promises", () => ({ readFile: mocks.readFile }));
vi.mock("@/lib/help/manual", () => ({
  INCIDENT_REFERENCE: [], WORKSPACE_OVERVIEWS: [], MANUAL: [], manualScreen: mocks.manualScreen,
}));

import ManualIndexPage from "@/app/(help)/help/page";
import ManualScreenPage, { generateMetadata } from "@/app/(help)/help/[workspace]/[section]/page";
import DeveloperGuidePage from "@/app/(help)/help/developer-guide/page";

const params = { params: Promise.resolve({ workspace: "control-tower", section: "grants" }) };
const renderers = [
  ["index", () => ManualIndexPage()],
  ["screen", () => ManualScreenPage(params)],
  ["screen metadata", () => generateMetadata(params)],
  ["developer guide", () => DeveloperGuidePage()],
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue(null);
  mocks.readFile.mockResolvedValue("# Developer guide");
  mocks.manualScreen.mockReturnValue({
    slug: "control-tower/grants", title: "Grants", workspaceLabel: "Control Tower",
    answers: "Test", cannotTell: [], misreadings: [], openTo: [], accessBasis: "session",
  });
});

describe("help content is protected even when the layout runs concurrently", () => {
  it.each(renderers)("%s refuses an invalid session before rendering or reading content", async (_name, render) => {
    await expect(render()).rejects.toThrow("NEXT_REDIRECT:/presales/login");
    expect(mocks.getCurrentUser).toHaveBeenCalledTimes(1);
    expect(mocks.readFile).not.toHaveBeenCalled();
    expect(mocks.manualScreen).not.toHaveBeenCalled();
  });
  it.each(renderers)("%s waits for authentication before doing any content work", async (_name, render) => {
    let resolveUser!: (user: null) => void;
    mocks.getCurrentUser.mockReturnValue(new Promise((resolve) => { resolveUser = resolve; }));
    const result = render();
    const denied = expect(result).rejects.toThrow("NEXT_REDIRECT");
    await Promise.resolve();
    expect(mocks.readFile).not.toHaveBeenCalled();
    expect(mocks.manualScreen).not.toHaveBeenCalled();
    resolveUser(null);
    await denied;
  });
  it.each(renderers)("%s permits a valid signed-in user without requiring admin", async (_name, render) => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "consultant" });
    expect(await render()).toBeTruthy();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
