/**
 * THE VERSION OF THE /SCHEMA TEXTS' RENDERER (P1.3).
 *
 * GET /schema serves texts rendered once, when the snapshot was recorded
 * (jobs.ts, renderSchemaTexts), while the starter kit and the solution
 * document render the same contract on every download. A deploy that changes
 * what the renderer writes (json-schema.ts, or how renderSchemaTexts calls it)
 * would leave /schema serving the old render and the kit and the document the
 * new one under the same contentHash, until each interface was verified again
 * — and consumers validate write bodies against /schema's requestSchema.
 *
 * So the texts are stored with this number (ContractSnapshot.schemaTextsVersion)
 * and served only while it is the running code's: an older one is answered
 * as NOT_RENDERED ("verify the service again"), never as a stale render.
 *
 * BUMP IT whenever a /schema text of any contract changes. The golden test
 * (tests/unit/contracts/golden.test.ts) records the digest of the goldens'
 * texts for each version, so a change made without a bump fails there.
 *
 * Pure, and its own module: GET /schema imports it and must import nothing
 * that renders (tests/unit/contracts/schema-read-path.test.ts).
 */
export const SCHEMA_TEXTS_VERSION = 1;
