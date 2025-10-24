import express, { type Request, type Response } from 'express';
import { z } from 'zod';
import OpenAI from 'openai';
import { startOtel } from '@autonomous/shared/src/otel';
import { createLogger } from '@autonomous/shared/src/logger';
import { getLangfuse } from '@autonomous/shared/src/langfuse';
import { publish } from '@autonomous/shared/src/events';
import { createVfs, type Vfs, type VfsFileEntry } from '@autonomous/shared/src/vfs';

startOtel('validator');
export const app = express();
app.use(express.json({ limit: '2mb' }));
const logger = createLogger('validator');

const ValidateRequestSchema = z.object({
  execId: z.string().min(1)
});

// Minimal secret patterns (extend as needed)
const secretRegexes: Array<{ name: string; re: RegExp }> = [
  { name: 'AWS Access Key', re: /AKIA[0-9A-Z]{16}/ },
  { name: 'AWS Secret Key', re: /(?i)aws(.{0,20})?(secret|access).{0,20}?[=:\s][A-Za-z0-9\/+=]{40}/ },
  { name: 'Generic Password', re: /(?i)password\s*[:=]\s*['\"][^'\"]+['\"]/ },
  { name: 'JWT', re: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/ }
];

// E2B sandbox API (subset)
type SandboxProcessOutcome = { exitCode: number; stdout: string; stderr: string };
type SandboxProcess = { wait: (opts?: { timeout?: number }) => Promise<SandboxProcessOutcome> };
type SandboxApi = {
  filesystem: {
    makeDir: (path: string, opts?: { recursive?: boolean }) => Promise<void>;
    write: (path: string, content: string | Uint8Array) => Promise<void>;
    read: (path: string) => Promise<string>;
    listDir?: (path: string) => Promise<{ path: string; isDir: boolean }[]>;
  };
  process: { start: (opts: { cmd: string; args?: string[]; cwd?: string; env?: Record<string, string> }) => Promise<SandboxProcess> };
  close?: () => Promise<void>;
};

const ValidationReportSchema = z.object({
  verdict: z.enum(['PASS', 'FAIL']),
  reasons: z.array(z.string()).optional(),
  issues: z.array(z.object({
    type: z.string(),
    severity: z.enum(['critical', 'high', 'medium', 'low']),
    description: z.string(),
    remediation: z.string().optional()
  })).optional(),
  coverage: z.object({ lines: z.number().nullable().optional() }).optional(),
  testsPassed: z.boolean().optional(),
  secretsFound: z.number().optional()
});

app.get('/healthz', (_req, res) => res.json({ ok: true }));

app.post('/validate', async (req: Request, res: Response) => {
  const parse = ValidateRequestSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'invalid request', details: parse.error.issues });
  const { execId } = parse.data;

  await publish(execId, 'agent', { agent: 'validator', status: 'working' });

  const vfs: Vfs = await createVfs(execId);
  const files = await vfs.listFiles();
  const codeFiles = files.filter((f: VfsFileEntry) => f.path.startsWith('code/'));
  if (codeFiles.length === 0) return res.status(400).json({ error: 'no code files found for execId' });

  // Prepare sandbox (same model as Runner)
  const apiKey = process.env.E2B_API_KEY;
  if (!apiKey) {
    logger.error('E2B_API_KEY is not set');
    return res.status(500).json({ error: 'E2B_API_KEY is not configured' });
  }

  const { Sandbox }: typeof import('@e2b/sdk') = await import('@e2b/sdk');
  const sandbox: SandboxApi = new Sandbox({ apiKey }) as unknown as SandboxApi;

  let junitObject: string | undefined;
  let coverageObject: string | undefined;
  let validationReportObject: string | undefined;

  try {
    const projectRoot = '/project';
    await sandbox.filesystem.makeDir(projectRoot);
    await sandbox.filesystem.makeDir(`${projectRoot}/src`);

    // Minimal package.json and tsconfig mirroring Runner expectations
    const pkg = {
      name: 'validator-project',
      version: '1.0.0',
      type: 'module',
      scripts: { test: 'vitest run --coverage --reporter=json' },
      devDependencies: {
        typescript: '^5.6.3',
        vitest: '^2.1.4',
        '@vitest/coverage-v8': '^2.1.4',
        tsx: '^4.19.0',
        '@types/node': '^22.7.4',
        '@types/express': '^4.17.21'
      },
      dependencies: { express: '^4.19.2' }
    };
    await sandbox.filesystem.write(`${projectRoot}/package.json`, JSON.stringify(pkg, null, 2));
    const tsconfig = {
      compilerOptions: {
        target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', esModuleInterop: true, strict: true, skipLibCheck: true,
        rootDir: './src', outDir: './dist'
      }, include: ['src']
    };
    await sandbox.filesystem.write(`${projectRoot}/tsconfig.json`, JSON.stringify(tsconfig, null, 2));

    // Write code files into sandbox
    for (const f of codeFiles) {
      const data = await vfs.readFile(f.path);
      const rel = f.path.replace(/^code\//, '');
      const dest = `${projectRoot}/src/${rel}`;
      const parent = dest.substring(0, dest.lastIndexOf('/'));
      if (parent) await sandbox.filesystem.makeDir(parent, { recursive: true });
      await sandbox.filesystem.write(dest, data.toString('utf8'));
    }

    // Install and run tests
    await exec(sandbox, projectRoot, 'npm', ['install', '--silent']);
    const testOutcome = await exec(sandbox, projectRoot, 'npm', ['run', 'test', '--silent']);

    // Save vitest JSON as validator artifact and convert to JUnit
    const vitestJson = testOutcome.stdout;
    junitObject = `validator/validator-junit.xml`;
    await vfs.writeFile(junitObject, vitestJsonToJUnit(vitestJson), { contentType: 'application/xml' });

    // Coverage summary
    const coverageSummaryPath = `${projectRoot}/coverage/coverage-summary.json`;
    const coverageJson = await sandbox.filesystem.read(coverageSummaryPath).catch(() => null);
    if (coverageJson) {
      coverageObject = `validator/validator-coverage.json`;
      await vfs.writeFile(coverageObject, coverageJson);
    }

    // Secrets scan (simple regex across src/)
    const secretsCount = await scanForSecrets(sandbox, `${projectRoot}/src`);

    // Determine coverage percent if present
    let linesPct: number | null = null;
    try { const parsed = JSON.parse(String(coverageJson || '{}')); linesPct = parsed.total?.lines?.pct ?? null; } catch {}

    const testsPassed = parseVitestPassed(vitestJson);
    const coveragePassed = linesPct == null ? false : linesPct >= 80;

    let report = {
      verdict: testsPassed && coveragePassed && secretsCount === 0 ? 'PASS' : 'FAIL',
      reasons: buildReasons(testsPassed, coveragePassed, secretsCount),
      issues: buildIssues(secretsCount),
      coverage: { lines: linesPct ?? null },
      testsPassed,
      secretsFound: secretsCount
    } as z.infer<typeof ValidationReportSchema>;

    // LLM judge only if FAIL
    if (report.verdict === 'FAIL') {
      try {
        const lf = getLangfuse();
        const trace = lf?.trace?.({ name: 'validator.judge', metadata: { execId } });
        const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const response = await client.chat.completions.create({
          model: process.env.OPENAI_MODEL || 'gpt-4o-2024-08-06',
          messages: [
            { role: 'system', content: 'You are a zero-trust validator. Analyze failures and propose specific remediations. Keep responses concise and actionable.' },
            { role: 'user', content: JSON.stringify({ testsPassed, coverage: linesPct, secretsFound: secretsCount }) }
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'Validation',
              schema: ValidationReportSchema,
              strict: true
            }
          }
        });
        const content = response.choices?.[0]?.message?.content || '';
        const parsed = ValidationReportSchema.safeParse(JSON.parse(content || '{}'));
        if (parsed.success) report = parsed.data;
        trace?.generation?.({ model: String((response as any)?.model || 'openai'), input: {}, output: report, usage: (response as any)?.usage });
        try { await (lf as any)?.flush?.(); } catch {}
      } catch (err) {
        logger.warn({ err: (err as Error).message }, 'LLM judge failed; keeping automated report');
      }
    }

    // Store validation report
    validationReportObject = `validator/validation-report.json`;
    await vfs.writeFile(validationReportObject, JSON.stringify(report, null, 2), { contentType: 'application/json' });

    await publish(execId, 'artifact', { type: 'validation', report: validationReportObject, junit: junitObject, coverage: coverageObject });
    await publish(execId, 'status', { status: report.verdict === 'PASS' ? 'validated' : 'needs_remediation' });

    return res.json({ ok: true, verdict: report.verdict, report: validationReportObject, junitObject, coverageObject });
  } catch (err) {
    const e = err as Error;
    logger.error({ err: e.message }, 'validator failed');
    await publish(execId, 'agent', { agent: 'validator', status: 'failed', error: e.message });
    return res.status(500).json({ error: e.message });
  } finally {
    try { await sandbox.close?.(); } catch {}
  }
});

