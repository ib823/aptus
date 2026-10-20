import type { Metadata } from "next";
import Link from "next/link";

import { ABeamLogo } from "@/components/shared/ABeamLogo";
import { developerSignupMode } from "@/lib/auth/developer-workspace";

import { DeveloperSignupForm } from "./DeveloperSignupForm";

/**
 * /signup/developer — a self-service developer workspace (roadmap P0.13).
 *
 * Reachable on a WORKBENCH_ONLY host through the '/signup' entry in
 * lib/routing/workbench-paths.ts, like the partner sign-up beside it. Whether it
 * offers a form is decided by COREEDGE_DEVELOPER_SIGNUP on the server; off (the
 * default), the page says so and the route refuses anyway.
 */

export const metadata: Metadata = { title: "Developer sign-up" };
export const dynamic = "force-dynamic";

export default function DeveloperSignupPage() {
  const open = developerSignupMode() === "open";

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
      <ABeamLogo size="lg" className="mb-6 justify-center lg:hidden" />
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold text-foreground">Create a developer workspace</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Explore SAP APIs against the SAP API Hub sandbox, and invite your colleagues.
        </p>
      </div>

      {open ? (
        <DeveloperSignupForm />
      ) : (
        <p className="text-center text-sm text-muted-foreground">
          Developer sign-up is not open on this host. Ask an administrator for an invitation.
        </p>
      )}

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href="/presales/login"
          className="font-medium text-foreground underline underline-offset-2 hover:text-foreground"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
