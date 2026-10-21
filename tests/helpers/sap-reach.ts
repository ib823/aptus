/**
 * Which code reaches SAP, computed from the source (A.3 #9, roadmap P0.14b).
 *
 * A small static call graph over src/, built with the TypeScript parser (no
 * type checker, so it runs in a second or two):
 *
 *   - BINDINGS. Every top-level declaration of every module (a function, a
 *     class, a const, `export default`) is a node. Its edges are the value
 *     identifiers it mentions anywhere in its body, parameters and defaults
 *     included: a local binding, a named import (followed through re-exports
 *     and `export *`), a member of a namespace import, a dynamic `import()`.
 *     Type positions are not edges.
 *   - SEEDS. A binding that mentions the global `fetch` (or `globalThis.fetch`)
 *     sends an HTTP request. Every such binding in server code is classified by
 *     the test that uses this module, SAP or not, so a new one cannot appear
 *     unclassified.
 *   - REACH. A binding reaches SAP when it is a SAP seed or has an edge to a
 *     binding that does. Mentioning is enough — passing a function along counts
 *     as reaching it — so the graph over-approximates; the few bindings that
 *     only BUILD a deferred credential (a closure called later, inside the
 *     pipeline's own SAP step) are cut by name, each with its reason, in the
 *     test.
 *
 * Then, for a route, `routeFindings` walks each exported handler and reports
 * every mention of a reaching binding that is NOT made inside the governed
 * pipeline: inside the callback a console call's `callSap` / `callSapWrite`
 * takes, or as a call to the broker pipeline's own step (a binding exported by
 * one of `pipelineModules`). A function declared inside the handler, or a
 * module-local helper, is followed into only where it is mentioned outside
 * those callbacks — the code that runs is the code that is followed.
 *
 * The receiver counts, not the method name (review round 3): `callSap` is the
 * pipeline only on a `const` the route initialised from `openConsoleCall`
 * (`consoleCallNames`), and a handler the route re-exports from another
 * module that reaches SAP is reported, since its body is never walked here.
 * Only the function the step runs is governed (review round 4): `callSap`'s
 * first argument and `callSapWrite`'s second, written in place or passed by
 * name. Its other arguments (`describe`'s callbacks, an expression evaluated
 * before the step is entered) are the handler's own code, and a console call
 * whose methods could have been replaced is no console call.
 *
 * A route module's top level runs on import (review round 5): a `const`
 * initialised by a call, `export const dynamic = (sideEffect(), …)`, a
 * class's static initializer, `export default <value>` — on every cold start,
 * before any handler's gate. That code is walked as a handler's
 * (`importTimeCode`), except the functions it only stores, which are followed
 * where a handler calls them. A destructuring declaration runs its binding
 * pattern too (review round 6): `const { warmed = sapCall() } = {}` runs the
 * default on every cold start, and so does a computed key
 * (`patternRunsOnImport`). And a route that re-exports ANOTHER ROUTE's
 * handler (P1.10's /api/northbound/v1/* aliases) is that route, judged by
 * its verdict (`routeAliases`); only a handler from a module that is not a
 * route stays unwalked, and a finding.
 *
 * A mention inside a governed callback is governed only while it runs there:
 * a SAP-reaching function value the callback returns, assigns out or pushes
 * onto something outside it would run after `callSap` recorded its outcome,
 * and is reported (`escapingFrom`, which says what it does not see).
 *
 * Pure: it takes the sources as data, so the test can feed it sources written
 * to fail it.
 */

import path from "node:path";

import ts from "typescript";

export interface SourceInput {
  /** Repository-relative, `/`-separated. */
  readonly file: string;
  readonly src: string;
}

type Ref = { readonly kind: "local"; readonly name: string } | { readonly kind: "import"; readonly module: string; readonly name: string } | { readonly kind: "fetch" };

interface Binding {
  readonly file: string;
  readonly name: string;
  readonly node: ts.Node;
}

interface ModuleInfo {
  readonly file: string;
  readonly sf: ts.SourceFile;
  readonly bindings: Map<string, Binding>;
  /** local name -> where it comes from ("*" = namespace, "default"). */
  readonly imports: Map<string, { readonly module: string; readonly name: string }>;
  /** exported name -> local binding name */
  readonly exports: Map<string, string>;
  /** exported name -> another module's export */
  readonly reexports: Map<string, { readonly module: string; readonly name: string }>;
  readonly starReexports: string[];
}

export const keyOf = (file: string, name: string): string => `${file}#${name}`;

const EXTENSIONS = [".ts", ".tsx", "/index.ts", "/index.tsx"];

/** The repo file a specifier names from `importer`, or null for a package. */
export function resolveSpecifier(spec: string, importer: string, files: ReadonlySet<string>): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = `src/${spec.slice(2)}`;
  else if (/^\.\.?(\/|$)/.test(spec)) base = path.posix.join(path.posix.dirname(importer), spec);
  else return null;
  base = base.replace(/\/$/, "");
  if (files.has(base)) return base;
  const stripped = base.replace(/\.(?:[cm]?[jt]sx?)$/, "");
  for (const ext of EXTENSIONS) if (files.has(`${stripped}${ext}`)) return `${stripped}${ext}`;
  return null;
}

const hasModifier = (node: ts.Node, kind: ts.SyntaxKind): boolean =>
  (ts.canHaveModifiers(node) ? (ts.getModifiers(node) ?? []) : []).some((m) => m.kind === kind);

function bindingNames(name: ts.BindingName): string[] {
  if (ts.isIdentifier(name)) return [name.text];
  return name.elements.flatMap((el) => (ts.isOmittedExpression(el) ? [] : bindingNames(el.name)));
}

