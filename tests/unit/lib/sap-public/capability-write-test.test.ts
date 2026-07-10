import { describe, expect, it } from "vitest";
import { WRITE_TEST_CONFIRMATION, assertWriteTestAllowed } from "@/lib/sap-public/capability-write-test";

const FULL = {
  writeEnabled: true,
  isAdmin: true,
  confirmation: WRITE_TEST_CONFIRMATION,
  writeSecretValid: true,
  ringEnabled: true,
  entitySetAllowed: true,
};

describe("assertWriteTestAllowed (fail-closed)", () => {
  it("allows only when EVERY factor passes", () => {
    expect(assertWriteTestAllowed(FULL)).toMatchObject({ ok: true, status: 200 });
  });

  it.each([
    ["write-back disabled", { writeEnabled: false }, 403],
    ["not admin", { isAdmin: false }, 401],
    ["missing confirmation phrase", { confirmation: "nope" }, 400],
    ["invalid write secret", { writeSecretValid: false }, 403],
    ["write-test ring disabled", { ringEnabled: false }, 403],
    ["entity set not on allowlist", { entitySetAllowed: false }, 403],
  ])("refuses when %s", (_label, override, status) => {
    const res = assertWriteTestAllowed({ ...FULL, ...override });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(status);
  });

  it("refuses a bare/empty request outright", () => {
    const res = assertWriteTestAllowed({
      writeEnabled: false,
      isAdmin: false,
      confirmation: "",
      writeSecretValid: false,
      ringEnabled: false,
      entitySetAllowed: false,
    });
    expect(res.ok).toBe(false);
  });
});
