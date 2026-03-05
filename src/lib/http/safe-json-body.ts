type JsonBodyParseFailure = "invalid_json" | "aborted";

export type SafeJsonBodyResult =
  | { ok: true; data: unknown }
  | { ok: false; reason: JsonBodyParseFailure };

function isRequestAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const code = (error as Error & { code?: unknown }).code;
  return code === "ECONNRESET" || error.message.toLowerCase() === "aborted";
}

function isInvalidJsonBodyError(error: unknown): boolean {
  return error instanceof SyntaxError || (error instanceof Error && error.message.includes("Unexpected end of JSON input"));
}

/**
 * Parse JSON request bodies without throwing on malformed/truncated payloads.
 */
export async function safeParseJsonBody(request: Request): Promise<SafeJsonBodyResult> {
  try {
    const data = await request.json();
    return { ok: true, data };
  } catch (error) {
    if (isRequestAbortError(error)) {
      return { ok: false, reason: "aborted" };
    }
    if (isInvalidJsonBodyError(error)) {
      return { ok: false, reason: "invalid_json" };
    }
    throw error;
  }
}