function parseModule(input: SourceInput, files: ReadonlySet<string>): ModuleInfo {
  const sf = ts.createSourceFile(input.file, input.src, ts.ScriptTarget.Latest, true, input.file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const info: ModuleInfo = {
    file: input.file,
    sf,
    bindings: new Map(),
    imports: new Map(),
    exports: new Map(),
    reexports: new Map(),
    starReexports: [],
  };
  const resolve = (spec: ts.Expression | undefined) =>
    spec && ts.isStringLiteral(spec) ? resolveSpecifier(spec.text, input.file, files) : null;
  const bind = (name: string, node: ts.Node, stmt: ts.Node) => {
    info.bindings.set(name, { file: input.file, name, node });
    if (hasModifier(stmt, ts.SyntaxKind.ExportKeyword)) {
      info.exports.set(hasModifier(stmt, ts.SyntaxKind.DefaultKeyword) ? "default" : name, name);
    }
  };
  let anonymous = 0;
  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt)) {
      const clause = stmt.importClause;
      const target = resolve(stmt.moduleSpecifier);
      if (!clause || clause.isTypeOnly || !target) continue;
      if (clause.name) info.imports.set(clause.name.text, { module: target, name: "default" });
      const nb = clause.namedBindings;
      if (nb && ts.isNamespaceImport(nb)) info.imports.set(nb.name.text, { module: target, name: "*" });
      if (nb && ts.isNamedImports(nb)) {
        for (const el of nb.elements) {
          if (el.isTypeOnly) continue;
          info.imports.set(el.name.text, { module: target, name: (el.propertyName ?? el.name).text });
        }
      }
    } else if (ts.isExportDeclaration(stmt)) {
      if (stmt.isTypeOnly) continue;
      const target = resolve(stmt.moduleSpecifier);
      if (stmt.moduleSpecifier) {
        if (!target) continue;
        if (!stmt.exportClause) info.starReexports.push(target);
        else if (ts.isNamespaceExport(stmt.exportClause)) info.reexports.set(stmt.exportClause.name.text, { module: target, name: "*" });
        else {
          for (const el of stmt.exportClause.elements) {
            if (el.isTypeOnly) continue;
            info.reexports.set(el.name.text, { module: target, name: (el.propertyName ?? el.name).text });
          }
        }
      } else if (stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
        for (const el of stmt.exportClause.elements) {
          if (el.isTypeOnly) continue;
          info.exports.set(el.name.text, (el.propertyName ?? el.name).text);
        }
      }
    } else if (ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt) || ts.isEnumDeclaration(stmt)) {
      bind(stmt.name?.text ?? "default", stmt, stmt);
    } else if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        for (const name of bindingNames(decl.name)) bind(name, decl, stmt);
      }
    } else if (ts.isExportAssignment(stmt)) {
      info.bindings.set("default", { file: input.file, name: "default", node: stmt.expression });
      info.exports.set("default", "default");
    } else if (!ts.isInterfaceDeclaration(stmt) && !ts.isTypeAliasDeclaration(stmt) && !ts.isModuleDeclaration(stmt)) {
      // Module-level code that runs on import.
      const name = `<module:${anonymous++}>`;
      info.bindings.set(name, { file: input.file, name, node: stmt });
    }
  }
  return info;
}

/** Whether this identifier is a value reference (not a declared name, a property name or a type). */
function isValueReference(id: ts.Identifier): boolean {
  const p = id.parent;
  if (!p) return false;
  if ((ts.isPropertyAccessExpression(p) || ts.isQualifiedName(p)) && (p as ts.PropertyAccessExpression).name === id) return false;
  if (
    (ts.isPropertyAssignment(p) ||
      ts.isPropertyDeclaration(p) ||
      ts.isMethodDeclaration(p) ||
      ts.isPropertySignature(p) ||
      ts.isGetAccessor(p) ||
      ts.isSetAccessor(p) ||
      ts.isEnumMember(p) ||
      ts.isJsxAttribute(p)) &&
    p.name === id
  ) {
    return false;
  }
  if (ts.isBindingElement(p) && p.propertyName === id) return false;
  if (
    (ts.isVariableDeclaration(p) ||
      ts.isParameter(p) ||
      ts.isFunctionDeclaration(p) ||
      ts.isFunctionExpression(p) ||
      ts.isClassDeclaration(p) ||
      ts.isClassExpression(p) ||
      ts.isBindingElement(p)) &&
    p.name === id
  ) {
    return false;
  }
  if (ts.isLabeledStatement(p) || ts.isBreakOrContinueStatement(p)) return false;
  if (ts.isImportSpecifier(p) || ts.isExportSpecifier(p) || ts.isImportClause(p) || ts.isNamespaceImport(p)) return false;
  return true;
}

/** The references one node makes, resolved against its module. */
function refsOf(node: ts.Node, mod: ModuleInfo, visit?: (n: ts.Node) => boolean): Array<{ ref: Ref; at: ts.Node }> {
  const out: Array<{ ref: Ref; at: ts.Node }> = [];
  const walk = (n: ts.Node): void => {
    if (ts.isTypeNode(n) || ts.isInterfaceDeclaration(n) || ts.isTypeAliasDeclaration(n)) return;
    if (visit && !visit(n)) return;
    if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression)) {
      const ns = mod.imports.get(n.expression.text);
      if (ns && ns.name === "*") {
        out.push({ ref: { kind: "import", module: ns.module, name: n.name.text }, at: n });
        return;
      }
      if (n.expression.text === "globalThis" && n.name.text === "fetch") {
        out.push({ ref: { kind: "fetch" }, at: n });
        return;
      }
    }
    if (ts.isCallExpression(n) && n.arguments.length > 0 && ts.isStringLiteral(n.arguments[0]!)) {
      const isDynamicImport = n.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(n.expression) && n.expression.text === "require";
      if (isDynamicImport || isRequire) {
        const target = resolveSpecifier((n.arguments[0] as ts.StringLiteral).text, mod.file, KNOWN_FILES.current);
        if (target) out.push({ ref: { kind: "import", module: target, name: "*" }, at: n });
      }
    }
    if (ts.isIdentifier(n) && isValueReference(n)) {
      const text = n.text;
      const imported = mod.imports.get(text);
      if (imported) out.push({ ref: { kind: "import", module: imported.module, name: imported.name }, at: n });
      else if (mod.bindings.has(text)) out.push({ ref: { kind: "local", name: text }, at: n });
      else if (text === "fetch") out.push({ ref: { kind: "fetch" }, at: n });
    }
    if (ts.isShorthandPropertyAssignment(n)) {
      // `{ fetch }` hands the value on; the identifier is the name node.
      walk(n.name);
      return;
    }
    ts.forEachChild(n, walk);
  };
  walk(node);
  return out;
}

/** The file set `resolveSpecifier` sees from inside `refsOf` (dynamic imports). */
const KNOWN_FILES: { current: ReadonlySet<string> } = { current: new Set() };

export interface SapGraph {
  readonly modules: ReadonlyMap<string, ModuleInfo>;
  /** Every binding that mentions the global fetch, by key. */
  readonly fetchers: readonly string[];
  /** Every binding key that reaches SAP. */
  readonly reaching: ReadonlySet<string>;
  /** The same, as if no binding were cut: what the cuts are checked against. */
  readonly reachingIgnoringCuts: ReadonlySet<string>;
  /** Resolve a module's export to binding keys (re-exports followed). */
  resolveExport(module: string, name: string): string[];
  /** The binding keys a reference resolves to. */
  targets(mod: string, ref: Ref): string[];
  /** The references a binding makes. */
  refs(key: string): Array<{ ref: Ref; at: ts.Node }>;
}

