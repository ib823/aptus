/**
 * POST /api/affirm/sample — provision (or reset) the training sandbox
 * bundle for the currently authenticated workbench user and return its
 * id, so the "Try it with sample data" card can drop the user straight
 * into a ready-made, issued affirm bundle with the guided tour running.
 *
 * Unlike /api/dev/seed-affirm (a secret-gated dev backdoor that mints its
 * own sessions), this runs as the logged-in user and never touches the
 * session — so a tester keeps their identity. Enabled only on internal
 * test / workbench-only deployments; 404 otherwise. Requires the affirm
 * value-stream master data to already be seeded.
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { ensureDemoBundle } from "@/lib/affirm/demo-bundle";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function sandboxEnabled(): boolean {
  return (
    process.env.INTERNAL_TEST_DEPLOYMENT === "true" ||
    process.env.WORKBENCH_ONLY === "true"
  );
}

export async function POST(): Promise<NextResponse> {
  if (!sandboxEnabled()) {
    return NextResponse.json({ error: "disabled" }, { status: 404 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const result = await ensureDemoBundle(user.id);
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        message:
          "The affirm sample data isn't seeded on this deployment yet. Ask the deployment owner to run the affirm seed.",
      },
      { status: 409 },
    );
  }

  return NextResponse.json({
    ok: true,
    bundleId: result.id,
    created: result.created,
    questionCount: result.questionCount,
  });
}
