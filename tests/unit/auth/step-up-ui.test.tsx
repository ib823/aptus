/**
 * The console's side of the step-up: the dialog a refused governance action
 * opens, and the banner warn mode shows. The server side and the retry are
 * covered in step-up.test.ts, step-up-client.test.ts and
 * step-up-governance-routes.test.ts.
 */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ startAuthentication: vi.fn() }));
vi.mock("@simplewebauthn/browser", () => ({
  startAuthentication: mocks.startAuthentication,
  startRegistration: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { StepUpBanner } from "@/components/auth/StepUpBanner";
import { StepUpDialog } from "@/components/auth/StepUpDialog";
import { fetchWithStepUp } from "@/lib/auth/step-up-client";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();

beforeEach(() => {
  fetchMock.mockReset();
  mocks.startAuthentication.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("StepUpDialog", () => {
  it("opens on a STEP_UP_REQUIRED refusal, asks for the passkey, and lets the action through", async () => {
    render(<StepUpDialog />);
    mocks.startAuthentication.mockResolvedValue({ id: "cred" });
    fetchMock
      .mockResolvedValueOnce(json(403, { error: { code: "STEP_UP_REQUIRED", message: "x" } }))
      .mockResolvedValueOnce(json(200, { data: {} })) // step-up options
      .mockResolvedValueOnce(json(200, { data: { assertedAt: "now" } })) // step-up verify
      .mockResolvedValueOnce(json(200, { data: { decided: true } })); // the retry

    let result: Promise<Response> | undefined;
    act(() => {
      result = fetchWithStepUp("/api/coreedge/requests/g1/decide", { method: "POST", body: "{}" });
    });

    fireEvent.click(await screen.findByRole("button", { name: /use passkey/i }));

    // The ceremony and the dialog closing are state updates; settle them in act.
    const res = await act(async () => result!);
    expect(res.status).toBe(200);
    expect(mocks.startAuthentication).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("button", { name: /use passkey/i })).toBeNull());
  });

  it("cancelling hands the refusal back, and nothing is retried", async () => {
    render(<StepUpDialog />);
    fetchMock.mockResolvedValueOnce(json(403, { error: { code: "STEP_UP_REQUIRED", message: "x" } }));

    let result: Promise<Response> | undefined;
    act(() => {
      result = fetchWithStepUp("/api/studio/clients", { method: "POST", body: "{}" });
    });
    fireEvent.click(await screen.findByRole("button", { name: /cancel/i }));

    expect((await act(async () => result!)).status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("offers enrolment, in place, to someone with no passkey", async () => {
    render(<StepUpDialog />);
    fetchMock.mockResolvedValueOnce(json(403, { error: { code: "STEP_UP_ENROLMENT_REQUIRED", message: "x" } }));

    let result: Promise<Response> | undefined;
    act(() => {
      result = fetchWithStepUp("/api/studio/connections", { method: "POST", body: "{}" });
    });

    expect(await screen.findByText(/add a passkey to continue/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /use passkey/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect((await act(async () => result!)).status).toBe(403);
  });
});

describe("StepUpBanner", () => {
  it("warn, no passkey: says it is coming and links to enrolment", () => {
    render(<StepUpBanner mode="warn" hasPasskey={false} />);
    expect(screen.getByTestId("step-up-banner").textContent).toMatch(/will soon need a passkey/);
    expect(screen.getByRole("link", { name: /add a passkey/i }).getAttribute("href")).toBe("/settings/security");
  });

  it("warn, with a passkey: offers to confirm now, and says when it has", async () => {
    mocks.startAuthentication.mockResolvedValue({ id: "cred" });
    fetchMock
      .mockResolvedValueOnce(json(200, { data: {} }))
      .mockResolvedValueOnce(json(200, { data: { assertedAt: "now" } }));
    render(<StepUpBanner mode="warn" hasPasskey />);
    expect(screen.getByTestId("step-up-banner").textContent).toMatch(/recorded as taken without one/);

    fireEvent.click(screen.getByRole("button", { name: /confirm with passkey now/i }));

    expect(await screen.findByText(/count as passkey-checked/)).toBeTruthy();
  });

  it("enforce, no passkey: says the actions need one now", () => {
    render(<StepUpBanner mode="enforce" hasPasskey={false} />);
    expect(screen.getByTestId("step-up-banner").textContent).toMatch(/need a passkey, and your account has none/);
  });
});
