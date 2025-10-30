# Known Issues Summary - Autonomous Platform

## Overview
During the investigation phase, the following categories of issues were identified. Your assistant should use AUDIT_INSTRUCTIONS.md to conduct a comprehensive audit and generate a complete findings report.

---

## Issues Identified So Far

### 1. MCA Service - Plan State Preservation (FIXED)
**Status:** Fixed but not committed
**File:** `packages/mca/src/server.ts` line 146
**Issue:** Plan channel reducer was not preserving plan state across graph nodes
**Current Code:**
```typescript
plan: { value: (_prev: Plan | undefined, curr: Plan | undefined) => curr as Plan }
```
**Problem:** When a node returns state without explicitly setting plan, curr becomes undefined
**Fix Applied:**
```typescript
plan: { value: (prev: Plan | undefined, curr: Plan | undefined) => curr ?? prev }
```
**Severity:** CRITICAL - Causes "plan missing from state" errors in Implementer node

---

### 2. Implementer Service - Error Handling (PARTIALLY FIXED)
**Status:** Fix applied but not committed
**File:** `packages/implementer/src/agent.ts` lines 82-142
**Issue:** OpenAI API errors from handleToolCalls() are not caught, escape to server handler
**Current Error:** `"400 Invalid parameter: messages with role 'tool' must be a response to a preceeding message with 'tool_calls'."`
**Root Cause:** Try-catch only wraps the OpenAI API call, not the entire iteration including handleToolCalls()
**Fix Applied:** Moved try-catch to wrap entire iteration loop
**Severity:** CRITICAL - Causes implementer to fail instead of gracefully handing off partial code

---

### 3. Runner Service - E2B SDK API Mismatch (FIXED)
**Status:** Committed (commit d7b092f)
**File:** `packages/runner/src/agent.ts` lines 150-157
**Issue:** E2B 2.x SDK requires separate command + args, not concatenated string
**Current Code:**
```typescript
const result = await sandbox.commands.run(cmd, { cwd, env: {} });
// where cmd is "npm install --silent" as a single string
```
**Fix Applied:** Split command into command name and args array
**Severity:** CRITICAL - Causes "Invalid argument expected string" errors

---

### 4. Planner Service - Silent Fallback on OpenAI Failure
**Status:** Not fixed
**File:** `packages/planner/src/server.ts` lines 37-91
**Issue:** When OpenAI API fails, falls back silently to generic 2-task plan unrelated to user intent
**Problem:**
- No logging when fallback is triggered
- Generic plan for backend scaffold doesn't match simple intents like "create hello_world app"
- Implementer receives mismatched plan and fails
- MCA shows failure at planner node due to downstream error
**Severity:** CRITICAL - Causes all executions to fail with mismatched plans
**Remediation Steps:**
1. Add explicit logging when fallback plan is used
2. Consider improving fallback plan or requiring real OpenAI response
3. Add intent validation to catch obviously generic plans

---

### 5. Implementer Service - Tool Message Validation Issue
**Status:** Unfixed - Requires investigation
**Observed Error:** `"400 Invalid parameter: messages with role 'tool' must be a response to a preceeding message with 'tool_calls'."`
**Problem:** The message history being sent to OpenAI violates their API contract:
- Tool results (role='tool') must follow assistant messages with tool_calls
- Current code may be adding tool results without proper assistant message preceding them
**File:** `packages/implementer/src/agent.ts` method `handleToolCalls()`
**Severity:** CRITICAL - Prevents any implementer tool execution
**Investigation Needed:**
1. Check `handleToolCalls()` implementation
2. Verify message ordering matches OpenAI API contract
3. Check if tool results are added correctly
4. Review message history construction logic

---

### 6. TypeScript Type Definition Issues
**Status:** Partial fixes applied, not committed
**File:** `packages/runner/src/agent.ts` line 29
**Issue:** SandboxApi type missing `args` field required by E2B 2.x
**Fix Applied:** Added `args?: string[]` to type definition
**Severity:** MAJOR - Causes TypeScript compilation errors

---

### 7. Missing Error Context Logging
**Status:** Not fixed
**Affected Files:** Multiple services
**Issues:**
- Error messages don't include execution context (execId, request ID)
- Stack traces often omitted from logs
- Silent catch blocks without logging
**Examples:**
- `packages/planner/src/server.ts`: OpenAI failures caught silently (line 78)
- `packages/implementer/src/server.ts`: Catch block at line 60 has minimal logging
**Severity:** MAJOR - Makes debugging production issues extremely difficult

---

### 8. API Contract Inconsistencies
**Status:** Multiple unfixed
**Issues:**

A. **MCA Graph State Machine** (packages/mca/src/server.ts)
   - Planner node returns: `{ ...state, status: 'planned', plan, current_agent: 'planner' }`
   - Implementer expects plan in state but it wasn't persisting
   - Fix: Channel reducer needs to preserve state across nodes

