/**
 * RelativeTime — dual-line timestamp display (brief §2.6).
 *
 * Top: human-relative ("2 hours ago"). Bottom: ISO-ish absolute in mono
 * ("2026-05-21 14:32:09"). Replaces every raw ISO string visible on
 * screen — bundle Recent Activity, audit table, signoff metadata.
 *
 * Implementation note: client component because formatDistanceToNow
 * computes against `new Date()` and the SSR'd value would otherwise
 * drift from the client value across hydration. Rendering on the
 * client side at mount avoids the hydration warning.
 */

'use client';

import { format, formatDistanceToNow } from 'date-fns';
import { useEffect, useState } from 'react';

interface Props {
  iso: string;
  /** When `true`, hides the absolute mono line (compact placement). */
  compact?: boolean;
}

export function RelativeTime({ iso, compact = false }: Props) {
  const d = new Date(iso);
  const absolute = format(d, 'yyyy-MM-dd HH:mm:ss');
  // SSR initial render uses the absolute as the "relative" line to keep
  // hydration deterministic. After mount, useEffect swaps in the live
  // relative string.
  const [relative, setRelative] = useState<string>(absolute);
  useEffect(() => {
    setRelative(formatDistanceToNow(d, { addSuffix: true }));
    const interval = setInterval(() => {
      setRelative(formatDistanceToNow(d, { addSuffix: true }));
    }, 60_000);
    return () => clearInterval(interval);
    // d is recomputed each render but its underlying value is stable
    // because iso is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iso]);

  if (compact) {
    return (
      <span style={{ fontSize: 13, color: 'var(--ink-soft, #4A4A4A)' }} title={absolute}>
        {relative}
      </span>
    );
  }

  return (
    <span style={{ display: 'inline-block', lineHeight: 1.2 }}>
      <span
        style={{ display: 'block', fontSize: 14, color: 'var(--ink-primary)' }}
      >
        {relative}
      </span>
      <span
        style={{
          display: 'block',
          fontSize: 11,
          color: 'var(--ink-muted)',
          fontFamily:
            'ui-monospace, "SF Mono", SFMono-Regular, Menlo, monospace',
        }}
      >
        {absolute}
      </span>
    </span>
  );
}
