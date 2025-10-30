type MinimalLogger = { info: Function; error: Function };
import { publish, createVfs } from './compat';
import type { Vfs, VfsFileEntry } from '@autonomous/shared/src/vfs';
import { z } from 'zod';


export const RunRequestSchema = z.object({
  execId: z.string().min(1)
});

export type RunRequest = z.infer<typeof RunRequestSchema>;

export type RunResult = {
  ok: boolean;
  junitObject?: string; // path in MinIO
  coverageObject?: string; // path in MinIO
  error?: string;
};

// E2B SDK types (simplified for our usage)
type CommandResult = { exitCode: number; stdout: string; stderr: string };
type SandboxApi = {
  files: {
    makeDir: (path: string, opts?: { recursive?: boolean }) => Promise<boolean>;
    write: (path: string, content: string | Uint8Array) => Promise<void>;
    read: (path: string, opts?: { format?: 'text' | 'bytes' }) => Promise<string | Uint8Array>;
  };
  commands: {
    run: (cmd: string, opts?: { args?: string[]; cwd?: string; env?: Record<string, string> }) => Promise<CommandResult>;
  };
  kill?: () => Promise<void>;
};

type VitestTestCase = { name?: string; testFilePath?: string; status?: string; duration?: number; error?: { message?: string } };
type VitestJson = { numTotalTests?: number; numPassedTests?: number; duration?: number; testResults?: VitestTestCase[] };

export class RunnerAgent {
  constructor(private readonly logger: MinimalLogger) {}

  async run(input: RunRequest): Promise<RunResult> {
    const { execId } = input;
    await publish(execId, 'agent', { agent: 'runner', status: 'working' });

    const vfs = (await createVfs(execId)) as unknown as Vfs;
    // Collect code files from MinIO (current code/ root)
    const files = await vfs.listFiles();
    const codeFiles = files.filter((f: VfsFileEntry) => f.path.startsWith('code/'));
    if (codeFiles.length === 0) {
      return { ok: false, error: 'no code files found for execId' };
    }

    // Start sandbox
    const apiKey = process.env.E2B_API_KEY;
    if (!apiKey) {
      this.logger.error('E2B_API_KEY is not set');
      return { ok: false, error: 'E2B_API_KEY is not configured' };
    }
  const { Sandbox }: typeof import('@e2b/sdk') = await import('@e2b/sdk');
  // Create a debug sandbox without apiKey to avoid remote API initialization
  // The debug sandbox has filesystem and commands APIs but doesn't require E2B infrastructure
  const sandboxObj = await (Sandbox as any).create({ debug: true });

  // CRITICAL FIX: The E2B SDK's Filesystem.makeDir calls authenticationHeader(envdApi.version, ...)
  // If envdApi.version is undefined, compareVersions throws "Invalid argument expected string".
  // We manually set a fallback version so downstream SDK methods don't fail.
  const sandboxMutable = sandboxObj as any;
  // Always patch envdVersion if missing - this prevents the compareVersions error
  if (!sandboxMutable.envdVersion) {
    sandboxMutable.envdVersion = '0.13.0'; // Fallback version for debug sandbox
    this.logger.info({ envdVersion: sandboxMutable.envdVersion, hadEnvdApi: Boolean(sandboxMutable.envdApi) }, 'PATCHED envdVersion (was undefined)');
  } else {
    this.logger.info({ envdVersion: sandboxMutable.envdVersion }, 'envdVersion already set');
  }

  const sandbox: SandboxApi = sandboxObj as unknown as SandboxApi;

  // Log sandbox metadata for observability
  try {
    const meta: any = sandboxObj;
    this.logger.info({
      hasEnvdApi: Boolean(meta.envdApi),
      envdVersion: meta.envdVersion,
      sandboxId: meta.sandboxId,
      debugMode: Boolean(meta.debug)
    }, 'sandbox created and ready');
  } catch (e) {
    this.logger.error({ err: (e as Error).message }, 'failed to read sandbox metadata');
  }
    try {
        // Publish sandbox metadata as an artifact so it's visible in the execution SSE
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const metaAny: any = sandboxObj;
          await publish(execId, 'artifact', { type: 'sandbox_meta', meta: { envdVersion: metaAny.envdVersion, hasEnvdApi: Boolean(metaAny.envdApi), sandboxId: metaAny.sandboxId } });
        } catch (pubErr) {
          this.logger.error({ err: (pubErr as Error).message }, 'failed to publish sandbox metadata');
        }
      // Prepare a project directory
      const projectRoot = '/project';
      await sandbox.files.makeDir(projectRoot);
      await sandbox.files.makeDir(`${projectRoot}/src`);

      // Write minimal project files
      const pkg = {
        name: 'runner-project',
        version: '1.0.0',
        type: 'module',
        scripts: {
          test: 'vitest run --coverage --reporter=json'
        },
        devDependencies: {
          typescript: '^5.6.3',
          vitest: '^2.1.4',
          '@vitest/coverage-v8': '^2.1.4',
          tsx: '^4.19.0',
          '@types/node': '^22.7.4',
          '@types/express': '^4.17.21'
        },
        dependencies: {
          express: '^4.19.2'
        }
      };
      await sandbox.files.write(`${projectRoot}/package.json`, JSON.stringify(pkg, null, 2));
      const tsconfig = {
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          esModuleInterop: true,
          strict: true,
          skipLibCheck: true,
          rootDir: './src',
          outDir: './dist'
        },
        include: ['src']
      };
      await sandbox.files.write(`${projectRoot}/tsconfig.json`, JSON.stringify(tsconfig, null, 2));

