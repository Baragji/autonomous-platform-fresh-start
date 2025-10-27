// Bridge CJS shared modules into ESM runner
import * as vfsMod from '@autonomous/shared/src/vfs';
import * as eventsMod from '@autonomous/shared/src/events';
import * as loggerMod from '@autonomous/shared/src/logger';
import * as otelMod from '@autonomous/shared/src/otel';

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
  return otelMod.startOtel(service);
}