export interface GraphOptions {
  /** Fetching bindings that call SAP (or Ariba): the seeds. */
  readonly sapFetchers: ReadonlySet<string>;
  /** Bindings whose mention of a reaching binding does not send anything: reach does not pass through them. */
  readonly cuts: ReadonlySet<string>;
}

export function buildSapGraph(inputs: readonly SourceInput[], options: GraphOptions): SapGraph {
  const files = new Set(inputs.map((i) => i.file));
  KNOWN_FILES.current = files;
  const modules = new Map<string, ModuleInfo>();
  for (const input of inputs) modules.set(input.file, parseModule(input, files));

  const resolveExport = (module: string, name: string, seen = new Set<string>()): string[] => {
    const tag = `${module}|${name}`;
    if (seen.has(tag)) return [];
    seen.add(tag);
    const mod = modules.get(module);
    if (!mod) return [];
    if (name === "*") {
      const names = new Set([...mod.exports.keys(), ...mod.reexports.keys()]);
      const out = [...names].flatMap((n) => resolveExport(module, n, seen));
      for (const star of mod.starReexports) out.push(...resolveExport(star, "*", seen));
      return out;
    }
    const local = mod.exports.get(name);
    if (local !== undefined && mod.bindings.has(local)) return [keyOf(module, local)];
    if (local !== undefined && mod.imports.has(local)) {
      const imp = mod.imports.get(local)!;
      return resolveExport(imp.module, imp.name, seen);
    }
    const re = mod.reexports.get(name);
    if (re) return resolveExport(re.module, re.name, seen);
    for (const star of mod.starReexports) {
      const found = resolveExport(star, name, seen);
      if (found.length > 0) return found;
    }
    return [];
  };

  const targets = (file: string, ref: Ref): string[] => {
    if (ref.kind === "local") return [keyOf(file, ref.name)];
    if (ref.kind === "import") return resolveExport(ref.module, ref.name);
    return [];
  };

  const refCache = new Map<string, Array<{ ref: Ref; at: ts.Node }>>();
  const refs = (key: string) => {
    const cached = refCache.get(key);
    if (cached) return cached;
    const [file, name] = [key.slice(0, key.indexOf("#")), key.slice(key.indexOf("#") + 1)];
    const mod = modules.get(file);
    const b = mod?.bindings.get(name);
    const found = mod && b ? refsOf(b.node, mod) : [];
    refCache.set(key, found);
    return found;
  };

  const fetchers: string[] = [];
  const dependents = new Map<string, string[]>();
  for (const mod of modules.values()) {
    for (const name of mod.bindings.keys()) {
      const key = keyOf(mod.file, name);
      for (const { ref } of refs(key)) {
        if (ref.kind === "fetch") {
          if (!fetchers.includes(key)) fetchers.push(key);
          continue;
        }
        for (const t of targets(mod.file, ref)) {
          if (t === key) continue;
          const list = dependents.get(t) ?? [];
          list.push(key);
          dependents.set(t, list);
        }
      }
    }
  }

  const reachFrom = (cuts: ReadonlySet<string>): Set<string> => {
    const reached = new Set<string>();
    const queue = fetchers.filter((f) => options.sapFetchers.has(f));
    for (const q of queue) reached.add(q);
    while (queue.length > 0) {
      const next = queue.shift()!;
      if (cuts.has(next)) continue;
      for (const d of dependents.get(next) ?? []) {
        if (reached.has(d)) continue;
        reached.add(d);
        queue.push(d);
      }
    }
    return reached;
  };
  const reaching = reachFrom(options.cuts);
  const reachingIgnoringCuts = reachFrom(new Set());

  return { modules, fetchers: fetchers.sort(), reaching, reachingIgnoringCuts, resolveExport, targets, refs };
}

/** The HTTP handlers a Next.js route module may export. */
export const HTTP_METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const;

/**
 * A Next.js route handler module: `route.ts` ANYWHERE under src/app. A route
 * group — src/app/(external)/c/sign/route.ts — is as much a route as
 * src/app/api/ is.
 */
export const isRouteModule = (file: string): boolean => file.startsWith("src/app/") && /\/route\.tsx?$/.test(file);

const fileOfKey = (key: string): string => key.slice(0, key.indexOf("#"));

/** A handler this route serves by re-exporting ANOTHER ROUTE's handler. */
export interface RouteAlias {
  /** The method this route exports it as. */
  readonly method: string;
  /** The route module that defines it. */
  readonly source: string;
  /** The method that route exports it as. */
  readonly sourceMethod: string;
}

/**
 * THE HANDLERS A ROUTE RE-EXPORTS FROM ANOTHER ROUTE (P0.14b review round 5):
 * `export { GET } from "@/app/api/northbound/interfaces/[id]/data/route"`,
 * P1.10's /api/northbound/v1/* aliases. The alias IS that route — the same
 * function, so the two paths cannot drift — and is judged by that route's
 * verdict. A handler re-exported from a module that is not a route, or a
 * binding of a route that is not one of its HTTP handlers, is not an alias.
 */
export function routeAliases(graph: SapGraph, file: string): RouteAlias[] {
  const out: RouteAlias[] = [];
  for (const method of HTTP_METHODS) {
    for (const key of graph.resolveExport(file, method)) {
      const source = fileOfKey(key);
      if (source === file || !isRouteModule(source)) continue;
      const sourceMethod = HTTP_METHODS.find((m) => graph.resolveExport(source, m).includes(key));
      if (sourceMethod) out.push({ method, source, sourceMethod });
    }
  }
  return out;
}

/** A piece of a module's top level that runs when the module is imported. */
interface ImportTimeCode {
  /** The binding it belongs to, for the fetch census. */
  readonly key: string;
  readonly node: ts.Node;
}

/** Through what passes a value on unchanged, or stores it in the value being built. */
function storesValue(parent: ts.Node, child: ts.Node): boolean {
  return (
    ts.isParenthesizedExpression(parent) ||
    ts.isAsExpression(parent) ||
    ts.isSatisfiesExpression(parent) ||
    ts.isNonNullExpression(parent) ||
    ts.isTypeAssertionExpression(parent) ||
    ts.isArrayLiteralExpression(parent) ||
    ts.isObjectLiteralExpression(parent) ||
    (ts.isPropertyAssignment(parent) && parent.initializer === child) ||
    (ts.isConditionalExpression(parent) && parent.condition !== child) ||
    (ts.isBinaryExpression(parent) &&
      [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.QuestionQuestionToken].includes(parent.operatorToken.kind))
  );
}

