/**
 * The topology endpoint is scoped, and each lens is gated by its own workspace.
 *
 * WHY THIS ROUTE GETS ITS OWN GUARD TEST. It assembles five tables in one
 * request — solutions, interfaces, grants, credentials, connections — which
 * makes it the most disclosure-dense read in the product. An unscoped query
 * here does not leak a row; it leaks a tenant's entire integration estate and
 * the shape of who talks to whom.
 *
 * AND THE LENS IS A QUERY PARAMETER, which is the part that needs watching. The
 * three workspaces admit different roles: `support` may open the Operations
 * Center and may NOT open Control Tower. If the lens only chose a rendering
 * style, a support user could read the governance view by editing a URL. The
 * guard must be selected FROM the lens, before anything is read.
 *
 * Source-level assertions, matching the house style for guard coverage
 * (assessment-route-guard-coverage, cross-tenant-idor-guard-coverage): the
 * helpers are unit-tested elsewhere; what these protect is that the route
 * actually calls them.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROUTE = path.resolve(process.cwd(), "src/app/api/console/topology/route.ts");
const src = readFileSync(ROUTE, "utf8");

/**
 * The same source with comments removed.
 *
 * Needed for the "computes no summary" assertions below, which look for words
 * like `uptime`. The route's own header says it computes no uptime figure —
 * and a scan that cannot tell a prose denial from an implementation punishes
 * writing the denial down, which is the most useful part of the file.
 */
const code = src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map((line) => {
    const i = line.indexOf("//");
    return i === -1 ? line : line.slice(0, i);
  })
  .join("\n");

/**
 * The full argument list of the call that starts at `from`, parens balanced.
 *
 * A FIXED-LENGTH WINDOW WOULD DRIFT. The first version of this read 260
 * characters and passed until a `groupBy` grew an eighth column, at which point
 * it reported an unscoped query that was in fact scoped — a guard test that
 * cries wolf gets its threshold raised, and the next raise hides a real one.
 * Balancing the parens asks the actual question: is `opsWhere` in THIS call.
 */
function callBody(source: string, from: number): string {
  const open = source.indexOf("(", from);
  if (open === -1) return "";
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return source.slice(open);
}

describe("every lens is gated by its own workspace predicate", () => {
  it.each([
    ["developer-studio", "requireStudio"],
    ["operations-center", "requireOperations"],
    ["control-tower", "requireControlTower"],
  ])("%s → %s", (lens, guard) => {
    expect(
      new RegExp(`"${lens}"\\s*:\\s*${guard}`).test(src),
      `${lens} must map to ${guard}. A shared guard would let one workspace's ` +
        "audience read another's lens by changing a query parameter.",
    ).toBe(true);
  });

  it("runs the guard before any query", () => {
    const guardAt = src.indexOf("await LENS_GUARD[lens]()");
    const firstQuery = src.indexOf("prisma.");
    expect(guardAt).toBeGreaterThan(-1);
    expect(firstQuery).toBeGreaterThan(-1);
    expect(guardAt, "the guard must resolve before the first prisma call").toBeLessThan(firstQuery);
  });

  it("refuses an unrecognised lens instead of defaulting to one", () => {
    /*
     * Defaulting would pick a workspace on the caller's behalf and then gate on
     * that choice — which is how a caller ends up reading a lens they were
     * never entitled to, via a typo.
     */
    expect(/if \(!lens\)/.test(src)).toBe(true);
    expect(src).toContain("VALIDATION_ERROR");
  });
});

