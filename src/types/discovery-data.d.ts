/**
 * ABeam Workbench — Neutral Process Discovery dataset module types.
 *
 * The discovery datasets are ~1.9MB of JSON. With `resolveJsonModule`, tsc
 * infers a full structural literal type for every one of the 742 processes and
 * their nested flows — which exhausts the V8 heap and makes `typecheck:strict`
 * die with an OOM. (Verified: the baseline passes; adding a plain
 * `import raw from "...client.json"` is what tips it over.)
 *
 * Typing these modules as `unknown` stops that inference dead. Nothing is lost:
 * the loaders never trusted the inferred shape anyway — they run the raw value
 * through the zod schemas in src/lib/discovery/schema.ts, which is a stronger
 * guarantee than a literal type (it validates at runtime, against frozen data).
 *
 * The declaration is scoped to the discovery datasets so JSON imports elsewhere
 * in the repo keep their normal inferred types.
 */

declare module "@/data/discovery/discovery-library.client.json" {
  const value: unknown;
  export default value;
}

declare module "@/data/discovery/discovery-library.consultant.json" {
  const value: unknown;
  export default value;
}
