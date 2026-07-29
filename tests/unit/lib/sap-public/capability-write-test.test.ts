import { describe, expect, it } from "vitest";
import { WRITE_TEST_CONFIRMATION, assertWriteTestAllowed } from "@/lib/sap-public/capability-write-test";

const FULL = {
  writeEnabled: true,
  authenticated: true,
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
    // 403, NOT 401. This row asserted 401 and so PINNED the defect: an
    // authenticated non-admin was told to authenticate, which they already had.
    // A test can cover a line and still certify the wrong answer — the row was
    // green for as long as the bug existed, and green is what stopped anyone
    // looking. Its sibling route probe-all answers 403 to the same caller.
    ["authenticated but not admin", { isAdmin: false }, 403],
    ["no session at all", { authenticated: false, isAdmin: false }, 401],
    ["missing confirmation phrase", { confirmation: "nope" }, 400],
    ["invalid write secret", { writeSecretValid: false }, 403],
    ["write-test ring disabled", { ringEnabled: false }, 403],
    ["entity set not on allowlist", { entitySetAllowed: false }, 403],
  ])("refuses when %s", (_label, override, status) => {
    const res = assertWriteTestAllowed({ ...FULL, ...override });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(status);
  });

  it("keeps writeEnabled ahead of identity, so a disabled feature reveals nothing", () => {
    // Ordering is a property, not an accident: if the feature is off, the caller
    // must not learn whether they would otherwise have qualified.
    const res = assertWriteTestAllowed({ ...FULL, writeEnabled: false, authenticated: false, isAdmin: false });
    expect(res.status).toBe(403);
    expect(res.message).toContain("disabled");
  });

  it("refuses a bare/empty request outright", () => {
    const res = assertWriteTestAllowed({
      writeEnabled: false,
      authenticated: false,
      isAdmin: false,
      confirmation: "",
      writeSecretValid: false,
      ringEnabled: false,
      entitySetAllowed: false,
    });
    expect(res.ok).toBe(false);
  });
});