describe("every query is tenant-scoped", () => {
  it("uses opsWhere on every prisma call, with no exceptions", () => {
    /*
     * `opsWhere` cannot be called without an actor, and on the scoped branch it
     * puts organizationId LAST so a caller-supplied one cannot win. A bare
     * `where:` here compiles, runs, and reads across every tenant while looking
     * identical to the scoped version.
     */
    const prismaCalls = [...src.matchAll(/prisma\.(\w+)\.(findMany|groupBy|findFirst|count)\(/g)];
    expect(prismaCalls.length, "no prisma calls found — has the route moved?").toBeGreaterThanOrEqual(6);

    const unscoped = prismaCalls.filter((m) => !callBody(src, m.index!).includes("opsWhere(actor"));
    expect(
      unscoped.map((m) => `prisma.${m[1]}.${m[2]}`),
      "these queries do not go through opsWhere",
    ).toEqual([]);
  });

  it("does not build a where clause by hand from the actor", () => {
    // `where: { organizationId: actor.organizationId }` typechecks and is null
    // for a global admin, which silently matches nothing instead of everything.
    expect(/organizationId:\s*actor\.organizationId/.test(src)).toBe(false);
  });

  it("clamps the window through opsWindowHours rather than trusting the caller", () => {
    expect(src).toContain("opsWindowHours(");
    expect(/parseInt\(url\.searchParams\.get\("hours"\)/.test(src)).toBe(false);
  });
});

describe("it carries its provenance rather than presenting counts as totals", () => {
  it("names the audit feed as a floor", () => {
    expect(src.toLowerCase()).toContain("floor, not a census");
  });

  it("says grant attribution is inferred, because there is no grant id on an audit row", () => {
    expect(src).toContain("grantAttribution");
    expect(src.toLowerCase()).toContain("no grant id on an audit row");
  });

  it("reports what it collapsed instead of truncating silently", () => {
    expect(src).toContain("collapsed");
    expect(src).toContain("collapseColumn");
  });

  it("computes no health score or uptime figure", () => {
    // The Operations home's argument: a second copy of a number is a thing that
    // disagrees with the screen that owns it.
    for (const forbidden of ["healthScore", "uptime", "healthPercent", "availability"]) {
      expect(code.includes(forbidden), `${forbidden} must not appear in the code`).toBe(false);
    }
  });
});

/**
 * An edge is a pairing, never one end's total.
 *
 * WHAT THIS PREVENTS, in the words of the bug it replaced. The route used to
 * build credential→grant edges by cross-producting every credential on the
 * solution against the grant, and give each one the GRANT's whole call count.
 * A grant with 400 recorded calls and three credentials drew three 400-call
 * edges: one call rendered three times, along two pairings that never
 * happened. Interface→connection was worse — every interface was wired into
 * every connection that had any traffic at all, which is a wiring diagram the
 * platform invented.
 *
 * It was invisible for as long as nothing drew the lines. It is not the kind of
 * thing that stays fixed on its own, because the wrong version is shorter.
 */
describe("edges are built from pairings, not from node totals", () => {
  it("groups the feed by both ends of every edge it draws", () => {
    // Without clientTokenId there is no credential→grant pairing to be had, and
    // without status a refused call is indistinguishable from a served one.
    for (const column of ["clientTokenId", "status", "interfaceId", "connectionId"]) {
      expect(
        new RegExp(`by:\\s*\\[[^\\]]*"${column}"`, "s").test(src.replace(/\n/g, " ")),
        `${column} must be in the audit groupBy — the edge counts cannot be derived without it`,
      ).toBe(true);
    }
  });

  it("routes every edge through one constructor rather than hand-built literals", () => {
    // `edges.push({ ... calls: someNodeTotal })` is exactly how the bug was
    // written, and it reads as correct at the call site.
    expect(
      /edges\.push\(\s*\{/.test(code),
      "edges must be built by the `edge(from, to, tally, inert)` helper, so the count " +
        "always comes from a tally and never from a number in scope",
    ).toBe(false);
  });

  it("takes each edge's count from the pair map for that pair", () => {
    expect(code).toContain("attributed.byCredentialSolution");
    expect(code).toContain("attributed.byGrantInterface");
    expect(code).toContain("attributed.byInterfaceConnection");
    // Keyed on both ends, in that order.
    expect(/pairKey\(c\.id,\s*s\.id\)/.test(code)).toBe(true);
    expect(/pairKey\(gk,\s*i\.id\)/.test(code)).toBe(true);
    expect(/pairKey\(i\.id,\s*c\.id\)/.test(code)).toBe(true);
  });

  it("routes the caller to the grant THROUGH the solution, not around it", () => {
    /*
     * A direct credential→grant line would jump the solution column and draw
     * the same traffic twice on one canvas — once on the short line and once on
     * the two-hop path beside it.
     */
    expect(/edge\(\s*`cred:\$\{c\.id\}`,\s*`grant:/.test(code)).toBe(false);
    expect(code).toContain("`sol:${g.solutionId}`");
  });

  it("draws an interface-to-connection line only where a call named both", () => {
    /*
     * There is NO schema link between Interface and SapConnection — the broker
     * resolves the binding per call from the declared environment. So an
     * unobserved pairing is not a fact and must not be drawn, which means this
     * one edge is conditional where the structural ones are not.
     */
    const block = src.slice(src.indexOf("byInterfaceConnection"));
    expect(/if \(pair\)\s*edges\.push\(/.test(block)).toBe(true);
    expect(src).toContain("binding");
  });

  it("keeps the grant's own total out of the edges entirely", () => {
    /*
     * `recordedCalls` is the grant NODE's count, and the right input to exactly
     * one thing: deriveGrant, which needs to know whether a revoked grant ever
     * carried anything. Handing it to an edge is the original bug verbatim.
     *
     * Not a tautology — the mutation that reintroduces the cross-product is a
     * two-token edit, and this is the line it has to cross.
     */
    expect(/edge\([^)]*recordedCalls/.test(code)).toBe(false);
    expect(/deriveGrant\(\{ \.\.\.g, recordedCalls \}/.test(code)).toBe(true);
  });

  it("passes a connection's own total only to the edge that genuinely carries it", () => {
    /*
     * connection→tenant is the one place a node total IS the edge total: every
     * call recorded through a connection went on to the tenant behind it. Every
     * other edge out of that loop must come from a pairing, which is why the
     * interface pairing is looked up separately a few lines above.
     */
    const block = src.slice(src.indexOf("/* Column 4"));
    expect(/edge\(`conn:\$\{c\.id\}`, sapNodeId\(c\.product\), seen,/.test(block)).toBe(true);
    expect(/edge\(`iface:\$\{i\.id\}`, `conn:\$\{c\.id\}`, seen/.test(block)).toBe(false);
  });
});

/**
 * A line on this canvas is an assertion about authorisation.
 *
 * These are the ones that were wrong once the lines were actually drawn. Each
 * looked correct in review and was only visible as a claim on screen.
 */
describe("the lines do not assert authorisations the broker refuses", () => {
  it("matches a grant to an interface on operation, not just the service", () => {
    /*
     * `src/lib/northbound/access.ts` is explicit: "A READ grant does not
     * authorise a write, even for the same service in the same environment —
     * that distinction is the entire reason `operation` is recorded on a
     * grant." Matching on solution + externalId alone drew a READ grant into a
     * CREATE interface, which is the one relationship the broker exists to
     * refuse.
     */
    const block = code.slice(code.indexOf("grants.filter"), code.indexOf("byGrantInterface"));
    expect(block).toContain("x.externalId === i.externalId");
    expect(
      /x\.operation === i\.operation/.test(block),
      "grant→interface must match on operation — otherwise a READ grant is drawn " +
        "as authorising a CREATE interface",
    ).toBe(true);
  });

  it("does not put environment in that match, because an interface has none", () => {
    // The same capability legitimately holds separate grants per landscape;
    // requiring equality would drop every one of them.
    const block = code.slice(code.indexOf("grants.filter"), code.indexOf("byGrantInterface"));
    expect(/x\.environment === i\.environment/.test(block)).toBe(false);
  });

  it("mirrors the incident rule's predicate rather than a better one", () => {
    /*
     * `unaccountable-prod-grant` counts on decision and environment alone — it
     * filters neither revoked nor expired rows. A stricter test here would be
     * the more defensible RULE and the wrong answer to what the node is asking,
     * which is not "should anything watch this" but "does anything". A node
     * claiming to be unmonitored while an incident is open about it is the
     * worse lie.
     */
    const block = code.slice(code.indexOf("const holdsProdGrant"));
    const decl = block.slice(0, block.indexOf(");"));
    expect(decl).toContain("grantConfersAccess");
    expect(decl).toContain('"PROD"');
    expect(
      /revokedAt/.test(decl),
      "the rule does not filter revoked grants, so this must not either",
    ).toBe(false);
  });
});

/**
 * "Client SAP tenant" was one node, and a tenant's SAP is not one system.
 *
 * A customer running Cloud ERP, SuccessFactors and Ariba has three, owned by
 * different teams with different blast radii. Converging every connection on a
 * single node asserted they were one thing — which makes a SuccessFactors
 * outage look like it touches the finance integration.
 */
describe("the last column names the systems, not 'SAP'", () => {
  it("derives one node per product from the connection layer", () => {
    // The connection is where product lives; nothing else declares it, which is
    // why `product` sat in the select unused for as long as the column was one
    // generic node.
    expect(code).toContain("new Set(connections.map((c) => c.product))");
    expect(code).toContain("productName(");
  });

  it("keys both ends of the connection edge the same way", () => {
    // A mismatch here drops the edge silently: the route filters edges to nodes
    // it kept, so a wrong id reads as "this connection reaches nothing".
    expect(code).toContain("sapNodeId(c.product)");
    expect(/id: product \? sapNodeId\(product\)/.test(code)).toBe(true);
  });

  it("still names one system when no connection declares a product", () => {
    // An empty column would read as "there is no SAP", which is not the claim.
    expect(code).toContain('[null]');
    expect(code).toContain('"Client SAP tenant"');
  });

  it("does not resurrect a hardcoded product list", () => {
    /*
     * ConnectionsClient's comment records why: an inline
     * ["s4hana","successfactors","ariba"] was a third enumeration, and adding
     * private cloud, on-premise and ECC to two of three left the picker
     * silently short.
     */
    expect(/\["s4hana"/.test(code)).toBe(false);
    expect(/"successfactors"/.test(code)).toBe(false);
  });
});
