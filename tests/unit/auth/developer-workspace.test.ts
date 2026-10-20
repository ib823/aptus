/**
 * Developer workspace sign-up: the setting, the policy and where a developer
 * lands (roadmap P0.13, lib/auth/developer-workspace.ts).
 *
 * The production-safety half is the first describe: with nothing set, sign-up
 * admits exactly who it did before, and a typo never opens it.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEVELOPER_HOME,
  developerLandingPath,
  developerSignupDomains,
  developerSignupMode,
  mayCreateDeveloperWorkspace,
  workspaceNameFor,
} from "@/lib/auth/developer-workspace";
import { mayRegisterOnFirstSignIn } from "@/lib/auth/auth-options";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("COREEDGE_DEVELOPER_SIGNUP", () => {
  it("is off when unset — the deployed default", () => {
    expect(developerSignupMode({})).toBe("off");
  });

  it.each(["", "on", "true", "1", "opne", "enabled", "warn"])("reads %j as off: a typo never opens sign-up", (value) => {
    expect(developerSignupMode({ COREEDGE_DEVELOPER_SIGNUP: value })).toBe("off");
  });

  it.each(["open", " OPEN ", "Open"])("opens only on the word open (%j)", (value) => {
    expect(developerSignupMode({ COREEDGE_DEVELOPER_SIGNUP: value })).toBe("open");
  });

  it("parses the developer domain list, lower-cased, empty meaning any", () => {
    expect(developerSignupDomains({})).toEqual([]);
    expect(developerSignupDomains({ COREEDGE_DEVELOPER_SIGNUP_DOMAINS: " Example.COM, ,partner.io " })).toEqual([
      "example.com",
      "partner.io",
    ]);
  });
});

describe("who may get a workspace", () => {
  it("nobody while the setting is off, whatever the domain lists say", () => {
    expect(mayCreateDeveloperWorkspace("dev@example.com", {}).allowed).toBe(false);
    expect(
      mayCreateDeveloperWorkspace("dev@example.com", { COREEDGE_DEVELOPER_SIGNUP_DOMAINS: "example.com" }).allowed,
    ).toBe(false);
  });

  it("any address when open with no domain list", () => {
    expect(mayCreateDeveloperWorkspace("dev@anywhere.dev", { COREEDGE_DEVELOPER_SIGNUP: "open" }).allowed).toBe(true);
  });

  it("only the listed domains when a list is set", () => {
    const env = { COREEDGE_DEVELOPER_SIGNUP: "open", COREEDGE_DEVELOPER_SIGNUP_DOMAINS: "example.com" };
    vi.stubEnv("AUTH_INVITATION_ONLY", "true");
    expect(mayCreateDeveloperWorkspace("dev@EXAMPLE.com", env).allowed).toBe(true);
    expect(mayCreateDeveloperWorkspace("dev@other.com", env).allowed).toBe(false);
  });

  it("refuses an address with no domain", () => {
    expect(mayCreateDeveloperWorkspace("nobody", { COREEDGE_DEVELOPER_SIGNUP: "open" }).allowed).toBe(false);
  });
});

describe("first sign-in registration keeps today's exposure by default", () => {
  it("with the setting off, the registration policy alone decides", () => {
    vi.stubEnv("COREEDGE_DEVELOPER_SIGNUP", "");
    vi.stubEnv("AUTH_INVITATION_ONLY", "true");
    vi.stubEnv("AUTH_WHITELIST_BYPASS", "");
    expect(mayRegisterOnFirstSignIn("stranger@example.com").allowed).toBe(false);

    vi.stubEnv("AUTH_INVITATION_ONLY", "false");
    vi.stubEnv("AUTH_ALLOWED_DOMAINS", "abeam.com");
    expect(mayRegisterOnFirstSignIn("staff@abeam.com").allowed).toBe(true);
    expect(mayRegisterOnFirstSignIn("stranger@example.com").allowed).toBe(false);
  });

  it("with the setting open, a developer domain is admitted even under invitation-only", () => {
    vi.stubEnv("AUTH_INVITATION_ONLY", "true");
    vi.stubEnv("COREEDGE_DEVELOPER_SIGNUP", "open");
    vi.stubEnv("COREEDGE_DEVELOPER_SIGNUP_DOMAINS", "example.com");
    expect(mayRegisterOnFirstSignIn("dev@example.com").allowed).toBe(true);
    expect(mayRegisterOnFirstSignIn("dev@elsewhere.com").allowed).toBe(false);
  });
});

describe("where a sandbox developer lands", () => {
  it.each(["/presales", "/assessments", "/workbench", "/affirm/x", "/", "/studiox"])(
    "%s, which would refuse them, becomes Discover",
    (target) => {
      expect(developerLandingPath(target)).toBe(DEVELOPER_HOME);
    },
  );

  it.each([
    "/studio/discover",
    "/studio",
    "/coreedge/members",
    "/coreedge",
    "/invitations/abc",
    "/settings/security?next=%2Fstudio",
    "/help",
  ])("%s, which they can use, stands", (target) => {
    expect(developerLandingPath(target)).toBe(target);
  });

  it("names the workspace after its person", () => {
    expect(workspaceNameFor("Ada")).toBe("Ada's workspace");
    expect(workspaceNameFor("x".repeat(300))).toHaveLength(200);
  });
});
