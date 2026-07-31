/**
 * Presales preferences — parse and read-back.
 *
 * THE DEFECT THIS PINS: the settings form POSTed to a route that stored
 * nothing and 303-redirected back, so Save looked successful for months.
 * These tests hold the round trip: what the form sends is what the column
 * stores is what the form renders.
 */

import { describe, expect, it } from 'vitest';

import {
  PRESALES_PREFERENCE_DEFAULTS,
  parsePresalesPreferences,
  readPresalesPreferences,
} from '@/lib/presales/preferences';

function form(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

describe('parsePresalesPreferences', () => {
  it('round-trips a complete submit', () => {
    const p = parsePresalesPreferences(
      form({
        pdfDisplayName: '  Ikmal B.  ',
        defaultWindowDays: '14',
        defaultAccent: '#c8102e',
        notifyOnSignoff: 'on',
      }),
    );
    expect(p).toEqual({
      pdfDisplayName: 'Ikmal B.',
      defaultWindowDays: 14,
      defaultAccent: '#C8102E',
      notifyOnSignoff: true,
      // Absent checkbox in a form POST means UNCHECKED, not "keep default".
      notifyOnOtpLockout: false,
    });
  });

  it('clamps the window and falls back on a malformed accent — never 400s', () => {
    const p = parsePresalesPreferences(
      form({ defaultWindowDays: '900', defaultAccent: 'blue-ish' }),
    );
    expect(p.defaultWindowDays).toBe(30);
    expect(p.defaultAccent).toBe(PRESALES_PREFERENCE_DEFAULTS.defaultAccent);
  });

  it('an empty submit is the defaults with both toggles off', () => {
    const p = parsePresalesPreferences(new FormData());
    expect(p.defaultWindowDays).toBe(7);
    expect(p.notifyOnSignoff).toBe(false);
    expect(p.notifyOnOtpLockout).toBe(false);
  });
});

describe('readPresalesPreferences', () => {
  it('NULL (never saved) renders the built-in defaults', () => {
    expect(readPresalesPreferences(null)).toEqual(PRESALES_PREFERENCE_DEFAULTS);
  });

  it('a malformed column value falls back rather than crashing the form', () => {
    expect(readPresalesPreferences('not-an-object')).toEqual(PRESALES_PREFERENCE_DEFAULTS);
    expect(readPresalesPreferences([1, 2])).toEqual(PRESALES_PREFERENCE_DEFAULTS);
    expect(readPresalesPreferences({ defaultWindowDays: 'NaN' }).defaultWindowDays).toBe(7);
  });

  it('what parse stored, read returns unchanged', () => {
    const stored = parsePresalesPreferences(
      form({ pdfDisplayName: 'X', defaultWindowDays: '3', defaultAccent: '#112233', notifyOnOtpLockout: 'on' }),
    );
    expect(readPresalesPreferences(JSON.parse(JSON.stringify(stored)))).toEqual(stored);
  });
});
