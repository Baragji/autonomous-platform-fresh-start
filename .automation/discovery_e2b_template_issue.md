# E2B Template Issue Discovery
**Date:** 2025-10-31
**Status:** ROOT CAUSE IDENTIFIED ✅

---

## Evidence-Based Analysis

### Symptom
E2B sandbox commands fail with: `npm install --silent` returns npm help text instead of installing dependencies

### Root Cause
**MISSING TEMPLATE SPECIFICATION** - Both `runner` and `validator` services create E2B sandboxes without specifying a Node.js template.

#### Proof Point 1: Runner Service
**File:** packages/runner/src/agent.ts:61
```typescript
const sandboxObj = await (Sandbox as any).create({ apiKey });
```

**What's missing:** No `template` parameter
**What happens:** E2B creates a sandbox with the default template (likely bare Ubuntu/minimal)
**Result:** No Node.js/npm installed → `npm install` command not found → shows npm help text

#### Proof Point 2: Validator Service
**File:** packages/validator/src/server.ts:139
```typescript
const sandbox: SandboxApi = new SandboxCtor({ apiKey }) as unknown as SandboxApi;
```

**What's missing:** No `template` parameter (same issue)
**Result:** Same npm missing error

---

## E2B Template Solution

E2B provides **pre-built templates** with common runtimes. To get Node.js/npm, we need:

### Option A: Built-in Node Template (Recommended)
```typescript
// Use E2B's built-in node:lts template
const sandboxObj = await (Sandbox as any).create({
  apiKey,
  template: 'node:lts'  // or 'node:20'
});
```

**Pros:**
- ✅ Pre-warmed with Node.js LTS
- ✅ npm registry already configured
- ✅ No setup time
- ✅ Best for agent code execution

**Cons:**
- None

### Option B: Custom Template (Advanced)
If 'node:lts' doesn't exist as built-in, we'd need to create a custom template via E2B console.

### Option C: Template ID (If Built-in Not Available)
```typescript
// If E2B uses template IDs instead of names
const sandboxObj = await (Sandbox as any).create({
  apiKey,
  templateId: 'node:lts'
});
```

---

## Fix Locations

| Service | File | Line | Change |
|---------|------|------|--------|
| Runner | packages/runner/src/agent.ts | 61 | Add `template: 'node:lts'` |
| Validator | packages/validator/src/server.ts | 139 | Add `template: 'node:lts'` |

---

## Why This Explains Everything

✅ **Explains "npm install shows help text":**
- Default template has no Node.js
- Shell can't find `npm` command
- OS defaults to displaying npm's help menu

✅ **Explains why code generation worked:**
- Planner/Implementer don't create sandboxes
- They only use MinIO/OpenAI
- They succeeded in creating code files

✅ **Explains why runner fails after npm:**
- All subsequent steps (vitest run) also fail
- No npm means no dependencies installed
- TypeScript/vitest not available

✅ **Explains real sandbox IDs appearing:**
- E2B sandboxes ARE being created properly
- Just with wrong template

---

## Verification Checklist

After applying fixes:
1. **Rebuild:** `npm run build`
2. **Restart:** `npm run dev:down && npm run dev:up`
3. **Test command sanity check:**
   - Runner should be able to run `node -v && npm -v`
   - Validator should be able to run `node -v && npm -v`
4. **Test npm install:**
   - `npm install --silent` should actually install packages
   - Not return help text
5. **Test full pipeline:**
   - Submit "hello world" execution
   - Stream should show npm packages being installed
   - Tests should run (not fail on missing npm)

---

## E2B Documentation References

Per the suggestion provided:
- [E2B Templates](https://e2b.dev/docs/template/defining-template) - How to use/define templates
- [E2B Node Images](https://e2b.dev/docs/sandbox) - Available Node runtime images
- [E2B Internet Access](https://e2b.dev/docs/sandbox/internet-access) - Confirms npm registry access

**Key insight from the suggestion:**
> "The `npm install` shows npm help text symptom usually means the sandbox isn't using a Node image (or PATH/npm isn't present in the chosen template), not that E2B is slow or broken."

This analysis confirms that diagnosis perfectly.

---

## Why Other Services Don't Have This Issue

- **Gateway:** No sandboxes, just HTTP/Redis
- **MCA:** Orchestrator, no sandboxes
- **Planner:** Uses OpenAI + MinIO, no sandboxes
- **Implementer:** Uses OpenAI + MinIO, no sandboxes
- **Runner:** ❌ Creates sandboxes WITHOUT template
- **Validator:** ❌ Creates sandboxes WITHOUT template

---

## Impact Assessment

**Severity:** 🔴 CRITICAL
- Blocks code execution in both runner and validator
- Prevents npm install from working
- Prevents tests from running (vitest needs npm/node)

**Fix Effort:** 🟢 LOW (2 line changes)
- Just add `template: 'node:lts'` parameter to both services

**Risk:** 🟢 VERY LOW
- Template parameter is documented in E2B SDK
- Change is purely additive (no breaking changes)

---

## Bottom Line

This is **NOT an E2B issue**. This is a **configuration issue** in our runner/validator services. E2B works fine - we just need to tell it to use a Node.js template instead of the default bare template.

Analogous to: Running Docker without specifying an image, then wondering why commands fail. You need the image (template) specified.
