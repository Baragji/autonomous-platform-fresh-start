/*
  Compatibility helpers for runner to access '@autonomous/shared' from both tests (Vite/Vitest) and
  dev/prod runtime (Node ESM). In tests, prefer importing directly from src so spies work. In runtime,
  load the compiled CJS from shared/dist using absolute paths resolved from the repo root.
*/
import { createRequire } from 'module';
import path from 'path';
const IS_TEST = !!process.env.VITEST_WORKER_ID;

// Resolve monorepo root without relying on ESM import.meta (keeps TS typecheck happy under CJS)
function resolveRepoRoot(): string {
  const cwdCandidate = path.resolve(process.cwd(), '..', '..');
  try {
    // if 'packages/shared' exists from this candidate, accept it
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs') as typeof import('fs');
    if (fs.existsSync(path.join(cwdCandidate, 'packages', 'shared'))) return cwdCandidate;
  } catch {}
  // fallback to path relative to this compiled file location (CommonJS __dirname)
  // __dirname is defined when compiled to CJS (our tsconfig)
  // @ts-ignore - __dirname exists at runtime in CJS output
  const here = typeof __dirname === 'string' ? __dirname : process.cwd();
  return path.resolve(here, '../../..');
}
const repoRoot = resolveRepoRoot();

// create a require() scoped to the repo root
const req = createRequire(path.join(repoRoot, 'package.json'));

async function loadSrc(modulePath: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (await import(modulePath)) as any;
}

function requireShared(relBasename: string) {
  // Try layout A: packages/shared/dist/packages/shared/src/*.js
  const candA = path.join(repoRoot, 'packages/shared/dist/packages/shared/src', relBasename);
  try { return req(candA); } catch {}
  // Fallback layout B: packages/shared/dist/src/*.js
  const candB = path.join(repoRoot, 'packages/shared/dist/src', relBasename);
  return req(candB);
}

export async function createVfs(execId: string, opts?: { prefixSuffix?: string }) {
  if (IS_TEST) {
    const m = await loadSrc('@autonomous/shared/src/vfs');
    return m.createVfs(execId, opts);
  }
  const m = requireShared('vfs.js');
  return (m as { createVfs: (id: string, o?: { prefixSuffix?: string }) => Promise<unknown> }).createVfs(execId, opts);
}

export async function publish(execId: string, event: string, data: unknown) {
  if (IS_TEST) {
    const m = await loadSrc('@autonomous/shared/src/events');
    return m.publish(execId, event, data);
  }
  const m = requireShared('events.js');
  return (m as { publish: (id: string, ev: string, d: unknown) => Promise<void> }).publish(execId, event, data);
}

export function createLogger(service: string) {
  if (IS_TEST) {
    return { info: () => {}, error: () => {} } as { info: Function; error: Function };
  }
  const m = requireShared('logger.js');
  return (m as { createLogger: (s: string) => { info: Function; error: Function } }).createLogger(service);
}

export function startOtel(service: string) {
  try {
    if (IS_TEST) return;
    const m = requireShared('otel.js');
    return (m as { startOtel: (s: string) => void }).startOtel(service);
  } catch {
    return;
  }
}
