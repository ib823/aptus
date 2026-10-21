/**
 * A request body read as JSON, refused past a stated size BEFORE it is parsed.
 *
 * `request.json()` reads and parses whatever the client sends; the platform's
 * own limit (4.5 MB on Vercel) is not stated anywhere a self-hosted
 * deployment would see it, and a route whose work is linear in its body is
 * bounded only by that. This reads the stream, counting bytes, and stops
 * (cancelling the rest) as soon as the count passes `maxBytes`, so nothing
 * past the stated size is buffered or parsed.
 */

export type BoundedJson = { ok: true; value: unknown } | { ok: false; reason: "TOO_LARGE" | "INVALID" };

export async function readJsonCapped(request: Request, maxBytes: number): Promise<BoundedJson> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, reason: "TOO_LARGE" };
  const body = request.body;
  if (!body) return { ok: false, reason: "INVALID" };
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return { ok: false, reason: "TOO_LARGE" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "INVALID" };
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.byteLength;
  }
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) as unknown };
  } catch {
    return { ok: false, reason: "INVALID" };
  }
}
