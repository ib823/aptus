/**
 * An owner slot may hold you, or nobody. Never a third party.
 *
 * WHY THIS IS A SECURITY TEST AND NOT A UI PREFERENCE. Issuing a runtime
 * credential requires all three owner slots filled AND refuses anyone who is
 * themselves an owner (`POST /api/studio/clients`). Those two rules together are
 * a two-human control: one person accepts accountability, a different person
 * issues.
 *
 * Allow arbitrary assignment and the control collapses. A consultant writes
 * three colleagues' ids into the slots — colleagues who did nothing and know
 * nothing — is not themselves an owner, and issues the credential alone. One
 * human, three unwitting names on the audit record, and a record that reads as
 * though accountability was accepted. That is worse than having no owner field:
 * the gate still appears to have been satisfied.
 *
 * The UI only ever offered claim and clear, so the product behaved correctly.
 * The route accepted any id. A control that lives only in a client is not a
 * control, and the two layers disagreeing is the thing this closes.
 *
 * CLEARING SOMEONE ELSE'S SLOT STAYS ALLOWED, deliberately — it is the recovery
 * path when an owner leaves. Clearing never makes anyone accountable; it makes
 * the solution visibly unowned, which auto-drops an ACTIVE solution to
 * RESTRICTED and is written to the config audit. So there is no orphan trap,
 * and claim-only costs nothing operationally.
 */

import { describe, expect, it } from "vitest";

import {
  OWNER_FIELDS,
  ownerAssignmentRefusal,
  rejectedOwnerAssignments,
  type OwnerField,
} from "@/lib/studio/solutions";

const ME = "user_me";
const SOMEONE_ELSE = "user_them";

describe("claiming a slot", () => {
  it("allows every slot to be set to the caller", () => {
    for (const field of OWNER_FIELDS) {
      expect(rejectedOwnerAssignments({ [field]: ME }, ME), field).toEqual([]);
    }
  });

  it("allows all three at once", () => {
    expect(
      rejectedOwnerAssignments(
        { technicalOwnerId: ME, businessOwnerId: ME, supportOwnerId: ME },
        ME,
      ),
    ).toEqual([]);
  });
});

describe("assigning someone else", () => {
  it("refuses every slot, named individually", () => {
    for (const field of OWNER_FIELDS) {
      expect(rejectedOwnerAssignments({ [field]: SOMEONE_ELSE }, ME), field).toEqual([field]);
    }
  });

  it("refuses the exact bypass: three colleagues, then issue it yourself", () => {
    // The attack in one line. Naming three other people leaves the caller a
    // non-owner, so the segregation check in the credential route would pass.
    const rejected = rejectedOwnerAssignments(
      { technicalOwnerId: "u_a", businessOwnerId: "u_b", supportOwnerId: "u_c" },
      ME,
    );
    expect(rejected).toEqual([...OWNER_FIELDS]);
  });

  it("refuses a mixed payload rather than accepting the valid half", () => {
    const rejected = rejectedOwnerAssignments(
      { technicalOwnerId: ME, businessOwnerId: SOMEONE_ELSE },
      ME,
    );
    expect(rejected).toEqual(["businessOwnerId"]);
  });
});

describe("clearing a slot", () => {
  it("is always allowed — it is how a departed owner's slot is recovered", () => {
    for (const field of OWNER_FIELDS) {
      expect(rejectedOwnerAssignments({ [field]: null }, ME), field).toEqual([]);
    }
  });

  it("is allowed even when the slot currently holds somebody else", () => {
    // Clearing never makes anyone accountable, so it cannot manufacture the
    // record the assignment bypass depends on. It makes the solution unowned,
    // which is visible, auto-drops ACTIVE to RESTRICTED, and is audited.
    expect(
      rejectedOwnerAssignments(
        { technicalOwnerId: null, businessOwnerId: null, supportOwnerId: null },
        ME,
      ),
    ).toEqual([]);
  });
});

describe("fields the request does not mention", () => {
  it("are untouched, not treated as an assignment", () => {
    // `undefined` means "not in this request". Conflating it with a value would
    // make every unrelated edit — renaming a solution — look like an ownership
    // change and be refused.
    expect(rejectedOwnerAssignments({}, ME)).toEqual([]);
    expect(rejectedOwnerAssignments({ technicalOwnerId: undefined }, ME)).toEqual([]);
  });
});

describe("the refusal explains the remedy", () => {
  it("names the slot and points at claiming rather than restating the rule", () => {
    const message = ownerAssignmentRefusal(["businessOwnerId"]);
    expect(message).toContain("business owner");
    expect(message).toContain("claim");
    // The recovery path is stated, so a blocked caller is not left stuck.
    expect(message).toContain("clear");
  });

  it("names every rejected slot", () => {
    const message = ownerAssignmentRefusal([...OWNER_FIELDS] as OwnerField[]);
    for (const label of ["technical owner", "business owner", "support owner"]) {
      expect(message).toContain(label);
    }
  });
});

describe("the slot list is the one the product uses", () => {
  it("covers exactly the three accountability roles", () => {
    // A fourth owner field added to the schema without being added here would
    // be assignable to anyone, silently.
    expect([...OWNER_FIELDS]).toEqual([
      "technicalOwnerId",
      "businessOwnerId",
      "supportOwnerId",
    ]);
  });
});
