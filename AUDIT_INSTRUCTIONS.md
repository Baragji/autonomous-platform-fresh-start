# Comprehensive Code Audit & Quality Assessment Instructions

## Overview
Conduct a systematic audit of the entire autonomous-platform codebase to identify ALL TypeScript errors, linting violations, and non-production-compliant code patterns. This audit will enable systematic remediation prioritized by severity and business impact.

---

## Phase 1: TypeScript Compilation Audit

### 1.1 Full TypeScript Type Checking
**Command:**
```bash
npm run typecheck 2>&1 | tee /tmp/typecheck_results.txt
```

**Analysis Tasks:**
- Capture ALL error messages with file paths and line numbers
- Categorize errors by type:
  * Type mismatches (e.g., `Type 'X' is not assignable to type 'Y'`)
  * Missing type definitions (e.g., `Property 'X' does not exist`)
  * Implicit `any` types (search for `error TS7006`)
  * Generic type errors
  * Union type issues
  * Missing return type annotations

**Output Format for Each Error:**
```
File: packages/[package]/src/[file].ts
Line: [line number]
Error Type: [category from above]
Message: [exact error message]
Severity: CRITICAL|MAJOR|MINOR
Context: [2-3 lines of code around the error]
```

### 1.2 Package-by-Package TypeScript Check
For each package in `packages/*/tsconfig.json`:
```bash
cd packages/[package-name]
npx tsc --noEmit 2>&1
```

**Packages to check:**
- packages/runner
- packages/implementer
- packages/validator
- packages/planner
- packages/mca
- packages/gateway
- packages/shared
- packages/vfs
- apps/web

---

## Phase 2: ESLint & Linting Audit

### 2.1 Run ESLint on Entire Project
**Command:**
```bash
npx eslint . --format json 2>&1 | tee /tmp/eslint_results.json
npx eslint . --format=table 2>&1 | tee /tmp/eslint_results.txt
```

**Analysis Tasks:**
- Extract ALL violations (not just errors, include warnings)
- Categorize by rule:
  * `@typescript-eslint/` violations
  * `eslint:recommended` violations
  * Custom rule violations
  * Import/export issues
  * Naming convention violations

**Output Format for Each Violation:**
```
File: [file path]
Line: [line number]
Rule: [rule name]
Message: [rule violation message]
Severity: ERROR|WARNING
Context: [line of code]
Fixable: YES|NO
```

### 2.2 Check for Specific High-Risk Patterns
Search for and document:
```bash
# Any explicit 'any' types
grep -r ":\s*any\|:\s*any\[" packages/ apps/ --include="*.ts" --include="*.tsx"

# Empty catch blocks
grep -r "catch\s*(" packages/ apps/ --include="*.ts" --include="*.tsx" -A 1 | grep -E "^\s*}\s*$"

# Unchecked array indexing
grep -r "\[.*\]\s*\." packages/ apps/ --include="*.ts" --include="*.tsx"

# Missing null/undefined checks
grep -r "as unknown as\|as any\|!.*\." packages/ apps/ --include="*.ts" --include="*.tsx"
```

---

## Phase 3: Code Quality & Production Compliance Audit

### 3.1 Error Handling Analysis
For EACH source file in packages/*/src/ and apps/*/src/:

**Check for:**
1. Unhandled promise rejections
   ```bash
   grep -n "await\|\.then\|\.catch" [file] | grep -v "try\|catch\|\.catch"
   ```

2. Missing error context in catch blocks
   ```bash
   grep -rn "catch.*{" packages/ apps/ --include="*.ts" -A 5 | grep -v "error\|err\|log\|throw"
   ```

3. Silent error suppression
   ```bash
   grep -rn "catch\s*(\s*\)" packages/ apps/ --include="*.ts"
   ```

**Document Each Finding:**
```
File: [file path]
Line: [line number]
Issue: [specific error handling problem]
Severity: CRITICAL|MAJOR|MINOR
Pattern: [code snippet]
Impact: [what could go wrong]
Remediation: [how to fix]
```

### 3.2 Type Safety Analysis
Search the entire codebase for:

1. **Type Casting Issues**
   ```bash
   grep -rn "as unknown\|as any\|<any>" packages/ apps/ --include="*.ts" --include="*.tsx"
   ```

2. **Non-Null Assertions (!)**
   ```bash
   grep -rn "!\." packages/ apps/ --include="*.ts" --include="*.tsx"
   ```

