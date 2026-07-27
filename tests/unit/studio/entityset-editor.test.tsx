/**
 * Setting an interface's entity set.
 *
 * WHY THIS WAS UNREACHABLE: the PATCH route has accepted `entitySet` since the
 * field was added, and no UI ever sent it. Discover creates every interface
 * without one, so every interface read "not set" — and the broker refuses the
 * read with 400 "This interface has no entity set configured. Set one in
 * Studio", advice that could not be followed anywhere in the product. The value
 * is the difference between an interface that 400s and one that returns rows.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { InterfacesClient, type StudioInterface } from "@/components/studio/InterfacesClient";

const BASE: StudioInterface = {
  id: "if_1",
  name: "Business Partner read",
  version: 1,
  sapProduct: "s4hana",
  externalId: "API_BUSINESS_PARTNER",
  operation: "READ",
  entitySet: null,
  mode: "READ",
  status: "DRAFT",
  mappingVersion: null,
  hasRequestSchema: false,
  hasResponseSchema: false,
  solutionId: "sol_1",
  solutionName: "Acme Portal",
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: {} }) });
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, reload: vi.fn() },
  });
});

function lastPatchBody() {
  const [, init] = fetchMock.mock.calls[0]!;
  return JSON.parse(init.body as string);
}

describe("an unset entity set can be set", () => {
  it("offers 'Set' when there is none, and PATCHes the trimmed value", async () => {
    render(<InterfacesClient interfaces={[BASE]} canAuthor={true} />);

    fireEvent.click(screen.getByRole("button", { name: "Set" }));
    fireEvent.change(screen.getByLabelText("Entity set"), {
      target: { value: "  A_BusinessPartner  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());

    expect(lastPatchBody()).toEqual({ id: "if_1", entitySet: "A_BusinessPartner" });
  });

  it("offers 'Change' once one exists", () => {
    render(
      <InterfacesClient
        interfaces={[{ ...BASE, entitySet: "A_BusinessPartner" }]}
        canAuthor={true}
      />,
    );
    expect(screen.getByRole("button", { name: "Change" })).toBeTruthy();
  });
});

describe("clearing is supported, because a wrong value must be removable", () => {
  it("sends null when the field is emptied", async () => {
    render(
      <InterfacesClient
        interfaces={[{ ...BASE, entitySet: "A_WrongEntity" }]}
        canAuthor={true}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    fireEvent.change(screen.getByLabelText("Entity set"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());

    // null, not "" — the column is nullable and an empty string is not an entity
    // set, it is the absence of one.
    expect(lastPatchBody()).toEqual({ id: "if_1", entitySet: null });
  });
});

describe("it does not send no-op writes", () => {
  it("disables Save while the draft equals the stored value", () => {
    render(
      <InterfacesClient
        interfaces={[{ ...BASE, entitySet: "A_BusinessPartner" }]}
        canAuthor={true}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Change" }));

    // Unchanged: saving would bump the interface version for nothing, since the
    // route treats an entitySet change as a contract change.
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Entity set"), { target: { value: "A_Other" } });
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("it is gated like every other authoring action", () => {
  it("renders the value read-only for a role that cannot author", () => {
    render(
      <InterfacesClient
        interfaces={[{ ...BASE, entitySet: "A_BusinessPartner" }]}
        canAuthor={false}
      />,
    );
    expect(screen.queryByRole("button", { name: "Change" })).toBeNull();
    expect(screen.queryByLabelText("Entity set")).toBeNull();
  });

  it("still shows 'not set' honestly rather than hiding the gap", () => {
    render(<InterfacesClient interfaces={[BASE]} canAuthor={false} />);
    expect(screen.getAllByText("not set").length).toBeGreaterThan(0);
  });
});
