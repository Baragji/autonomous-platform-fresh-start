# .automation/ Directory

**Purpose:** Machine-generated evidence and artifacts for all tasks.

**DO NOT manually create files here.** AI builders will generate evidence automatically during task execution.

---

## 📁 Directory Structure

```
.automation/
├── README.md                    # This file
├── evidence/                    # Task-scoped evidence (created per task)
│   ├── week1/                   # Example: Week 1 infrastructure setup
│   │   ├── discovery.txt        # Proof targets exist before editing
│   │   ├── baseline.json        # Metrics before change
│   │   ├── final.json           # Metrics after change
│   │   ├── valid/
│   │   │   ├── lint.txt         # Lint output (exit 0)
│   │   │   ├── typecheck.txt    # TypeScript check (exit 0)
│   │   │   ├── tests.json       # Test results (all passing)
│   │   │   └── coverage.json    # Coverage report (≥80%)
│   │   ├── iterations/          # (if any failures occurred)
│   │   │   ├── attempt-1.md     # First fix attempt
│   │   │   ├── attempt-2.md     # Second fix attempt
│   │   │   └── attempt-3.md     # Third fix attempt (if needed)
│   │   ├── artifacts.sha256     # SHA256 hashes of all changed files
│   │   ├── task_provenance.json # {task_id, files_changed[], commands_run[], timestamp}
│   │   ├── audit.json           # npm audit --json (no new high/critical)
│   │   ├── env.txt              # node -v, npm -v, git rev-parse HEAD
│   │   └── summary.md           # Markdown summary with links to all artifacts
│   │
│   └── task-{id}/               # Other tasks follow same structure
│       └── (same structure as week1)
│
├── checkpoints/                 # LangGraph execution checkpoints (auto-created by LangGraph)
│   └── step-workflows/          # Checkpoint data for pause/resume
│
└── traces/                      # OpenTelemetry trace files (if local export enabled)
    └── (auto-created by OTel SDK)
```

---

## 📝 Evidence Requirements (Per Task)

Every task MUST produce these files in `.automation/evidence/$TASK/`:

### Required Files:
1. **discovery.txt** - Proof that targets exist before editing (grep/find output)
2. **baseline.json** - Metrics before change (tests, coverage, lint status)
3. **final.json** - Metrics after change (gates must all PASS)
4. **valid/lint.txt** - `npm run lint` output (exit 0)
5. **valid/typecheck.txt** - `npm run typecheck` output (exit 0)
6. **valid/tests.json** - `npm test --json` output (all passing)
7. **valid/coverage.json** - Coverage report (≥80% line coverage)
8. **artifacts.sha256** - SHA256 hashes of all changed files
9. **task_provenance.json** - Task metadata (ID, files changed, commands run, timestamp)
10. **audit.json** - `npm audit --json` (no new high/critical vulnerabilities)
11. **env.txt** - Environment details (node -v, npm -v, git rev-parse HEAD)
12. **summary.md** - Markdown summary linking to all artifacts

### Optional (Created on Failure):
- **iterations/attempt-N.md** - Created if validation fails (max 3 attempts)

---

## 🚫 What NOT to Do

❌ **Don't commit large files** (>1MB) - Use MinIO for artifacts
❌ **Don't manually create evidence** - Let AI builders generate it
❌ **Don't edit existing evidence** - Evidence is immutable once created
❌ **Don't skip evidence collection** - Every task requires complete evidence

---

## ✅ What AI Builders Do

**During task execution:**

1. **Create task directory:**
   ```bash
   mkdir -p .automation/evidence/$TASK/valid
   mkdir -p .automation/evidence/$TASK/iterations
   ```

2. **Run discovery:**
   ```bash
   grep -r "pattern" src/ > .automation/evidence/$TASK/discovery.txt
   ```

3. **Capture baseline:**
   ```bash
   npm run lint > /dev/null 2>&1; echo $? > baseline_lint_status.txt
   # (similar for typecheck, test)
   ```

4. **Implement change** (within architectural boundaries)

5. **Run validation gates:**
   ```bash
   npm run lint | tee .automation/evidence/$TASK/valid/lint.txt
   npm run typecheck | tee .automation/evidence/$TASK/valid/typecheck.txt
   npm test -- --json > .automation/evidence/$TASK/valid/tests.json
   npm test -- --coverage --json > .automation/evidence/$TASK/valid/coverage.json
   ```

6. **Hash changed files:**
   ```bash
   git diff --name-only | xargs sha256sum > .automation/evidence/$TASK/artifacts.sha256
   ```

7. **Create provenance:**
   ```bash
   cat > .automation/evidence/$TASK/task_provenance.json <<EOF
   {
     "task_id": "$TASK",
     "files_changed": ["src/app.ts", "src/app.test.ts"],
     "commands_run": ["npm run lint", "npm run typecheck", "npm test"],
     "timestamp": "$(date -Iseconds)",
     "git_commit": "$(git rev-parse HEAD)"
   }
   EOF
   ```

8. **Audit security:**
   ```bash
   npm audit --json > .automation/evidence/$TASK/audit.json
   ```

9. **Capture environment:**
   ```bash
   {
     echo "Node: $(node -v)"
     echo "npm: $(npm -v)"
     echo "Git: $(git rev-parse HEAD)"
     echo "OS: $(uname -a)"
   } > .automation/evidence/$TASK/env.txt
   ```

10. **Write summary:**
    ```bash
    cat > .automation/evidence/$TASK/summary.md <<EOF
    # Task: $TASK Summary

    ## Status: PASS

    ## Gates:
    - Lint: PASS (exit 0)
    - TypeCheck: PASS (exit 0)
    - Tests: PASS (12/12 passing)
    - Coverage: PASS (85% line coverage)

    ## Artifacts:
    - [discovery.txt](discovery.txt)
    - [baseline.json](baseline.json)
    - [final.json](final.json)
    - [valid/lint.txt](valid/lint.txt)
    - [valid/typecheck.txt](valid/typecheck.txt)
    - [valid/tests.json](valid/tests.json)
    - [valid/coverage.json](valid/coverage.json)
    - [artifacts.sha256](artifacts.sha256)
    - [task_provenance.json](task_provenance.json)
    - [audit.json](audit.json)
    - [env.txt](env.txt)

    ## Changes:
    - Modified: src/app.ts (added feature X)
    - Added: src/app.test.ts (12 new tests)

    ## Iterations:
    None (passed on first attempt)
    EOF
    ```

---

## 🔍 Verification

**To verify evidence is complete:**

```bash
# Check required files exist
ls .automation/evidence/$TASK/discovery.txt
ls .automation/evidence/$TASK/baseline.json
ls .automation/evidence/$TASK/final.json
ls .automation/evidence/$TASK/valid/lint.txt
ls .automation/evidence/$TASK/valid/typecheck.txt
ls .automation/evidence/$TASK/valid/tests.json
ls .automation/evidence/$TASK/valid/coverage.json
ls .automation/evidence/$TASK/artifacts.sha256
ls .automation/evidence/$TASK/task_provenance.json
ls .automation/evidence/$TASK/audit.json
ls .automation/evidence/$TASK/env.txt
ls .automation/evidence/$TASK/summary.md

# All 12 files should exist
```

---

## 📚 References

- **[AGENTS.md](../AGENTS.md)** - Evidence requirements (Rule 7)
- **[CONSTITUTION.md](../CONSTITUTION.md)** - Article V (Evidence Requirement)
- **[11_211025/WEEK_1_DOD.md](../11_211025/WEEK_1_DOD.md)** - Week 1 evidence example

---

**This directory is auto-populated during task execution. Do not manually create files.**
