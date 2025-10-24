# Artifact Provenance (MinIO Metadata) Evidence

## VFS Interface (packages/vfs/src/interface.ts)

### Lines 1-4 (VfsWriteOptions)
```typescript
export type VfsWriteOptions = {
  contentType?: string;
  sha256?: string;
};
```

**Status**: ✓ Interface accepts sha256 parameter

## MinIO VFS Implementation (packages/vfs/src/minio.ts)

### Lines 166-175 (buildMetadata function)
```typescript
function buildMetadata(options?: VfsWriteOptions) {
  const meta: Record<string, string> = {};
  if (options?.contentType) {
    meta['Content-Type'] = options.contentType;
  }
  if (options?.sha256) {
    meta['x-amz-meta-sha256'] = options.sha256;
  }
  return meta;
}
```

**Key**: Uses exact key `x-amz-meta-sha256` (not custom variants)

### Lines 25-30 (writeFile method)
```typescript
async writeFile(relativePath: string, content: Buffer | string, options?: VfsWriteOptions): Promise<void> {
  const key = this.resolveCurrentPath(relativePath);
  await this.ensureVersionBackup(key, relativePath);
  const buf = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
  await this.client.putObject(this.bucket, key, buf, buf.length, buildMetadata(options));
}
```

**Status**: ✓ Writes metadata via buildMetadata(options) which includes x-amz-meta-sha256

## Validator Implementation (packages/validator/src/server.ts)

### Lines 136-142 (JUnit artifact with SHA256)
```typescript
const junitXml = vitestJsonToJUnit(vitestJson);
const junitBuf = Buffer.from(junitXml, 'utf8');
await vfs.writeFile(junitObject, junitBuf, { 
  contentType: 'application/xml',
  sha256: sha256(junitBuf)
});
```

### Lines 147-154 (Coverage artifact with SHA256)
```typescript
if (coverageJson) {
  coverageObject = `${prefix}/validator-coverage.json`;
  const coverageBuf = Buffer.from(coverageJson, 'utf8');
  await vfs.writeFile(coverageObject, coverageBuf, {
    contentType: 'application/json',
    sha256: sha256(coverageBuf)
  });
}
```

### Lines 215-220 (Validation report with SHA256)
```typescript
const reportBuf = Buffer.from(JSON.stringify(reportWithChecksums, null, 2));
checksums.report = sha256(reportBuf);
await vfs.writeFile(validationReportObject, reportBuf, { 
  contentType: 'application/json',
  sha256: checksums.report
});
```

### Lines 291-295 (sha256 helper)
```typescript
export function sha256(buf: Buffer | string): string {
  const h = crypto.createHash('sha256');
  h.update(typeof buf === 'string' ? Buffer.from(buf) : buf);
  return h.digest('hex');
}
```

**Status**: ✓ Validator computes sha256 and passes to VFS for all artifacts

## Verification

The artifact metadata uses the standard S3-compatible key `x-amz-meta-sha256`:
- VFS interface accepts `sha256?: string`
- MinIO VFS stores it as `x-amz-meta-sha256` (exact AWS S3 custom metadata convention)
- Validator computes sha256 for junit, coverage, and report artifacts
- All artifacts written by validator include provenance metadata

**Verdict**: ✓ PASS - All artifacts have x-amz-meta-sha256 metadata
