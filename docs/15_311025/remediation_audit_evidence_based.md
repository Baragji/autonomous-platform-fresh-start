**CRITICAL: Incremental Evidence Collection**

You will hit context limits. To prevent data loss:

1. **Create the file FIRST**: `touch .automation/REMEDIATION_INSTRUCTION_EVIDENCE_BASED.md`

2. **Append findings IMMEDIATELY as you discover them**:
   - Found a gap in STATUS? → Append it to the file NOW
   - Identified missing implementation? → Write the remediation task NOW
   - Don't wait to analyze everything before writing

3. **Use this pattern**:
   ```bash
   # As you read each document, append findings:
   echo "## Gap: [Description]" >> .automation/REMEDIATION_INSTRUCTION_EVIDENCE_BASED.md
   echo "File: path/to/file.ts:123" >> .automation/REMEDIATION_INSTRUCTION_EVIDENCE_BASED.md
   echo "Evidence: [exact quote]" >> .automation/REMEDIATION_INSTRUCTION_EVIDENCE_BASED.md
   echo "" >> .automation/REMEDIATION_INSTRUCTION_EVIDENCE_BASED.md
   ```

4. **After ~20 tool calls, consolidate**: Read what you've written, organize it into the proper structure (Gap Analysis → Remediation → Verification → Metrics → Timeline → Risks), then rewrite the file coherently.

5. **If context resets**: Read `.automation/REMEDIATION_INSTRUCTION_EVIDENCE_BASED.md` to see what you already found, then continue from the next document.

# Evidence-Based Remediation Plan Creation Instructions

## Your Task

Create a new file: `.automation/REMEDIATION_INSTRUCTION_EVIDENCE_BASED.md`

## Step 1: Read Foundation Documents (What Should Exist)

Read these files completely to understand the original plan:
- `docs/11_211025/VERTICAL_1_PLAN.md`
- `docs/11_211025/VERTICAL_1_TOOLING.md`
- `WEEK_1_DOD.md`
- `WEEK_2_DOD.md`
- `WEEK_3_4_DOD.md`
- `week_5_6.md`

Extract: technical requirements, architecture decisions, validation gates, success criteria.

## Step 2: Read Current State (What's Actually Broken)

Read `.automation/STATUS_2025-10-31.md` completely.

Extract: all deviations, bugs, missing implementations, compliance gaps, technical debt.

## Step 3: Learn Our Evidence-Based Methodology

Read these files to understand HOW we operate:
- `AGENTS.md`
- `universal_autonomy_template.md`
- `prompt_pattern_analysis.md`
- `extracted_user_instructions.md`

Extract: evidence requirements, autonomous execution patterns, proof-of-work standards, forbidden patterns.

## Step 4: Review Existing Remediation (For Context Only)

Read `REMEDIATION_INSTRUCTION.md` to see what was previously proposed. Do NOT copy it or trust it—use it only to understand what issues were identified.

## Step 5: Create Evidence-Based Remediation Plan

Now create `REMEDIATION_INSTRUCTION_EVIDENCE_BASED.md` with:

**Requirements:**
- Cite exact file paths and line numbers for every claim
- Provide specific commands (not "run tests" but "npm test -- --coverage --run")
- Define measurable success criteria (not "good coverage" but "≥80% line coverage")
- Include verification steps with exact expected outputs
- No generic advice—every instruction must be repository-specific
- No speculation—every gap must reference actual code/config that's missing or wrong
- Follow the evidence-based patterns from AGENTS.md

**Structure:**
1. **Gap Analysis** - List each deviation from STATUS with file:line citations
2. **Remediation Tasks** - Specific actions with exact file paths and commands
3. **Verification Protocol** - How to prove each fix worked (with commands and expected output)
4. **Success Metrics** - Measurable criteria (coverage %, test pass rate, etc.)
5. **Timeline** - Realistic estimates per task
6. **Risk Assessment** - What could go wrong with each fix

Do NOT proceed until you've read all referenced documents. Begin now.