/*
  Compatibility helpers for runner using dynamic imports (works with ESM).
*/
import path from 'path';
import fs from 'fs';
const IS_TEST = !!process.env.VITEST_WORKER_ID;

function resolveRepoRoot(): string {
  const cwd = process.cwd();
  let dir = cwd;
  for (let i = 0; i < 8; i += 1) {
    if (fs.existsSync(path.join(dir, 'packages', 'shared'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return cwd;
}

const repoRoot = resolveRepoRoot();

async function loadSrc(modulePath: string) {
  return (await import(modulePath)) as any;
}

async function importShared(relBasename: string) {
  // Try layout A: packages/shared/dist/packages/shared/src/*.js
  const candA = path.join(repoRoot, 'packages/shared/dist/packages/shared/src', relBasename);
  try { return (await import(candA)); } catch {}
  // Fallback layout B: packages/shared/dist/src/*.js
  const candB = path.join(repoRoot, 'packages/shared/dist/src', relBasename);
  try { return (await import(candB)); } catch {}
  // Last resort: try TS source (tsx runtime)
  const candSrc = path.join(repoRoot, 'packages/shared/src', relBasename.replace(/\.js$/, '.ts'));
  return (await import(candSrc));
}

export async function createVfs(execId: string, opts?: { prefixSuffix?: string }) {
  if (IS_TEST) {
    const m = await loadSrc('@autonomous/shared/src/vfs');
    return m.createVfs(execId, opts);
  }
  const m = await importShared('vfs.js');
  return (m as { createVfs: (id: string, o?: { prefixSuffix?: string }) => Promise<unknown> }).createVfs(execId, opts);
}

export async function publish(execId: string, event: string, data: unknown) {
  if (IS_TEST) {
    const m = await loadSrc('@autonomous/shared/src/events');
    return m.publish(execId, event, data);
  }
  const m = await importShared('events.js');
  return (m as { publish: (id: string, ev: string, d: unknown) => Promise<void> }).publish(execId, event, data);
}

export async function createLogger(service: string) {
  if (IS_TEST) {
    return { info: () => {}, error: () => {} } as { info: Function; error: Function };
  }
  const m = await importShared('logger.js');
  return (m as { createLogger: (s: string) => { info: Function; error: Function } }).createLogger(service);
}

export async function startOtel(service: string) {
  try {
    if (IS_TEST) return;
    const m = await importShared('otel.js');
    return (m as { startOtel: (s: string) => void }).startOtel(service);
  } catch {
    return;
  }
}
