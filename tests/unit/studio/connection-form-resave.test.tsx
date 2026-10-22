/**
 * A re-save from the Connections form keeps what is stored (wave 2 final
 * review round 3), and says what the probe of the new secret found.
 *
 * THE DEFECT, AT ITS ROOT. The save route replaces every column with what the
 * save sends, and the form started blank: re-saving a connection to rotate
 * its password (the documented way) sent no probe path and no timeout, so it
 * cleared both. The rotation probe then judged the new secret at another
 * service, or with the default timeout on a slow tenant, and three review
 * rounds of rules tried to infer around a form that had changed the settings.
 * Now every stored setting the route accepts and does not seal (label, base
 * URL, environment, SAP client, auth type, token URL, probe path, timeout)
 * is loaded into the form and sent back unless the person edits it, and an
 * edit that changes one is named before Save.
 *
 * And after a save that went through, a secret SAP refused (or could not
 * check) is said on the form instead of the page reloading over it.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetchWithStepUp: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/auth/step-up-client", () => ({ fetchWithStepUp: mocks.fetchWithStepUp }));

import { ConnectionsClient, type StudioConnection } from "@/components/studio/ConnectionsClient";
import { changedStoredSettings, storedEnvironmentTwin, storedFormSettings } from "@/lib/studio/connection-form";

const reload = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, reload } });
});
afterEach(() => cleanup());

const STORED: StudioConnection = {
  id: "conn_1",
  product: "s4hana",
  key: "erp-dev",
  label: "ERP DEV",
  baseUrl: "https://my000001-api.s4hana.cloud.sap",
  authType: "basic",
  environment: "DEV",
  client: null,
  apiPath: "/sap/opu/odata/sap/API_PURCHASEORDER_PROCESS_SRV",
  timeoutMs: 30000,
  writeEnabled: false,
  isActive: true,
  lastValidatedAt: null,
  lastValidationStatus: "OK",
};

function openForm(connections: StudioConnection[]) {
  render(<ConnectionsClient connections={connections} canManage />);
  fireEvent.click(screen.getByRole("button", { name: /Add a connection/ }));
}

/** The documented rotation: the key, and the new credentials. Nothing else typed. */
function rotate(key = "erp-dev", password = "New-Password-2") {
  fireEvent.change(screen.getByPlaceholderText("x5m-100"), { target: { value: key } });
  fireEvent.change(screen.getByLabelText("Username"), { target: { value: "COMM_USER" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
}

function respond(data: Record<string, unknown>) {
  mocks.fetchWithStepUp.mockResolvedValue(new Response(JSON.stringify({ data }), { status: 200 }));
}

function sentBody(): Record<string, unknown> {
  return JSON.parse(String((mocks.fetchWithStepUp.mock.calls[0]![1] as RequestInit).body)) as Record<string, unknown>;
}

describe("a form re-save keeps the stored settings", () => {
  it("sends back the stored probe path and timeout, and every other stored setting", async () => {
    respond({ connection: { id: "conn_1" }, replaced: true });
    openForm([STORED]);
    rotate();
    expect((screen.getByPlaceholderText("/sap/opu/odata/sap/ZMY_SERVICE") as HTMLInputElement).value).toBe(STORED.apiPath);
    expect((screen.getByPlaceholderText("30000") as HTMLInputElement).value).toBe("30000");
    expect(screen.queryByTestId("settings-changed-notice")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Save connection" }));
    await vi.waitFor(() => expect(reload).toHaveBeenCalled());
    expect(sentBody()).toMatchObject({
      product: "s4hana",
      key: "erp-dev",
      label: "ERP DEV",
      baseUrl: "https://my000001-api.s4hana.cloud.sap",
      environment: "DEV",
      authType: "basic",
      apiPath: STORED.apiPath,
      timeoutMs: 30000,
    });
  });

  it("loads the stored SAP client and OAuth token URL too", async () => {
    respond({ connection: { id: "conn_2" }, replaced: true });
    const oauth: StudioConnection = {
      ...STORED,
      id: "conn_2",
      product: "cloud-erp-private",
      key: "x5m-100",
      client: "100",
      authType: "oauth-client-credentials",
      oauthTokenUrl: "https://auth.example.com/oauth/token",
    };
    openForm([oauth]);
    fireEvent.click(screen.getAllByText("SAP Cloud ERP Private").map((el) => el.closest("button[aria-pressed]")).find(Boolean)!);
    fireEvent.change(screen.getByPlaceholderText("x5m-100"), { target: { value: "x5m-100" } });
    fireEvent.change(screen.getByLabelText("Client ID"), { target: { value: "cid" } });
    fireEvent.change(screen.getByLabelText("Client secret"), { target: { value: "new-secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Save connection" }));
    await vi.waitFor(() => expect(reload).toHaveBeenCalled());
    expect(sentBody()).toMatchObject({
      client: "100",
      authType: "oauth-client-credentials",
      oauthTokenUrl: "https://auth.example.com/oauth/token",
      apiPath: STORED.apiPath,
      timeoutMs: 30000,
    });
  });

  it("a stored setting the person clears is cleared, and named before Save", async () => {
    respond({ connection: { id: "conn_1" }, replaced: true });
    openForm([STORED]);
    rotate();
    fireEvent.change(screen.getByPlaceholderText("/sap/opu/odata/sap/ZMY_SERVICE"), { target: { value: "" } });
    expect(screen.getByTestId("settings-changed-notice").textContent).toMatch(/probe path/);
    fireEvent.click(screen.getByRole("button", { name: "Save connection" }));
    await vi.waitFor(() => expect(reload).toHaveBeenCalled());
    expect(sentBody()).not.toHaveProperty("apiPath");
    expect(sentBody()).toMatchObject({ timeoutMs: 30000 });
  });

  it("a new connection starts blank", () => {
    openForm([STORED]);
    fireEvent.change(screen.getByPlaceholderText("x5m-100"), { target: { value: "erp-new" } });
    expect((screen.getByPlaceholderText("/sap/opu/odata/sap/ZMY_SERVICE") as HTMLInputElement).value).toBe("");
    expect((screen.getByPlaceholderText("Customizing X5M/100") as HTMLInputElement).value).toBe("");
  });

  it("the pure halves: what is loaded, and what a save changes", () => {
    const stored = storedFormSettings(STORED);
    expect(stored).toMatchObject({ apiPath: STORED.apiPath, timeoutMs: "30000", environment: "DEV" });
    expect(changedStoredSettings(stored, { ...stored, product: "s4hana" })).toEqual([]);
    // The same value in another spelling is the same setting.
    expect(changedStoredSettings(stored, { ...stored, product: "s4hana", environment: "dev", baseUrl: `${STORED.baseUrl}/` })).toEqual([]);
    expect(changedStoredSettings(stored, { ...stored, product: "s4hana", apiPath: "", timeoutMs: "" })).toEqual(["apiPath", "timeoutMs"]);
    expect(storedFormSettings(null)).toMatchObject({ label: "", apiPath: "", timeoutMs: "", authType: "basic" });
  });
});

/*
 * Wave 2 rotation probe review round 1. Bringing back a deactivated row whose
 * environment a live row now holds: main's form started blank and sent no
 * environment, which the route's twin rule never checks, so it saved. A form
 * that sent the stored environment back would be refused as a twin. For that
 * row the field starts blank, as on main, and the form says why.
 */
describe("reactivating a deactivated row next to its live twin", () => {
  const RETIRED: StudioConnection = { ...STORED, id: "conn_old", key: "erp-dev-old", label: "ERP DEV (old)", isActive: false };
  const LIVE: StudioConnection = { ...STORED, id: "conn_live", key: "erp-dev", label: "ERP DEV" };

  it("starts the environment blank, names the twin and the change, and sends no environment", async () => {
    respond({ connection: { id: "conn_old" }, replaced: true });
    openForm([RETIRED, LIVE]);
    rotate("erp-dev-old");
    expect((screen.getByPlaceholderText("DEV") as HTMLInputElement).value).toBe("");
    expect(screen.getByTestId("environment-twin-notice").textContent).toContain("“ERP DEV” (erp-dev) is now the active DEV connection");
    expect(screen.getByTestId("settings-changed-notice").textContent).toMatch(/environment/);
    // Everything else stored is still sent back.
    expect((screen.getByPlaceholderText("/sap/opu/odata/sap/ZMY_SERVICE") as HTMLInputElement).value).toBe(STORED.apiPath);
    fireEvent.click(screen.getByRole("button", { name: "Save connection" }));
    await vi.waitFor(() => expect(reload).toHaveBeenCalled());
    expect(sentBody()).not.toHaveProperty("environment");
    expect(sentBody()).toMatchObject({ key: "erp-dev-old", apiPath: STORED.apiPath, timeoutMs: 30000 });
  });

  it("keeps the stored environment when no live row holds it, or the row is active", () => {
    expect(storedEnvironmentTwin(RETIRED, [RETIRED, LIVE])).toBe(LIVE);
    expect(storedEnvironmentTwin(RETIRED, [RETIRED, { ...LIVE, isActive: false }])).toBeNull();
    expect(storedEnvironmentTwin(RETIRED, [RETIRED, { ...LIVE, environment: "TEST" }])).toBeNull();
    expect(storedEnvironmentTwin(RETIRED, [RETIRED, { ...LIVE, product: "ecc" }])).toBeNull();
    expect(storedEnvironmentTwin(RETIRED, [RETIRED, { ...LIVE, client: "200" }])).toBeNull();
    expect(storedEnvironmentTwin({ ...RETIRED, isActive: true }, [RETIRED, LIVE])).toBeNull();
    expect(storedEnvironmentTwin(RETIRED, [RETIRED, { ...LIVE, environment: "dev" }])?.key).toBe("erp-dev");
  });
});

describe("what the probe of the new secret found is said on the form", () => {
  it("SAP refused the new password: the save went through, and the form says calls will fail", async () => {
    respond({
      connection: { id: "conn_1" },
      replaced: true,
      rotationProbe: {
        mode: "observe",
        ran: true,
        outcome: "rejected",
        reason: "sap_http_401",
        warning: "SAP refused the new password; calls through this connection will fail until it is corrected.",
      },
    });
    openForm([STORED]);
    rotate("erp-dev", "Typo-Password");
    fireEvent.click(screen.getByRole("button", { name: "Save connection" }));
    const warning = await screen.findByTestId("rotation-probe-warning");
    expect(warning.getAttribute("role")).toBe("alert");
    expect(warning.textContent).toContain(
      "SAP refused the new password; calls through this connection will fail until it is corrected",
    );
    // Not reloaded over, and the typed secret is gone from the form.
    expect(reload).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Password") as HTMLInputElement).value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Reload connections" }));
    expect(reload).toHaveBeenCalled();
  });

  it("a secret that could not be checked says why", async () => {
    respond({
      connection: { id: "conn_1" },
      replaced: true,
      rotationProbe: {
        mode: "observe",
        ran: true,
        outcome: "noAnswer",
        reason: "sap_timeout",
        warning: "The new password could not be checked: SAP did not say whether it accepts it. The tenant did not respond within 30000ms.",
      },
    });
    openForm([STORED]);
    rotate();
    fireEvent.click(screen.getByRole("button", { name: "Save connection" }));
    expect((await screen.findByTestId("rotation-probe-warning")).textContent).toContain("did not respond within 30000ms");
  });

  it("a probe that passed, or did not apply, reloads as before", async () => {
    respond({ connection: { id: "conn_1" }, replaced: true, rotationProbe: { outcome: "passed", warning: null } });
    openForm([STORED]);
    rotate();
    fireEvent.click(screen.getByRole("button", { name: "Save connection" }));
    await vi.waitFor(() => expect(reload).toHaveBeenCalled());
    expect(screen.queryByTestId("rotation-probe-warning")).toBeNull();
  });
});
