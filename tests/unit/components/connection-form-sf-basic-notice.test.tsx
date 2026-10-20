/**
 * The Connections form says SAP is retiring SuccessFactors Basic BEFORE Save
 * (P0.9) — on a new connection only, and without disabling anything.
 *
 * The notice text comes from the server (the page computes it with the server
 * clock and SF_BASIC_AUTH_DELETION_DATE), so this test hands the component a
 * sentence and checks WHEN it is shown: SuccessFactors + Basic + a key that is
 * not already a connection of that product.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { ConnectionsClient, type StudioConnection } from "@/components/studio/ConnectionsClient";

afterEach(() => cleanup());

const NOTICE ="SAP retires HTTP Basic for SuccessFactors APIs on 2026-11-20 (31 day(s) from now).";

const EXISTING_SF: StudioConnection = {
  id: "conn_sf",
  product: "successfactors",
  key: "sf-prod",
  label: "SuccessFactors PROD",
  baseUrl: "https://api17.sapsf.com",
  authType: "basic",
  environment: "PROD",
  apiPath: null,
  timeoutMs: null,
  writeEnabled: false,
  isActive: true,
  lastValidatedAt: null,
  lastValidationStatus: null,
};

function renderForm(connections: StudioConnection[] = []) {
  render(
    <ConnectionsClient
      connections={connections}
      canManage
      basicAuthNotices={{ successfactors: NOTICE }}
    />,
  );
  // With connections, the form is behind the "Add a connection" toggle.
  if (connections.length > 0) fireEvent.click(screen.getByRole("button", { name: /Add a connection/ }));
}

function pickSuccessFactors() {
  /*
   * By the tile's OWN text. The tiles sit inside the "Product" <label>, which
   * names the first of them with every tile's text — so a query by accessible
   * name would also match the S/4HANA tile.
   */
  const tile = screen
    .getAllByRole("button")
    .find((b) => b.hasAttribute("aria-pressed") && b.textContent?.includes("SAP SuccessFactors"));
  if (!tile) throw new Error("no SuccessFactors product tile");
  fireEvent.click(tile);
}

function typeKey(value: string) {
  fireEvent.change(screen.getByPlaceholderText("x5m-100"), { target: { value } });
}

describe("the SuccessFactors Basic-auth notice on the Connections form", () => {
  it("is shown, dated, for a new SuccessFactors connection on Basic", () => {
    renderForm();
    pickSuccessFactors();
    typeKey("sf-dev");
    expect(screen.getByTestId("sf-basic-auth-notice").textContent).toBe(NOTICE);
  });

  it("is not shown for another product on Basic", () => {
    renderForm();
    typeKey("s4-dev");
    expect(screen.queryByTestId("sf-basic-auth-notice")).toBeNull();
  });

  it("goes away when the auth type moves off Basic", () => {
    renderForm();
    pickSuccessFactors();
    fireEvent.change(screen.getByDisplayValue("Basic — communication user"), {
      target: { value: "oauth-saml-bearer" },
    });
    expect(screen.queryByTestId("sf-basic-auth-notice")).toBeNull();
  });

  it("is not shown when the key is an existing connection's — that save is a rotation", () => {
    renderForm([EXISTING_SF]);
    pickSuccessFactors();
    // Normalized as the server stores it: " SF Prod " IS "sf-prod".
    typeKey(" SF Prod ");
    expect(screen.queryByTestId("sf-basic-auth-notice")).toBeNull();
    typeKey("sf-prod-2");
    expect(screen.getByTestId("sf-basic-auth-notice")).toBeTruthy();
  });
});
