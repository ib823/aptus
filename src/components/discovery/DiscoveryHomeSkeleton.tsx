/**
 * ABeam Workbench — V1 loading skeleton (brief §7 V1 state (f)).
 *
 * Brief §12.8: "Every state in §7 exists — fallback, decided, sealed, Present,
 * Export, skeleton are first-class, not afterthoughts." The .dc models no
 * skeleton at all; this is built from the brief.
 *
 * Mirrors V1's real geometry so the swap doesn't jump. `.ax-skeleton` carries
 * the pulse and already respects reduced-motion via the shared stylesheet.
 */

export function DiscoveryHomeSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="ax-skeleton mb-2 h-3 w-64 rounded-input bg-ink-tint" />
      <div className="ax-skeleton mb-7 h-10 w-[min(720px,100%)] rounded-input bg-ink-tint" />

      <div className="mb-9 grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="ax-skeleton h-[92px] rounded-card-warm border border-border-default bg-ink-tint"
          />
        ))}
      </div>

      <div className="ax-skeleton mb-3.5 h-3 w-40 rounded-input bg-ink-tint" />
      <div className="mb-9 grid gap-3.5 lg:grid-cols-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="ax-skeleton h-[116px] rounded-card-warm border border-border-default bg-ink-tint"
          />
        ))}
      </div>

      <div className="ax-skeleton h-[220px] rounded-card-warm border border-border-default bg-ink-tint" />
    </div>
  );
}
