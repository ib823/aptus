/**
 * Discover's "On this tenant" panel and "From a file" dialog (P1.2), as a
 * person sees them: the stored listing's groups (customer-built with its
 * badge and a pre-filled Register, Published with its scenario, SAP's
 * unpublished services with §1.2's sentence and no action), a catalogue the
 * user cannot read said plainly with the upload offered and no communication
 * scenario named (Q1), a refusal with its correlation id, no listed URL ever a
 * link; and the dataset picker's reading of a description file.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TenantServicesPanel } from "@/components/studio/TenantServicesPanel";
import { entitySetsInDescription } from "@/components/studio/UploadDescriptionDialog";
import type { ListingEntry } from "@/lib/sap-public/tenant-discovery";

const entry = (over: Partial<ListingEntry>): ListingEntry => ({
  id: "X_0001",
  technicalName: "X",
  version: "0001",
  odataVersion: "V2",
  path: null,
  title: null,
  class: "PUBLISHED",
  catalogueExternalId: null,
  scenarioIds: [],
  ...over,
});

const LISTING = {
  listedAt: "2026-10-23T08:00:00.000Z",
  listedBy: "Dana Builder",
  correlationId: "corr-1",
  catalogueStatus: "OK",
  v4Status: "NOT_TRIED",
  sentence: "The service catalogue answered.",
  truncated: false,
  entryCount: 4,
  connectionChanged: false,
  groups: {
    customerBuilt: [
      entry({ id: "ZUI_TRAVEL_O2_0001", technicalName: "ZUI_TRAVEL_O2", class: "CUSTOMER_DEVELOPER", path: "/sap/opu/odata/sap/ZUI_TRAVEL_O2", title: "<b>Travel</b>" }),
      entry({ id: "YY1_SALESBONUS_CDS_0001", technicalName: "YY1_SALESBONUS_CDS", class: "CUSTOMER_KEY_USER", path: null }),
    ],
    published: [entry({ id: "API_BUSINESS_PARTNER_0001", technicalName: "API_BUSINESS_PARTNER", catalogueExternalId: "API_BUSINESS_PARTNER", scenarioIds: ["SAP_COM_0008", "SAP_COM_0087"] })],
    sapUnpublished: [entry({ id: "C_PURCHASEORDER_FS_SRV_0001", technicalName: "C_PURCHASEORDER_FS_SRV", class: "SAP_UNPUBLISHED" })],
    unknown: [],
  },
  scenarios: { SAP_COM_0008: { name: null, interfaceCount: 9 } },
  scenarioRelease: "2608",
};

function stub(stored: unknown, live?: { status: number; body: unknown }) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") return new Response(JSON.stringify(live!.body), { status: live!.status });
    return new Response(JSON.stringify({ data: stored }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

const VIEW = { listable: true, v4Allowed: false, source: "connection", connection: { label: "Lab X5M" }, mayList: true, listing: LISTING };

describe("the stored listing", () => {
  it("shows customer-built services with their badge and a pre-filled Register, and no listed URL as a link", async () => {
    stub(VIEW);
    const onRegister = vi.fn();
    const { container } = render(<TenantServicesPanel tenant="lab" product="s4hana" canAuthor onRegister={onRegister} onAddToInterface={vi.fn()} />);
    await screen.findByText("ZUI_TRAVEL_O2");
    expect(screen.getByText(/Last read .* by Dana Builder/)).toBeTruthy();
    expect(screen.getByText("Developer (Z*, Y*)")).toBeTruthy();
    expect(screen.getByText("Key user (YY1_)")).toBeTruthy();
    // A title is text, never markup.
    expect(screen.getByText("<b>Travel</b>")).toBeTruthy();
    expect(container.querySelector("a")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Register ZUI_TRAVEL_O2" }));
    expect(onRegister).toHaveBeenCalledWith(expect.objectContaining({ path: "/sap/opu/odata/sap/ZUI_TRAVEL_O2" }));
    // An entry without a storable path gets no Register.
    expect(screen.queryByRole("button", { name: "Register YY1_SALESBONUS_CDS" })).toBeNull();
  });

  it("shows a Published service's scenario and offers Add to interface; SAP's unpublished ones get §1.2 and no action", async () => {
    stub(VIEW);
    const add = vi.fn();
    render(<TenantServicesPanel tenant="lab" product="s4hana" canAuthor onAddToInterface={add} />);
    await screen.findByText("API_BUSINESS_PARTNER");
    expect(screen.getByText("SAP_COM_0008 +1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add to interface" }));
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ externalId: "API_BUSINESS_PARTNER", product: "s4hana" }));
    expect(screen.getByText(/SAP API Policy §1.2/)).toBeTruthy();
    expect(screen.getAllByRole("button").map((b) => b.textContent)).not.toContain("Register C_PURCHASEORDER_FS_SRV");
  });

  it("says plainly when the user cannot read the catalogue, offers the upload, and names no scenario to activate", async () => {
    stub({ ...VIEW, listing: { ...LISTING, catalogueStatus: "UNAUTHORIZED", sentence: "This connection's user cannot read the system's service catalogue, so CoreEdge cannot list its services. You can still register a service from its description: upload its $metadata file under From a file.", groups: { customerBuilt: [], published: [], sapUnpublished: [], unknown: [] } } });
    const { container } = render(<TenantServicesPanel tenant="lab" product="s4hana" canAuthor />);
    await screen.findByText(/cannot read the system's service catalogue/);
    expect(screen.getByText(/From a file/)).toBeTruthy();
    expect(container.textContent).not.toMatch(/SAP_COM_0087|SAP_COM_0370|SAP_COM_0761|SAP_COM_0449/);
  });
});

describe("the live listing", () => {
  it("renders a refusal as a result, with its correlation id", async () => {
    stub({ ...VIEW, listing: null }, { status: 403, body: { error: { code: "NO_APPROVED_GRANT", message: "Reading PROD needs a live grant.", correlationId: "corr-9" } } });
    render(<TenantServicesPanel tenant="lab" product="s4hana" canAuthor />);
    fireEvent.click(await screen.findByRole("button", { name: "Read the service list from Lab X5M" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Reading PROD needs a live grant."));
    expect(screen.getByRole("alert").textContent).toContain("corr-9");
  });
});

describe("the upload dialog's dataset picker", () => {
  const golden = (name: string) => readFileSync(path.resolve(__dirname, "../../fixtures/contracts/edmx", name), "utf8");

  it("reads the entity sets of an XML description and of a CSDL JSON one", () => {
    expect(entitySetsInDescription(golden("yy1-sales-bonus.v2.xml")).length).toBeGreaterThan(0);
    expect(entitySetsInDescription(golden("z-bonus-plan-rap.v4.json")).length).toBeGreaterThan(0);
    expect(entitySetsInDescription("not a description")).toEqual([]);
  });
});
