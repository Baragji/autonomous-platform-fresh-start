Autonomous Platform UI (apps/web)
================================

Dev
---

Live mode (proxy to gateway):

UI_BACKEND_MODE=live UI_GATEWAY_BASE=http://localhost:3030 npm -w apps/web run dev

Evidence replay mode:

UI_BACKEND_MODE=evidence UI_EVIDENCE_DIR=../../.automation/evidence npm -w apps/web run dev

Endpoints
---------

- POST /api/session { intent }
- GET  /api/stream?sessionId=...
- GET  /api/artifacts
- POST /api/artifacts { paths: string[] }

