/**
 * What the deployment's env tenant serves, and what it does not (P0.3, A59) —
 * the sentences both connection registers print, in one place.
 *
 * THE CLAIM THAT WAS WRONG. Both registers said that an organization with no
 * stored connection "falls back to the deployment's configured tenant", and
 * called that "the broker's own fallback rule". The broker does the opposite:
 * the northbound data and write routes bind only through the organization's
 * own connections (`resolveBindingFor`, never the shared env tenant) and
 * refuse with CONNECTION_NOT_CONFIGURED when there is none. Meanwhile the
 * console reads (Explore, preview, the operations screens) resolve the
 * deployment's tenant keys for every organization whether it has connections
 * or not (`resolveReadTenant`, deployment tenants first). So the register told
 * a reviewer that an organization with no connection had live apps on the
 * shared tenant when every one of their calls was refused, and told an
 * organization WITH connections that the env tenant was not in use when its
 * users' console reads still reached it.
 *
 * So two facts, reported separately, neither derived from the other:
 *   - `deploymentTenant.configured`: the env tenant exists and serves console
 *     reads for every organization, whatever connections it has;
 *   - `brokerReachable`: the organization has an active connection, without
 *     which every app call is refused.
 */

export const DEPLOYMENT_TENANT_SCOPE =
  "The deployment's configured tenant serves console and explorer reads (Explore, preview and the operations screens) for every organization on this deployment, whatever connections each has. The northbound broker never uses it: an app reaches SAP only through a connection its own organization declares. It is shared by every organization here, governed at the deployment level, and has no per-connection owner, write flag or sealed secret.";

export const BROKER_UNREACHABLE =
  "This organization has no active SAP connection, so every call its apps make through the broker is refused with CONNECTION_NOT_CONFIGURED until one is declared in Developer Studio. The deployment's tenant does not stand in for it.";
