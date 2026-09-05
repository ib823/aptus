/**
 * 2608 WS6 — the To-Be Process Pack is flag-gated: TOBE_PACK_ENABLED === "true".
 * Same shape as NEUTRAL_DISCOVERY_ENABLED / AFFIRM_EXTERNAL_ENABLED: a server
 * env, the literal "true", read at request time so a deployment can flip it
 * without a rebuild. Off means the routes 404 and the hub never advertises it.
 */
export function isTobePackEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.TOBE_PACK_ENABLED === "true";
}
