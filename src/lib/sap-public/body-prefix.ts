/**
 * READ A RESPONSE BODY NO FURTHER THAN A BOUND.
 *
 * `res.text()` and `res.json()` read a body whole, and fetch inflates gzip,
 * deflate and brotli before they see it, without a limit. A host that answers
 * with a small compressed body expanding to hundreds of megabytes therefore
 * costs the reader hundreds of megabytes: a few such reads at once take a 2 GB
 * instance down, with every other organisation's requests on it. Any host a
 * builder can name (every *.ondemand.com host passes the allow-list, and a
 * free BTP trial serves whatever its owner likes) is such a host, so every
 * body read from one goes through here, with a bound in DECODED bytes.
 *
 * Past the bound the stream is cancelled, so nothing more is inflated, and
 * `truncated` says the body had more to give: a caller that needs the whole
 * body refuses it rather than parse half of it.
 */

export async function bodyPrefix(res: Response, maxBytes: number): Promise<{ text: string; truncated: boolean }> {
  if (res.body && typeof res.body.getReader === "function") {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    let size = 0;
    let truncated = false;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      text += decoder.decode(value, { stream: true });
      if (size > maxBytes) {
        truncated = true;
        break;
      }
    }
    text += decoder.decode();
    await reader.cancel().catch(() => undefined);
    return { text: text.slice(0, maxBytes), truncated };
  }
  // Not a stream (a test double, or an environment without one).
  const full = typeof res.text === "function" ? await res.text() : "";
  return {
    text: full.slice(0, maxBytes),
    truncated: new TextEncoder().encode(full).byteLength > maxBytes,
  };
}
