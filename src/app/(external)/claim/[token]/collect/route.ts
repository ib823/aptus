/**
 * POST /claim/:token/collect — mint the key, once, for the person who pressed.
 *
 * POST ONLY, and that is the whole point. The claim page's GET used to mint
 * the key, so the mail scanner or chat unfurler that fetched the URL first was
 * handed the only copy. Scanners GET; they do not send POSTs. There is no GET
 * export here, so a scanner probing this path gets a 405 and nothing else.
 *
 * THE KEY IS IN THIS RESPONSE BODY AND NOWHERE ELSE. It exists for this one
 * response — the server keeps only its hash — so the response is marked
 * no-store: a cache that kept it would be a second place the key lives.
 *
 * EVERY REFUSAL IS THE SAME RESPONSE. A caller holding a wrong, expired, spent
 * or revoked token learns only that it did not work; the reason is recorded on
 * the link server-side, where the people who sent it can read it.
 */

import { NextResponse, type NextRequest } from "next/server";

import { claimKey } from "@/lib/northbound/claim-link";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await context.params;
  const result = await claimKey(token);

  if (!result.ok) {
    return NextResponse.json(
      { error: { message: "This link can't be used." } },
      { status: 404, headers: NO_STORE },
    );
  }

  return NextResponse.json(
    {
      data: {
        rawToken: result.rawToken,
        environment: result.environment,
        solutionName: result.solutionName,
        tail: result.tail,
        tokenPrefix: result.tokenPrefix,
        // P0.11: when the key stops, and until when the key it replaced
        // still works. Dates, never secrets.
        expiresAt: result.expiresAt?.toISOString() ?? null,
        previousValidUntil: result.previousValidUntil?.toISOString() ?? null,
      },
    },
    { headers: NO_STORE },
  );
}