/**
 * Whether `n`, inside the import-time code rooted at `root`, does NOT run when
 * the module is imported: a function only STORED in the value being built (a
 * property of an object literal, an element of an array literal, through `?:`
 * and `||`), or a class's method, constructor, accessor or instance field. It
 * runs when something calls it, and a handler that mentions the binding is
 * followed into all of it. A function handed to a call (`setTimeout(fn)`,
 * `.then(fn)`, `forEach(fn)`) or invoked in place is taken to run.
 */
function notRunOnImport(root: ts.Node): (n: ts.Node) => boolean {
  return (n) => {
    if (n === root) return false;
    const p = n.parent;
    if (
      p &&
      ts.isClassLike(p) &&
      (ts.isMethodDeclaration(n) ||
        ts.isConstructorDeclaration(n) ||
        ts.isGetAccessorDeclaration(n) ||
        ts.isSetAccessorDeclaration(n) ||
        (ts.isPropertyDeclaration(n) && !hasModifier(n, ts.SyntaxKind.StaticKeyword)))
    ) {
      return true;
    }
    if (!isFunctionLike(n)) return false;
    for (let cur: ts.Node = n; cur !== root; cur = cur.parent) {
      if (!cur.parent || !storesValue(cur.parent, cur)) return false;
    }
    return true;
  };
}

/**
 * WHAT A MODULE RUNS WHEN IT IS IMPORTED, besides its bare statements (P0.14b
 * review round 5). A route module is imported on every cold start of every
 * instance, before any handler's gate: a `const` initialised by a call to SAP
 * (`const _warmed = previewSapEntitySet(…)`), a value beside
 * `export const dynamic`, a class's static initializer, an `export default`
 * value or an enum member all run there, with no role gate, no ceiling, no
 * circuit and no row. A binding whose value is a function is not here: it runs
 * where it is called, and is followed there.
 */
function importTimeCode(mod: ModuleInfo): ImportTimeCode[] {
  const out: ImportTimeCode[] = [];
  const isFunctionValue = (e: ts.Expression) => {
    const v = unwrap(e);
    return ts.isArrowFunction(v) || ts.isFunctionExpression(v);
  };
  for (const stmt of mod.sf.statements) {
    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        const name = bindingNames(decl.name)[0];
        if (decl.initializer && name !== undefined && !isFunctionValue(decl.initializer)) {
          out.push({ key: keyOf(mod.file, name), node: decl.initializer });
        }
        // The binding pattern runs too (review round 6): its defaults and computed keys.
        for (const node of patternRunsOnImport(decl.name)) out.push({ key: keyOf(mod.file, name ?? "default"), node });
      }
    } else if (ts.isClassDeclaration(stmt) || ts.isEnumDeclaration(stmt)) {
      out.push({ key: keyOf(mod.file, stmt.name?.text ?? "default"), node: stmt });
    } else if (ts.isExportAssignment(stmt) && !isFunctionValue(stmt.expression)) {
      out.push({ key: keyOf(mod.file, "default"), node: stmt.expression });
    }
  }
  return out;
}

/**
 * The code a destructuring pattern runs when it binds (P0.14b review round 6):
 * a default (`const { warmed = sapCall() } = {}`, `const [w = sapCall()] = []`)
 * runs whenever the value it stands in for is undefined, which on a module's
 * top level is every cold start, and a computed key (`{ [sapCall()]: k }`) runs
 * always. Nested patterns are walked. A default that is a function is only
 * stored, like a `const` whose value is a function, and is followed where a
 * handler calls it.
 */
function patternRunsOnImport(name: ts.BindingName): ts.Node[] {
  if (ts.isIdentifier(name)) return [];
  const out: ts.Node[] = [];
  for (const el of name.elements) {
    if (ts.isOmittedExpression(el)) continue;
    if (el.propertyName && ts.isComputedPropertyName(el.propertyName)) out.push(el.propertyName.expression);
    if (el.initializer) {
      const v = unwrap(el.initializer);
      if (!ts.isArrowFunction(v) && !ts.isFunctionExpression(v)) out.push(el.initializer);
    }
    out.push(...patternRunsOnImport(el.name));
  }
  return out;
}

/** Whether a piece of import-time code reaches SAP. */
function importTimeReaches(graph: SapGraph, mod: ModuleInfo, code: ImportTimeCode): boolean {
  const skip = notRunOnImport(code.node);
  return refsOf(code.node, mod, (n) => !skip(n)).some(({ ref }) =>
    ref.kind === "fetch" ? graph.reaching.has(code.key) : graph.targets(mod.file, ref).some((t) => graph.reaching.has(t)),
  );
}

/**
 * Whether this route reaches SAP through code it defines itself: a handler
 * declared in the file, or what the module runs on import. A handler it
 * re-exports from elsewhere is not counted.
 */
export function routeReachesOwn(graph: SapGraph, file: string): boolean {
  const mod = graph.modules.get(file);
  if (!mod) return false;
  const own = [
    ...HTTP_METHODS.flatMap((m) => graph.resolveExport(file, m)).filter((k) => fileOfKey(k) === file),
    ...[...mod.bindings.keys()].filter((n) => n.startsWith("<module:")).map((n) => keyOf(file, n)),
  ];
  return own.some((k) => graph.reaching.has(k)) || importTimeCode(mod).some((c) => importTimeReaches(graph, mod, c));
}

/** Whether any exported handler of this route (or what its module runs on import) reaches SAP. */
export function routeReaches(graph: SapGraph, file: string): boolean {
  if (!graph.modules.has(file)) return false;
  return routeReachesOwn(graph, file) || HTTP_METHODS.flatMap((m) => graph.resolveExport(file, m)).some((k) => graph.reaching.has(k));
}

/** A function a governed callback can create or be. */
function isFunctionLike(n: ts.Node): n is ts.FunctionLikeDeclaration {
  return (
    ts.isArrowFunction(n) ||
    ts.isFunctionExpression(n) ||
    ts.isFunctionDeclaration(n) ||
    ts.isMethodDeclaration(n) ||
    ts.isGetAccessorDeclaration(n) ||
    ts.isSetAccessorDeclaration(n)
  );
}

/**
 * A console call's governed steps, and which argument of each is the function
 * it runs inside the pipeline: `callSap(fn, describe)`, `callSapWrite(handle,
 * fn)`. Every other argument is ordinary handler code (review round 4): it is
 * evaluated before the step is entered, or (`describe`'s callbacks) run after
 * its outcome is recorded.
 */
