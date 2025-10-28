// Bridge CJS shared modules into ESM runner
import * as vfsMod from '@autonomous/shared/src/vfs';
import * as eventsMod from '@autonomous/shared/src/events';
import * as loggerMod from '@autonomous/shared/src/logger';
// otel interop can differ under ESM/CJS; use dynamic import to be resilient in ESM

export function createVfs(execId: string, opts?: { prefixSuffix?: string }) {
  return vfsMod.createVfs(execId, opts);
}
export function publish(execId: string, event: string, data: unknown) {
  return eventsMod.publish(execId, event, data);
}
export function createLogger(service: string) {
  return loggerMod.createLogger(service);
}
export function startOtel(service: string) {
  // Fire-and-forget; tracing is best-effort in runner
  import('@autonomous/shared/src/otel').then((m: Record<string, unknown>) => {
    const fn = (m as { startOtel?: (s: string) => unknown; default?: { startOtel?: (s: string) => unknown } }).startOtel
      || (m as { default?: { startOtel?: (s: string) => unknown } }).default?.startOtel;
    if (typeof fn === 'function') fn(service);
  }).catch(() => {});
}