function buildReasons(testsPassed: boolean, coveragePassed: boolean, secretsCount: number): string[] {
  const reasons: string[] = [];
  if (!testsPassed) reasons.push('Tests failed');
  if (!coveragePassed) reasons.push('Coverage below 80%');
  if (secretsCount > 0) reasons.push(`Secrets detected (${secretsCount})`);
  if (reasons.length === 0) reasons.push('All automated checks passed');
  return reasons;
}

function buildIssues(secretsCount: number) {
  const issues: Array<{ type: string; severity: 'critical'|'high'|'medium'|'low'; description: string; remediation?: string }> = [];
  if (secretsCount > 0) {
    issues.push({ type: 'secrets', severity: 'high', description: 'Hardcoded secrets detected', remediation: 'Remove secrets from source; use environment variables and secret manager.' });
  }
  return issues;
}

async function scanForSecrets(sandbox: SandboxApi, root: string): Promise<number> {
  // If listDir not available, do simple heuristic: scan the files we wrote (src tree) by reading them back is non-trivial without listing.
  // For now, rely on patterns likely present in code files written. This can be extended when Sandbox supports listing.
  let count = 0;
  // Try some common paths
  const guesses = ['index.ts', 'app.ts', 'main.ts'];
  for (const g of guesses) {
    try {
      const content = await sandbox.filesystem.read(`${root}/${g}`);
      for (const { re } of secretRegexes) {
        if (re.test(content)) count += 1;
      }
    } catch {}
  }
  return count;
}

