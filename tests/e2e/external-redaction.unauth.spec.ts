/**
 * ABeam Workbench — Presales redaction layer integration test.
 *
 * THIS IS THE LOAD-BEARING REDACTION GATE.
 *
 * Catches the single failure mode that is most catastrophic for the
 * product: IP-bearing fields (effort estimates, custom-development types,
 * upgrade impact, RICEFW classification, SSCUI references) leaking into
 * the external client surface.
 *
 * The test:
 *   1. Issues a real HTTP request to /c/s/[scopeCode] with a valid
 *      presales-session cookie.
 *   2. Captures the response HTML.
 *   3. Extracts <script id="__NEXT_DATA__"> JSON — Next.js 15's hydration
 *      carrier for App Router server components. Falls back to inline
 *      __NEXT_F__ data chunks if the App Router emits those instead.
 *   4. Recursively walks the parsed JSON.
 *   5. Asserts NONE of these keys appear at any depth:
 *      effort, effortDays, custom_type, ext_impact, ricefw_class, sscui_refs
 *   6. Sweeps every string value with /\b\d+\s*days?\b/ to catch
 *      hard-coded "5 days" strings that may have leaked into description
 *      fields. False positives possible; if one fires, audit the source.
 *   7. Runs both passes in light-mode AND dark-mode session contexts.
 *      The redaction layer is mode-agnostic (data-layer concern, not
 *      render-layer), and the test proves that.
 *
 * Pre-route state: this test will FAIL until /c/s/[scopeCode] exists AND
 * a presales fixture (bundle + grant + session) has been seeded. That is
 * intentional. The build sequence is: redaction layer + this test → route
 * → page. This test guards the merge of the route.
 *
 * Seeded fixture contract (consumed via env vars so we don't hard-code
 * cuid values in source):
 *   PRESALES_TEST_BUNDLE_ID         — id of a seeded PresalesBundle
 *   PRESALES_TEST_SCOPE_CODE        — scope code present in that bundle (e.g. "BD9")
 *   PRESALES_TEST_SESSION_COOKIE    — value of a valid presales-session cookie
 *                                     bound to a grant on that bundle
 */

import { expect, test } from '@playwright/test';
import { REDACTED_KEYS } from '../../src/lib/presales/redaction';
import { PRESALES_TEST_SCOPE_CODE, PRESALES_TEST_UA } from './fixtures/presales-constants';

const BUNDLE_ID = process.env.PRESALES_TEST_BUNDLE_ID ?? 'NOT_SEEDED';
const SCOPE_CODE = process.env.PRESALES_TEST_SCOPE_CODE ?? PRESALES_TEST_SCOPE_CODE;
const SESSION_COOKIE = process.env.PRESALES_TEST_SESSION_COOKIE ?? 'NOT_SEEDED';
const TEST_UA = PRESALES_TEST_UA;

const SCOPE_URL = `/c/s/${SCOPE_CODE}`;

// Catches "5 days", "12 day", "1day". The redaction layer strips structured
// effort fields; this sweep catches accidental hard-codes in description
// strings.
const DAYS_REGEX = /\b\d+\s*days?\b/i;

// ─── Helpers ────────────────────────────────────────────────────────────────

function walkForBannedKeys(value: unknown, banned: ReadonlySet<string>, path = '$'): string[] {
  const hits: string[] = [];
  const stack: Array<{ v: unknown; p: string }> = [{ v: value, p: path }];
  let iterations = 0;
  while (stack.length) {
    if (++iterations > 100_000) break; // defense against pathological depth
    const { v, p } = stack.pop()!;
    if (v === null || typeof v !== 'object') continue;
    if (Array.isArray(v)) {
      v.forEach((child, i) => stack.push({ v: child, p: `${p}[${i}]` }));
      continue;
    }
    for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
      if (banned.has(k)) hits.push(`${p}.${k}`);
      stack.push({ v: child, p: `${p}.${k}` });
    }
  }
  return hits;
}

function walkForDaysStrings(value: unknown, path = '$'): Array<{ path: string; sample: string }> {
  const hits: Array<{ path: string; sample: string }> = [];
  const stack: Array<{ v: unknown; p: string }> = [{ v: value, p: path }];
  let iterations = 0;
  while (stack.length) {
    if (++iterations > 100_000) break;
    const { v, p } = stack.pop()!;
    if (typeof v === 'string') {
      if (DAYS_REGEX.test(v)) hits.push({ path: p, sample: v.slice(0, 80) });
      continue;
    }
    if (v === null || typeof v !== 'object') continue;
    if (Array.isArray(v)) {
      v.forEach((child, i) => stack.push({ v: child, p: `${p}[${i}]` }));
      continue;
    }
    for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
      stack.push({ v: child, p: `${p}.${k}` });
    }
  }
  return hits;
}

