#!/bin/bash
set -e

echo "🗑️  Cleaning up autonomous-platform-fresh-start repository..."
echo ""

# Navigate to repo root
cd "$(dirname "$0")"

echo "📋 Files to delete:"
echo ""

# Root level obsolete files
echo "Root level:"
echo "  ❌ AI_INSTRUCTIONS.md (superseded by AGENTS.md v3)"
echo "  ❌ START_HERE.md (obsolete scaffold guide)"
echo "  ❌ SESSION_HANDOFF.md (one-time handoff)"
echo "  ❌ FOLDER_CONTENTS.md (generated doc)"
echo "  ❌ SCAFFOLD_README.md (obsolete scaffold)"
echo "  ❌ final_delivery_handoff.md (one-time delivery)"
echo "  ❌ final_summary.md (session summary)"
echo "  ❌ scaffold.py (scaffolding script)"
echo "  ❌ scaffold.sh (scaffolding script)"
echo ""

# 11_211025/ obsolete files
echo "11_211025/ directory:"
echo "  ❌ BUILDER_INSTRUCTIONS.md (wrong approach, replaced by WEEK_1_DOD.md)"
echo "  ❌ PROMPT_FOR_COPILOT_TO_CREATE_AGENTS_MD.md (one-time prompt)"
echo "  ❌ OPENAI_STACK_UPDATE.md (info in VERTICAL_1_TOOLING.md)"
echo "  ❌ TECH_STACK_CLARIFICATION.md (duplicate)"
echo "  ❌ session_summary.md (session log)"
echo "  ❌ complete_log.md (144KB historical log)"
echo "  ❌ complete_log_summary_A.md (session summary)"
echo "  ❌ complete_log_summary_B.md (session summary)"
echo "  ❌ delivery.md (redundant with VERTICAL_1_PLAN.md)"
echo ""

# docs/ obsolete files
echo "docs/ directory:"
echo "  ❌ docs/11_211025/TECH_STACK_CLARIFICATION.md (duplicate)"
echo "  ❌ docs/11_211025/delivery.md (duplicate)"
echo "  ❌ docs/VISION.md (merged into CONSTITUTION.md)"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
read -p "Proceed with deletion? (y/N) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Cleanup cancelled."
    exit 1
fi

echo ""
echo "🗑️  Deleting files..."
echo ""

# Root level
rm -f AI_INSTRUCTIONS.md
rm -f START_HERE.md
rm -f SESSION_HANDOFF.md
rm -f FOLDER_CONTENTS.md
rm -f SCAFFOLD_README.md
rm -f final_delivery_handoff.md
rm -f final_summary.md
rm -f scaffold.py
rm -f scaffold.sh

# 11_211025/
rm -f 11_211025/BUILDER_INSTRUCTIONS.md
rm -f 11_211025/PROMPT_FOR_COPILOT_TO_CREATE_AGENTS_MD.md
rm -f 11_211025/OPENAI_STACK_UPDATE.md
rm -f 11_211025/TECH_STACK_CLARIFICATION.md
rm -f 11_211025/session_summary.md
rm -f 11_211025/complete_log.md
rm -f 11_211025/complete_log_summary_A.md
rm -f 11_211025/complete_log_summary_B.md
rm -f 11_211025/delivery.md

# docs/
rm -f docs/11_211025/TECH_STACK_CLARIFICATION.md
rm -f docs/11_211025/delivery.md
rm -f docs/VISION.md

echo ""
echo "✅ Cleanup complete!"
echo ""
echo "📊 Final structure:"
echo ""
echo "Root (kept):"
echo "  ✅ CONSTITUTION.md"
echo "  ✅ AGENTS.md (v3)"
echo "  ✅ README.md"
echo "  ✅ .gitignore"
echo ""
echo "11_211025/ (kept):"
echo "  ✅ ARCHITECTURE_DECISION.md"
echo "  ✅ VERTICAL_1_TOOLING.md"
echo "  ✅ VERTICAL_1_PLAN.md"
echo "  ✅ WEEK_1_DOD.md"
echo "  ✅ umca_RA_part2.md"
echo "  ✅ umca_research_report_multi_agent_ai_coding_system_oct_2025.md"
echo ""
echo "🎯 Repository is now clean and ready for Week 1 execution!"
