#!/bin/bash
# Scaffold entire project structure from delivery.md
# This script extracts all code blocks marked with file paths and creates the files

set -e

DELIVERY_FILE="docs/11_211025/delivery.md"
ROOT_DIR="."

echo "🚀 Scaffolding autonomous-platform from delivery.md..."
echo ""

# Create base directory structure
echo "📁 Creating directory structure..."
mkdir -p apps/gateway/src
mkdir -p apps/mca-orchestrator/src/graph
mkdir -p services/planner-ra/src
mkdir -p services/architect-aa/src
mkdir -p services/implementer-ia/src
mkdir -p services/runner-da/src
mkdir -p services/security-sa/src
mkdir -p services/quality-qa/src
mkdir -p services/finops-fops/src
mkdir -p services/db-layer-dba/src
mkdir -p packages/contracts/openapi
mkdir -p packages/contracts/schema
mkdir -p ops/dev
mkdir -p ops/dev/grafana/provisioning

echo "✅ Directory structure created"
echo ""

# Function to extract code blocks from delivery.md
# Usage: extract_file "path/to/file.ext" "START_LINE" "END_LINE"
extract_file() {
  local filepath="$1"
  local start_marker="$2"
  local end_marker='```'

  echo "📝 Extracting: $filepath"

  # Use awk to extract content between markers
  awk "/$start_marker/,/$end_marker/" "$DELIVERY_FILE" | \
    tail -n +2 | \
    head -n -1 > "$filepath"

  if [ -s "$filepath" ]; then
    echo "   ✅ Created $filepath ($(wc -l < "$filepath") lines)"
  else
    echo "   ⚠️  Warning: $filepath is empty"
  fi
}

# Extract docker-compose.yml
echo "🐳 Creating Docker Compose configuration..."
extract_file "ops/dev/docker-compose.yml" '> `ops/dev/docker-compose.yml`'

# Extract .env.example
extract_file ".env.example" '> `.env.example`'

# Extract otel-collector.yaml
extract_file "ops/dev/otel-collector.yaml" '> `ops/dev/otel-collector.yaml`'

# Extract OpenAPI specs
echo ""
echo "📋 Creating OpenAPI 3.1 contracts..."
extract_file "packages/contracts/openapi/gateway.openapi.yaml" '> `packages/contracts/openapi/gateway.openapi.yaml`'
extract_file "packages/contracts/openapi/_template.worker.openapi.yaml" '> Template: `packages/contracts/openapi/_template.worker.openapi.yaml`'
extract_file "packages/contracts/openapi/planner-ra.openapi.yaml" '> `packages/contracts/openapi/planner-ra.openapi.yaml`'
extract_file "packages/contracts/openapi/architect-aa.openapi.yaml" '> `packages/contracts/openapi/architect-aa.openapi.yaml`'
extract_file "packages/contracts/openapi/implementer-ia.openapi.yaml" '> `packages/contracts/openapi/implementer-ia.openapi.yaml`'
extract_file "packages/contracts/openapi/runner-da.openapi.yaml" '> `packages/contracts/openapi/runner-da.openapi.yaml`'
extract_file "packages/contracts/openapi/security-sa.openapi.yaml" '> `packages/contracts/openapi/security-sa.openapi.yaml`'
extract_file "packages/contracts/openapi/quality-qa.openapi.yaml" '> `packages/contracts/openapi/quality-qa.openapi.yaml`'
extract_file "packages/contracts/openapi/finops-fops.openapi.yaml" '> `packages/contracts/openapi/finops-fops.openapi.yaml`'
extract_file "packages/contracts/openapi/db-layer-dba.openapi.yaml" '> `packages/contracts/openapi/db-layer-dba.openapi.yaml`'

# Extract JSON Schemas
echo ""
echo "🔧 Creating JSON Schemas..."
extract_file "packages/contracts/schema/work-item.v1.json" '> `packages/contracts/schema/work-item.v1.json`'
extract_file "packages/contracts/schema/work-result.v1.json" '> `packages/contracts/schema/work-result.v1.json`'

# Extract TypeScript types
echo ""
echo "📘 Creating TypeScript definitions..."
extract_file "apps/mca-orchestrator/src/types.ts" '> `apps/mca-orchestrator/src/types.ts`'

# Extract orchestrator files
echo ""
echo "🧠 Creating orchestrator service..."
extract_file "apps/mca-orchestrator/src/graph/gates.ts" '> `apps/mca-orchestrator/src/graph/gates.ts`'
extract_file "apps/mca-orchestrator/src/graph/natsAdapter.ts" '> `apps/mca-orchestrator/src/graph/natsAdapter.ts`'
extract_file "apps/mca-orchestrator/src/graph/state.ts" '> `apps/mca-orchestrator/src/graph/state.ts`'
extract_file "apps/mca-orchestrator/src/index.ts" '> `apps/mca-orchestrator/src/index.ts`'

# Extract gateway files
echo ""
echo "🌐 Creating gateway service..."
extract_file "apps/gateway/src/problem.ts" '> `apps/gateway/src/problem.ts`'
extract_file "apps/gateway/src/server.ts" '> `apps/gateway/src/server.ts`'

