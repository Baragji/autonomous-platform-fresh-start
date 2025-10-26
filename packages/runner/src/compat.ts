/*
  Compatibility helpers for runner to access '@autonomous/shared' from both tests (Vite/Vitest) and
  dev/prod runtime (Node ESM). In tests, prefer importing directly from src/ so spies work. In runtime,
  prefer the compiled CJS in dist/ via createRequire.
*/
import { createRequire } from 'module';
import path from 'path';
const req = createRequire(process.cwd() + '/package.json');
const root = process.cwd();
const IS_TEST = !!process.env.VITEST_WORKER_ID;

async function loadSrc(modulePath: string) {
  // Dynamic import lets Vitest's resolver handle TS path aliases
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (await import(modulePath)) as any;
}

function loadDist(modulePath: string, relPath: string) {
  try { return req(modulePath); } catch {
    return req(path.join(root, relPath));
  }
}

export async function createVfs(execId: string, opts?: { prefixSuffix?: string }) {
  if (IS_TEST) {
    const m = await loadSrc('@autonomous/shared/src/vfs');
    return m.createVfs(execId, opts);
  }
  const m = loadDist('@autonomous/shared/dist/vfs.js', 'packages/shared/dist/vfs.js');
  return (m as { createVfs: (id: string, o?: { prefixSuffix?: string }) => Promise<unknown> }).createVfs(execId, opts);
}

export async function publish(execId: string, event: string, data: unknown) {
  if (IS_TEST) {
    const m = await loadSrc('@autonomous/shared/src/events');
    return m.publish(execId, event, data);
  }
  const m = loadDist('@autonomous/shared/dist/events.js', 'packages/shared/dist/events.js');
  return (m as { publish: (id: string, ev: string, d: unknown) => Promise<void> }).publish(execId, event, data);
}

export function createLogger(service: string) {
  if (IS_TEST) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const m = req('@autonomous/shared/src/logger');
    return (m as { createLogger: (s: string) => { info: Function; error: Function } }).createLogger(service);
  }
  const m = loadDist('@autonomous/shared/dist/logger.js', 'packages/shared/dist/logger.js');
  return (m as { createLogger: (s: string) => { info: Function; error: Function } }).createLogger(service);
}

export function startOtel(service: string) {
  try {
    if (IS_TEST) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const m = req('@autonomous/shared/src/otel');
      return (m as { startOtel: (s: string) => void }).startOtel(service);
    }
    const m = loadDist('@autonomous/shared/dist/otel.js', 'packages/shared/dist/otel.js');
    return (m as { startOtel: (s: string) => void }).startOtel(service);
  } catch {
    // In tests, tolerates missing OTEL
    return;
  }
}
