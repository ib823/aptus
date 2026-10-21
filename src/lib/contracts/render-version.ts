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
 * So the texts are stored with this number (ContractSnapshot.schemaTextsVersion),
 * and the build renders every row of an OLDER version again from its stored
 * IR (scripts/rerender-schema-texts.ts, contracts/rerender.ts), so a bump
 * costs no re-verify against SAP. The number only picks those rows: /schema
 * serves stored texts whatever version wrote them (consolidated review round
 * 3). Refusing another version's texts answered NOT_RENDERED for every
 * interface while a build re-rendered under the live deployment, and for
 * every row a run did not reach; serving them leaves at most a deploy
 * window's, or a row's until the next run, of /schema one render behind the
 * kit, each a self-consistent render of the same IR.
 *
 * BUMP IT whenever a /schema text of any contract changes. The golden test
 * (tests/unit/contracts/golden.test.ts) records the digest of the goldens'
 * texts for each version, so a change made without a bump fails there.
 *
 * Pure, and its own module: GET /schema imports it and must import nothing
 * that renders (tests/unit/contracts/schema-read-path.test.ts).
 */
export const SCHEMA_TEXTS_VERSION = 1;
