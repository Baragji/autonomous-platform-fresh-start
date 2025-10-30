import { describe, expect, it } from 'vitest';
import { isInside, normalizeSafe } from '../pathSafe';
import path from 'node:path';

describe('pathSafe', () => {
  it('normalizes simple paths', () => {
    expect(normalizeSafe('foo/bar.txt')).toBe('foo/bar.txt');
    expect(normalizeSafe('foo/./bar')).toBe('foo/bar');
  });

  it('rejects traversal', () => {
    expect(normalizeSafe('../secret')).toBeNull();
    expect(normalizeSafe('..')).toBeNull();
    expect(normalizeSafe('a/../../b')).toBeNull();
  });

  it('isInside enforces containment', () => {
    const root = path.resolve('/tmp', 'evidence');
    const inside = path.resolve(root, 'a/b.txt');
    const outside = path.resolve('/tmp', 'other', 'x');
    expect(isInside(root, inside)).toBe(true);
    expect(isInside(root, outside)).toBe(false);
  });
});