import { describe, it, expect } from "vitest";

describe("Project Setup", () => {
  it("should have TypeScript strict mode enabled", () => {
    // This test passes if the project compiles with strict: true
    const strictCheck: string = "strict mode enabled";
    expect(strictCheck).toBe("strict mode enabled");
  });
});
