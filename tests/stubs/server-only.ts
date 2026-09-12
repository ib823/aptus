/**
 * A no-op stand-in for `server-only` under vitest.
 *
 * `server-only` is not a real module: it is a build-time marker whose package
 * exports resolve to a file that THROWS when bundled into a client graph. That
 * is what makes `import "server-only"` a guarantee rather than a comment — a
 * component that imports a server module fails the build instead of shipping
 * database code to a browser.
 *
 * Vitest is neither graph, so the import cannot resolve and the module cannot be
 * unit-tested at all. Aliasing it here restores that: the marker keeps its
 * meaning in `next build`, which is the only place it ever meant anything, and
 * the module it guards becomes testable.
 *
 * This does NOT weaken the guarantee. The check lives in the bundler, and this
 * file is only reachable from vitest's own resolver.
 */
export {};
