/**
 * Creates can be switched on from the screens (P0.3).
 *
 * THE DEFECT. The write path shipped every gate and no screen to pass them:
 *   - no component called POST /api/studio/clients/write-credential, so a
 *     write key could be issued only by calling the API by hand, while the
 *     Interfaces screen told builders to issue it "under API Access";
 *   - the Connections form had no write-secret field, so no screen could
 *     allow writes on a connection;
 *   - and every re-save — how credentials are rotated — sent no
 *     `writeEnabled`, which the route reads as off, so rotating a writing
 *     connection's password silently stopped its writes.
 *
 * Here the two screens are rendered and driven: API Access offers "Issue write
 * key" where it can succeed and says why where it cannot, and calls the route
 * through the step-up helper; the Connections form carries "Allow writes" and
 * the write secret, starts ticked when re-saving a writing connection, and
 * says so before Save when a save would turn writes off.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetchWithStepUp: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/lib/auth/step-up-client", () => ({ fetchWithStepUp: mocks.fetchWithStepUp }));

import {
  ClientCredentials,
  writeKeyAction,
  type CredentialSolution,
  type CredentialSummary,
} from "@/components/studio/ClientCredentials";
import { ConnectionsClient, type StudioConnection } from "@/components/studio/ConnectionsClient";
import { connectionSaveBody, writeTargetChanges } from "@/lib/studio/connection-form";

afterEach(() => cleanup());
beforeEach(() => vi.clearAllMocks());

const POLICY = { maxTtlDays: 90, defaultExpiry: "2027-01-01", overlapHours: 24 };

const credential = (over: Partial<CredentialSummary> = {}): CredentialSummary => ({
  id: "cl_1",
  solutionId: "sol_1",
  solutionName: "PO intake",
  solutionSlug: "po-intake",
  label: "PO intake · DEV",
  environment: "DEV",
  sapClient: null,
  isActive: true,
  lastUsedAt: null,
  revokedAt: null,
  state: "active",
  tokenPrefix: "ce_test_",
  expiresAt: null,
  previousValidUntil: null,
  tokenTail: "k9Xq",
  writeKeyIssued: false,
  writeGrantLive: true,
  writeKeyNeedsExpiry: false,
  solutionRetired: false,
  ownersMissing: [],
  ownersDeparted: false,
  ...over,
});

const solution = (viewerOwns: boolean): CredentialSolution => ({ id: "sol_1", name: "PO intake", slug: "po-intake", viewerOwns });

function renderCredentials(c: CredentialSummary, viewerOwns = false) {
  render(
    <ClientCredentials
      credentials={[c]}
      solutions={[solution(viewerOwns)]}
      canIssue
      connectedEnvironments={["DEV"]}
      keyPolicy={POLICY}
    />,
  );
}

describe("API Access · Issue write key", () => {
  it("offers the action on a live credential with an approved write grant, to someone who does not own the app", () => {
    renderCredentials(credential());
    const button = screen.getByRole("button", { name: "Issue write key" }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  it("mints through the write-key route, with the step-up helper, and shows the key once", async () => {
    mocks.fetchWithStepUp.mockResolvedValue(
      new Response(JSON.stringify({ data: { writeKey: "cew_only_shown_once", warning: "Copy this write key now." } }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    renderCredentials(credential());

    fireEvent.click(screen.getByRole("button", { name: "Issue write key" }));

    await screen.findByText("cew_only_shown_once");
    expect(screen.getByText("Copy this write key now.")).toBeTruthy();
    expect(mocks.fetchWithStepUp).toHaveBeenCalledWith(
      "/api/studio/clients/write-credential",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ solutionId: "sol_1", environment: "DEV" }) }),
    );
  });

  it("asks before replacing a write key, because the current one stops at once", async () => {
    mocks.fetchWithStepUp.mockResolvedValue(
      new Response(JSON.stringify({ data: { writeKey: "cew_new", warning: "w" } }), { status: 201 }),
    );
    renderCredentials(credential({ writeKeyIssued: true }));

    fireEvent.click(screen.getByRole("button", { name: "Replace write key" }));
    expect(mocks.fetchWithStepUp).not.toHaveBeenCalled();
    expect(screen.getByText(/stops the current write key at once/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Replace now" }));
    await waitFor(() => expect(mocks.fetchWithStepUp).toHaveBeenCalledTimes(1));
  });

  it("says the route's refusal in words when it refuses", async () => {
    mocks.fetchWithStepUp.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "This solution has no Business owner." } }), { status: 403 }),
    );
    renderCredentials(credential());
    fireEvent.click(screen.getByRole("button", { name: "Issue write key" }));
    expect((await screen.findByRole("alert")).textContent).toContain("no Business owner");
  });

  it.each([
    ["the viewer owns the app", credential(), true, /a colleague who does not own it/],
    ["no write grant covers the environment", credential({ writeGrantLive: false }), false, /No approved CREATE or UPDATE grant covers DEV/],
    ["the credential has expired", credential({ state: "expired" }), false, /not live/],
    ["the credential is revoked", credential({ state: "revoked", revokedAt: new Date().toISOString() }), false, /not live/],
  ])("is disabled, with its reason beside it, when %s", (_why, c, owns, reason) => {
    renderCredentials(c, owns);
    const button = screen.getByRole("button", { name: "Issue write key" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    const describedBy = button.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toMatch(reason);
  });

  it("shows the key's own reference, or says it was not recorded", () => {
    renderCredentials(credential());
    expect(document.body.textContent).toContain("ce_test_…k9Xq");
    cleanup();
    renderCredentials(credential({ tokenTail: null }));
    expect(document.body.textContent).toContain("ending not recorded");
  });

  it("is disabled, with its reason, on a TEST or PROD key with no expiry while expiry is enforced (review round 1)", () => {
    // The route refuses a write key sealed on a key that would never end; the
    // row says so, instead of leaving the refusal to be the first notice.
    const c = credential({ environment: "PROD", state: "noExpiry", writeKeyNeedsExpiry: true });
    const action = writeKeyAction(c, false);
    expect(action.enabled).toBe(false);
    expect(action.reason).toMatch(/no expiry/i);
    expect(action.reason).toMatch(/rotate/i);

    renderCredentials(c);
    const button = screen.getByRole("button", { name: "Issue write key" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(document.getElementById(button.getAttribute("aria-describedby")!)?.textContent).toMatch(/no expiry/i);
  });

  it.each([
    ["the app is retired (route gate 2)", credential({ solutionRetired: true }), /retired/i, /Reactivate it/],
    ["an owner slot is empty (route gate 3)", credential({ ownersMissing: ["support owner"] }), /no live support owner/, /Assign all three owners/],
    [
      "an owner has been deactivated or left (route gate 3, on live owners)",
      credential({ ownersMissing: ["business owner"], ownersDeparted: true }),
      /no live business owner/,
      /deactivated or has left/,
    ],
  ])("is disabled, with its reason, when %s (review round 2)", (_why, c, reason, remedy) => {
    // The credential itself is live and a write grant is approved: only the
    // app's own state stands in the way, and the route refuses for it.
    const action = writeKeyAction(c, false);
    expect(action.enabled).toBe(false);
    expect(action.reason).toMatch(reason);
    expect(action.reason).toMatch(remedy);

    renderCredentials(c);
    const button = screen.getByRole("button", { name: "Issue write key" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(document.getElementById(button.getAttribute("aria-describedby")!)?.textContent).toMatch(reason);
  });

  it("names the retired app before the credential's own state, as the route does", () => {
    expect(writeKeyAction(credential({ solutionRetired: true, state: "revoked" }), false).reason).toMatch(/retired/i);
    expect(writeKeyAction(credential({ ownersMissing: ["technical owner"], state: "expired" }), true).reason).toMatch(
      /Assign all three owners/,
    );
  });

  it("writeKeyAction is the single decision the row renders", () => {
    // With expiry not enforced (COREEDGE_KEY_EXPIRY=off) the route issues it.
    expect(writeKeyAction(credential({ state: "noExpiry", writeKeyNeedsExpiry: false }), false).enabled).toBe(true);
    expect(writeKeyAction(credential({ writeKeyIssued: true }), false).label).toBe("Replace write key");
  });
});

const WRITING: StudioConnection = {
  id: "conn_1",
  product: "s4hana",
  key: "erp-dev",
  label: "ERP DEV",
  baseUrl: "https://my000001-api.s4hana.cloud.sap",
  authType: "basic",
  environment: "DEV",
  client: null,
  apiPath: null,
  timeoutMs: null,
  writeEnabled: true,
  isActive: true,
  lastValidatedAt: null,
  lastValidationStatus: null,
};

/** Type the key, environment and host — the same system as WRITING unless overridden. */
function fillTarget(key: string, environment = "DEV", baseUrl = "https://my000001-api.s4hana.cloud.sap") {
  fireEvent.change(screen.getByPlaceholderText("x5m-100"), { target: { value: key } });
  fireEvent.change(screen.getByPlaceholderText("DEV"), { target: { value: environment } });
  fireEvent.change(screen.getByPlaceholderText("https://my123456-api.s4hana.cloud.sap"), { target: { value: baseUrl } });
}