const GOVERNED_ARGUMENT: ReadonlyMap<string, number> = new Map([
  ["callSap", 0],
  ["callSapWrite", 1],
]);
const GOVERNED_METHODS: ReadonlySet<string> = new Set(GOVERNED_ARGUMENT.keys());

/** The functions, exported by a pipeline module, that open a console call. */
export const CONSOLE_OPENERS: ReadonlySet<string> = new Set(["openConsoleCall"]);

/** Through what passes a value on unchanged: parentheses, `await`, `as`, `!`. */
function unwrap(e: ts.Expression): ts.Expression {
  let cur = e;
  while (
    ts.isParenthesizedExpression(cur) ||
    ts.isAwaitExpression(cur) ||
    ts.isAsExpression(cur) ||
    ts.isSatisfiesExpression(cur) ||
    ts.isNonNullExpression(cur) ||
    ts.isTypeAssertionExpression(cur)
  ) {
    cur = cur.expression;
  }
  return cur;
}

/**
 * THE NAMES IN A ROUTE FILE THAT CERTAINLY HOLD A CONSOLE CALL (P0.14b review
 * round 3). A `.callSap(...)` is the pipeline only when its receiver is one:
 * an object literal with a `callSap` method, or a parameter typed like one,
 * runs the callback with no ceiling, no circuit and no row.
 *
 * A name qualifies when EVERY declaration of it anywhere in the file — a
 * variable, a parameter, a destructured binding, a function or class, a catch
 * variable — is a `const` initialised by a call (awaited or not) to an opener
 * a pipeline module exports, named directly or through a namespace import.
 * Scopes are not modelled: a name declared otherwise anywhere in the file is
 * not trusted anywhere in it, which over-reports rather than under-reports.
 *
 * A `const` stops the NAME being rebound, not its methods being replaced
 * (review round 4): `(call as any).callSap = (fn) => fn()` keeps the name and
 * drops the pipeline. So a name also loses its trust when, anywhere in the
 * file, it is mentioned other than as the object of a member READ — a
 * member's assignment target (`=`, `+=`, a destructuring assignment), the
 * operand of `delete`, `++` or `--`, an argument (`Object.assign(call, …)`,
 * `Object.defineProperty`, `Reflect.set`, any helper that might do the same),
 * an alias (`const c = call`), a spread or a return value.
 */
export function consoleCallNames(
  graph: SapGraph,
  file: string,
  pipelineModules: ReadonlySet<string>,
  openers: ReadonlySet<string> = CONSOLE_OPENERS,
): Set<string> {
  const mod = graph.modules.get(file);
  const verdict = new Map<string, boolean>();
  if (!mod) return new Set();
  const isOpener = (callee: ts.Expression): boolean => {
    let ref: Ref | null = null;
    if (ts.isIdentifier(callee)) {
      const imp = mod.imports.get(callee.text);
      if (imp && imp.name !== "*") ref = { kind: "import", module: imp.module, name: imp.name };
    } else if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)) {
      const ns = mod.imports.get(callee.expression.text);
      if (ns && ns.name === "*") ref = { kind: "import", module: ns.module, name: callee.name.text };
    }
    if (!ref) return false;
    return graph.targets(file, ref).some((t) => {
      const [targetFile, name] = [t.slice(0, t.indexOf("#")), t.slice(t.indexOf("#") + 1)];
      return pipelineModules.has(targetFile) && openers.has(name);
    });
  };
  const note = (name: string, ok: boolean) => verdict.set(name, (verdict.get(name) ?? true) && ok);
  const visit = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n)) {
      const isConst = ts.isVariableDeclarationList(n.parent) && (n.parent.flags & ts.NodeFlags.Const) !== 0;
      const init = n.initializer ? unwrap(n.initializer) : undefined;
      const opened = isConst && ts.isIdentifier(n.name) && !!init && ts.isCallExpression(init) && isOpener(init.expression);
      for (const nm of bindingNames(n.name)) note(nm, opened);
    } else if (ts.isParameter(n) || ts.isBindingElement(n)) {
      for (const nm of bindingNames(n.name)) note(nm, false);
    } else if ((ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isClassDeclaration(n) || ts.isClassExpression(n)) && n.name) {
      note(n.name.text, false);
    } else if (ts.isBinaryExpression(n) && n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && n.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
      for (const nm of targetRoots(n.left)) note(nm, false);
    } else if (ts.isDeleteExpression(n)) {
      for (const nm of targetRoots(n.expression)) note(nm, false);
    } else if (
      (ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) &&
      (n.operator === ts.SyntaxKind.PlusPlusToken || n.operator === ts.SyntaxKind.MinusMinusToken)
    ) {
      for (const nm of targetRoots(n.operand)) note(nm, false);
    } else if (ts.isIdentifier(n) && isValueReference(n) && !isMemberRead(n)) {
      note(n.text, false);
    }
    ts.forEachChild(n, visit);
  };
  visit(mod.sf);
  // An imported name is a declaration too: never a console call opened here.
  for (const name of mod.imports.keys()) note(name, false);
  return new Set([...verdict].filter(([, ok]) => ok).map(([name]) => name));
}

/** Up from `n` through what passes a value on unchanged: parentheses, `as`, `!`, `satisfies`. */
function climbWrappers(n: ts.Node): ts.Node {
  let cur = n;
  while (
    cur.parent &&
    (ts.isParenthesizedExpression(cur.parent) ||
      ts.isAsExpression(cur.parent) ||
      ts.isSatisfiesExpression(cur.parent) ||
      ts.isNonNullExpression(cur.parent) ||
      ts.isTypeAssertionExpression(cur.parent))
  ) {
    cur = cur.parent;
  }
  return cur;
}

/** Whether identifier `id` is only the object a member is read from (`id.x`, `(id as T)[k]`). */
function isMemberRead(id: ts.Identifier): boolean {
  const top = climbWrappers(id);
  const p = top.parent;
  return !!p && (ts.isPropertyAccessExpression(p) || ts.isElementAccessExpression(p)) && p.expression === top;
}

