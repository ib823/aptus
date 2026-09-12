import type { ReactNode } from "react";

/**
 * OpsTable — the operator's view of every lane at once.
 *
 * NAME COLLISION, DELIBERATE. `src/components/ops/OpsChrome.tsx:291` exports an
 * `OpsTable` too. They are different components for different consoles and
 * neither imports the other; `tests/unit/coreedge/components.test.ts` asserts
 * that no file under `src/components/coreedge/` imports from `components/ops`
 * or `components/shared`, and vice versa. Renaming one to avoid the collision
 * would have been the other reasonable choice; the build brief chose this one,
 * and the test is what makes it safe.
 *
 * THE LEGEND IS NOT OPTIONAL. An operator's table is dense enough that the
 * glyphs do real work, and a glyph nobody has been told the meaning of is worse
 * than a word. It renders above the table, not behind a toggle.
 *
 * EMPTY AND LOADING ARE DIFFERENT and are rendered differently: "no lanes match
 * this filter" is a fact about the filter, and a skeleton is a fact about us.
 * Collapsing them is how an operator concludes the estate is empty during an
 * outage.
 */

export interface OpsColumn<Row> {
  readonly key: string;
  readonly header: string;
  readonly cell: (row: Row) => ReactNode;
  /** Right-aligned for counts and ages, so the eye can scan a column. */
  readonly numeric?: boolean;
}

export interface OpsTableProps<Row> {
  readonly rows: readonly Row[];
  readonly columns: readonly OpsColumn<Row>[];
  readonly rowKey: (row: Row) => string;
  readonly legend: ReactNode;
  readonly caption: string;
  readonly onRowOpen?: (row: Row) => void;
  /** Shown only when nothing has ever loaded — never over a known set of rows. */
  readonly loading?: ReactNode;
  /** Shown when the query genuinely returned nothing. */
  readonly empty?: ReactNode;
}

export function OpsTable<Row>({
  rows,
  columns,
  rowKey,
  legend,
  caption,
  onRowOpen,
  loading,
  empty,
}: OpsTableProps<Row>): ReactNode {
  if (loading !== undefined && rows.length === 0) return <>{loading}</>;

  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs text-ink-muted">{legend}</div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="bg-cream text-left">
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={`border-b border-[color:var(--border-default)] px-3 py-2 font-medium text-ink-soft ${
                    col.numeric === true ? "text-right" : ""
                  }`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                className="border-b border-[color:var(--border-default)] last:border-b-0 focus-within:bg-ink-tint"
              >
                {columns.map((col, i) => (
                  <td
                    key={col.key}
                    className={`px-3 py-2 align-top ${col.numeric === true ? "text-right" : ""}`}
                  >
                    {/*
                      The row opens from its first cell, as a real button. A
                      click handler on <tr> is unreachable by keyboard, which on
                      an operator's screen means the whole table is.
                    */}
                    {i === 0 && onRowOpen !== undefined ? (
                      <button
                        type="button"
                        onClick={() => onRowOpen(row)}
                        className="text-left underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring-navy"
                      >
                        {col.cell(row)}
                      </button>
                    ) : (
                      col.cell(row)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length === 0 && empty !== undefined ? <div className="py-6">{empty}</div> : null}
    </div>
  );
}
