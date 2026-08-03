/**
 * The scope boundary, asserted rather than assumed.
 *
 * CoreEdge sits close enough to "SAP development" that people reasonably expect
 * it to edit ABAP, deploy, or host their app. These tests keep the corrective
 * statements present where someone is most likely to form that assumption — and
 * keep the developer guide honest about the write path, which is READ-ONLY by
 * decision, not by omission.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.resolve(ROOT, p), "utf8");

const GUIDE = read("docs/coreedge-developer-guide.md");
const RUNBOOK = read("docs/coreedge/SAP-CONNECTION-KEYSTONE-RUNBOOK.md");
const SCOPE_NOTE = read("src/components/studio/ScopeNote.tsx");
const DISCOVER = read("src/app/(studio)/studio/discover/page.tsx");
const TEST_PAGE = read("src/app/(studio)/studio/test/page.tsx");

describe("the guide states what stays with the developer", () => {
  it("says the application code lives in their own repository", () => {
    expect(GUIDE).toContain("Your repository");
  });

  it("says their database and CI are untouched", () => {
    expect(GUIDE.toLowerCase()).toContain("your database");
    expect(GUIDE.toLowerCase()).toContain("run them offline");
  });

  it("shows how to generate a client in other languages", () => {
    // The OpenAPI is the portable artifact; TypeScript is a convenience.
    for (const lang of ["python", "go", "java"]) {
      expect(GUIDE).toContain(`-g ${lang}`);
    }
  });
});

describe("the guide is straight about ABAP", () => {
  it("says ABAP is built in ADT, not here", () => {
    expect(GUIDE).toContain("Build ABAP in ADT");
    expect(GUIDE.toLowerCase()).toContain("no abap editor");
  });

  it("explains the consumption bridge — the part CoreEdge DOES help with", () => {
    // Not just "we don't do that": what to do instead.
    expect(GUIDE.toLowerCase()).toContain("governs the odata your abap exposes");
  });

  it("explains what a non-probeable service will look like", () => {
    // So "Not probeable" reads as accurate rather than broken.
    expect(GUIDE).toContain("Not probeable");
  });
});

describe("the guide is straight about what is NOT built", () => {
  it("says there is no in-browser editing", () => {
    expect(GUIDE.toLowerCase()).toContain("no in-browser editing");
  });

  it("documents the write path's gates rather than leaving them to be discovered", () => {
    // Writes are now supported (PR-D6). A developer must know the rules BEFORE
    // calling, because four of the five gates return a 403 that looks identical
    // from the outside.
    expect(GUIDE).toContain("## Writing to SAP");
    expect(GUIDE).toContain("X-CoreEdge-Write-Key");
    expect(GUIDE.toLowerCase()).toContain("a read grant never authorises a write");
  });

  it("states that idempotency is mandatory, and why", () => {
    // The one gate with no way around it, and the one that prevents duplicate
    // records in a customer's ledger.
    expect(GUIDE).toContain("Idempotency is not optional");
    expect(GUIDE.toLowerCase()).toContain("reuse the same key when you retry");
    expect(GUIDE.toLowerCase()).toContain("two records in a\nclient's ledger");
  });

  it("explains the timeout case, which is the one that actually bites", () => {
    expect(GUIDE.toLowerCase()).toContain("a timeout is the case this exists for");
    expect(GUIDE.toLowerCase()).toContain("exactly one record");
  });

  it("says where the human oversight sits, since there is none per call", () => {
    expect(GUIDE.toLowerCase()).toContain("no per-call confirmation");
    expect(GUIDE.toLowerCase()).toContain("approved once");
  });

  it("says mapping is present-but-disabled rather than missing", () => {
    expect(GUIDE.toLowerCase()).toContain("mapping card is visible and");
  });
});

describe("honest status is taught, not just implemented", () => {
  it("gives the four states and what to do about each", () => {
    expect(GUIDE).toContain("No records");
    expect(GUIDE).toContain("Do not retry");
    expect(GUIDE).toContain("An empty result is not an error");
  });
});

describe("credential handling is explained where a developer will look", () => {
  it("says the token is shown once and cannot be recovered", () => {
    expect(GUIDE.toLowerCase()).toContain("shown **once**");
  });

  it("says who may issue it, and that owners may not", () => {
    expect(GUIDE.toLowerCase()).toContain("cannot issue its credential");
  });

  it("says rotation has no overlap window", () => {
    expect(GUIDE.toLowerCase()).toContain("no overlap window");
  });
});

describe("the scope notes sit where the assumption forms", () => {
  it("covers ABAP, bring-your-own stack, and the no-editor boundary", () => {
    // Assert the exported union rather than the object keys: hyphenated keys are
    // quoted in the literal, and the union is the actual contract callers use.
    const union = SCOPE_NOTE.slice(
      SCOPE_NOTE.indexOf("export type ScopeTopic"),
      SCOPE_NOTE.indexOf("const NOTES"),
    );
    for (const topic of ["abap", "byo-stack", "no-editor"]) {
      expect(union, `ScopeTopic must include ${topic}`).toContain(`"${topic}"`);
    }
  });

  it("puts the ABAP note on Discover, where an ABAP-exposed service appears", () => {
    expect(DISCOVER).toContain('<ScopeNote topic="abap" />');
  });

  it("puts the no-editor note on the Test Console, next to Scaffold", () => {
    expect(TEST_PAGE).toContain('<ScopeNote topic="no-editor" />');
  });

  it("links onward to the full guide rather than restating it", () => {
    expect(SCOPE_NOTE).toContain("coreedge-developer-guide");
  });
});

describe("the KMS gap is recorded before real credentials are stored", () => {
  it("names the env-var key as below the enterprise bar", () => {
    // Written down so it is a known debt rather than a later discovery.
    expect(RUNBOOK).toContain("KMS gap");
    expect(RUNBOOK.toLowerCase()).toContain("is not the\nenterprise bar");
  });

  it("lists key versioning and rotation as missing", () => {
    expect(RUNBOOK.toLowerCase()).toContain("key versioning");
    expect(RUNBOOK).toContain("migrate:reseal");
  });

  it("states the consequence of losing the key", () => {
    expect(RUNBOOK.toLowerCase()).toContain("losing the key");
  });

  it("documents the AAD binding and the attack it closes", () => {
    expect(RUNBOOK).toContain("connectionAad");
    expect(RUNBOOK.toLowerCase()).toContain("free-floating secret");
  });
});
