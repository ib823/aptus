import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { PRESALES_SESSION_COOKIE_NAME } from "@/lib/presales/session";

export default async function RootNotFound() {
  const cookieStore = await cookies();
  /*
   * ASK FOR THE COOKIE THIS PRODUCT ACTUALLY SETS.
   *
   * These were hardcoded as "session-token" / "next-auth.session-token", and
   * neither is ever issued — the Workbench session cookie is `abeam-session`.
   * So `hasSession` was unconditionally false and every signed-in user who hit
   * a bad URL was shown a "Sign In" button, which reads as "your session
   * expired" and sends people back through a login they do not need.
   *
   * Importing the names rather than restating them is the point: a rename that
   * misses this file should not silently degrade back to "always signed out".
   */
  const hasSession =
    cookieStore.has(SESSION_COOKIE_NAME) || cookieStore.has(PRESALES_SESSION_COOKIE_NAME);

  /*
   * Point at destinations that exist ON THIS DEPLOYMENT. `/dashboard` and
   * `/login` live under (portal), which a Workbench-only host does not serve —
   * the middleware allow-list bounces both to /workbench, so the buttons
   * "worked" only by way of a redirect that discards where you asked to go.
   * Same env test as dev-login/page.tsx.
   */
  const workbenchOnly = process.env.WORKBENCH_ONLY === "true";
  const homeHref = workbenchOnly ? "/workbench" : "/";
  const signedInHref = workbenchOnly ? "/workbench" : "/dashboard";
  const signInHref = workbenchOnly ? "/presales/login" : "/login";

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 px-4">
      <div className="text-center animate-in fade-in slide-in-from-bottom-2 duration-300">
        <FileQuestion className="w-16 h-16 text-muted-foreground/40 mx-auto mb-6" />
        <h1 className="text-4xl font-bold text-foreground mb-2">Page not found</h1>
        <p className="text-base text-muted-foreground mb-8 max-w-md">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="flex items-center justify-center gap-3">
          {hasSession ? (
            <Link href={signedInHref}>
              <Button size="lg">{workbenchOnly ? "Go to Workbench" : "Go to Dashboard"}</Button>
            </Link>
          ) : (
            <Link href={signInHref}>
              <Button size="lg">Sign In</Button>
            </Link>
          )}
          <Link href={homeHref}>
            <Button variant="outline" size="lg">Home</Button>
          </Link>
        </div>
        <p className="mt-8 text-sm text-muted-foreground/60">ABeam Workbench</p>
      </div>
    </div>
  );
}