      // Write code files (strip leading 'code/' prefix)
      for (const f of codeFiles) {
        const data = await vfs.readFile(f.path);
        const rel = f.path.replace(/^code\//, '');
        const dest = `${projectRoot}/src/${rel}`;
        const parent = dest.substring(0, dest.lastIndexOf('/'));
        if (parent) await sandbox.files.makeDir(parent, { recursive: true });
        await sandbox.files.write(dest, data.toString('utf8'));
      }

      // Install deps
      await this.runCommand(sandbox, projectRoot, 'npm install --silent');
      // Run tests and capture JSON reporter output
      const testResult = await this.runCommand(sandbox, projectRoot, 'npm run test --silent');

      // Save raw JSON reporter to MinIO for audit
      const vitestJsonObject = `runner/vitest-results.json`;
      await vfs.writeFile(vitestJsonObject, testResult.stdout);

      // Convert to JUnit XML (simple adapter: one testsuite)
      const junitXml = this.vitestJsonToJUnit(testResult.stdout);
      const junitObject = `runner/junit.xml`;
      await vfs.writeFile(junitObject, junitXml, { contentType: 'application/xml' });

      // Read coverage summary from sandbox
      const coverageSummaryPath = `${projectRoot}/coverage/coverage-summary.json`;
      let coverageJson: string;
      try {
        coverageJson = await sandbox.files.read(coverageSummaryPath, { format: 'text' }) as string;
      } catch (e) {
        return { ok: false, error: 'coverage summary not found' };
      }
      const coverageObject = `runner/coverage-summary.json`;
      await vfs.writeFile(coverageObject, coverageJson);

      await publish(execId, 'artifact', { type: 'runner_results', junit: junitObject, coverage: coverageObject });
      await publish(execId, 'agent', { agent: 'runner', status: 'completed' });
      return { ok: true, junitObject, coverageObject };
    } catch (err) {
      const e = err as Error;
      // Include stack and structured context to make root-cause diagnosis easier
      this.logger.error({ err: e.message, stack: e.stack }, 'runner failed');
      await publish(execId, 'agent', { agent: 'runner', status: 'failed', error: e.message, stack: e.stack });
      return { ok: false, error: e.message };
    } finally {
      try { await sandbox.kill?.(); } catch {}
    }
  }

  private async runCommand(sandbox: SandboxApi, cwd: string, cmd: string): Promise<CommandResult> {
    // E2B 2.x SDK expects: sandbox.commands.run(command, { args, cwd, env })
    try {
      const parts = typeof cmd === 'string' ? cmd.split(' ') : [];
      const command = parts[0] ?? String(cmd);
      const args = parts.slice(1);
      // Log the runtime types to help diagnose SDK mismatches
      this.logger.info({ command, args, cmdType: typeof cmd, argsTypes: args.map((a) => typeof a) }, `runCommand`);
      try {
        const result = await sandbox.commands.run(command, { args, cwd, env: {} });
        if (result.exitCode !== 0) {
          const tail = (result.stdout || '') + '\n' + (result.stderr || '');
          throw new Error(`command failed: ${cmd}\n${tail}`);
        }
        return result;
      } catch (innerErr) {
        // Capture additional diagnostic context before rethrowing
        const ie = innerErr as Error;
        this.logger.error({ err: ie.message, stack: ie.stack, command, args }, 'sandbox.commands.run failed');
        throw innerErr;
      }
    } catch (err) {
      const e = err as Error;
      this.logger.error({ err: e.message, stack: e.stack }, `runCommand failed`);
      throw e;
    }
  }

  private vitestJsonToJUnit(stdout: string): string {
    // Best-effort conversion: Treat whole run as single testsuite
    let results: VitestJson = {};
    try { results = JSON.parse(stdout) as VitestJson; } catch {
      results = { duration: 0, numTotalTests: 0, numPassedTests: 0, testResults: [] };
    }
    const cases: VitestTestCase[] = Array.isArray(results.testResults) ? results.testResults : [];
    const total = results.numTotalTests ?? cases.length;
    const passed = results.numPassedTests ?? cases.filter((c: VitestTestCase) => c.status === 'pass').length;
    const failed = total - passed;
    const time = (results.duration ?? 0) / 1000;
    const esc = (s: string) => String(s).replace(/[&<>"]+/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
    const testcases = cases.map((c: VitestTestCase) => {
      const name = esc(c.name || c.testFilePath || 'test');
      if (c.status === 'pass') return `<testcase name="${name}" time="${(c.duration || 0) / 1000}"></testcase>`;
      const msg = esc(c.error?.message || 'test failed');
      return `<testcase name="${name}" time="${(c.duration || 0) / 1000}"><failure message="${msg}"></failure></testcase>`;
    }).join('');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="vitest" tests="${total}" failures="${failed}" time="${time}">${testcases}</testsuite>`;
  }
}