# Extract worker services
echo ""
echo "🔨 Creating worker services..."
extract_file "services/runner-da/src/server.ts" '> `services/runner-da/src/server.ts`'
extract_file "services/planner-ra/src/server.ts" '> `services/planner-ra/src/server.ts`'
extract_file "services/architect-aa/src/server.ts" '> `services/architect-aa/src/server.ts`'
extract_file "services/implementer-ia/src/server.ts" '> `services/implementer-ia/src/server.ts`'
extract_file "services/security-sa/src/server.ts" '> `services/security-sa/src/server.ts`'
extract_file "services/quality-qa/src/server.ts" '> `services/quality-qa/src/server.ts`'
extract_file "services/finops-fops/src/server.ts" '> `services/finops-fops/src/server.ts`'
extract_file "services/db-layer-dba/src/server.ts" '> `services/db-layer-dba/src/server.ts`'

# Extract package.json files
echo ""
echo "📦 Creating package.json files..."
extract_file "apps/gateway/package.json" '> `apps/gateway/package.json`'
extract_file "apps/mca-orchestrator/package.json" '> `apps/mca-orchestrator/package.json`'
extract_file "services/planner-ra/package.json" '> `services/planner-ra/package.json`'
extract_file "services/architect-aa/package.json" '> `services/architect-aa/package.json`'
extract_file "services/implementer-ia/package.json" '> `services/implementer-ia/package.json`'
extract_file "services/runner-da/package.json" '> `services/runner-da/package.json`'
extract_file "services/security-sa/package.json" '> `services/security-sa/package.json`'
extract_file "services/quality-qa/package.json" '> `services/quality-qa/package.json`'
extract_file "services/finops-fops/package.json" '> `services/finops-fops/package.json`'
extract_file "services/db-layer-dba/package.json" '> `services/db-layer-dba/package.json`'
extract_file "package.json" '> Root `package.json` (Turborepo)'

# Extract GitHub Actions workflows
echo ""
echo "🤖 Creating CI/CD workflows..."
mkdir -p .github/workflows
extract_file ".github/workflows/slsa.yml" '> `.github/workflows/slsa.yml`'
extract_file ".github/workflows/codeql.yml" '> `.github/workflows/codeql.yml`'
extract_file ".github/workflows/trivy.yml" '> `.github/workflows/trivy.yml`'
extract_file ".github/workflows/semgrep.yml" '> `.github/workflows/semgrep.yml`'

# Create Dockerfiles (boilerplate - not in delivery.md)
echo ""
echo "🐋 Creating Dockerfiles..."

cat > apps/gateway/Dockerfile <<'EOF'
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src ./src
CMD ["node", "src/server.js"]
EXPOSE 8080
EOF

cat > apps/mca-orchestrator/Dockerfile <<'EOF'
FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache sqlite
COPY package*.json ./
RUN npm ci --only=production
COPY src ./src
CMD ["node", "src/index.js"]
EOF

# Create worker Dockerfiles (all TypeScript services use same template)
for service in planner-ra architect-aa implementer-ia runner-da security-sa quality-qa finops-fops db-layer-dba; do
  cat > "services/$service/Dockerfile" <<'EOF'
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src ./src
CMD ["node", "src/server.js"]
EOF
done

echo "   ✅ Created Dockerfiles for all services"

# Create tsconfig.json files
echo ""
echo "🔧 Creating TypeScript configs..."

cat > tsconfig.json <<'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  }
}
EOF

# Copy tsconfig to all TypeScript services
for dir in apps/gateway apps/mca-orchestrator services/*/; do
  cp tsconfig.json "$dir/tsconfig.json"
done

echo "   ✅ Created tsconfig.json files"

# Create turbo.json
echo ""
echo "⚡ Creating Turborepo config..."

cat > turbo.json <<'EOF'
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "outputs": []
    },
    "test": {
      "outputs": []
    }
  }
}
EOF

echo "   ✅ Created turbo.json"

# Create .gitignore
echo ""
echo "🙈 Creating .gitignore..."

cat > .gitignore <<'EOF'
node_modules/
dist/
.env
*.log
checkpoints/
checkpoints.db
.DS_Store
EOF

echo "   ✅ Created .gitignore"

echo ""
echo "✨ Scaffolding complete!"
echo ""
echo "📊 Summary:"
echo "   - 10 services created (2 apps + 8 workers)"
echo "   - 9 OpenAPI specs"
echo "   - 2 JSON schemas"
echo "   - Docker Compose + OTEL + Grafana configs"
echo "   - GitHub Actions workflows (SLSA, CodeQL, Trivy, Semgrep)"
echo "   - Dockerfiles for all services"
echo ""
echo "🚀 Next steps:"
echo "   1. Review the generated files"
echo "   2. Copy .env.example to .env and customize"
echo "   3. Run: docker-compose -f ops/dev/docker-compose.yml up -d"
echo "   4. Install dependencies: npm install"
echo "   5. Test health endpoints: curl http://localhost:8080/healthz"
echo ""
