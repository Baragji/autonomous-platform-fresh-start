declare module 'e2b' {
  export class Sandbox {
    constructor(opts?: { apiKey?: string });
    filesystem: {
      makeDir: (path: string, opts?: { recursive?: boolean }) => Promise<void>;
      write: (path: string, content: string | Uint8Array) => Promise<void>;
      read: (path: string) => Promise<string>;
    };
    process: {
      start: (opts: { cmd: string; args?: string[]; cwd?: string; env?: Record<string, string> }) => Promise<{
        wait: (opts?: { timeout?: number }) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
      }>;
    };
    close: () => Promise<void>;
  }
}
