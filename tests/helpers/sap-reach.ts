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

/** Whether any exported handler of this route (or its module-level code) reaches SAP. */
export function routeReaches(graph: SapGraph, file: string): boolean {
  const mod = graph.modules.get(file);
  if (!mod) return false;
  const entry = [...HTTP_METHODS.flatMap((m) => graph.resolveExport(file, m)), ...[...mod.bindings.keys()].filter((n) => n.startsWith("<module:")).map((n) => keyOf(file, n))];
  return entry.some((k) => graph.reaching.has(k));
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

/** A console call's governed step: what is passed to it runs inside the pipeline. */
const GOVERNED_METHODS = new Set(["callSap", "callSapWrite"]);

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
export function routeFindings(graph: SapGraph, file: string, pipelineModules: ReadonlySet<string>): RouteFinding[] {
  const mod = graph.modules.get(file);
  if (!mod) return [];
  const findings: RouteFinding[] = [];
  const followed = new Set<ts.Node>();

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

  const follow = (node: ts.Node, handler: string): void => {
    if (followed.has(node)) return;
    followed.add(node);
    // Inner functions are followed where they are mentioned, not where they are declared.
    const inner = new Map<string, ts.Node>();
    const collectInner = (n: ts.Node): void => {
      if (n !== node && isInnerFunction(n) && n.name && ts.isIdentifier(n.name)) inner.set(n.name.text, n);
      ts.forEachChild(n, collectInner);
    };
    collectInner(node);
    const innerNodes = new Set(inner.values());
    const isGoverned = (n: ts.Node): n is ts.CallExpression & { expression: ts.PropertyAccessExpression } =>
      ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && GOVERNED_METHODS.has(n.expression.name.text);
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
    const mentions = refsOf(node, mod, (n) => {
      if (n !== node && innerNodes.has(n)) return false;
      if (isGoverned(n)) {
        // The receiver is walked; the callbacks run inside the pipeline —
        // unless a SAP-reaching function value leaves them, to run after.
        for (const { ref, at } of refsOf(n.expression.expression, mod)) check(ref, at, handler);
        for (const arg of n.arguments) {
          const callback = ts.isIdentifier(arg) && inner.has(arg.text) ? inner.get(arg.text)! : arg;
          if (isFunctionLike(callback) || ts.isVariableDeclaration(callback)) {
            for (const f of escapingFrom(callback, n.expression.name.text, inner, innerReaches)) findings.push({ handler, ...f });
          }
        }
        return false;
      }
      return true;
    });
    for (const { ref, at } of mentions) check(ref, at, handler);
    // Inner functions mentioned outside the governed callbacks run on the handler's path.
    const mentionedNames = new Set<string>();
    const collectMentions = (n: ts.Node): void => {
      if (ts.isTypeNode(n)) return;
      if (n !== node && innerNodes.has(n)) return;
      if (isGoverned(n)) {
        collectMentions(n.expression.expression);
        return;
      }
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
      if (b && key.startsWith(`${file}#`)) follow(b.node, method);
    }
  }
  for (const name of mod.bindings.keys()) {
    if (name.startsWith("<module:")) follow(mod.bindings.get(name)!.node, "<module>");
  }
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