3. **Missing Type Annotations**
   ```bash
   grep -rn "function.*(\w\+)\s*{" packages/ apps/ --include="*.ts" | grep -v ":\s*\(Type\|interface\|{" | head -50
   ```

4. **Implicit Dependencies**
   Check each file for imports that could be missing or circular:
   ```bash
   grep -n "^import\|^export" [file] | verify-each-import-exists
   ```

**Report Format:**
```
File: [file path]
Line: [line number]
Type Safety Issue: [specific issue]
Current Code: [exact code]
Severity: CRITICAL|MAJOR|MINOR
Risk: [what could break]
Suggested Fix: [specific code change]
```

### 3.3 Dependency & Configuration Audit

1. **Check package.json files for issues:**
   - Duplicate dependencies across packages
   - Mismatched versions of same package
   - Missing peer dependencies
   - Obsolete/deprecated packages

2. **Check TypeScript configurations:**
   ```bash
   cat packages/*/tsconfig.json | check-strict-mode-enabled
   cat apps/*/tsconfig.json | check-strict-mode-enabled
   ```
   - Verify `strict: true` is set
   - Verify `noImplicitAny: true`
   - Verify `strictNullChecks: true`

3. **Check ESLint configurations:**
   ```bash
   cat .eslintrc.json
   ```
   - Verify TypeScript parser is configured
   - Verify all recommended rules are enabled

**Report Format:**
```
File/Config: [config file path]
Issue: [specific configuration problem]
Current Setting: [current value]
Recommended Setting: [recommended value]
Severity: CRITICAL|MAJOR|MINOR
Impact: [what this affects]
```

---

## Phase 4: Runtime Failures & Bad Coding Patterns

### 4.1 Common Bad Patterns

Search for and document:

1. **Promise/Async Issues:**
   ```bash
   # Fire-and-forget promises (not awaited)
   grep -rn "\.then\|\.catch\|fetch\|Promise\." packages/ apps/ --include="*.ts" --include="*.tsx" | grep -v "await\|return\|\.catch"

   # Missing async keyword
   grep -rn "(.*)\s*=>\s*{\s*await\|async\s*(" packages/ apps/ --include="*.ts" | grep -v "^async"
   ```

2. **String/Number Conversions:**
   ```bash
   # Implicit string to number conversions
   grep -rn "String(.*)\|Number(.*)\|parseInt\|parseFloat" packages/ apps/ --include="*.ts" | grep -v "\/\/"
   ```

3. **Array/Object Safety:**
   ```bash
   # Unsafe array access
   grep -rn "\.split.*\[0\]\|\.split.*\[1\]" packages/ apps/ --include="*.ts"

   # Missing .length check
   grep -rn "\[0\]\|\.at(0)" packages/ apps/ --include="*.ts" -B 1 | grep -v "\.length\|if\|guard"
   ```

4. **Null/Undefined Safety:**
   ```bash
   # Missing null checks
   grep -rn "!.*\.\|\..*??\.\|optional chaining" packages/ apps/ --include="*.ts" | head -50
   ```

### 4.2 API Contract Violations

For each service (packages/mca, packages/runner, packages/implementer, etc.):

1. **Check request validation:**
   - Is input validated before use?
   - Are types strictly enforced?
   - Are edge cases handled?

2. **Check response contracts:**
   - Do all responses match declared types?
   - Are error responses properly structured?
   - Are all fields always present?

3. **Check error propagation:**
   - Are HTTP status codes appropriate?
   - Are error messages user-facing or safe?
   - Is error context preserved?

**Report Format:**
```
Service: [service name]
Endpoint: [endpoint path]
Issue: [API contract violation]
File: [file path]
Line: [line number]
Severity: CRITICAL|MAJOR|MINOR
Impact: [what could break]
Fix: [what needs to change]
```

---

## Phase 5: Production Compliance Checklist

For EACH source file, verify:

- [ ] All public functions have JSDoc comments
- [ ] All complex logic has inline comments
- [ ] All error paths are explicitly handled
- [ ] All external calls have error handling
- [ ] All string concatenations use template literals (not +)
- [ ] All logging includes context (execId, request id, etc.)
- [ ] No hardcoded credentials or secrets
- [ ] No TODO/FIXME/XXX comments without issues
- [ ] No console.log statements (use logger instead)
- [ ] All types are explicitly specified (no implicit any)
- [ ] All promises are properly awaited or returned
- [ ] All catch blocks have meaningful error handling
- [ ] Database queries use parameterized statements
- [ ] File paths use path.resolve() or path.join()
- [ ] Environment variables have fallbacks or explicit checks

