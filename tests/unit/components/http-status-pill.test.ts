import { describe, expect, it } from "vitest";
import { httpTone } from "@/components/sap/HttpStatusPill";

describe("httpTone — honest heartbeat mapping", () => {
  it("200 with rows → green (ok)", () => {
    expect(httpTone(true)).toBe("ok");
    expect(httpTone(true, false)).toBe("ok");
  });

  it("200 but empty → amber (reachable, no data) — not a false green", () => {
    expect(httpTone(true, true)).toBe("empty");
  });

  it("non-2xx → red (error)", () => {
    expect(httpTone(false)).toBe("error");
    expect(httpTone(false, true)).toBe("error"); // error wins over empty
  });

  it("not run → neutral", () => {
    expect(httpTone(undefined)).toBe("neutral");
  });
});
