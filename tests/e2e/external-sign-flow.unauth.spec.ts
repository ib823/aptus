/**
 * End-to-end signoff round-trip.
 *
 * Goes: POST decision → POST sign → follow 303 → assert SIGNED page
 * renders → verify the bundle row reflects signed state → verify
 * signoff_completed + pdf_generated audit rows landed.
 *
 * The PDF generation will fall back to the HTML stub in local test mode
 * (no Chromium binary cached in the codespace); the route accepts that
 * fallback for dev and writes signedPdfHash/Url from it. Production env
 * gate prevents the same in production.
 */

import { expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import {
  PRESALES_TEST_BUNDLE_ID,
  PRESALES_TEST_SCOPE_CODE,
  PRESALES_TEST_UA,
} from './fixtures/presales-constants';
import { issueSessionNonce } from '../../src/lib/presales/csrf';

const SESSION_COOKIE = process.env.PRESALES_TEST_SESSION_COOKIE ?? 'NOT_SEEDED';

test.describe('Presales signoff — end-to-end', () => {
  test.skip(
    SESSION_COOKIE === 'NOT_SEEDED',
    'PRESALES_TEST_SESSION_COOKIE must be set by global-setup',
  );

  test('decision write → sign → SIGNED page renders + audit rows present', async ({ request }) => {
    const prisma = new PrismaClient();
    try {
      // Mark the grant as the signatory so the sign route allows it. The
      // seed leaves canSignOff true on the only grant, but make sure.
      await prisma.presalesAccessGrant.updateMany({
        where: { bundleId: PRESALES_TEST_BUNDLE_ID },
        data: { canSignOff: true },
      });
      // Reset any prior signoff so re-running this test in the same DB
      // exercises the first-writer path. (The unique constraint is on
      // signedByGrantId via single-row UPDATE; full reset is the seeder's
      // job otherwise.)
      await prisma.presalesBundle.update({
        where: { id: PRESALES_TEST_BUNDLE_ID },
        data: {
          signedAt: null,
          signedByGrantId: null,
          signedDecisionsJson: null as unknown as object,
          signedPdfBlobUrl: null,
          signedPdfHash: null,
          signedWithinGrace: false,
        },
      });
      await prisma.presalesAuditEvent.deleteMany({
        where: {
          bundleId: PRESALES_TEST_BUNDLE_ID,
          eventType: { in: ['signoff_completed', 'pdf_generated', 'pdf_emailed', 'decision_set', 'decision_changed'] },
        },
      });

      // The CSRF nonce is keyed on session id — the test sends the same
      // one the page would have rendered, derived from the seeded
      // session cookie value.
      const csrf = issueSessionNonce(SESSION_COOKIE);
      const baseHeaders = {
        cookie: `presales-session=${SESSION_COOKIE}`,
        'user-agent': PRESALES_TEST_UA,
        'content-type': 'application/x-www-form-urlencoded',
      };

      // 1. Record a decision on d1.
      const decRes = await request.post('/c/decisions', {
        headers: baseHeaders,
        form: { scopeCode: PRESALES_TEST_SCOPE_CODE, decisionId: 'd1', choice: 'cfg', csrf },
        maxRedirects: 0,
      });
      expect(decRes.status()).toBe(303);

      // 2. Sign.
      const signRes = await request.post('/c/sign', {
        headers: baseHeaders,
        form: { csrf },
        maxRedirects: 0,
      });
      expect(signRes.status(), 'POST /c/sign should 303 on success').toBe(303);
      expect(signRes.headers()['location']).toContain('/signed');

      // 3. Bundle row reflects signed state.
      const bundle = await prisma.presalesBundle.findUniqueOrThrow({
        where: { id: PRESALES_TEST_BUNDLE_ID },
      });
      expect(bundle.signedAt).not.toBeNull();
      expect(bundle.signedByGrantId).not.toBeNull();
      expect(bundle.signedDecisionsJson).not.toBeNull();

      // 4. Audit rows for signoff_completed and pdf_generated exist.
      const signoff = await prisma.presalesAuditEvent.findFirst({
        where: { bundleId: PRESALES_TEST_BUNDLE_ID, eventType: 'signoff_completed' },
      });
      expect(signoff).not.toBeNull();

      const pdfGen = await prisma.presalesAuditEvent.findFirst({
        where: { bundleId: PRESALES_TEST_BUNDLE_ID, eventType: 'pdf_generated' },
      });
      // In local test (no chromium binary), the PDF generator falls back
      // to an HTML stub which still produces a hash + sizeBytes. The
      // audit row is written regardless.
      expect(pdfGen).not.toBeNull();

      // 5. SIGNED page renders successfully.
      const signedPage = await request.get(
        `/c/s/${encodeURIComponent(PRESALES_TEST_SCOPE_CODE)}/signed`,
        { headers: { cookie: `presales-session=${SESSION_COOKIE}`, 'user-agent': PRESALES_TEST_UA } },
      );
      expect(signedPage.status()).toBe(200);
      const html = await signedPage.text();
      expect(html).toContain('decisions recorded');
      expect(html).toContain('Signature record');

      // 6. Bundle now immutable: subsequent decision write is rejected.
      const blocked = await request.post('/c/decisions', {
        headers: baseHeaders,
        form: { scopeCode: PRESALES_TEST_SCOPE_CODE, decisionId: 'd2', choice: 'std', csrf },
      });
      expect(blocked.status()).toBe(409);
      const blockedJson = (await blocked.json()) as { error?: { code?: string } };
      expect(blockedJson.error?.code).toBe('BUNDLE_SIGNED');
    } finally {
      await prisma.$disconnect();
    }
  });
});