function openForm(connections: StudioConnection[]) {
  render(<ConnectionsClient connections={connections} canManage />);
  if (connections.length > 0) fireEvent.click(screen.getByRole("button", { name: /Add a connection/ }));
}

describe("Connections · Allow writes and the write secret", () => {
  it("offers both on a new connection, unticked, and requires the secret once ticked", () => {
    openForm([]);
    const allow = screen.getByRole("checkbox", { name: /Allow writes/ }) as HTMLInputElement;
    expect(allow.checked).toBe(false);
    expect(screen.queryByLabelText(/Write secret/)).toBeNull();

    fireEvent.click(allow);
    expect(screen.getByLabelText(/Write secret/)).toBeTruthy();
    expect(document.body.textContent).toContain("the write secret (writes are allowed)");
  });

  it("starts ticked when re-saving a connection that allows writes, so a rotation keeps them on", () => {
    openForm([WRITING]);
    fillTarget("erp-dev");
    const allow = screen.getByRole("checkbox", { name: /Allow writes/ }) as HTMLInputElement;
    expect(allow.checked).toBe(true);
    expect(screen.queryByTestId("writes-off-notice")).toBeNull();
  });

  it("starts unticked when re-saving a DEACTIVATED connection, so a rotation does not re-arm its writes (review round 1)", () => {
    openForm([{ ...WRITING, isActive: false }]);
    fireEvent.change(screen.getByPlaceholderText("x5m-100"), { target: { value: "erp-dev" } });
    const allow = screen.getByRole("checkbox", { name: /Allow writes/ }) as HTMLInputElement;
    expect(allow.checked).toBe(false);
    // Its writes are not live today, so leaving the box unticked turns nothing off.
    expect(screen.queryByTestId("writes-off-notice")).toBeNull();
  });

  it("says, before Save, that unticking turns writes off", () => {
    openForm([WRITING]);
    fillTarget("erp-dev");
    fireEvent.click(screen.getByRole("checkbox", { name: /Allow writes/ }));
    expect(screen.getByTestId("writes-off-notice").textContent).toMatch(/turns them off/);
  });

  it("starts unticked, and says why, when a save points a writing connection at another environment or host (review round 2)", () => {
    openForm([WRITING]);
    fillTarget("erp-dev", "PROD", "https://my999999-api.s4hana.cloud.sap");
    const allow = screen.getByRole("checkbox", { name: /Allow writes/ }) as HTMLInputElement;
    expect(allow.checked).toBe(false);
    const notice = screen.getByTestId("writes-moved-notice").textContent ?? "";
    expect(notice).toMatch(/DEV at my000001-api\.s4hana\.cloud\.sap/);
    expect(notice).toMatch(/environment, SAP host or base path/);
    expect(notice).toMatch(/passkey/);
    // The moved notice says it; the "turns them off" one would only repeat it.
    expect(screen.queryByTestId("writes-off-notice")).toBeNull();

    // Back on the same system (a lower-case environment is the same one), the box follows the row again.
    fillTarget("erp-dev", "dev");
    expect(allow.checked).toBe(true);
    expect(screen.queryByTestId("writes-moved-notice")).toBeNull();
  });

  it("says, before Save, that saving a deactivated connection makes it active again (review round 2)", () => {
    openForm([{ ...WRITING, isActive: false }]);
    fillTarget("erp-dev");
    expect(screen.getByTestId("reactivates-notice").textContent).toMatch(/active again/);
    expect(screen.getByTestId("reactivates-notice").textContent).not.toMatch(/with writes on/);
    fireEvent.click(screen.getByRole("checkbox", { name: /Allow writes/ }));
    expect(screen.getByTestId("reactivates-notice").textContent).toMatch(/with writes on/);
  });

  it("sends what it showed for the row it replaces, so the route can refuse a stale save (review round 2)", async () => {
    mocks.fetchWithStepUp.mockResolvedValue(new Response(JSON.stringify({ error: { message: "changed since" } }), { status: 409 }));
    openForm([WRITING]);
    fillTarget("erp-dev");
    fireEvent.change(screen.getByPlaceholderText("Customizing X5M/100"), { target: { value: "ERP DEV" } });
    const [username, password] = [screen.getByLabelText("Username"), screen.getByLabelText("Password")];
    fireEvent.change(username, { target: { value: "COMM_USER" } });
    fireEvent.change(password, { target: { value: "p" } });
    fireEvent.change(screen.getByLabelText(/Write secret/), { target: { value: "w" } });
    fireEvent.click(screen.getByRole("button", { name: "Save connection" }));

    expect((await screen.findByRole("alert")).textContent).toContain("changed since");
    const body = JSON.parse(String((mocks.fetchWithStepUp.mock.calls[0]![1] as RequestInit).body)) as Record<string, unknown>;
    expect(body.expected).toEqual({ isActive: true, writeEnabled: true });
    expect(body).toMatchObject({ writeEnabled: true, environment: "DEV" });
  });

  it("sends writeEnabled with the secret only when writes are allowed", () => {
    const base = {
      product: "s4hana", client: "", key: "erp-dev", label: "ERP DEV", baseUrl: "https://my000001-api.s4hana.cloud.sap",
      environment: "DEV", authType: "basic" as const, apiKey: "", apiKeyHeader: "apikey", username: "u", password: "p",
      bearerToken: "", clientId: "", clientSecret: "", oauthTokenUrl: "", companyId: "", samlAssertion: "",
      samlSigning: "key" as const, samlPrivateKey: "", samlUserId: "", apiPath: "", timeoutMs: "",
    };
    expect(connectionSaveBody({ ...base, allowWrites: true, writeSecret: "s" })).toMatchObject({ writeEnabled: true, writeSecret: "s" });
    const off = connectionSaveBody({ ...base, allowWrites: false, writeSecret: "ignored" });
    expect("writeEnabled" in off).toBe(false);
    expect("writeSecret" in off).toBe(false);
  });
});

