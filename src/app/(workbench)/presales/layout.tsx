/**
 * Presales route-group layout — the tenant-scope gate the pages were missing.
 *
 * THE BUG THIS CLOSES, which the codebase had already half-fixed. Every presales
 * query scopes with the conditional org-drop idiom:
 *
 *     where: { id, ...(user.organizationId ? { organizationId: user.organizationId } : {}) }
 *
 * When `organizationId` is null the filter is not narrowed — it is REMOVED, and
 * the query matches rows in every tenant. `lacksTenantScope` exists to reject
 * exactly that caller, its own comment says so, and seven API routes call it.
 *
 * The six PAGES using the same idiom did not, and neither did the test that
 * guards the rule: `cross-tenant-idor-guard-coverage.test.ts` walks
 * `src/app/api/presales` for `route.ts` files only. So the API was hardened,
 * tested, and the screens rendering the same rows were left open — the third
 * time this session that a guard existed on the mutation path and not the read
 * path.
 *
 * AND IT IS REACHABLE, which is what makes it urgent rather than theoretical.
 * `auth-options.ts` creates a magic-link user with `role: "consultant"` and no
 * organization at all. `canAccessPresales("consultant")` is true. So anyone who
 * completes a magic-link sign-in lands in exactly the state the idiom fails
 * open for.
 *
 * ONE GATE, NOT SIX. A per-page check is one forgotten page away from open, and
 * this is the second time these pages have been fixed one at a time. Both
 * conditions are evaluated here, before any page runs a query.
 *
 * The pages keep their own `canAccessPresales` calls: those redirect within the
 * workspace and drive per-action affordances, which is a different job from
 * deciding whether the workspace opens at all.
 */

import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { getCurrentUser } from "@/lib/auth/session";
import { canAccessPresales, lacksTenantScope } from "@/lib/presales/rbac";

export default async function PresalesLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/presales/login");

  // Role first, then tenant scope — a role that may not be here does not need
  // to be told anything about organizations.
  if (!canAccessPresales(user.role)) {
    return (
      <Refusal
        title="Presales is not open to your role"
        body="Bundles are created and sent by consultants, partner leads and platform admins. Executive sponsors and project managers can view them. If you need access, ask whoever administers your organization to change your role."
      />
    );
  }

  /*
   * A non-admin with no organization has no tenant to scope to. Refusing is the
   * only safe answer: the alternative the code took was to run the query
   * unscoped, which returns every organization's bundles.
   *
   * Stated plainly and made actionable, because this is a configuration
   * accident rather than anything the person did — a magic-link sign-in creates
   * exactly this account.
   */
  if (lacksTenantScope(user)) {
    return (
      <Refusal
        title="Your account is not attached to an organization"
        body="Presales bundles belong to an organization, and this account has none — so there is nothing here to show you, and showing you everything would be wrong. Ask a platform admin to attach your account, then reload."
      />
    );
  }

  return <>{children}</>;
}

function Refusal({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto max-w-2xl px-6 py-20">
      <div className="rounded-card-warm border border-border-default bg-paper p-8 shadow-card">
        <h1 className="font-serif text-2xl leading-8 text-ink">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-ink-soft">{body}</p>
      </div>
    </div>
  );
}
