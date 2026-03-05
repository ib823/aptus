import { describe, expect, it } from "vitest";
import { safeParseJsonBody } from "@/lib/http/safe-json-body";

describe("safeParseJsonBody", () => {
  it("returns parsed data for valid JSON", async () => {
    const request = new Request("http://localhost/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ a: 1 }),
    });

    const result = await safeParseJsonBody(request);
    expect(result).toEqual({ ok: true, data: { a: 1 } });
  });

  it("returns invalid_json for malformed JSON", async () => {
    const request = new Request("http://localhost/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const result = await safeParseJsonBody(request);
    expect(result).toEqual({ ok: false, reason: "invalid_json" });
  });

  it("returns aborted for aborted body reads", async () => {
    const aborted = Object.assign(new Error("aborted"), { code: "ECONNRESET" });
    const request = {
      json: async () => Promise.reject(aborted),
    } as unknown as Request;

    const result = await safeParseJsonBody(request);
    expect(result).toEqual({ ok: false, reason: "aborted" });
  });

  it("rethrows unknown parsing errors", async () => {
    const request = {
      json: async () => Promise.reject(new Error("boom")),
    } as unknown as Request;

    await expect(safeParseJsonBody(request)).rejects.toThrow("boom");
  });
});