function extractHydrationPayload(html: string): unknown {
  // Dual-path parser by design — pin this comment.
  //
  // Next 15 App Router server components stream as self.__next_f.push([...])
  // inline scripts. The Pages Router (and pages that opt out of streaming)
  // emit a single <script id="__NEXT_DATA__">{...JSON...}</script> tag.
  // The presales /c surface is App Router today but a future maintainer
  // may convert pieces; until Next 16 unifies the carriers, both must be
  // parsed or the redaction test will silently vacuous-pass against the
  // hydration variant it doesn't recognise.
  //
  // If you are upgrading Next: confirm which branch is in use against the
  // actual response body, then prune the unused branch — leaving a dead
  // branch makes future audits harder.
  //
  // The test asserts ANY payload is present — a missing payload is itself
  // a failure (covered by the !toBeNull() assertion in assertRedaction).
  const nextData = html.match(/<script\s+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (nextData?.[1]) {
    return JSON.parse(nextData[1]);
  }
  const nextF: unknown[] = [];
  const re = /self\.__next_f\.push\(\[\d+,\s*("(?:[^"\\]|\\.)*")\]\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    // The captured group is a JSON string; parse to unescape, then attempt
    // to JSON.parse again if it looks like a JSON payload (starts with [ or {).
    const captured = match[1];
    if (!captured) continue;
    const raw = JSON.parse(captured) as string;
    const trimmed = raw.trim();
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        nextF.push(JSON.parse(trimmed));
      } catch {
        nextF.push(raw);
      }
    } else {
      nextF.push(raw);
    }
  }
  return nextF.length ? nextF : null;
}

// ─── Per-mode runner ────────────────────────────────────────────────────────

async function assertRedaction(opts: {
  baseURL: string;
  request: import('@playwright/test').APIRequestContext;
  themeCookie: 'light' | 'dark';
}): Promise<void> {
  const response = await opts.request.get(SCOPE_URL, {
    headers: {
      cookie: [
        `presales-session=${SESSION_COOKIE}`,
        `theme=${opts.themeCookie}`,
      ].join('; '),
      'user-agent': TEST_UA,
    },
  });

  // (a) status. A 404 here is a vacuous-pass trap — we want the test to fail
  // loudly until the route is built and the fixture is wired.
  expect(response.status(), `expected 200 from ${SCOPE_URL} in ${opts.themeCookie} mode`).toBe(200);

  const html = await response.text();

  // (b) hydration payload present. A blank response would let banned-key
  // checks vacuously pass.
  const payload = extractHydrationPayload(html);
  expect(payload, 'no Next hydration payload found in response HTML').not.toBeNull();

  // (c) recursive banned-key sweep.
  const bannedSet = new Set<string>(REDACTED_KEYS);
  const keyHits = walkForBannedKeys(payload, bannedSet);
  expect(
    keyHits,
    `REDACTION LEAK in ${opts.themeCookie} mode — banned keys present at: ${keyHits.join(', ')}`,
  ).toEqual([]);

  // (d) string sweep for hard-coded day counts. False positives possible;
  // if one fires, audit the source field — but never relax this assertion
  // without a documented exception.
  const dayHits = walkForDaysStrings(payload);
  expect(
    dayHits,
    `potential effort leak in ${opts.themeCookie} mode — "<n> days" string at: ${dayHits
      .map((h) => `${h.path} ("${h.sample}")`)
      .join('; ')}`,
  ).toEqual([]);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test.describe('Presales external view — redaction gate', () => {
  test.skip(
    BUNDLE_ID === 'NOT_SEEDED' || SESSION_COOKIE === 'NOT_SEEDED',
    'PRESALES_TEST_BUNDLE_ID and PRESALES_TEST_SESSION_COOKIE must be set. ' +
      'Seed a presales fixture (bundle + grant + session) and re-run. This skip is ' +
      'a wiring guard; once the route and seed exist, remove it or the gate is bypassed.',
  );

  test('light mode response carries no IP-bearing fields', async ({ request, baseURL }) => {
    await assertRedaction({ baseURL: baseURL ?? '', request, themeCookie: 'light' });
  });

  test('dark mode response carries no IP-bearing fields', async ({ request, baseURL }) => {
    await assertRedaction({ baseURL: baseURL ?? '', request, themeCookie: 'dark' });
  });
});
