/**
 * Reading source as source, for the scans that assert things about the codebase.
 *
 * WHY THIS IS NOT A PAIR OF REGEXES. Two guards in this suite have now been
 * broken by naive comment-stripping, in opposite directions:
 *
 *   · The tenant-scope scan treated a COMMENT as code. A comment containing the
 *     word `where` sat between a Prisma call and its real clause, so the parser
 *     read the prose, found no colon after it, and reported a correctly-scoped
 *     upsert as unverifiable.
 *
 *   · The workspace-chrome scan treated CODE as a comment. `StudioTopBar`
 *     explains a past defect using the paths `/operations/*` and
 *     `/control-tower/*` — inside `//` comments. A block-comment regex applied
 *     first sees that `/*`, matches forward to the next `*​/` two hundred lines
 *     later, and silently deletes the code it was supposed to inspect. The guard
 *     passed on a file with the exact literal it exists to forbid.
 *
 * The second is the dangerous one: a scan that quietly stops seeing anything
 * reports success forever. Both come from the same mistake — applying two
 * independent regexes to a language where comment delimiters nest inside each
 * other and inside strings.
 *
 * A single left-to-right walk cannot make either error, because it always knows
 * which construct it is currently inside.
 */

type Mode = "comments" | "comments-and-strings";

/**
 * Blank out comments — and optionally string literals — preserving length and
 * line breaks so offsets and line numbers still line up.
 *
 * `comments`: use when a literal in a string IS the thing being looked for (a
 * hardcoded label, a forbidden column name in a query).
 *
 * `comments-and-strings`: use when only executable structure matters (matching
 * call shapes, argument objects).
 */
export function stripSource(src: string, mode: Mode = "comments"): string {
  const out = src.split("");
  const blank = (from: number, to: number) => {
    for (let k = from; k < to && k < out.length; k++) if (out[k] !== "\n") out[k] = " ";
  };

  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];

    if (ch === "/" && next === "/") {
      const nl = src.indexOf("\n", i);
      const stop = nl === -1 ? src.length : nl;
      blank(i, stop);
      i = stop;
      continue;
    }

    if (ch === "/" && next === "*") {
      const close = src.indexOf("*/", i + 2);
      const stop = close === -1 ? src.length : close + 2;
      blank(i, stop);
      i = stop;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      // A string is skipped either way — the walk must step OVER it so a `//`
      // inside a URL cannot start a comment. It is only blanked on request.
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === "\\") {
          j += 2;
          continue;
        }
        if (src[j] === ch) {
          j++;
          break;
        }
        j++;
      }
      if (mode === "comments-and-strings") blank(i, j);
      i = j;
      continue;
    }

    i++;
  }

  return out.join("");
}
