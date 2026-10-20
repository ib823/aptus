/**
 * Opening a claim link changes nothing; pressing the button collects the key.
 *
 * THE DEFECT (A11). `/claim/:token` called `claimKey` while rendering the GET,
 * so the first GET minted the key, spent the link and printed the key into the
 * HTML. Mail scanners (Defender Safe Links) and chat unfurlers (Slack, Teams)
 * GET every URL in a message before a person does, and this product has no
 * mail sender — every link goes out through exactly those channels. The
 * scanner got the only copy; the recipient got "This link can't be used".
 *
 * So the GET is rendered here as a scanner would fetch it — twice — and the
 * store is read afterwards: no key row, no spent link. Then the POST a click
 * sends is driven, and only that mints.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", async () => {
  const { laneStore } = await import("../../helpers/credential-lane-store");
  return { prisma: laneStore.client };
});

import { laneStore } from "../../helpers/credential-lane-store";
import ClaimPage from "@/app/(external)/claim/[token]/page";
import { POST as collect } from "@/app/(external)/claim/[token]/collect/route";
import { CollectKey } from "@/app/(external)/claim/[token]/CollectKey";
import { createClaimLink } from "@/lib/northbound/claim-link";

const ORG = "org_a";

beforeEach(() => {
  laneStore.reset();
  laneStore.solutions.push({
    id: "sol_1",
    organizationId: ORG,
    name: "Finance accelerator",
    status: "ACTIVE",
    technicalOwnerId: "u_tech",
    businessOwnerId: "u_biz",
    supportOwnerId: "u_sup",
  });
});

async function sendLink(): Promise<string> {
  const link = await createClaimLink({
    organizationId: ORG,
    solutionId: "sol_1",
    environment: "PROD",
    createdById: "u_sender",
  });
  return link.rawToken;
}

async function renderGet(token: string): Promise<string> {
  const tree = await ClaimPage({ params: Promise.resolve({ token }) });
  return renderToStaticMarkup(tree as never);
}

function postCollect(token: string) {
  return collect(new Request(`http://localhost/claim/${token}/collect`, { method: "POST" }) as never, {
    params: Promise.resolve({ token }),
  });
}

describe("GET /claim/:token is side-effect free", () => {
  it("a scanner's GET, and then another, mints nothing and spends nothing", async () => {
    const token = await sendLink();
    const linkBefore = { ...laneStore.links[0] };

    const first = await renderGet(token);
    const second = await renderGet(token);

    // What the scanner sees: the button, and no key.
    for (const html of [first, second]) {
      expect(html).toContain("Collect your key");
      expect(html).not.toMatch(/ce_[A-Za-z0-9_-]{20,}/);
    }
    // What the store holds afterwards: exactly what it held before.
    expect(laneStore.clients).toHaveLength(0);
    expect(laneStore.links[0]).toEqual(linkBefore);
    expect(laneStore.audits).toHaveLength(0);
  });

  it("the person's POST after the scanner's GET still collects the key", async () => {
    const token = await sendLink();
    await renderGet(token);

    const res = await postCollect(token);
    const body = (await res.json()) as { data: { rawToken: string; environment: string } };

    expect(res.status).toBe(200);
    expect(body.data.rawToken).toMatch(/^ce_/);
    expect(body.data.environment).toBe("PROD");
    // A cache that kept this response would be a second place the key lives.
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(laneStore.clients).toHaveLength(1);
    expect(laneStore.links[0]!.claimedAt).toBeInstanceOf(Date);
  });

  it("once collected, both the GET and a second POST refuse — in one shape", async () => {
    const token = await sendLink();
    await postCollect(token);

    expect(await renderGet(token)).toContain("This link can&#x27;t be used.");
    const spent = await postCollect(token);
    const unknown = await postCollect("cec_never_issued");

    expect(spent.status).toBe(unknown.status);
    expect(await spent.json()).toEqual(await unknown.json());
    expect(laneStore.clients).toHaveLength(1);
  });

  it("has no GET handler on the collect path for a scanner to follow", async () => {
    const route = await import("@/app/(external)/claim/[token]/collect/route");
    expect("GET" in route).toBe(false);
  });
});

describe("the collect button", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function renderButton(overlapHours = 0) {
    render(
      <CollectKey
        collectPath="/claim/cec_x/collect"
        keyPrefix="ce_live_"
        solutionName="Finance accelerator"
        environment="PROD"
        keyExpiresAt="2027-01-18T09:00:00.000Z"
        overlapHours={overlapHours}
      />,
    );
  }

  it("says before the press when the key will stop, and that a working key overlaps (P0.11)", () => {
    renderButton(24);
    expect(screen.getByText(/It will stop working on/)).toBeInTheDocument();
    expect(screen.getByText(/keeps working for 24 hours after you collect this one/)).toBeInTheDocument();
  });

  it("says after the press when the key stops, and until when the replaced key still works", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            rawToken: "ce_live_the_only_copy_abcd",
            environment: "PROD",
            solutionName: "Finance accelerator",
            tail: "abcd",
            tokenPrefix: "ce_live_",
            expiresAt: "2027-01-18T09:00:00.000Z",
            previousValidUntil: "2026-10-21T09:00:00.000Z",
          },
        }),
        { status: 200 },
      ),
    );
    renderButton(24);
    fireEvent.click(screen.getByRole("button", { name: "Collect your key" }));

    await waitFor(() => expect(screen.getByText("ce_live_the_only_copy_abcd")).toBeInTheDocument());
    expect(screen.getByText(/It stops working on/)).toBeInTheDocument();
    expect(screen.getByText(/The key this replaces keeps working until/)).toBeInTheDocument();
  });

  it("POSTs only when pressed, then shows the key once", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { rawToken: "ce_the_only_copy_abcd", environment: "PROD", solutionName: "Finance accelerator", tail: "abcd" },
        }),
        { status: 200 },
      ),
    );
    renderButton();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Collect your key" }));

    await waitFor(() => expect(screen.getByText("ce_the_only_copy_abcd")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith("/claim/cec_x/collect", expect.objectContaining({ method: "POST" }));
  });

  it("shows the one uniform refusal when the server refuses", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "This link can't be used." } }), { status: 404 }),
    );
    renderButton();

    fireEvent.click(screen.getByRole("button", { name: "Collect your key" }));

    await waitFor(() => expect(screen.getByText("This link can't be used.")).toBeInTheDocument());
  });

  it("keeps the button when the server could not be reached — the link may still be good", async () => {
    fetchMock.mockRejectedValue(new TypeError("network down"));
    renderButton();

    fireEvent.click(screen.getByRole("button", { name: "Collect your key" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("could not be reached"));
    expect(screen.getByRole("button", { name: "Collect your key" })).toBeInTheDocument();
  });
});
