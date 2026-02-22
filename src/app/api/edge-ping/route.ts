/** Edge runtime diagnostic — tests if Edge functions work when Node.js functions hang */

export const runtime = "edge";

export function GET() {
  return new Response(
    JSON.stringify({
      ok: true,
      runtime: "edge",
      timestamp: new Date().toISOString(),
      region: process.env.VERCEL_REGION ?? "unknown",
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}
