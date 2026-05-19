import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center max-w-md px-6">
        <div className="text-xs font-mono text-slate-500 uppercase tracking-wide">
          Scope item not found
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mt-2">
          We don&rsquo;t have a workbench for that scope code yet.
        </h1>
        <p className="text-sm text-slate-600 mt-3">
          Tier 1 decisions for this scope item haven&rsquo;t been authored. Add a
          YAML under <code className="font-mono">scripts/decisions-yaml/</code>{" "}
          and re-run the generator.
        </p>
        <Link
          href="/workbench"
          className="inline-block mt-6 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-700"
        >
          Back to workbenches
        </Link>
      </div>
    </div>
  );
}