/** The root names an assignment target writes into: `a.b[c] = …` writes into `a`; destructuring targets each. */
function targetRoots(target: ts.Node): string[] {
  let e: ts.Node = target;
  for (;;) {
    if (
      ts.isParenthesizedExpression(e) ||
      ts.isAsExpression(e) ||
      ts.isSatisfiesExpression(e) ||
      ts.isNonNullExpression(e) ||
      ts.isTypeAssertionExpression(e) ||
      ts.isPropertyAccessExpression(e) ||
      ts.isElementAccessExpression(e) ||
      ts.isSpreadElement(e) ||
      ts.isSpreadAssignment(e)
    ) {
      e = e.expression;
      continue;
    }
    break;
  }
  if (ts.isIdentifier(e)) return [e.text];
  if (ts.isArrayLiteralExpression(e)) return e.elements.flatMap(targetRoots);
  if (ts.isObjectLiteralExpression(e)) {
    return e.properties.flatMap((p) =>
      ts.isPropertyAssignment(p) ? targetRoots(p.initializer) : ts.isShorthandPropertyAssignment(p) ? [p.name.text] : ts.isSpreadAssignment(p) ? targetRoots(p) : [],
    );
  }
  // `[x = d] = …`: the default's target is its left side.
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.EqualsToken) return targetRoots(e.left);
  return [];
}

/** Whether `n` is `x.callSap(...)` / `x.callSapWrite(...)`, whatever `x` is. */
function isGovernedMethodCall(n: ts.Node): n is ts.CallExpression & { expression: ts.PropertyAccessExpression } {
  return ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && GOVERNED_METHODS.has(n.expression.name.text);
}

/**
 * Every `.callSap(...)` / `.callSapWrite(...)` in a route file whose receiver
 * is not a name `consoleCallNames` trusts: the audit check reports each, since
 * a call made on anything else writes no console row.
 */
