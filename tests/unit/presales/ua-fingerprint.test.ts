import { describe, expect, it } from 'vitest';
import { hashUserAgent, normalizeUserAgent } from '@/lib/presales/ua-fingerprint';

describe('normalizeUserAgent', () => {
  it('strips Chrome version', () => {
    const a = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.6700.123 Safari/537.36';
    const b = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.6800.55 Safari/537.36';
    expect(normalizeUserAgent(a)).toBe(normalizeUserAgent(b));
  });

  it('strips Firefox version', () => {
    const a = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 13.6; rv:120.0) Gecko/20100101 Firefox/120.0';
    const b = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 13.6; rv:120.0) Gecko/20100101 Firefox/121.5';
    expect(normalizeUserAgent(a)).toBe(normalizeUserAgent(b));
  });

  it('strips Safari + Version', () => {
    const a = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1';
    const b = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/605.0';
    expect(normalizeUserAgent(a)).toBe(normalizeUserAgent(b));
  });

  it('strips Edge', () => {
    const a = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.2210.91';
    const b = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.2210.91';
    expect(normalizeUserAgent(a)).toBe(normalizeUserAgent(b));
  });

  it('different devices with same browser do not collide', () => {
    const macChrome = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';
    const winChrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';
    expect(normalizeUserAgent(macChrome)).not.toBe(normalizeUserAgent(winChrome));
  });

  it('handles empty / missing UA deterministically', () => {
    expect(hashUserAgent('')).toBe(hashUserAgent(''));
    expect(hashUserAgent('')).not.toBe(hashUserAgent('Mozilla/5.0 Chrome/142'));
  });
});

describe('hashUserAgent', () => {
  it('returns a 64-char hex string', () => {
    const h = hashUserAgent('Mozilla/5.0 Chrome/142.0.0.0');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is stable across version bumps', () => {
    const a = hashUserAgent('Mozilla/5.0 Chrome/142.0.0.0');
    const b = hashUserAgent('Mozilla/5.0 Chrome/199.5.123.456');
    expect(a).toBe(b);
  });
});
