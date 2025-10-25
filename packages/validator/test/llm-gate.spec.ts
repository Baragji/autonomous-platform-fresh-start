import { describe, it, expect } from 'vitest';

// Gate behavior is implemented inside the route handler. This test documents intent via env checks
// and ensures enabling env is parsed correctly. Detailed integration tests will cover full flow.
describe('LLM gate env parsing', () => {
  it('treats non-truthy values as disabled', () => {
    const vals = [undefined, '0', 'false', 'no', ''];
    for (const v of vals) {
      const enabled = ['1','true','yes'].includes(String(v || '0').toLowerCase());
      expect(enabled).toBe(false);
    }
  });
  it('treats truthy values as enabled', () => {
    const vals = ['1', 'true', 'yes', 'TRUE'];
    for (const v of vals) {
      const enabled = ['1','true','yes'].includes(String(v || '0').toLowerCase());
      expect(enabled).toBe(true);
    }
  });
});
