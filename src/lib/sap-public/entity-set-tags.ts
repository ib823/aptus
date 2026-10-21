/**
 * The older reader of a service description's entity sets: a bounded scan of
 * `<EntitySet …>` start tags, no XML parser. The SAP connectors read with it,
 * and the verify falls back to it when the Contract Compiler refuses a
 * description (service-verify.ts). Pure, with no imports, so the compiler's
 * worker runs it inside its envelope (pipeline.ts) without carrying the
 * connectors along.
 */

export interface SapEntitySet {
  name: string;
  entityType: string;
}

/**
 * An `<EntitySet …>` start tag. LINEAR ON HOSTILE INPUT: the attribute run
 * excludes `<` as well as `>` and is bounded, so a body of `<EntitySet
 * <EntitySet …` with no `>` costs one short scan per tag instead of a scan to
 * the end of the document from every one (quadratic — an 8 MB description
 * held the event loop for hours). `<` cannot appear inside an XML attribute
 * value, so no real tag is lost.
 */
export const ENTITY_SET_TAG = /<EntitySet\b([^<>]{0,4096})>/g;

export function parseEntitySets(metadataXml: string): SapEntitySet[] {
  const entitySets: SapEntitySet[] = [];
  const re = new RegExp(ENTITY_SET_TAG.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(metadataXml)) !== null) {
    const attrs = match[1] ?? "";
    const name = attrs.match(/\bName="([^"]+)"/)?.[1];
    const entityType = attrs.match(/\bEntityType="([^"]+)"/)?.[1];
    if (name && entityType) entitySets.push({ name, entityType });
  }
  return entitySets;
}