B. **Implementer Response Contract** (packages/implementer/src/server.ts)
   - Must return: `{ ok: boolean, files?: string[], summary?: string, error?: string }`
   - On error, returns `{ ok: true, files: [...] }` with no error field
   - Inconsistent with error response format

C. **Runner Response Contract** (packages/runner/src/agent.ts)
   - Expected format not clearly defined
   - May return partial results or incomplete test data

**Severity:** MAJOR - Causes downstream node failures due to missing or unexpected fields

---

### 9. Environment Variable & Configuration Issues
**Status:** Multiple unfixed
**Issues:**

A. **Hardcoded Defaults Without Validation:**
   - `packages/planner/src/server.ts` line 29: `PLANNER_PROMPT_PATH` defaults to relative path
   - If file doesn't exist, falls back to 2-sentence prompt

B. **Missing Configuration Validation:**
   - No verification that required env vars are set correctly
   - No type checking on configuration values
   - Fallback values may not be appropriate for production

**Severity:** MAJOR - Can silently degrade functionality in production

---

### 10. Promise/Async Handling Issues
**Status:** Multiple unfixed
**Issues Found:**

A. **Fire-and-forget promises:**
   - `packages/gateway/src/server.ts` line 23-25: MCA call not awaited
   ```typescript
   fetch(...).catch(() => {});  // Silently dropped error
   ```

B. **Missing error context in async operations:**
   - `packages/implementer/src/server.ts` line 32-35: Promise.all without individual error handling
   ```typescript
   const [vfs, langfuse] = await Promise.all([...]);  // No error context
   ```

**Severity:** MAJOR - Errors in background operations are silently lost

---

### 11. Null/Undefined Safety Issues
**Status:** Multiple unfixed
**Issues:**

A. **Non-null assertions without verification:**
   - Multiple files use `!.` operator without preceding null check
   - Example: `packages/implementer/src/agent.ts` line 100: `choice?.message` used but no check if choice is null

B. **Unsafe array access:**
   - `packages/implementer/src/agent.ts` line 108: `response.choices[0]` accessed without bounds check
   - Could throw if choices array is empty

**Severity:** MAJOR - Can cause runtime crashes in edge cases

---

### 12. Linting & Code Quality Issues
**Status:** Multiple unfixed
**Known Issues:**

A. **Unused variables and imports:**
   - Multiple unused imports across packages
   - Unreferenced local variables

B. **Long functions without documentation:**
   - Agent run methods exceed 200 lines without JSDoc
   - Complex logic lacks inline comments

C. **Inconsistent error handling:**
   - Some errors logged, some silent
   - Some caught and rethrown, some swallowed
   - Inconsistent error message formatting

**Severity:** MINOR-MAJOR (depending on specific instance)

---

## Uncommitted Changes Currently in Workspace

The following changes have been made but NOT committed:

1. **packages/runner/src/agent.ts** - E2B API fix and logging improvements
2. **packages/mca/src/server.ts** - Plan state preservation fix
3. **packages/implementer/src/agent.ts** - Error handling wrapper fix

These changes should be:
1. Thoroughly tested
2. Verified to not introduce new TypeScript errors
3. Committed with proper commit messages after audit verification

---

## Critical Path for Execution Failures

Current execution flow and failure points:

```
Gateway (/api/executions)
    ↓
MCA (/start)
    ├─ Planner
    │   └─ Issue: OpenAI fails → silent fallback to generic plan
    │       └─ Implementer receives mismatched plan
    │
    ├─ Implementer
    │   ├─ Issue: Tool message validation fails with OpenAI
    │   ├─ Issue: Error handling doesn't catch all error paths
    │   └─ Result: Returns error, propagates to MCA
    │
    ├─ Runner
    │   ├─ Issue: E2B command API signature mismatch
    │   └─ Result: "Invalid argument expected string"
    │
    └─ Validator
        └─ Not reached due to earlier failures
```

All three critical issues must be fixed for executions to progress.

---

## Next Steps for Your Assistant

1. **Read AUDIT_INSTRUCTIONS.md** - Complete audit procedure
2. **Run Phase 1-2** - TypeScript and ESLint checks
3. **Document all findings** - File, line, severity, context
4. **Generate AUDIT_REPORT.md** - Master report with all findings
5. **Create FIX_ROADMAP.md** - Prioritized list of fixes
6. **Execute fixes systematically** - By priority and category
7. **Validate all fixes** - TypeScript + ESLint + tests
8. **Create PR** - With audit report and remediation evidence

---

## Key Success Metrics

After audit and fixes:
- [ ] `npm run typecheck` - Zero errors
- [ ] `npx eslint .` - Zero violations
- [ ] `npm run build` - Successful build
- [ ] `npm run test` - All tests pass
- [ ] Manual execution test - "create hello_world app" completes successfully
- [ ] AUDIT_REPORT.md - Comprehensive findings with all remediation verified
