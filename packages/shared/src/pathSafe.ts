// Utilities for safe path handling in POSIX-style semantics
// These helpers are pure and can be unit-tested.

import path from 'node:path';

/** Normalize an input path string to POSIX form and reject obvious traversal tokens. */
export function normalizeSafe(input: string): string | null {
  const s = String(input ?? '').replaceAll('\\', '/');
  const normalized = path.posix.normalize(s);
  // Reject traversal attempts
  if (normalized.includes('..')) return null;
  // Trim leading './'
  return normalized.startsWith('./') ? normalized.slice(2) : normalized;
}

/** Ensure target (already resolved) stays under root. */
export function isInside(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}