function parseVitestPassed(stdout: string): boolean {
  try {
    const j = JSON.parse(stdout);
    const passed = typeof j.numPassedTests === 'number' ? j.numPassedTests : 0;
    const total = typeof j.numTotalTests === 'number' ? j.numTotalTests : 0;
    return total > 0 && passed === total;
  } catch {
    return false;
  }
}

async function exec(sandbox: SandboxApi, cwd: string, cmd: string, args: string[]): Promise<SandboxProcessOutcome> {
  const p: SandboxProcess = await sandbox.process.start({ cmd, args, cwd, env: {} });
  const outcome: SandboxProcessOutcome = await p.wait({ timeout: 1000 * 60 * 3 });
  if (outcome.exitCode !== 0) {
    const tail = (outcome.stdout || '') + '\n' + (outcome.stderr || '');
    throw new Error(`command failed: ${cmd} ${args.join(' ')}\n${tail}`);
  }
  return outcome;
}

function vitestJsonToJUnit(stdout: string): string {
  let results: any = {};
  try { results = JSON.parse(stdout); } catch { results = {}; }
  const cases = Array.isArray(results.testResults) ? results.testResults : [];
  const total = results.numTotalTests ?? cases.length ?? 0;
  const passed = results.numPassedTests ?? cases.filter((c: any) => c.status === 'pass').length;
  const failed = Math.max(0, total - passed);
  const time = (results.duration ?? 0) / 1000;
  const esc = (s: string) => String(s).replace(/[&<>"]+/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  const testcases = cases.map((c: any) => {
    const name = esc(c.name || c.testFilePath || 'test');
    if (c.status === 'pass') return `<testcase name="${name}" time="${(c.duration || 0) / 1000}"></testcase>`;
    const msg = esc(c.error?.message || 'test failed');
    return `<testcase name="${name}" time="${(c.duration || 0) / 1000}"><failure message="${msg}"></failure></testcase>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="vitest" tests="${total}" failures="${failed}" time="${time}">${testcases}</testsuite>`;
}

const port = Number(process.env.VALIDATOR_PORT || 7050);
if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => process.stdout.write(`[validator] listening on :${port}\n`));
}
