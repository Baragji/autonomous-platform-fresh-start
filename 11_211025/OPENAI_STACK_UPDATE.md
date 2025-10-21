# OpenAI-Only Stack Update

**Date:** 2025-10-21  
**Decision:** Switch from mixed OpenAI+Anthropic stack to **OpenAI-only** for Vertical Slice #1  
**Reason:** Use existing OpenAI credits, prepare for GPT-5, simplify vendor stack

---

## What Changed

### Before (Mixed Stack)
- **MCA Supervisor:** Anthropic Claude Sonnet 4.5
- **Planner:** OpenAI GPT-4o (Structured Outputs)
- **Implementer:** Anthropic Text Editor Tool (`text_editor_20250728`)
- **Validator:** OpenAI GPT-4o (Structured Outputs)
- **Cost:** $800-1600/month ($500-1000 LLM)

### After (OpenAI-Only)
- **MCA Supervisor:** OpenAI GPT-4o (or GPT-5 when available)
- **Planner:** OpenAI GPT-4o (Structured Outputs)
- **Implementer:** OpenAI Function Calling with custom `edit_file` tool
- **Validator:** OpenAI GPT-4o (Structured Outputs)
- **Cost:** $700-1400/month ($400-800 LLM) - **20-40% cheaper**

---

## Why This Makes Sense

### ✅ Pros
1. **Uses Your Existing Credits** - No Anthropic spend initially
2. **GPT-5 Ready** - Can swap to GPT-5 when available with no architecture changes
3. **Simpler Stack** - One vendor, one API, one billing dashboard
4. **Multi-Vendor Portability 5/5** - Can still add Anthropic/Gemini later if needed
5. **20-40% Cost Reduction** - OpenAI pricing more competitive for this use case
6. **Streaming Still Works** - OpenAI function calling supports streaming chunks

### ⚠️ Trade-offs
1. **Slightly Less Granular Streaming** - Anthropic streams parameters more cleanly (5/5 vs OpenAI 4/5), but OpenAI is still production-grade
2. **No Native Text Editor Tool** - We define our own `edit_file` function schema (pro: more control, con: slightly more code)

---

## Technical Implementation

### Implementer Agent (OpenAI Function Calling)

**Function Definition:**
```typescript
const tools: OpenAI.ChatCompletionTool[] = [{
  type: "function",
  function: {
    name: "edit_file",
    description: "Edit a file using string replacement, creation, insertion, or viewing",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path relative to project root" },
        operation: { 
          type: "string", 
          enum: ["view", "create", "str_replace", "insert"],
          description: "Operation to perform on the file"
        },
        old_str: { type: "string", description: "Exact string to replace (for str_replace)" },
        new_str: { type: "string", description: "Replacement string (for str_replace, insert)" },
        file_content: { type: "string", description: "Complete file content (for create)" },
        insert_line: { type: "number", description: "Line number to insert at (for insert)" }
      },
      required: ["path", "operation"]
    }
  }
}];
```

**Streaming:**
```typescript
for await (const chunk of stream) {
  const delta = chunk.choices[0]?.delta;
  
  if (delta?.tool_calls?.[0]?.function?.arguments) {
    // Accumulate partial JSON
    currentToolCall.arguments += delta.tool_calls[0].function.arguments;
    
    // Try to parse and stream to frontend
    try {
      const partial = JSON.parse(currentToolCall.arguments);
      publishEvent("edit.streaming", {
        path: partial.path,
        operation: partial.operation,
        partial_text: partial.new_str || partial.file_content
      });
    } catch {
      // Incomplete JSON, continue
    }
  }
}
```

**Frontend (Monaco) receives same SSE events:**
- `edit.streaming` - Show ghost text as LLM generates
- `edit.complete` - Apply actual edit with accept/reject UI

---

## Multi-Vendor Escape Hatch

**If OpenAI quality degrades or experiences outage:**

1. **Add Anthropic (1-2 days):**
   - Install `@anthropic-ai/sdk`
   - Wrap Anthropic Text Editor Tool in same `implementerAgent` interface
   - Use environment variable to switch providers

2. **Add Google Gemini (2-3 days):**
   - Install `@google/generative-ai`
   - Map function schemas to Gemini format
   - Similar interface abstraction

**Cost Comparison:**
- OpenAI GPT-4o: $2.50 input / $10 output per 1M tokens
- Anthropic Claude Sonnet 4.5: $3 input / $15 output per 1M tokens (20% more expensive)
- Google Gemini 1.5 Pro: $1.25 input / $5 output per 1M tokens (50% cheaper, but less proven for code gen)

---

## Files Updated

1. **`VERTICAL_1_TOOLING.md`**
   - Replaced Anthropic Text Editor Tool with OpenAI Function Calling
   - Updated MCA Supervisor to use OpenAI
   - Updated budget breakdown (now $700-1400/month)
   - Removed `@anthropic-ai/sdk` from dependencies
   - Added "Multi-Vendor Escape Hatch" section
   - Updated streaming examples

2. **`ARCHITECTURE_DECISION.md`**
   - Updated Implementer tool choice to OpenAI
   - Added note about using existing credits

---

## Action Items

### Week 1-2 (Infrastructure + MCA)
- ✅ No changes - Postgres, Redis, MinIO setup same as before
- ✅ Update `.env` with `OPENAI_MODEL=gpt-4o-2024-08-06` (or `gpt-5` when available)

### Week 3-4 (Implementer)
- ✅ Install `openai` package (already have it for Planner)
- ✅ Implement `edit_file` function schema
- ✅ Add streaming handler for partial JSON
- ✅ Test streaming to Monaco via SSE

### Week 5-8 (Runner + Validator + E2E)
- ✅ No changes - E2B, Validator same as before

---

## Budget Impact

**Initial (1-5 concurrent executions):**
- Before: $800-1600/month
- After: $700-1400/month
- **Savings: $100-200/month**

**At Scale (100 concurrent executions):**
- Before: $6k-10k/month
- After: $5k-9k/month
- **Savings: $1k/month**

**When GPT-5 Available:**
- Pricing TBD (estimated $5-15/1M tokens)
- May increase to $600-1200/month initially
- Performance gains likely justify cost

---

## Approval

- ✅ User (Product Owner) - Requested 2025-10-21 (wants to use existing OpenAI credits)
- ✅ Claude (Technical Architect) - Approved 2025-10-21 (clean abstraction, multi-vendor portability maintained)

---

## References

- Updated `VERTICAL_1_TOOLING.md` - Full OpenAI implementation with code examples
- Updated `ARCHITECTURE_DECISION.md` - Reflects OpenAI-only stack choice
- OpenAI Function Calling Docs: https://platform.openai.com/docs/guides/function-calling
- Multi-vendor comparison: See VERTICAL_1_TOOLING.md "Multi-Vendor Escape Hatch" section
