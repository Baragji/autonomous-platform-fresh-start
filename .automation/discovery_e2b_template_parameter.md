# E2B Template Parameter Investigation
**Date:** 2025-10-31
**Status:** PARAMETER SPECIFICATION UNKNOWN

---

## What We Tried

Applied `template: 'node:lts'` parameter to both runner and validator:

```typescript
// runner/src/agent.ts:62
const sandboxObj = await (Sandbox as any).create({ apiKey, template: 'node:lts' });

// validator/src/server.ts:140
const sandbox: SandboxApi = new SandboxCtor({ apiKey, template: 'node:lts' });
```

**Result:** ❌ No change - npm install still shows help text
- Real E2B sandboxes still created (real IDs: i8s4w70fvcjta4pfhl0m5, izcad3fyq0pn02cgdukub, etc.)
- But they still don't have npm working

---

## Root Cause: E2B SDK v2.1.1 API Unknown

**Current Setup:**
- E2B SDK version: `@e2b/sdk@^2.1.1` (in packages/runner/package.json)
- Previous code: `Sandbox.create({ apiKey })`
- Attempted fix: `Sandbox.create({ apiKey, template: 'node:lts' })`
- Result: Parameter appears to be ignored or not recognized

**Options for Template Specification:**

| Option | Status | Evidence |
|--------|--------|----------|
| `template: 'node:lts'` | ❌ Doesn't work | No change in behavior |
| `templateId: 'node:lts'` | ⁇ Unknown | Not tested yet |
| `template: <ID_string>` | ⁇ Unknown | Need actual template ID from E2B |
| Environment variable | ⁇ Unknown | No E2B_TEMPLATE var found |
| Default template config | ⁇ Unknown | Might require E2B dashboard setup |

---

## Next Investigation Steps

### 1. Check E2B SDK v2.1.1 TypeScript Signatures
Need to find either:
- TypeScript definitions in node_modules/@e2b/sdk
- JSDoc comments in the SDK
- Examples in the SDK package

### 2. Determine Correct Parameter Name
The SDK might use:
- `templateId` instead of `template`
- Template UUID instead of "node:lts" string
- Different API altogether (static method vs instance)

### 3. Check E2B Environment Setup
E2B might require:
- Default template set in E2B console/dashboard
- Environment variable for default template ID
- API key linked to specific default template

### 4. Review E2B Documentation
- E2B SDK v2.1.1 changelog/docs
- Known template names/IDs
- API breaking changes between versions

---

## Evidence Preserved

- `discovery_e2b_template_issue.md` - Initial root cause analysis (template missing)
- `recovery_summary_2025-10-31.md` - Infrastructure working, npm issue identified
- Current file - Template parameter investigation results

---

## Key Insight

The problem is **NOT** that templates don't exist in E2B. The problem is we don't know:
1. How to specify a template in SDK v2.1.1
2. Whether "node:lts" is a valid template name
3. What the correct parameter name is

This is a **documentation/API gap**, not a platform issue.

---

## Recommended Approach

1. **Read E2B SDK source code** in node_modules to find Sandbox.create() signature
2. **Check for examples** in E2B docs or SDK README
3. **Test different parameter names** (templateId, template_id, etc.)
4. **Fall back to E2B console** if SDK doesn't support inline template specification

The sandbox creation itself IS working (real IDs returned), so the issue is purely about which template is being used, not about the SDK being broken.
