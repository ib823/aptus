/**
 * The names CoreEdge will write into an OData URL (P1.4).
 *
 * WHY A RULE OF ITS OWN. A query's structure is CoreEdge's; its names come
 * from the compiled query policy, and the policy's names come from the
 * service's `$metadata`. That document is written by the SAP system, or by
 * whatever host a builder pointed a custom service at, and CSDL lets a
 * property name carry almost any character, up to 511 of them
 * (csdl-xml.ts). A property called `a'b` or `x&$expand=y` is a perfectly good
 * XML attribute, and spliced into a `$filter` or a `$select` it is an
 * injection that no literal encoding can catch, because names are not
 * literals. So a name is addressable only when it is plain ASCII: a letter or
 * an underscore, then letters, digits and underscores, at most 128 in all.
 * Everything else is shown in Studio as a field CoreEdge cannot address.
 *
 * `__proto__` IS REFUSED BY NAME. It passes the pattern, and a plain object
 * keyed by it does not store it (the setter replaces the prototype instead).
 * Every lookup on the query path is a Map or a null-prototype object, so this
 * is belt and braces; but a field nobody can store is a field nobody should be
 * able to grant either.
 *
 * Checked when a basis is derived, when a policy is compiled, when a compiled
 * policy is read back on a call, and once more when a name is emitted
 * (operation-compiler.ts emitName): four places, because the cost is a regex
 * and the failure is an injection.
 */

/** The longest name CoreEdge addresses. SAP's own ABAP names are far shorter. */
export const MAX_IDENTIFIER_LENGTH = 128;

/** ASCII only: `[A-Za-z_][A-Za-z0-9_]{0,127}`. */
export const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;

/** Is this a name CoreEdge may write into a SAP URL? */
export function isQueryIdentifier(name: unknown): name is string {
  return typeof name === "string" && IDENTIFIER_PATTERN.test(name) && name !== "__proto__";
}

/**
 * A query the compiler built is not one it may send. Never a caller's fault:
 * the checker refuses everything a caller can get wrong before the compiler
 * runs, so reaching this is a defect, answered 500 INTERNAL with nothing sent
 * to SAP. The message names no value.
 */
export class QueryCompilerInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QueryCompilerInvariantError";
  }
}

/**
 * A name, as the compiler writes it: asserted against the rule once more at
 * the moment it is emitted, whatever checked it before.
 */
export function emitName(name: string): string {
  if (!isQueryIdentifier(name)) throw new QueryCompilerInvariantError("A field name failed the identifier rule at emission.");
  return name;
}
