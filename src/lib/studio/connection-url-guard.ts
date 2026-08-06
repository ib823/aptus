/**
 * Hosts a stored connection must never point at.
 *
 * The broker calls a connection's `baseUrl` server-side with credentials
 * attached, so a URL aimed at localhost, the link-local metadata service, or a
 * private range would turn "add a connection" into an SSRF primitive against
 * this deployment's own network — authenticated, but builder-reachable.
 * Literal-IP and obvious-internal names are refused at validation; a public
 * DNS name resolving privately is a network-layer concern this check cannot
 * see, and pretending otherwise here would be a false claim.
 *
 * A lib module rather than a route export: a route file may only export route
 * fields, and the build enforces it.
 */
export function isForbiddenBaseUrlHost(u: string): boolean {
  let host: string;
  try {
    host = new URL(u).hostname.toLowerCase();
  } catch {
    return true;
  }
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return true;
  }
  // IPv6 literals ([::1], [fe80::…], [fd…]) — refuse all IP literals outright.
  if (host.startsWith("[")) return true;
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4) {
    // A public literal IP is refused too: a real SAP tenant has a hostname,
    // and an IP-literal target is far more likely to be probing than SAP.
    return true;
  }
  return false;
}
