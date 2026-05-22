/**
 * /affirm/new — Screen 1, create-a-bundle flow.
 *
 * page-head with eyebrow + serif h1 + sub. AffirmStepper at the top.
 * The picker itself lives in ValueStreamTreePicker.
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { getValueStreamTree } from "@/lib/affirm/queries";
import { ValueStreamTreePicker } from "@/components/affirm/ValueStreamTreePicker";
import { AffirmStepper } from "@/components/affirm/AffirmStepper";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: { absolute: "New affirm bundle — ABeam Workbench" },
};

export default async function NewBundlePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/presales/login");

  const tree = await getValueStreamTree();

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <nav className="mb-4 text-xs text-ink-muted">
        <Link href="/affirm" className="hover:text-ink">
          Affirmations
        </Link>
        <span className="px-1.5 text-ink-disabled">/</span>
        <span className="text-ink-soft">New</span>
      </nav>
      <header className="mb-5">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
          New affirm bundle · 2026 release master
        </p>
        <h1 className="font-serif text-3xl leading-10 text-ink">Assemble the affirmation bundle</h1>
        <p className="mt-1.5 max-w-[720px] text-sm text-ink-soft">
          Selection is manual against the controlled 672-item master. There is no DDA
          auto-import. Coverage chips show which sub-processes already carry SAP
          Business-Driven Configuration questions.
        </p>
      </header>

      <AffirmStepper current="scope" />

      <ValueStreamTreePicker tree={tree} mode="new" />
    </div>
  );
}