---

## Phase 6: Report Generation

### 6.1 Create Master Report
Generate a single comprehensive report file with sections:

```markdown
# Code Audit Report - [Date]

## Executive Summary
- Total Files Audited: [X]
- Critical Issues Found: [X]
- Major Issues Found: [X]
- Minor Issues Found: [X]
- Estimated Remediation Time: [X] hours

## Critical Issues (BLOCKING PRODUCTION)
[List all critical issues with details]

## Major Issues (HIGH PRIORITY)
[List all major issues with details]

## Minor Issues (MEDIUM PRIORITY)
[List all minor issues with details]

## Linting Violations Summary
[Categorized by rule type]

## Type Safety Issues Summary
[List all type-related issues]

## Dependency Issues
[List all package/config issues]

## Remediation Roadmap
1. [Critical issue 1]
2. [Critical issue 2]
... (prioritized by business impact and effort)
```

### 6.2 Create Detailed Findings Index
CSV format with columns:
```
File,Line,Severity,Category,Rule/Issue,Current Code,Suggested Fix,Estimated Effort,Dependencies
```

### 6.3 Create Fix Instructions
For each category of issues, provide:
1. Search pattern to find all instances
2. Step-by-step fix procedure
3. Validation command to verify fix
4. Test cases to confirm fix doesn't break anything

---

## Tools & Commands Reference

### TypeScript Checking
```bash
npm run typecheck                    # Full project
npx tsc --noEmit                    # Current package
npx tsc --listFiles                 # List all files processed
npx tsc --diagnostic                # Detailed diagnostics
```

### Linting
```bash
npx eslint . --format=json          # JSON output for parsing
npx eslint . --format=table         # Human readable table
npx eslint [file] --fix             # Auto-fix violations
npx eslint . --max-warnings=0       # Fail on any warning
```

### Code Search
```bash
grep -rn "PATTERN" packages/ apps/ --include="*.ts" --include="*.tsx"
find . -name "*.ts" -exec grep -l "PATTERN" {} \;
git diff --name-only HEAD~1         # Recently changed files
```

### Dependency Analysis
```bash
npm ls                              # Tree of dependencies
npm audit                           # Security vulnerabilities
npm outdated                        # Outdated packages
```

---

## Priority & Severity Definitions

### CRITICAL
- **Impact:** Prevents production deployment or causes data loss
- **Examples:** TypeScript compilation errors, unhandled promise rejections, SQL injection, missing error handling for external APIs
- **SLA:** Must fix before any deployment

### MAJOR
- **Impact:** Could cause runtime failures or data inconsistency
- **Examples:** Type casting issues, missing null checks, inconsistent error handling patterns
- **SLA:** Fix in current sprint

### MINOR
- **Impact:** Code quality, maintainability, or minor style issues
- **Examples:** Linting violations, missing comments, inconsistent naming
- **SLA:** Fix in next sprint

---

## Validation Steps After Fixes

1. **TypeScript Compilation:**
   ```bash
   npm run typecheck        # Zero errors
   npm run build            # Successful build
   ```

2. **Linting:**
   ```bash
   npx eslint . --max-warnings=0   # Zero violations
   ```

3. **Testing:**
   ```bash
   npm run test             # All tests pass
   npm run test:e2e         # E2E tests pass
   ```

4. **Code Review:**
   - Submit PR with changes
   - Link to audit report
   - Reference each fix to audit finding

---

## Output Files to Generate

1. `AUDIT_REPORT.md` - Main comprehensive report
2. `AUDIT_FINDINGS.csv` - Detailed findings index
3. `AUDIT_FIX_INSTRUCTIONS.md` - Step-by-step remediation guide
4. `typecheck_results.txt` - TypeScript output
5. `eslint_results.txt` - ESLint output
6. `eslint_results.json` - ESLint JSON (for parsing)

---

## Success Criteria

The audit is complete when:
- [ ] All TypeScript compilation succeeds with zero errors
- [ ] ESLint passes with zero violations and zero warnings
- [ ] All critical issues have documented fixes
- [ ] All code follows production compliance checklist
- [ ] Report includes specific file/line/code references for each issue
- [ ] Remediation roadmap prioritizes fixes by business impact