describe("writeTargetChanges · the system a connection's writes are allowed for (review round 2)", () => {
  const dev = { environment: "DEV", baseUrl: "https://my000001-api.s4hana.cloud.sap", client: null };

  it("is unchanged by a rotation: same environment in any spelling, same host in any case, a trailing slash", () => {
    expect(writeTargetChanges(dev, { ...dev, environment: "dev", baseUrl: "https://MY000001-api.s4hana.cloud.sap/" })).toEqual([]);
    const gw = { ...dev, baseUrl: "https://apim.example.hana.ondemand.com/s4-dev" };
    expect(writeTargetChanges(gw, { ...gw, baseUrl: "https://APIM.example.hana.ondemand.com/s4-dev/" })).toEqual([]);
  });

  it("calls another base path on the same host another system: the path is joined into every request (review round 3)", () => {
    const gw = { ...dev, baseUrl: "https://apim.example.hana.ondemand.com/s4-dev" };
    expect(writeTargetChanges(gw, { ...gw, baseUrl: "https://apim.example.hana.ondemand.com/s4-prod" })).toEqual(["baseUrl"]);
    expect(writeTargetChanges(dev, { ...dev, baseUrl: `${dev.baseUrl}/s4-prod` })).toEqual(["baseUrl"]);
  });

  it("names each part a save moves", () => {
    expect(writeTargetChanges(dev, { ...dev, environment: "PROD" })).toEqual(["environment"]);
    expect(writeTargetChanges(dev, { ...dev, baseUrl: "https://my999999-api.s4hana.cloud.sap" })).toEqual(["baseUrl"]);
    expect(writeTargetChanges({ ...dev, client: "100" }, { ...dev, client: "200" })).toEqual(["client"]);
    expect(writeTargetChanges({ ...dev, client: "100" }, { ...dev, client: " " })).toEqual(["client"]);
    expect(writeTargetChanges(dev, { ...dev, environment: null })).toEqual(["environment"]);
  });
});
