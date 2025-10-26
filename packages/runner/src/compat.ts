import { createRequire } from 'module';
const req = createRequire(import.meta.url);

// Import shared (CJS) modules safely in ESM runtime
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sharedVfs: any = req('@autonomous/shared/src/vfs');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sharedEvents: any = req('@autonomous/shared/src/events');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sharedLogger: any = req('@autonomous/shared/src/logger');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sharedOtel: any = req('@autonomous/shared/src/otel');

export const createVfs = sharedVfs.createVfs as (execId: string, opts?: { prefixSuffix?: string }) => Promise<unknown>;
export const publish = sharedEvents.publish as (execId: string, event: string, data: unknown) => Promise<void>;
export const createLogger = sharedLogger.createLogger as (service: string) => { info: Function; error: Function };
export const startOtel = sharedOtel.startOtel as (service: string) => void;

