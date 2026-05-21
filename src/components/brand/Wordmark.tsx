/**
 * ABeam Workbench wordmark (brief §6.3).
 *
 * The mark + lockup used in the TopBar, terminal pages, the client landing
 * card, and email headers. SVG is inline so it survives email clients that
 * strip <img> tags. Color resolves to --brand-navy at runtime.
 *
 * Sizes:
 *   sm  — 20 px mark, 13 px text (compact placements: dense headers)
 *   md  — 24 px mark, 16 px text (default — TopBar lockup)
 *   lg  — 32 px mark, 22 px text (terminal hero, login card)
 */

interface WordmarkProps {
  size?: 'sm' | 'md' | 'lg';
  /** Optional className for layout positioning. */
  className?: string;
  /** When true, hides the text and renders just the mark. */
  markOnly?: boolean;
}

export function Wordmark({ size = 'md', className, markOnly = false }: WordmarkProps) {
  const markDim = size === 'sm' ? 20 : size === 'lg' ? 32 : 24;
  const textSize = size === 'sm' ? 13 : size === 'lg' ? 22 : 16;

  return (
    <span
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
    >
      <svg
        width={markDim}
        height={markDim}
        viewBox="0 0 24 24"
        aria-hidden
        focusable={false}
      >
        <rect width="24" height="24" rx="4" fill="var(--brand-navy)" />
        <path
          d="M7 18 L12 6 L17 18 M9 14 L15 14"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
      {markOnly ? null : (
        <span
          style={{
            fontFamily: 'var(--font-serif), Georgia, serif',
            fontSize: textSize,
            fontWeight: 500,
            color: 'var(--brand-navy)',
            letterSpacing: '-0.005em',
            lineHeight: 1,
          }}
        >
          ABeam Workbench
        </span>
      )}
    </span>
  );
}
