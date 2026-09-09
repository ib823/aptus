/** Convert response Set-Cookie fields to request Cookie name/value pairs.
 * Node's getSetCookie preserves separate fields. The fallback also handles
 * combined headers without splitting the comma in an Expires date.
 */
export function extractCookies(headers: Headers): string {
  const separate = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.();
  const raw = separate?.length ? separate : [headers.get("set-cookie") ?? ""];
  return raw.flatMap((field) => field.split(/,(?=\s*[^;,\s=]+=)/))
    .map((cookie) => cookie.split(";")[0]!.trim())
    .filter((pair) => /^[^=\s;]+=[^\r\n]*$/.test(pair))
    .join("; ");
}
