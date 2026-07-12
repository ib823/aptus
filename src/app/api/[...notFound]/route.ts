/**
 * API catch-all — any /api/* path with no matching route returns the standard
 * JSON error envelope { error: { code, message } } instead of Next's HTML 404,
 * so API clients never have to branch on content-type. Real routes are more
 * specific and always win route resolution; only genuine misses reach here.
 */
import { NextResponse, type NextRequest } from "next/server";
import { ERROR_CODES } from "@/types/api";

export const dynamic = "force-dynamic";

function notFound(request: NextRequest): NextResponse {
  return NextResponse.json(
    { error: { code: ERROR_CODES.NOT_FOUND, message: `No API route for ${request.nextUrl.pathname}` } },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}

export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
export const HEAD = notFound;
export const OPTIONS = notFound;
