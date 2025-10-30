# Graceful Shutdown Handler Investigation
**Date:** 2025-10-31
**Task:** Investigate why services are hanging on shutdown and identify missing graceful shutdown handlers per AGENTS.md (discover-before-act)

---

## Discovery Findings

### ✅ What's Already Implemented
All 6 services are calling `registerShutdown()` from `packages/shared/src/shutdown.ts`:
- **gateway** (line 134): Full shutdown with Redis clients + DB pool
- **mca** (line 259): Full shutdown with Redis clients + DB pool
- **planner** (line 164): Partial shutdown (server + logger only)
- **implementer** (line 106): Partial shutdown (server + logger only)
- **runner** (line 73): Partial shutdown (server + logger only)
- **validator** (line 390): Partial shutdown (server + logger only)

### ❌ Root Cause of Hanging: Missing Resource Cleanup in 4 Services
The `registerShutdown()` implementation (shared/src/shutdown.ts) provides:
- ✅ HTTP server.close() with timeout (default 15s)
- ✅ Redis client.quit() for all clients
- ✅ DB pool.end() for database connections
- ✅ SIGINT/SIGTERM handlers
- ✅ Timeout enforcement to prevent indefinite hangs

**BUT:** Four services are not passing all their resources to registerShutdown():

| Service | Server | Redis | DB | Missing |
|---------|--------|-------|----|-|
| gateway | ✅ | ✅ | ✅ | None - COMPLETE |
| mca | ✅ | ✅ | ✅ | None - COMPLETE |
| planner | ✅ | ❌ | ❌ | No Redis, no DB |
| implementer | ✅ | ❌ | ❌ | No Redis, no DB |
| runner | ✅ | ❌ | ❌ | No Redis, no DB |
| validator | ✅ | ❌ | ❌ | No Redis, no DB |

### ⚠️ Why This Causes Hanging

When SIGTERM/SIGINT is sent to a service during graceful shutdown:

1. **gateway/mca** → HTTP server closes → Redis quits → DB pool ends → process exits
2. **planner/implementer/runner/validator** → HTTP server closes → process exits (hanging connections remain!)

The hanging connections accumulate because:
- Open HTTP connections to planner/implementer/runner/validator aren't closed from the client side
- Next restart tries to bind to the same ports
- Zombie processes remain holding those ports → EADDRINUSE errors

### 🔍 Services Need to Pass

**planner** (7020) uses:
- Express HTTP server (already passed) ✅
- Does NOT use Redis ✅
- Does NOT use Postgres directly ✅
- **Uses MinIO** → needs cleanup handler for potential S3 connections

**implementer** (7030) uses:
- Express HTTP server (already passed) ✅
- Creates RedisEventPublisher (NOT passed) ❌
- Does NOT use direct Postgres ✅
- Uses MinIO → needs cleanup handler

**runner** (7040) uses:
- Express HTTP server (already passed) ✅
- Creates E2B sandboxes (NOT passed) ❌ **CRITICAL - child processes**
- Does NOT use Redis ✅
- Does NOT use Postgres ✅
- Uses MinIO → needs cleanup handler

**validator** (7050) uses:
- Express HTTP server (already passed) ✅
- Creates E2B sandboxes (NOT passed) ❌ **CRITICAL - child processes**
- Does NOT use Redis ✅
- Does NOT use Postgres ✅
- Uses MinIO → needs cleanup handler

---

## Action Plan (To Fix)

### Phase 1: Audit Service Dependencies
For each of planner, implementer, runner, validator:
1. Read their imports and module initialization
2. Identify all long-lived connections/child processes:
   - Redis pub/sub subscriptions
   - Database pools
   - **E2B Sandbox instances** (runner/validator create these)
   - MinIO client connections
   - OpenTelemetry collectors
3. Document where each is created and stored

### Phase 2: Implement Cleanup Handlers
For each service, add cleanup functions to `registerShutdown()`:

**Example pattern** (from gateway/mca):
```typescript
registerShutdown({
  server,
  redisClients: [/* array of redis clients */],
  db: pool,  // or [db1, db2] for multiple
  extra: [
    () => /* custom cleanup for sandboxes, minio, etc */
  ],
  logger
});
```

### Phase 3: Test Graceful Shutdown
```bash
npm run dev:up
# In separate terminal:
curl -s -X POST localhost:3030/api/executions -H 'Content-Type: application/json' -d '{"intent":"hello world"}'
# Watch logs streaming...

# Then in original terminal:
# Press Ctrl+C (SIGINT) - all services should shut down cleanly
# Verify: no EADDRINUSE on restart
```

---

## Evidence Files
- `packages/shared/src/shutdown.ts` - Implementation (lines 1-87)
- `packages/gateway/src/server.ts:134` - Full shutdown example
- `packages/mca/src/server.ts:259` - Full shutdown example
- `packages/planner/src/server.ts:164` - **NEEDS FIX**
- `packages/implementer/src/server.ts:106` - **NEEDS FIX** (has RedisEventPublisher)
- `packages/runner/src/server.ts:73` - **CRITICAL FIX** (manages E2B sandboxes)
- `packages/validator/src/server.ts:390` - **CRITICAL FIX** (manages E2B sandboxes)

---

## Conclusion
✅ Framework exists and is proven to work
❌ 4 services don't pass all resources to framework
🔴 runner and validator critically need E2B sandbox cleanup in extra handlers

**Next step:** Implement cleanup handlers for each service following the registry pattern.
