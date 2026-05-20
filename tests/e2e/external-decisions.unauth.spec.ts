/**
 * ABeam Workbench — Presales decision-write round-trip test.
 *
 * Exercises route 5 (POST /c/decisions) plus the scope page's decision-
 * state surfacing plus the session_invalid audit hook. Three assertions
 * mounted in one spec for narrative compactness:
 *
 *   1. POST /c/decisions for (BD9, d1, 'cfg') → 303 to /c/s/BD9 → GET that
 *      → parse hydration JSON → assert the choice text 'Configure' is
 *      present AND no forbidden key surfaces.
 *
 *   2. Tampered cookie POST → 409 + external_action_denied audit row with
 *      payload.reason = 'session_invalid' and null bundleId (off-bundle
 *      tampering signal).
 *
 *   3. Guard rejection: with a valid session, POST an invalid choice →
 *      409 INVALID_CHOICE, no decision row created.
 *
 * The redaction sweep is the same walker used by external-redaction.spec.
 */

import { expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { issueSessionNonce } from '../../src/lib/presales/csrf';
import { REDACTED_KEYS } from '../../src/lib/presales/redaction';
import {
  PRESALES_TEST_BUNDLE_ID,
  PRESALES_TEST_GRANT_ID,
  PRESALES_TEST_SCOPE_CODE,
  PRESALES_TEST_UA,
} from './fixtures/presales-constants';

const SESSION_COOKIE = process.env.PRESALES_TEST_SESSION_COOKIE ?? 'NOT_SEEDED';

const DAYS_REGEX = /\b\d+\s*days?\b/i;

function walkForBannedKeys(value: unknown, banned: ReadonlySet<string>, path = '$'): string[] {
  const hits: string[] = [];
  const stack: Array<{ v: unknown; p: string }> = [{ v: value, p: path }];
  let iterations = 0;
  while (stack.length) {
    if (++iterations > 100_000) break;
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

function extractHydrationPayload(html: string): unknown {
  const nextData = html.match(/<script\s+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (nextData?.[1]) return JSON.parse(nextData[1]);
  const nextF: unknown[] = [];
  const re = /self\.__next_f\.push\(\[\d+,\s*("(?:[^"\\]|\\.)*")\]\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
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

test.describe('Presales decision write — round trip + guards', () => {
  test.skip(
    SESSION_COOKIE === 'NOT_SEEDED',
    'PRESALES_TEST_SESSION_COOKIE must be set by global-setup',
  );

  test('POST sets decision → scope page surfaces the new choice with no IP leak', async ({
    request,
    baseURL,
  }) => {
    const baseHeaders = {
      cookie: `presales-session=${SESSION_COOKIE}`,
      'user-agent': PRESALES_TEST_UA,
    };

    const csrf = SESSION_COOKIE === 'NOT_SEEDED' ? '' : issueSessionNonce(SESSION_COOKIE);
    const postRes = await request.post('/c/decisions', {
      headers: {
        ...baseHeaders,
        'content-type': 'application/x-www-form-urlencoded',
      },
      form: {
        scopeCode: PRESALES_TEST_SCOPE_CODE,
        decisionId: 'd1',
        choice: 'cfg',
        csrf,
      },
      maxRedirects: 0,
    });
    expect(postRes.status(), 'POST /c/decisions should 303 on success').toBe(303);
    expect(postRes.headers()['location']).toContain(`/c/s/${PRESALES_TEST_SCOPE_CODE}`);

    const scopeRes = await request.get(`/c/s/${PRESALES_TEST_SCOPE_CODE}`, {
      headers: baseHeaders,
    });
    expect(scopeRes.status()).toBe(200);
    const html = await scopeRes.text();

    // The redaction sweep must still pass on the now-stateful page.
    const payload = extractHydrationPayload(html);
    expect(payload, 'hydration payload should be present').not.toBeNull();
    const banned = new Set<string>(REDACTED_KEYS);
    expect(
      walkForBannedKeys(payload, banned),
      'no IP-bearing key should appear in hydration JSON after decision write',
    ).toEqual([]);

    // Day-mention sweep should still pass.
    const matches = JSON.stringify(payload).match(DAYS_REGEX);
    expect(matches, 'no day-mention should appear in hydration JSON').toBeNull();

    // The choice should appear in the rendered HTML next to decision d1.
    // The page emits a data-testid="current-choice-d1" with the label
    // 'Configure' once the cfg choice is set.
    expect(html).toContain('current-choice-d1');
    expect(html).toContain('Configure');
  });

  test('tampered cookie POST → 409 + session_invalid audit row, bundleId null', async ({
    request,
    baseURL,
  }) => {
    const tampered = 'bogus-session-id-' + 'a'.repeat(32);

    const prisma = new PrismaClient();
    try {
      const beforeCount = await prisma.presalesAuditEvent.count({
        where: {
          eventType: 'external_action_denied',
          bundleId: null,
          payload: { path: ['reason'], equals: 'session_invalid' },
        },
      });

      const res = await request.post('/c/decisions', {
        headers: {
          cookie: `presales-session=${tampered}`,
          'user-agent': PRESALES_TEST_UA,
          'content-type': 'application/x-www-form-urlencoded',
        },
        form: {
          scopeCode: PRESALES_TEST_SCOPE_CODE,
          decisionId: 'd1',
          choice: 'cfg',
        },
      });
      expect(res.status(), 'tampered cookie POST should 409').toBe(409);
      const json = (await res.json()) as { error?: { code?: string } };
      expect(json.error?.code).toBe('SESSION_INVALID');

      const afterCount = await prisma.presalesAuditEvent.count({
        where: {
          eventType: 'external_action_denied',
          bundleId: null,
          payload: { path: ['reason'], equals: 'session_invalid' },
        },
      });
      expect(afterCount).toBeGreaterThan(beforeCount);
    } finally {
      await prisma.$disconnect();
    }
  });

  test('invalid choice → 409 INVALID_CHOICE, no row inserted', async ({ request }) => {
    const prisma = new PrismaClient();
    try {
      const beforeRows = await prisma.presalesBundleDecision.count({
        where: {
          bundleId: PRESALES_TEST_BUNDLE_ID,
          scopeCode: PRESALES_TEST_SCOPE_CODE,
          decisionId: 'd2',
        },
      });

      const csrf = issueSessionNonce(SESSION_COOKIE);
      const res = await request.post('/c/decisions', {
        headers: {
          cookie: `presales-session=${SESSION_COOKIE}`,
          'user-agent': PRESALES_TEST_UA,
          'content-type': 'application/x-www-form-urlencoded',
          'accept': 'application/json',
        },
        form: {
          scopeCode: PRESALES_TEST_SCOPE_CODE,
          decisionId: 'd2',
          choice: 'NOT_A_CHOICE',
          csrf,
        },
      });
      expect(res.status()).toBe(409);
      const json = (await res.json()) as { error?: { code?: string } };
      expect(json.error?.code).toBe('INVALID_CHOICE');

      const afterRows = await prisma.presalesBundleDecision.count({
        where: {
          bundleId: PRESALES_TEST_BUNDLE_ID,
          scopeCode: PRESALES_TEST_SCOPE_CODE,
          decisionId: 'd2',
        },
      });
      expect(afterRows).toBe(beforeRows);
    } finally {
      await prisma.$disconnect();
    }
  });

  // Suppress unused-warning for the grant constant; it's exported for use
  // in upcoming consultant-side audit query tests.
  test.skip('reserved: PRESALES_TEST_GRANT_ID kept available for downstream tests', () => {
    expect(PRESALES_TEST_GRANT_ID).toBeTruthy();
  });
});
