/**
 * The passport says, on every row, whether the approval is a read or a write
 * into SAP (P0.3 review round 1).
 *
 * THE DEFECT. Since rows were keyed by grant, a READ and a CREATE approval for
 * one feed both render — and render identically: no column showed the
 * operation, so with one approver and no end date the two lines were
 * byte-for-byte the same. The subtitle promises "what ABeam apps may read, and
 * write" and a "Writes into SAP" tile counts them, yet a client CIO could not
 * tell which line lets the app write, so could not ask for that one to stop.
 * The tile also counted every non-READ row, including a CREATE approval
 * decided READ_ONLY, which `grantsWrite` refuses: it writes nothing.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PassportRow } from "@/lib/coreedge/queries";

const mocks = vi.hoisted(() => ({
  user: { id: "u1", role: "consultant", organizationId: "org1", email: "cio@org1.test" } as Record<string, unknown> | null,
  listPassport: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => mocks.user }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/coreedge/queries", () => ({ listPassport: mocks.listPassport }));
vi.mock("@/app/(coreedge)/coreedge/CoreEdgeShell", () => ({
  CoreEdgeShell: ({ children }: { children: unknown }) => <main>{children as never}</main>,
}));

function row(over: Partial<PassportRow>): PassportRow {
  return {
    id: "g",
    appName: "PO intake",
    feedName: "Purchase orders",
    externalId: "purchase-orders",
    environment: "DEV",
    environmentRaw: "DEV",
    operation: "READ",
    writesIntoSap: false,
    approvedBy: "Colleague",
    approvedAt: new Date("2026-10-01T00:00:00Z"),
    accessEnds: null,
    keyState: "active",
    fieldsApproved: null,
    ...over,
  };
}

async function render(): Promise<string> {
  const { default: PassportPage } = await import("@/app/(coreedge)/coreedge/passport/page");
  return renderToStaticMarkup((await PassportPage()) as never);
}

function bodyRows(html: string): string[] {
  const body = html.slice(html.indexOf("<tbody"), html.indexOf("</tbody>"));
  return body.split("<tr").slice(1);
}

/** The number under a tile's label. */
function tile(html: string, label: string): string | undefined {
  return new RegExp(`${label}</dt><dd[^>]*>(\\d+)</dd>`).exec(html)?.[1];
}

beforeEach(() => vi.clearAllMocks());

describe("the passport's access column", () => {
  it("tells a READ approval from a CREATE approval for the same feed", async () => {
    mocks.listPassport.mockResolvedValue([
      row({ id: "g-read", operation: "READ" }),
      row({ id: "g-create", operation: "CREATE", writesIntoSap: true }),
    ]);

    const html = await render();
    const [read, create] = bodyRows(html);

    expect(read).not.toBe(create);
    expect(read).toContain(">Read<");
    expect(create).toContain("Write: create");
    expect(tile(html, "Writes into SAP")).toBe("1");
  });

  it("names an update as a write too", async () => {
    mocks.listPassport.mockResolvedValue([row({ id: "g-upd", operation: "UPDATE", writesIntoSap: true })]);
    expect(bodyRows(await render())[0]).toContain("Write: update");
  });

  it("does not count, or call, a write approval decided READ_ONLY a write into SAP", async () => {
    mocks.listPassport.mockResolvedValue([row({ id: "g-legacy", operation: "CREATE", writesIntoSap: false })]);

    const html = await render();
    expect(tile(html, "Writes into SAP")).toBe("0");
    const [legacy] = bodyRows(html);
    expect(legacy).not.toContain("Write: create");
    expect(legacy).toMatch(/no write/i);
  });
});
