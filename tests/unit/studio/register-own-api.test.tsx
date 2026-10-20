/**
 * Studio's "Register your own API" path, and the Source card of an interface
 * that carries its own service.
 *
 * The routes are the control (interfaces-custom-service.test.ts,
 * verify-service-route.test.ts); this pins the affordances: the dialog
 * validates the path with the API's own rule as it is typed and sends the
 * derived-id request, the Source card shows the path and offers Verify, and
 * Mark ACTIVE on an unverified custom WRITE interface says why it is disabled.
 * Review round 1: the OData version can be changed from the Source card (and
 * from Verify's VERSION_MISMATCH answer), the environments verified are
 * listed because the write gate is per environment, and a live custom WRITE
 * interface warns before a dataset change stops its writes.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InterfacesClient, type StudioInterface } from "@/components/studio/InterfacesClient";
import type { WriteReadinessRow } from "@/lib/studio/write-readiness";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const PATH = "/sap/opu/odata/sap/ZUI_X_O2";
const PRODUCTS = [
  { key: "s4hana", label: "S/4HANA Cloud", addressesClient: false },
  { key: "s4hana-onprem", label: "SAP S/4HANA (on-premise)", addressesClient: true },
  { key: "successfactors", label: "SuccessFactors", addressesClient: false },
];
const SOLUTIONS = [{ id: "sol_1", name: "Travel Portal" }];
const READY: WriteReadinessRow[] = [
  { environment: "TEST", credential: "ready", grant: "approved", ready: true },
];

const CUSTOM: StudioInterface = {
  id: "if_c",
  name: "Travel create",
  version: 2,
  sapProduct: "s4hana-onprem",
  externalId: `custom:${PATH}`,
  operation: "CREATE",
  entitySet: "A_Travel",
  mode: "WRITE",
  status: "DRAFT",
  mappingVersion: null,
  hasRequestSchema: false,
  hasResponseSchema: false,
  solutionId: "sol_1",
  solutionName: "Travel Portal",
  servicePath: PATH,
  odataVersion: "V2",
  serviceVerifiedAt: null,
  serviceVerifiedEnvironment: null,
  serviceVerifiedEntitySets: null,
  writeReadiness: READY,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Register your own API", () => {
  it("opens from the header, validates the path as typed, and infers the version", () => {
    render(<InterfacesClient interfaces={[]} canAuthor solutions={SOLUTIONS} products={PRODUCTS} />);
    fireEvent.click(screen.getByRole("button", { name: "Register your own API" }));
    expect(screen.getByRole("dialog")).toBeTruthy();

    const path = screen.getByLabelText("Service path");
    fireEvent.change(path, { target: { value: "https://my-host/sap/opu/odata/sap/ZUI_X_O2" } });
    expect(screen.getByText(/Enter only the path, not a full address/)).toBeTruthy();

    fireEvent.change(path, { target: { value: "/sap/opu/odata4/sap/zui_x_o4/srvd_a2x/sap/zx/0001" } });
    expect((screen.getByRole("radio", { name: /^V4/ }) as HTMLInputElement).checked).toBe(true);
  });

  it("opens on arrival with ?register=1, and posts the path and version — never an id", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { id: "if_new" } }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<InterfacesClient interfaces={[]} canAuthor openRegister solutions={SOLUTIONS} products={PRODUCTS} />);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Travel read" } });
    fireEvent.change(screen.getByLabelText("SAP product"), { target: { value: "s4hana-onprem" } });
    fireEvent.change(screen.getByLabelText("Service path"), { target: { value: `  ${PATH}/  ` } });
    fireEvent.click(screen.getByRole("button", { name: "Register draft" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/studio/interfaces");
    const sent = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(sent).toMatchObject({
      solutionId: "sol_1",
      sapProduct: "s4hana-onprem",
      name: "Travel read",
      servicePath: `${PATH}/`,
      odataVersion: "V2",
      operation: "READ",
    });
    expect(sent).not.toHaveProperty("externalId");
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("is not offered to a role that cannot author", () => {
    render(<InterfacesClient interfaces={[]} canAuthor={false} solutions={SOLUTIONS} products={PRODUCTS} />);
    expect(screen.queryByRole("button", { name: "Register your own API" })).toBeNull();
  });
});

describe("an interface on your own API", () => {
  it("shows its own service and version instead of a catalogue service", () => {
    render(<InterfacesClient interfaces={[CUSTOM]} canAuthor products={PRODUCTS} />);
    expect(screen.getByText("Your own service")).toBeTruthy();
    expect(screen.getByText(PATH)).toBeTruthy();
    expect(screen.queryByText("Catalogue service")).toBeNull();
    expect(screen.getByText("Not verified since it last changed")).toBeTruthy();
  });

  it("Mark ACTIVE on an unverified custom WRITE interface is disabled and says why", () => {
    render(<InterfacesClient interfaces={[CUSTOM]} canAuthor products={PRODUCTS} />);
    const btn = screen.getByRole("button", { name: "Mark ACTIVE" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.title).toMatch(/Verify this interface's own SAP service first/);
  });

  it("once verified, Mark ACTIVE is offered", () => {
    render(
      <InterfacesClient
        interfaces={[{ ...CUSTOM, serviceVerifiedAt: "2026-10-19T10:00:00.000Z", serviceVerifiedEnvironment: "DEV", serviceVerifiedEntitySets: ["A_Travel"] }]}
        canAuthor
        products={PRODUCTS}
      />,
    );
    expect((screen.getByRole("button", { name: "Mark ACTIVE" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText(/Last verified in DEV on 2026-10-19 10:00 UTC · 1 dataset/)).toBeTruthy();
  });

  it("Verify asks the chosen environment and offers the datasets SAP listed", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: {
            status: "OK",
            verified: true,
            detail: "The service answered with its description.",
            entitySets: ["A_Travel", "A_Booking"],
            entitySet: "A_Travel",
            suggestedEntitySet: null,
            boundTo: { label: "ERP DEV", environment: "DEV", sapClient: "100" },
          },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <InterfacesClient
        interfaces={[CUSTOM]}
        canAuthor
        products={PRODUCTS}
        verifyTargets={[{ product: "s4hana-onprem", environment: "DEV", sapClient: "100", label: "ERP DEV" }]}
      />,
    );
    expect(screen.getByRole("option", { name: "DEV · client 100 · ERP DEV" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() => expect(screen.getByText("Answered by ERP DEV")).toBeTruthy());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/studio/interfaces/if_c/verify-service");
    expect(JSON.parse(String(init.body))).toEqual({ environment: "DEV", sapClient: "100" });
    expect(screen.getByRole("option", { name: "A_Booking" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Use this dataset" })).toBeTruthy();
  });

  it("the dataset picker opens on the interface's own dataset, not the first one listed (review round 3)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: {
              status: "OK",
              verified: true,
              detail: "The service answered with its description.",
              entitySets: ["A_Booking", "A_Travel"],
              entitySet: "A_Travel",
              suggestedEntitySet: null,
              boundTo: { label: "ERP DEV", environment: "DEV", sapClient: "100" },
            },
          }),
          { status: 200 },
        ),
      ),
    );
    render(
      <InterfacesClient
        interfaces={[CUSTOM]}
        canAuthor
        products={PRODUCTS}
        verifyTargets={[{ product: "s4hana-onprem", environment: "DEV", sapClient: "100", label: "ERP DEV" }]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    await screen.findByText("Answered by ERP DEV");
    const picker = screen.getByLabelText("Datasets") as HTMLSelectElement;
    expect(picker.value).toBe("A_Travel");
    const use = screen.getByRole("button", { name: "Use this dataset" }) as HTMLButtonElement;
    expect(use.disabled).toBe(true);
    // Choosing another dataset is still one deliberate change away.
    fireEvent.change(picker, { target: { value: "A_Booking" } });
    expect(use.disabled).toBe(false);
  });

  it("says there is nothing to ask when no connection declares an environment", () => {
    render(<InterfacesClient interfaces={[CUSTOM]} canAuthor products={PRODUCTS} verifyTargets={[]} />);
    expect(screen.getByText(/No connection for this product declares an environment yet/)).toBeTruthy();
  });
});

describe("review round 1 — the version, per-environment verification, live-write warnings", () => {
  function patchAndVerifyFetch(verifyOutcomes: unknown[]) {
    const outcomes = [...verifyOutcomes];
    return vi.fn(async (url: string) => {
      if (url === "/api/studio/interfaces") {
        return new Response(JSON.stringify({ data: { id: "if_c" } }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: outcomes.shift() }), { status: 200 });
    });
  }

  it("a new V4 path infers V4, and the version is sent with the path", async () => {
    const fetchMock = patchAndVerifyFetch([]);
    vi.stubGlobal("fetch", fetchMock);
    render(<InterfacesClient interfaces={[CUSTOM]} canAuthor products={PRODUCTS} />);
    fireEvent.click(screen.getByRole("button", { name: "Change path or version" }));
    const v4 = "/sap/opu/odata4/sap/zui_x_o4/srvd_a2x/sap/zx/0001";
    fireEvent.change(screen.getByLabelText("Service path"), { target: { value: v4 } });
    expect((screen.getByRole("radio", { name: "OData V4" }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ id: "if_c", servicePath: v4, odataVersion: "V4" });
  });

  it("the version alone can be changed, and the warning says grants stay attached", async () => {
    const fetchMock = patchAndVerifyFetch([]);
    vi.stubGlobal("fetch", fetchMock);
    render(<InterfacesClient interfaces={[CUSTOM]} canAuthor products={PRODUCTS} />);
    fireEvent.click(screen.getByRole("button", { name: "Change path or version" }));
    expect(screen.getByText(/A version change alone keeps the grants attached/)).toBeTruthy();
    const save = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "OData V4" }));
    fireEvent.click(save);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ id: "if_c", odataVersion: "V4" });
  });

  it("VERSION_MISMATCH offers to switch the version, then verifies again", async () => {
    const mismatch = {
      status: "VERSION_MISMATCH",
      verified: false,
      detail: "This service describes itself as OData V4, but the interface says V2. Change the version, then verify again.",
      entitySets: ["Travel"],
      entitySet: "A_Travel",
      suggestedEntitySet: null,
      detectedODataVersion: "V4",
      boundTo: { label: "ERP DEV", environment: "DEV", sapClient: "100" },
    };
    const ok = { ...mismatch, status: "OK", verified: true, detail: "The service answered with its description." };
    const fetchMock = patchAndVerifyFetch([mismatch, ok]);
    vi.stubGlobal("fetch", fetchMock);
    render(
      <InterfacesClient
        interfaces={[CUSTOM]}
        canAuthor
        products={PRODUCTS}
        verifyTargets={[{ product: "s4hana-onprem", environment: "DEV", sapClient: "100", label: "ERP DEV" }]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    const switchBtn = await screen.findByRole("button", { name: "Switch to V4 and verify again" });
    fireEvent.click(switchBtn);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls[1]![0]).toBe("/api/studio/interfaces");
    expect(JSON.parse(String(calls[1]![1].body))).toEqual({ id: "if_c", odataVersion: "V4" });
    expect(calls[2]![0]).toBe("/api/studio/interfaces/if_c/verify-service");
  });

  it("lists the environments verified, because writes are allowed only there", () => {
    render(
      <InterfacesClient
        interfaces={[
          {
            ...CUSTOM,
            serviceVerifiedAt: "2026-10-19T10:00:00.000Z",
            serviceVerifiedEnvironment: "DEV",
            serviceVerifiedEnvironments: [
              { environment: "SANDBOX", at: "2026-10-18T10:00:00.000Z", sapClient: null },
              { environment: "DEV", at: "2026-10-19T10:00:00.000Z", sapClient: "100" },
            ],
          },
        ]}
        canAuthor
        products={PRODUCTS}
      />,
    );
    expect(
      screen.getByText(/Writes are allowed only in the environments verified here: SANDBOX, DEV \(client 100\)\. .*a DEV verify does not open PROD/),
    ).toBeTruthy();
  });

  it("a live custom WRITE interface warns before a dataset change stops its writes", () => {
    render(
      <InterfacesClient interfaces={[{ ...CUSTOM, status: "ACTIVE" }]} canAuthor products={PRODUCTS} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(screen.getByText(/This write interface is live\. Saving a new dataset clears verification and returns it to draft/)).toBeTruthy();
  });

  it("a catalogue or draft interface shows no such warning", () => {
    render(<InterfacesClient interfaces={[CUSTOM]} canAuthor products={PRODUCTS} />);
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(screen.queryByText(/This write interface is live/)).toBeNull();
  });
});

describe("review round 2 — a result describes one version; a changed connection is not open", () => {
  const TARGETS = [{ product: "s4hana-onprem", environment: "DEV", sapClient: "100", label: "ERP DEV" }];
  const OK_V2 = {
    status: "OK",
    verified: true,
    detail: 'The service answered with its description and offers the dataset "A_Travel" (2 datasets in all).',
    entitySets: ["A_Travel", "A_Booking"],
    entitySet: "A_Travel",
    suggestedEntitySet: null,
    boundTo: { label: "ERP DEV", environment: "DEV", sapClient: "100" },
    interfaceVersion: 2,
  };

  it("after the path changes elsewhere, the old 'verified' result and its dataset picker are gone", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: OK_V2 }), { status: 200 })));
    const verified = { ...CUSTOM, serviceVerifiedAt: "2026-10-19T10:00:00.000Z", serviceVerifiedEnvironment: "DEV" };
    const { rerender } = render(
      <InterfacesClient interfaces={[verified]} canAuthor products={PRODUCTS} verifyTargets={TARGETS} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    await screen.findByText("Answered by ERP DEV");
    expect(screen.getByRole("button", { name: "Use this dataset" })).toBeTruthy();

    // What router.refresh brings after "Change path or version" saved ZNEW.
    rerender(
      <InterfacesClient
        interfaces={[
          {
            ...CUSTOM,
            version: 3,
            servicePath: "/sap/opu/odata/sap/ZNEW",
            externalId: "custom:/sap/opu/odata/sap/ZNEW",
            serviceVerifiedAt: null,
          },
        ]}
        canAuthor
        products={PRODUCTS}
        verifyTargets={TARGETS}
      />,
    );
    expect(screen.getByText("Not verified since it last changed")).toBeTruthy();
    expect(screen.queryByText("verified")).toBeNull();
    expect(screen.queryByText("Answered by ERP DEV")).toBeNull();
    expect(screen.queryByText(/offers the dataset "A_Travel"/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Use this dataset" })).toBeNull();
  });

  it("a result for the current version stays shown across a refresh", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: OK_V2 }), { status: 200 })));
    const { rerender } = render(
      <InterfacesClient interfaces={[CUSTOM]} canAuthor products={PRODUCTS} verifyTargets={TARGETS} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    await screen.findByText("Answered by ERP DEV");
    rerender(
      <InterfacesClient
        interfaces={[{ ...CUSTOM, serviceVerifiedAt: "2026-10-20T10:00:00.000Z", serviceVerifiedEnvironment: "DEV" }]}
        canAuthor
        products={PRODUCTS}
        verifyTargets={TARGETS}
      />,
    );
    expect(screen.getByText("Answered by ERP DEV")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Use this dataset" })).toBeTruthy();
  });

  it("an environment whose connection changed since its verify is not listed as open for writes", () => {
    render(
      <InterfacesClient
        interfaces={[
          {
            ...CUSTOM,
            serviceVerifiedAt: "2026-10-19T10:00:00.000Z",
            serviceVerifiedEnvironment: "DEV",
            serviceVerifiedEnvironments: [
              { environment: "DEV", at: "2026-10-19T10:00:00.000Z", sapClient: "100", connectionChanged: true },
              { environment: "TEST", at: "2026-10-19T11:00:00.000Z", sapClient: "100", connectionChanged: false },
            ],
          },
        ]}
        canAuthor
        products={PRODUCTS}
      />,
    );
    expect(screen.getByText(/Writes are allowed only in the environments verified here: TEST \(client 100\)\./)).toBeTruthy();
    expect(
      screen.getByText(/Verify again: the connection for DEV \(client 100\) has changed since it was verified, so writes there are refused\./),
    ).toBeTruthy();
  });

  it("the Write chain row names a missing verification for your own API", () => {
    render(
      <InterfacesClient
        interfaces={[
          {
            ...CUSTOM,
            serviceVerifiedAt: "2026-10-19T10:00:00.000Z",
            writeReadiness: [
              { environment: "SANDBOX", credential: "none", grant: "none", service: "verified", ready: false },
              { environment: "PROD", credential: "ready", grant: "approved", service: "not-verified", ready: false },
            ],
          },
        ]}
        canAuthor
        products={PRODUCTS}
      />,
    );
    expect(screen.getByText("PROD: credential with write key · write grant approved · service not verified here")).toBeTruthy();
    expect(screen.getByText(/or a verification of this service in that environment/)).toBeTruthy();
    const btn = screen.getByRole("button", { name: "Mark ACTIVE" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.title).toMatch(/this service verified there/);
  });
});
