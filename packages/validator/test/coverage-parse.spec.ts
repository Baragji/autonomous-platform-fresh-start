import { describe, it, expect } from 'vitest';

function parseLinesPct(json: string): number | null {
  try {
    const j = JSON.parse(json) as any;
    return j?.total?.lines?.pct ?? null;
  } catch {
    return null;
  }
}

describe('coverage parse', () => {
  it('extracts lines pct from valid summary', () => {
    const pct = parseLinesPct(JSON.stringify({ total: { lines: { pct: 87.5 } } }));
    expect(pct).toBe(87.5);
  });
  it('returns null on malformed json', () => {
    expect(parseLinesPct('{')).toBeNull();
  });
  it('returns null when missing fields', () => {
    expect(parseLinesPct(JSON.stringify({}))).toBeNull();
  });
});
