import type { Logger } from '@autonomous/shared/src/logger';
import { publish } from '@autonomous/shared/src/events';
import { createVfs, type Vfs, type VfsFileEntry } from '@autonomous/shared/src/vfs';
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

type SandboxProcessOutcome = { exitCode: number; stdout: string; stderr: string };
type SandboxProcess = { wait: (opts?: { timeout?: number }) => Promise<SandboxProcessOutcome> };
type SandboxApi = {
  filesystem: {
    makeDir: (path: string, opts?: { recursive?: boolean }) => Promise<void>;
    write: (path: string, content: string | Uint8Array) => Promise<void>;
    read: (path: string) => Promise<string>;
  };
  process: { start: (opts: { cmd: string; args?: string[]; cwd?: string; env?: Record<string, string> }) => Promise<SandboxProcess> };
  close?: () => Promise<void>;
};

type VitestTestCase = { name?: string; testFilePath?: string; status?: string; duration?: number; error?: { message?: string } };
type VitestJson = { numTotalTests?: number; numPassedTests?: number; duration?: number; testResults?: VitestTestCase[] };

export class RunnerAgent {
  constructor(private readonly logger: Logger) {}

  async run(input: RunRequest): Promise<RunResult> {
    const { execId } = input;
    await publish(execId, 'agent', { agent: 'runner', status: 'working' });

    const vfs: Vfs = await createVfs(execId);
    // Collect code files from MinIO (current code/ root)
    const files = await vfs.listFiles();
    const codeFiles = files.filter((f: VfsFileEntry) => f.path.startsWith('code/'));
    if (codeFiles.length === 0) {
      return { ok: false, error: 'no code files found for execId' };
    }

    // Start sandbox
  const { Sandbox }: typeof import('@e2b/sdk') = await import('@e2b/sdk');
  const sandbox: SandboxApi = new Sandbox({ apiKey: process.env.E2B_API_KEY });
    try {
      // Prepare a project directory
      const projectRoot = '/project';
      await sandbox.filesystem.makeDir(projectRoot);
      await sandbox.filesystem.makeDir(`${projectRoot}/src`);

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
      await sandbox.filesystem.write(`${projectRoot}/package.json`, JSON.stringify(pkg, null, 2));
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
      await sandbox.filesystem.write(`${projectRoot}/tsconfig.json`, JSON.stringify(tsconfig, null, 2));

      // Write code files (strip leading 'code/' prefix)
      for (const f of codeFiles) {
        const data = await vfs.readFile(f.path);
        const rel = f.path.replace(/^code\//, '');
        const dest = `${projectRoot}/src/${rel}`;
        const parent = dest.substring(0, dest.lastIndexOf('/'));
        if (parent) await sandbox.filesystem.makeDir(parent, { recursive: true });
        await sandbox.filesystem.write(dest, data.toString('utf8'));
      }

      // Install deps
      await this.exec(sandbox, projectRoot, 'npm', ['install', '--silent']);
      // Run tests and capture JSON reporter output
      const { stdout } = await this.exec(sandbox, projectRoot, 'npm', ['run', 'test', '--silent']);

      // Save raw JSON reporter to MinIO for audit
      const vitestJsonObject = `runner/vitest-results.json`;
      await vfs.writeFile(vitestJsonObject, stdout);

      // Convert to JUnit XML (simple adapter: one testsuite)
      const junitXml = this.vitestJsonToJUnit(stdout);
      const junitObject = `runner/junit.xml`;
      await vfs.writeFile(junitObject, junitXml, { contentType: 'application/xml' });

      // Read coverage summary from sandbox
      const coverageSummaryPath = `${projectRoot}/coverage/coverage-summary.json`;
      const coverageJson = await sandbox.filesystem.read(coverageSummaryPath).catch(() => null);
      if (!coverageJson) {
        return { ok: false, error: 'coverage summary not found' };
      }
      const coverageObject = `runner/coverage-summary.json`;
      await vfs.writeFile(coverageObject, coverageJson);

      await publish(execId, 'artifact', { type: 'runner_results', junit: junitObject, coverage: coverageObject });
      await publish(execId, 'agent', { agent: 'runner', status: 'completed' });
      return { ok: true, junitObject, coverageObject };
    } catch (err) {
      const e = err as Error;
      this.logger.error({ err: e.message }, 'runner failed');
      await publish(execId, 'agent', { agent: 'runner', status: 'failed', error: e.message });
      return { ok: false, error: e.message };
    } finally {
      try { await sandbox.close?.(); } catch {}
    }
  }

  private async exec(sandbox: SandboxApi, cwd: string, cmd: string, args: string[]): Promise<SandboxProcessOutcome> {
    const p: SandboxProcess = await sandbox.process.start({ cmd, args, cwd, env: {} });
    const outcome: SandboxProcessOutcome = await p.wait({ timeout: 1000 * 60 * 3 });
    if (outcome.exitCode !== 0) {
      const tail = (outcome.stdout || '') + '\n' + (outcome.stderr || '');
      throw new Error(`command failed: ${cmd} ${args.join(' ')}\n${tail}`);
    }
    return outcome;
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
