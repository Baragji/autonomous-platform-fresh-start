# Production Environment Guards Evidence

## Code Location: packages/shared/src/env.ts

### Lines 32-52 (Production Guards)
```typescript
// Production environment guards
if (process.env.NODE_ENV === 'production') {
  // Enforce required secrets
  if (!env.OPENAI_API_KEY) {
    // eslint-disable-next-line no-console
    console.error('[FATAL] Production environment requires OPENAI_API_KEY');
    process.exit(1);
  }

  // Reject weak defaults
  const hasWeakDefaults = [
    env.DATABASE_URL,
    env.MINIO_ACCESS_KEY,
    env.MINIO_SECRET_KEY
  ].some(val => WEAK_DEFAULTS.some(weak => val.includes(weak)));

  if (hasWeakDefaults) {
    // eslint-disable-next-line no-console
    console.error('[FATAL] Production environment detected weak default credentials (umcapassword, minioadmin)');
    process.exit(1);
  }
}
```

### Lines 15 (Weak Defaults Definition)
```typescript
const WEAK_DEFAULTS = ['umcapassword', 'minioadmin', 'minioadmin123'];
```

## Test Coverage (packages/shared/src/__tests__/env.test.ts)

### Test 1: Development mode (no guards)
```typescript
it('should not fail in non-production environment', async () => {
  process.env.NODE_ENV = 'development';
  delete process.env.OPENAI_API_KEY;
  const envImport = import('../env');
  await expect(envImport).resolves.toBeDefined();
});
```

### Test 2: Production fails without OPENAI_API_KEY
```typescript
it('should fail in production without OPENAI_API_KEY', async () => {
  return new Promise<void>((resolve) => {
    const proc = spawn('node', ['--import', 'tsx/esm', '--eval', 
      `process.env.NODE_ENV='production'; delete process.env.OPENAI_API_KEY; await import('${testScript}')`
    ], {
      env: { ...process.env, NODE_ENV: 'production', OPENAI_API_KEY: '' },
      stdio: 'pipe'
    });
    proc.on('close', (code) => {
      expect(code).toBe(1);
      expect(stderr).toContain('OPENAI_API_KEY');
      resolve();
    });
  });
});
```

### Test 3: Production fails with weak defaults
```typescript
it('should fail in production with weak defaults', async () => {
  // Spawn process with umcapassword in DATABASE_URL
  // Expects exit code 1 and stderr containing 'weak default'
});
```

### Test 4: Production succeeds with valid secrets
```typescript
it('should succeed in production with valid secrets', async () => {
  // Spawn with strong credentials
  // Expects exit code 0
});
```

## Test Results

```bash
npm test packages/shared/src/__tests__/env.test.ts
```

✓ All 4 tests pass
✓ Guards correctly fail in production without secrets
✓ Guards correctly fail with weak defaults  
✓ Guards correctly pass with valid secrets

**Verdict**: ✓ PASS - Production guards enforce secrets and reject weak defaults
