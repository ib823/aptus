/**
 * The browser half of the step-up (lib/auth/step-up-client.ts): a refused
 * governance call becomes a passkey prompt and one retry, and nothing else
 * changes for a caller.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ startAuthentication: vi.fn() }));
vi.mock("@simplewebauthn/browser", () => ({ startAuthentication: mocks.startAuthentication }));

import { fetchWithStepUp, registerStepUpPrompt, runStepUpCeremony } from "@/lib/auth/step-up-client";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const refusedWith = (code: string) => json(403, { error: { code, message: `refused: ${code}` } });

const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();
const INIT: RequestInit = { method: "PATCH", body: JSON.stringify({ grantId: "g1", decision: "APPROVED" }) };

beforeEach(() => {
  fetchMock.mockReset();
  mocks.startAuthentication.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchWithStepUp", () => {
  it("passes every other answer straight through, without prompting", async () => {
    const prompt = vi.fn();
    const unregister = registerStepUpPrompt(prompt);
    for (const res of [json(200, { data: 1 }), json(409, {}), refusedWith("FORBIDDEN"), json(403, "not json")]) {
      fetchMock.mockResolvedValueOnce(res);
      expect(await fetchWithStepUp("/api/x", INIT)).toBe(res);
    }
    expect(prompt).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    unregister();
  });

  it("asks once on STEP_UP_REQUIRED and sends the same request again", async () => {
    const ok = json(200, { data: { id: "g1" } });
    fetchMock.mockResolvedValueOnce(refusedWith("STEP_UP_REQUIRED")).mockResolvedValueOnce(ok);
    const prompt = vi.fn().mockResolvedValue(true);
    const unregister = registerStepUpPrompt(prompt);

    const res = await fetchWithStepUp("/api/studio/access-grants", INIT);

    expect(res).toBe(ok);
    expect(prompt).toHaveBeenCalledWith("STEP_UP_REQUIRED");
    expect(fetchMock.mock.calls).toEqual([
      ["/api/studio/access-grants", INIT],
      ["/api/studio/access-grants", INIT],
    ]);
    unregister();
  });

  it("hands back the refusal, still readable, when the person does not step up", async () => {
    fetchMock.mockResolvedValueOnce(refusedWith("STEP_UP_ENROLMENT_REQUIRED"));
    const unregister = registerStepUpPrompt(vi.fn().mockResolvedValue(false));

    const res = await fetchWithStepUp("/api/x", INIT);

    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { message: string } }).error.message).toBe(
      "refused: STEP_UP_ENROLMENT_REQUIRED",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    unregister();
  });

  it("never prompts for a token refusal: there is nothing a passkey can fix", async () => {
    fetchMock.mockResolvedValueOnce(refusedWith("STEP_UP_TOKEN_REFUSED"));
    const prompt = vi.fn();
    const unregister = registerStepUpPrompt(prompt);
    expect((await fetchWithStepUp("/api/x", INIT)).status).toBe(403);
    expect(prompt).not.toHaveBeenCalled();
    unregister();
  });

  it("with no dialog mounted, runs the passkey ceremony itself and retries", async () => {
    mocks.startAuthentication.mockResolvedValue({ id: "cred" });
    fetchMock
      .mockResolvedValueOnce(refusedWith("STEP_UP_REQUIRED"))
      .mockResolvedValueOnce(json(200, { data: { challenge: "c" } })) // options
      .mockResolvedValueOnce(json(200, { data: { assertedAt: "now" } })) // verify
      .mockResolvedValueOnce(json(201, { data: { token: "ce_x" } }));

    const res = await fetchWithStepUp("/api/studio/clients", INIT);

    expect(res.status).toBe(201);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      "/api/studio/clients",
      "/api/auth/webauthn/step-up/options",
      "/api/auth/webauthn/step-up/verify",
      "/api/studio/clients",
    ]);
  });

  it("with no dialog mounted, does not retry an enrolment refusal", async () => {
    fetchMock.mockResolvedValueOnce(refusedWith("STEP_UP_ENROLMENT_REQUIRED"));
    expect((await fetchWithStepUp("/api/x", INIT)).status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("an unregistered dialog stops being asked", async () => {
    const prompt = vi.fn().mockResolvedValue(true);
    registerStepUpPrompt(prompt)();
    fetchMock.mockResolvedValueOnce(refusedWith("STEP_UP_ENROLMENT_REQUIRED"));
    await fetchWithStepUp("/api/x", INIT);
    expect(prompt).not.toHaveBeenCalled();
  });
});

describe("runStepUpCeremony", () => {
  it("reports enrolment when the account has no passkey", async () => {
    fetchMock.mockResolvedValueOnce(json(409, { error: { code: "STEP_UP_ENROLMENT_REQUIRED", message: "none" } }));
    expect(await runStepUpCeremony()).toEqual({ ok: false, reason: "enrol", message: "none" });
    expect(mocks.startAuthentication).not.toHaveBeenCalled();
  });

  it("treats a dismissed browser prompt as a cancel with nothing to say", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { data: {} }));
    mocks.startAuthentication.mockRejectedValue(new Error("The operation was cancelled"));
    expect(await runStepUpCeremony()).toEqual({ ok: false, reason: "cancelled", message: null });
  });

  it("passes on the server's sentence when verification fails", async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, { data: {} }))
      .mockResolvedValueOnce(json(403, { error: { message: "That passkey is not registered to your account." } }));
    mocks.startAuthentication.mockResolvedValue({ id: "someone-elses" });
    expect(await runStepUpCeremony()).toEqual({
      ok: false,
      reason: "failed",
      message: "That passkey is not registered to your account.",
    });
  });

  it("says something useful when the options call fails for another reason", async () => {
    fetchMock.mockResolvedValueOnce(json(429, null));
    const result = await runStepUpCeremony();
    expect(result).toMatchObject({ ok: false, reason: "failed" });
    expect(result.ok ? "" : result.message).toMatch(/passkey check/);
  });
});
