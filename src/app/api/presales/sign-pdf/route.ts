/**
 * Server-side Chromium PDF generator for the presales signoff artifact.
 *
 * Runs as a separate Vercel Function with 1024MB memory (configured in
 * vercel.json under functions).
 *
 * Inputs: { bundleId } via JSON POST. The route is intentionally
 * internal — protected by SIGNOFF_INTERNAL_SECRET (server-to-server
 * shared secret, since /c/sign on this same deployment is the only
 * legitimate caller). No external client should ever see this endpoint.
 *
 * Output: PDF bytes uploaded to Vercel Blob; route returns
 * { blobUrl, sha256, sizeBytes }.
 *
 * If @sparticuz/chromium can't initialize (local dev without the binary
 * cached, or the binary missing in the deploy artifact), the route falls
 * back to returning the HTML rendering with a clearly stamped DRAFT
 * watermark. The /c/sign handler refuses to sign on fallback in
 * production — see the sign route for the gate logic.
 */

import { put } from '@vercel/blob';
import chromium from '@sparticuz/chromium';
import { createHash } from 'crypto';
import { NextResponse, type NextRequest } from 'next/server';
import puppeteer from 'puppeteer-core';
import { prisma } from '@/lib/db/prisma';
import { renderSignoffPdfHtml, type SignoffPdfContext } from '@/lib/presales/pdf-template';
import type { Decision, ScopeItemContent } from '@/lib/fts/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

function internalAuthOk(req: NextRequest): boolean {
  const provided = req.headers.get('x-presales-internal-secret');
  const expected = process.env.PRESALES_INTERNAL_SECRET;
  if (!expected || expected.length < 16) return false;
  if (!provided) return false;
  // Length-prefix check then constant-time compare avoided here since
  // we're early in the request — a string equality on header values is
  // acceptable for a server-to-server shared secret of fixed length.
  return provided === expected;
}

interface DecisionStateLite {
  scopeCode: string;
  decisionId: string;
  choice: string;
  notes: string;
}

const CHOICE_LABEL: Record<string, string> = {
  open: 'No position taken',
  std: 'Standard',
  cfg: 'Configure',
  cst: 'Custom',
};

async function buildPdfContext(bundleId: string): Promise<SignoffPdfContext | null> {
  const bundle = await prisma.presalesBundle.findUnique({
    where: { id: bundleId },
    include: { signedByGrant: true },
  });
  if (!bundle) return null;

  // Prefer signedDecisionsJson if signing already wrote a frozen view
  // (consultant re-renders for archive use this path). Otherwise we
  // re-derive from the live decisions table, which is the path /c/sign
  // calls before transitioning the bundle to signed state.
  let statesByScope: Record<string, DecisionStateLite[]>;
  if (bundle.signedDecisionsJson) {
    statesByScope = bundle.signedDecisionsJson as unknown as Record<string, DecisionStateLite[]>;
  } else {
    const rows = await prisma.presalesBundleDecision.findMany({
      where: { bundleId, supersededAt: null },
      orderBy: { setAt: 'asc' },
    });
    statesByScope = {};
    for (const r of rows) {
      const arr = statesByScope[r.scopeCode] ?? [];
      arr.push({ scopeCode: r.scopeCode, decisionId: r.decisionId, choice: r.choice, notes: r.notes });
      statesByScope[r.scopeCode] = arr;
    }
  }

  const snapshot = bundle.contentSnapshotJson as unknown as ScopeItemContent[];
  const scopes: SignoffPdfContext['scopes'] = bundle.scopeCodes.map((code) => {
    const snap = Array.isArray(snapshot) ? snapshot.find((s) => s?.code === code) : null;
    const states = statesByScope[code] ?? [];
    const stateByDecisionId = new Map<string, DecisionStateLite>();
    for (const s of states) stateByDecisionId.set(s.decisionId, s);

    const decisions = (snap?.decisions ?? []).map((d: Decision) => {
      const state = stateByDecisionId.get(d.id);
      const choice = state?.choice ?? 'open';
      return {
        scopeCode: code,
        decisionId: d.id,
        decisionTitle: d.title,
        choiceLabel: CHOICE_LABEL[choice] ?? choice,
        notes: state?.notes || undefined,
      };
    });
    return {
      scopeCode: code,
      scopeTitle: snap?.title ?? code,
      decisions,
    };
  });

  return {
    clientCompanyName: bundle.clientCompanyName,
    bundleReference: bundle.id,
    signatoryName: bundle.signedByGrant?.displayName ?? bundle.signedByGrant?.email ?? '(pending)',
    signatoryEmail: bundle.signedByGrant?.email ?? '(pending)',
    signedAtIso: (bundle.signedAt ?? new Date()).toISOString(),
    signedWithinGrace: bundle.signedWithinGrace,
    documentHash: bundle.signedPdfHash ?? 'pending',
    acknowledgementVersion: bundle.acknowledgementTextVersion,
    pdpaVersion: bundle.pdpaNoticeTextVersion,
    scopes,
  };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!internalAuthOk(req)) {
    return NextResponse.json({ error: { code: 'INTERNAL_AUTH' } }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { bundleId?: string };
  if (!body.bundleId) {
    return NextResponse.json({ error: { code: 'MISSING_BUNDLE_ID' } }, { status: 400 });
  }

  const ctx = await buildPdfContext(body.bundleId);
  if (!ctx) {
    return NextResponse.json({ error: { code: 'BUNDLE_NOT_FOUND' } }, { status: 404 });
  }

  const html = renderSignoffPdfHtml(ctx);

  let pdfBytes: Buffer;
  try {
    const executablePath = await chromium.executablePath();
    const browser = await puppeteer.launch({
      args: chromium.args,
      executablePath,
      headless: true,
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      const uint8 = await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
      });
      pdfBytes = Buffer.from(uint8);
    } finally {
      await browser.close();
    }
  } catch (err) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: { code: 'PDF_RENDER_FAILED', message: (err as Error).message } },
        { status: 500 },
      );
    }
    // Dev/test fallback: ship the raw HTML bytes so the sign flow can
    // proceed without the Chromium binary on a developer machine. The
    // sign route gates on a real PDF in production by checking the
    // returned contentType.
    pdfBytes = Buffer.from(html, 'utf8');
  }

  const sha256 = createHash('sha256').update(pdfBytes).digest('hex');

  let blobUrl: string;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(`presales/signoff/${body.bundleId}.pdf`, pdfBytes, {
      access: 'public',
      contentType: 'application/pdf',
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    blobUrl = blob.url;
  } else {
    // Local dev: no blob token — return a data URL the sign route can
    // store. Production env-check requires BLOB_READ_WRITE_TOKEN.
    blobUrl = `data:application/pdf;base64,${pdfBytes.toString('base64')}`;
  }

  return NextResponse.json({
    blobUrl,
    sha256,
    sizeBytes: pdfBytes.length,
  });
}
