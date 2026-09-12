"use client";

import { useState, type ReactNode } from "react";

import { reasonIdFor } from "@/lib/coreedge/disabled";

/**
 * FieldPicker — which fields a data feed carries.
 *
 * Choosing fields is a privacy decision as much as a technical one, so the count
 * is stated rather than implied: "12 of 84 fields" is the sentence, and the
 * read-only summary after approval says the same thing in the same words. A
 * picker that shows only ticks makes "how much of this table are we sending"
 * something the reader has to work out.
 *
 * READ-ONLY IS A RENDER, NOT A DISABLED FORM. Once access is approved the chosen
 * fields are part of what was approved, and showing them as greyed-out inputs
 * invites the reader to try to change them. The summary is a different shape on
 * purpose.
 */

export interface FieldPickerProps {
  readonly fields: readonly string[];
  readonly chosen: readonly string[];
  readonly onChange?: (chosen: readonly string[]) => void;
  readonly readOnly?: boolean;
  readonly id: string;
  /** Present means the picker cannot be edited, and says why. */
  readonly disabledReason?: string;
}

export function FieldPicker({
  fields,
  chosen,
  onChange,
  readOnly = false,
  id,
  disabledReason,
}: FieldPickerProps): ReactNode {
  const [query, setQuery] = useState("");
  const chosenSet = new Set(chosen);
  const summary = `${chosen.length} of ${fields.length} ${fields.length === 1 ? "field" : "fields"}`;

  if (readOnly) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-ink-muted">{summary}</p>
        <ul className="flex flex-wrap gap-2">
          {chosen.map((field) => (
            <li
              key={field}
              className="rounded-full border border-[color:var(--border-strong)] px-2 py-[0.125em] font-mono text-xs text-ink-soft"
            >
              {field}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const blocked = disabledReason !== undefined;
  const reasonId = reasonIdFor(id);
  const visible = fields.filter((f) => f.toLowerCase().includes(query.toLowerCase()));

  function toggle(field: string): void {
    if (blocked || onChange === undefined) return;
    onChange(chosenSet.has(field) ? chosen.filter((f) => f !== field) : [...chosen, field]);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={`${id}-filter`} className="text-sm text-ink">
          Fields
        </label>
        {/* Announced when it changes, because the count IS the decision. */}
        <span className="text-xs text-ink-muted" aria-live="polite">
          {summary}
        </span>
      </div>

      <input
        id={`${id}-filter`}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filter fields"
        aria-disabled={blocked ? "true" : undefined}
        {...(blocked ? { "aria-describedby": reasonId } : {})}
        className="rounded-[var(--radius-input)] border border-[color:var(--border-strong)] bg-paper px-3 py-2 font-mono text-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring-navy"
      />

      <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
        {visible.map((field) => (
          <li key={field}>
            <label className="flex items-center gap-2 font-mono text-sm text-ink">
              <input
                type="checkbox"
                checked={chosenSet.has(field)}
                // Stays focusable while blocked, so the reason can be reached.
                aria-disabled={blocked ? "true" : undefined}
                {...(blocked ? { "aria-describedby": reasonId } : {})}
                onChange={() => toggle(field)}
                className="accent-[var(--brand-navy)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring-navy"
              />
              {field}
            </label>
          </li>
        ))}
      </ul>

      {blocked ? (
        <p id={reasonId} className="max-w-prose text-xs text-ink-muted">
          {disabledReason}
        </p>
      ) : null}
    </div>
  );
}
