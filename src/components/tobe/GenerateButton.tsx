"use client";

/**
 * 2608 WS6 — "Generate pack" for one engagement. POSTs to
 * /api/tobe/[bundleId]/generate and refreshes the server-rendered page, which
 * then shows the new latest pack. Errors are shown inline, never swallowed.
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function GenerateButton({ bundleId, hasPack }: { bundleId: string; hasPack: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function generate() {
    setError(null);
    start(async () => {
      const res = await fetch(`/api/tobe/${bundleId}/generate`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `failed (${res.status})`);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={generate}
        disabled={pending}
        data-testid="tobe-generate"
        className="inline-flex h-10 items-center rounded-input bg-navy px-4 text-sm font-semibold text-white transition hover:bg-navy-hover disabled:opacity-60"
      >
        {pending ? "Generating…" : hasPack ? "Regenerate pack" : "Generate pack"}
      </button>
      {error && (
        <p role="alert" className="text-xs text-decision-custom">
          Could not generate: {error}
        </p>
      )}
    </div>
  );
}
