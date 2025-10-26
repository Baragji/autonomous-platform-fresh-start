/*
  Runner runs under ESM (type: module) while @autonomous/shared compiles to CJS.
  Named ESM imports from CJS are not available at runtime, so we bridge via createRequire
  and load the compiled dist files. Keep this file minimal to satisfy both runtime and tsc.
*/
import { createRequire } from 'module';
import path from 'path';
const req = createRequire(process.cwd() + '/package.json');

function r(mod: string, fallback: string, alt?: string) {
  try { return req(mod); } catch {
    try { return req(fallback); } catch {
      if (alt) { return req(alt); }
      throw new Error(`Cannot load module ${mod} or fallback ${fallback}`);
    }
  }
}

const root = process.cwd();
const vfsMod = r('@autonomous/shared/dist/vfs.js', path.join(root, 'packages/shared/dist/vfs.js'), '@autonomous/shared/src/vfs');
const eventsMod = r('@autonomous/shared/dist/events.js', path.join(root, 'packages/shared/dist/events.js'), '@autonomous/shared/src/events');
const loggerMod = r('@autonomous/shared/dist/logger.js', path.join(root, 'packages/shared/dist/logger.js'), '@autonomous/shared/src/logger');
const otelMod = r('@autonomous/shared/dist/otel.js', path.join(root, 'packages/shared/dist/otel.js'), '@autonomous/shared/src/otel');

export const createVfs = vfsMod.createVfs as (execId: string, opts?: { prefixSuffix?: string }) => Promise<unknown>;
export const publish = eventsMod.publish as (execId: string, event: string, data: unknown) => Promise<void>;
export const createLogger = loggerMod.createLogger as (service: string) => { info: Function; error: Function };
export const startOtel = otelMod.startOtel as (service: string) => void;