export function untracedGovernedCalls(
  graph: SapGraph,
  file: string,
  pipelineModules: ReadonlySet<string>,
): Array<{ readonly method: string; readonly receiver: string; readonly line: number }> {
  const mod = graph.modules.get(file);
  if (!mod) return [];
  const trusted = consoleCallNames(graph, file, pipelineModules);
  const out: Array<{ method: string; receiver: string; line: number }> = [];
  const visit = (n: ts.Node): void => {
    if (isGovernedMethodCall(n)) {
      const receiver = unwrap(n.expression.expression);
      if (!(ts.isIdentifier(receiver) && trusted.has(receiver.text))) {
        out.push({
          method: n.expression.name.text,
          receiver: n.expression.expression.getText(mod.sf),
          line: mod.sf.getLineAndCharacterOfPosition(n.getStart(mod.sf)).line + 1,
        });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(mod.sf);
  return out;
}

export interface RouteFinding {
  readonly handler: string;
  /** The name mentioned, and the binding it resolves to. */
  readonly via: string;
  readonly target: string;
  readonly line: number;
}

/**
 * Every mention, on the path a handler runs, of a reaching binding outside the
 * governed pipeline. Empty when the route reaches SAP only through it.
 */
export function routeFindings(
  graph: SapGraph,
  file: string,
  pipelineModules: ReadonlySet<string>,
  /** The routes already being judged, so an alias cycle ends. */
  seenRoutes: ReadonlySet<string> = new Set(),
): RouteFinding[] {
  const mod = graph.modules.get(file);
  if (!mod || seenRoutes.has(file)) return [];
  const judging: ReadonlySet<string> = new Set([...seenRoutes, file]);
  const aliases = routeAliases(graph, file);
  const findings: RouteFinding[] = [];
  const followed = new Set<ts.Node>();
  /** Import-time code is walked apart: a handler that mentions the same binding walks all of it. */
  const followedOnImport = new Set<ts.Node>();
  const consoleCalls = consoleCallNames(graph, file, pipelineModules);

  /** The SAP-reaching binding a reference names, outside the pipeline's own modules; null when none. */
  const reachingTarget = (ref: Ref): string | null => {
    if (ref.kind === "fetch") return "global fetch";
    for (const t of graph.targets(file, ref)) {
      if (graph.reaching.has(t) && !pipelineModules.has(t.slice(0, t.indexOf("#")))) return t;
    }
    return null;
  };

  /**
   * A SAP-reaching FUNCTION VALUE that leaves a governed callback, to be called
   * after `callSap` has recorded its outcome: no row, no circuit (P0.14b review).
   * What runs inside the callback is governed; a closure it hands out is not.
   *
   * A mention of a reaching binding (an import, a module-local helper, an
   * inner function of the handler, or a local the callback stored one in)
   * carries a function value when it is not called right there, or when it
   * sits inside a function the callback creates. That value ESCAPES when it
   * reaches, through parentheses, `await`, `as`, `?:`, `||`/`??`, `.bind()`,
   * array and object literals:
   *   - the callback's return value (its concise body, or a `return` of the
   *     callback itself),
   *   - an assignment to anything not declared inside the callback (a
   *     variable, or a property of one, or of `this`),
   *   - `push` / `unshift` / `set` / `add` / `splice` on something not
   *     declared inside the callback.
   * Stored in a local of the callback instead, the local carries it on.
   *
   * WHAT IS NOT SEEN, said plainly: a value handed to a call the callback
   * makes is taken to be consumed by it (`items.map(k => read(k))`,
   * `Array.from({ length }, worker)`), so a closure returned through such a
   * call (`return items.map(k => () => read(k))`) or stored by a helper the
   * callback calls is not followed; nor is a value that leaves through a
   * module-level variable a helper writes. Those are the review's to catch.
   */
  const escapingFrom = (
    callback: ts.Node,
    method: string,
    inner: ReadonlyMap<string, ts.Node>,
    innerReaches: (name: string) => boolean,
  ): Array<Omit<RouteFinding, "handler">> => {
    const out: Array<Omit<RouteFinding, "handler">> = [];
    const body = ts.isVariableDeclaration(callback) ? callback.initializer : callback;
    if (!body || !isFunctionLike(body)) return out;

    // Names declared anywhere inside the callback (shadowing is not modelled: over-approximates "local").
    const declared = new Set<string>();
    const collectDeclared = (n: ts.Node): void => {
      // A catch clause's variable is a VariableDeclaration too.
      if (ts.isVariableDeclaration(n) || ts.isParameter(n)) for (const nm of bindingNames(n.name)) declared.add(nm);
      if ((ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n)) && n.name) declared.add(n.name.text);
      ts.forEachChild(n, collectDeclared);
    };
    collectDeclared(body);

    const enclosingFunction = (n: ts.Node): ts.Node | undefined => {
      for (let p = n.parent; p; p = p.parent) if (isFunctionLike(p)) return p;
      return undefined;
    };
    const rootName = (target: ts.Expression): string | null => {
      let e: ts.Expression = target;
      while (ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e) || ts.isParenthesizedExpression(e) || ts.isNonNullExpression(e)) {
        e = e.expression;
      }
      return ts.isIdentifier(e) ? e.text : null;
    };
    const ASSIGN = new Set([
      ts.SyntaxKind.EqualsToken,
      ts.SyntaxKind.QuestionQuestionEqualsToken,
      ts.SyntaxKind.BarBarEqualsToken,
      ts.SyntaxKind.AmpersandAmpersandEqualsToken,
    ]);
    const PASS_THROUGH = new Set([ts.SyntaxKind.BarBarToken, ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.QuestionQuestionToken]);
    const STORE = new Set(["push", "unshift", "set", "add", "splice"]);

    /** Up through what passes a value on unchanged. */
    const climb = (x: ts.Node): ts.Node => {
      let cur = x;
      for (;;) {
        const p = cur.parent;
        if (!p || cur === body) return cur;
        if (
          ts.isParenthesizedExpression(p) ||
          ts.isAsExpression(p) ||
          ts.isSatisfiesExpression(p) ||
          ts.isNonNullExpression(p) ||
          ts.isTypeAssertionExpression(p) ||
          ts.isAwaitExpression(p) ||
          ts.isSpreadElement(p) ||
          ts.isArrayLiteralExpression(p) ||
          ts.isObjectLiteralExpression(p) ||
          ts.isShorthandPropertyAssignment(p) ||
          (ts.isPropertyAssignment(p) && p.initializer === cur) ||
          (ts.isConditionalExpression(p) && p.condition !== cur) ||
          (ts.isBinaryExpression(p) && PASS_THROUGH.has(p.operatorToken.kind)) ||
          (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.CommaToken && p.right === cur)
        ) {
          cur = p;
          continue;
        }
        if (ts.isPropertyAccessExpression(p) && p.expression === cur && p.name.text === "bind" && ts.isCallExpression(p.parent) && p.parent.expression === p) {
          cur = p.parent;
          continue;
        }
        return cur;
      }
    };

    const carriers = new Set<string>();
    const reported = new Set<ts.Node>();
    /** Where a function value that `x` is ends up: an escape is reported; a local of the callback carries it on. */
    const trace = (x: ts.Node, at: ts.Node, target: string): void => {
      const top = climb(x);
      const p = top.parent;
      if (!p) return;
      let escapes = false;
      if (top === body) escapes = false;
      else if (ts.isArrowFunction(p) && p === body && p.body === top) escapes = true;
      else if (ts.isReturnStatement(p) && enclosingFunction(p) === body) escapes = true;
      else if (ts.isBinaryExpression(p) && p.right === top && ASSIGN.has(p.operatorToken.kind)) {
        const root = rootName(p.left);
        if (root === null || !declared.has(root)) escapes = true;
        else carriers.add(root);
      } else if (ts.isVariableDeclaration(p) && p.initializer === top) {
        for (const nm of bindingNames(p.name)) carriers.add(nm);
      } else if (
        ts.isCallExpression(p) &&
        p.arguments.some((a) => a === top) &&
        ts.isPropertyAccessExpression(p.expression) &&
        STORE.has(p.expression.name.text)
      ) {
        const root = rootName(p.expression.expression);
        if (root === null || !declared.has(root)) escapes = true;
        else carriers.add(root);
      }
      if (escapes && !reported.has(at)) {
        reported.add(at);
        out.push({ via: at.getText(mod.sf), target: `${target} (escapes ${method})`, line: line(at) });
      }
    };
    /** A mention of something that reaches SAP: the value it is, and every function around it inside the callback. */
    const mention = (at: ts.Node, target: string): void => {
      const p = at.parent;
      const called = !!p && ts.isCallExpression(p) && p.expression === at;
      if (!called) trace(at, at, target);
      for (let a = at.parent; a && a !== body; a = a.parent) if (isFunctionLike(a)) trace(a, at, target);
    };

    for (const { ref, at } of refsOf(body, mod)) {
      const target = reachingTarget(ref);
      if (target !== null) mention(at, target);
    }
    const identifiers: ts.Identifier[] = [];
    const collectIds = (n: ts.Node): void => {
      if (ts.isIdentifier(n) && isValueReference(n)) identifiers.push(n);
      ts.forEachChild(n, collectIds);
    };
    collectIds(body);
    for (const id of identifiers) {
      if (!declared.has(id.text) && inner.has(id.text) && innerReaches(id.text)) mention(id, `inner function ${id.text}`);
    }
    // A local that holds a reaching function value passes it on wherever it goes.
    const seen = new Set<string>();
    while ([...carriers].some((c) => !seen.has(c))) {
      const round = [...carriers].filter((c) => !seen.has(c));
      for (const c of round) seen.add(c);
      for (const id of identifiers) if (round.includes(id.text)) mention(id, `a function value stored in ${id.text}`);
    }
    return out;
  };

  const isInnerFunction = (n: ts.Node): n is ts.FunctionDeclaration | ts.VariableDeclaration =>
    ts.isFunctionDeclaration(n) ||
    (ts.isVariableDeclaration(n) &&
      !!n.initializer &&
      (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer)));

  /**
   * Walk `node` as code that runs on `handler`'s path. `skip` prunes what does
   * not run there (import-time code: a function only stored, a class method).
   */
  const follow = (node: ts.Node, handler: string, skip?: (n: ts.Node) => boolean): void => {
    const seen = skip ? followedOnImport : followed;
    if (seen.has(node)) return;
    seen.add(node);
    // Inner functions are followed where they are mentioned, not where they are declared.
    const inner = new Map<string, ts.Node>();
    const collectInner = (n: ts.Node): void => {
      if (n !== node && isInnerFunction(n) && n.name && ts.isIdentifier(n.name)) inner.set(n.name.text, n);
      ts.forEachChild(n, collectInner);
    };
    collectInner(node);
    const innerNodes = new Set(inner.values());
    // Only a console call this route opened is the pipeline (review round 3):
    // `{ callSap: (fn) => fn() }.callSap(...)` runs its callback ungoverned.
    const isGoverned = (n: ts.Node): n is ts.CallExpression & { expression: ts.PropertyAccessExpression } => {
      if (!isGovernedMethodCall(n)) return false;
      const receiver = unwrap(n.expression.expression);
      return ts.isIdentifier(receiver) && consoleCalls.has(receiver.text);
    };
    /** Whether an inner function of this handler reaches SAP, through anything it mentions. */
    const innerReachCache = new Map<string, boolean>();
    const innerReaches = (name: string): boolean => {
      const cached = innerReachCache.get(name);
      if (cached !== undefined) return cached;
      innerReachCache.set(name, false); // a recursive mention adds nothing
      const fn = inner.get(name);
      let reaches = false;
      if (fn) {
        reaches = refsOf(fn, mod).some(({ ref }) => reachingTarget(ref) !== null);
        if (!reaches) {
          const names: string[] = [];
          const collect = (n: ts.Node): void => {
            if (ts.isIdentifier(n) && isValueReference(n) && n.text !== name && inner.has(n.text)) names.push(n.text);
            ts.forEachChild(n, collect);
          };
          collect(fn);
          reaches = names.some(innerReaches);
        }
      }
      innerReachCache.set(name, reaches);
      return reaches;
    };
    /**
     * The function a governed call runs inside the pipeline, when `n` is that
     * argument: a function written in place, or a name passed (an inner
     * function of the handler is checked for what escapes it; an import or a
     * module-local binding is called inside). Anything else in that place —
     * `makeFn(await read())` — is evaluated before the call is entered, so it
     * is null and walked as handler code.
     */
    const governedCallback = (n: ts.Node): ts.Node | "named" | null => {
      const top = climbWrappers(n);
      const call = top.parent;
      if (top !== n || !call || !isGoverned(call)) return null;
      if (call.arguments.indexOf(n as ts.Expression) !== GOVERNED_ARGUMENT.get(call.expression.name.text)) return null;
      const arg = unwrap(n as ts.Expression);
      if (isFunctionLike(arg)) return arg;
      if (ts.isIdentifier(arg)) return inner.get(arg.text) ?? "named";
      return null;
    };
    const visitor = (n: ts.Node): boolean => {
      if (skip?.(n)) return false;
      if (n !== node && innerNodes.has(n)) return false;
      const callback = governedCallback(n);
      if (callback !== null) {
        // It runs inside the pipeline — unless a SAP-reaching function value
        // leaves it, to run after. The receiver and the other arguments are
        // walked as the handler's own code.
        const method = (climbWrappers(n).parent as ts.CallExpression & { expression: ts.PropertyAccessExpression }).expression.name.text;
        if (callback !== "named" && (isFunctionLike(callback) || ts.isVariableDeclaration(callback))) {
          for (const f of escapingFrom(callback, method, inner, innerReaches)) findings.push({ handler, ...f });
        }
        return false;
      }
      return true;
    };
    const mentions = refsOf(node, mod, visitor);
    for (const { ref, at } of mentions) check(ref, at, handler);
    // Inner functions mentioned outside the governed callbacks run on the handler's path.
    const mentionedNames = new Set<string>();
    const collectMentions = (n: ts.Node): void => {
      if (ts.isTypeNode(n)) return;
      if (skip?.(n)) return;
      if (n !== node && innerNodes.has(n)) return;
      if (governedCallback(n) !== null) return;
      if (ts.isIdentifier(n) && isValueReference(n)) mentionedNames.add(n.text);
      if (ts.isShorthandPropertyAssignment(n)) mentionedNames.add(n.name.text);
      ts.forEachChild(n, collectMentions);
    };
    collectMentions(node);
    for (const [name, n] of inner) if (mentionedNames.has(name)) follow(n, handler);
  };

  const check = (ref: Ref, at: ts.Node, handler: string): void => {
    if (ref.kind === "fetch") {
      findings.push({ handler, via: "fetch", target: "global fetch", line: line(at) });
      return;
    }
    for (const t of graph.targets(file, ref)) {
      if (!graph.reaching.has(t)) continue;
      const targetFile = t.slice(0, t.indexOf("#"));
      if (pipelineModules.has(targetFile)) continue;
      if (targetFile === file) {
        const b = mod.bindings.get(t.slice(t.indexOf("#") + 1));
        if (b) follow(b.node, handler);
        continue;
      }
      findings.push({ handler, via: at.getText(mod.sf), target: t, line: line(at) });
    }
  };

  const line = (n: ts.Node) => mod.sf.getLineAndCharacterOfPosition(n.getStart(mod.sf)).line + 1;

  for (const method of HTTP_METHODS) {
    for (const key of graph.resolveExport(file, method)) {
      const name = key.slice(key.indexOf("#") + 1);
      const b = mod.bindings.get(name);
      if (b && key.startsWith(`${file}#`)) {
        follow(b.node, method);
        continue;
      }
      /*
       * ANOTHER ROUTE'S HANDLER, RE-EXPORTED (review round 5): P1.10's
       * /api/northbound/v1/* aliases. It is that route's handler — the same
       * function — so it carries that route's findings for it, and that
       * route's import-time findings (importing the alias runs them).
       */
      const alias = aliases.find((a) => a.method === method && graph.resolveExport(a.source, a.sourceMethod).includes(key));
      if (alias) {
        for (const f of routeFindings(graph, alias.source, pipelineModules, judging)) {
          if (f.handler === alias.sourceMethod || f.handler === "<module>") {
            findings.push({ ...f, handler: method, target: `${f.target} (in ${alias.source}, whose ${alias.sourceMethod} this route re-exports)` });
          }
        }
        continue;
      }
      /*
       * A HANDLER THIS FILE RE-EXPORTS FROM A MODULE THAT IS NOT A ROUTE
       * (review round 3): `export { GET } from "@/lib/…"`, or an import
       * exported as GET. Its body is not this route's to walk, and src/lib is
       * no side entrance, so it was never checked at all. One that reaches
       * SAP outside a pipeline module is a finding: define the handler in the
       * route file, where it is checked, or exempt the route.
       */
      if (!key.startsWith(`${file}#`) && graph.reaching.has(key) && !pipelineModules.has(key.slice(0, key.indexOf("#")))) {
        findings.push({ handler: method, via: `export ${method}`, target: `${key} (a handler re-exported from another module)`, line: 1 });
      }
    }
  }
  for (const name of mod.bindings.keys()) {
    if (name.startsWith("<module:")) follow(mod.bindings.get(name)!.node, "<module>");
  }
  // What the module runs on import, besides its bare statements (review round 5).
  for (const code of importTimeCode(mod)) follow(code.node, "<module>", notRunOnImport(code.node));
  return findings;
}

/** The names a module mentions as values (imports it uses), for the audit-writer check. */
export function mentionedTargets(graph: SapGraph, file: string): Set<string> {
  const mod = graph.modules.get(file);
  const out = new Set<string>();
  if (!mod) return out;
  for (const name of mod.bindings.keys()) {
    for (const { ref } of graph.refs(keyOf(file, name))) for (const t of graph.targets(file, ref)) out.add(t);
  }
  return out;
}
