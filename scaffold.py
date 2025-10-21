#!/usr/bin/env python3
"""
Scaffold the entire autonomous-platform project structure from delivery.md

This script extracts all code blocks marked with file paths (> `path/to/file`)
and creates the complete directory structure with all files.

Usage:
    python3 scaffold.py
"""

import re
import os
from pathlib import Path

DELIVERY_FILE = "docs/11_211025/delivery.md"
ROOT_DIR = Path(".")

def extract_code_blocks(content):
    """
    Extract all code blocks from delivery.md that have file path markers.

    Returns: List of (filepath, code) tuples
    """
    blocks = []

    # Pattern: > `path/to/file` or > Template: `path/to/file`
    # Followed by ```yaml or ```ts or ```json or ```sh
    # Then capture everything until closing ```

    pattern = r'>\s+(?:Template:\s+)?`([^`]+)`\s*\n\n```(?:\w+)?\n(.*?)```'

    matches = re.finditer(pattern, content, re.DOTALL | re.MULTILINE)

    for match in matches:
        filepath = match.group(1).strip()
        code = match.group(2).strip()
        blocks.append((filepath, code))

    return blocks

def create_directories():
    """Create the base directory structure."""
    dirs = [
        "apps/gateway/src",
        "apps/mca-orchestrator/src/graph",
        "services/planner-ra/src",
        "services/architect-aa/src",
        "services/implementer-ia/src",
        "services/runner-da/src",
        "services/security-sa/src",
        "services/quality-qa/src",
        "services/finops-fops/src",
        "services/db-layer-dba/src",
        "packages/contracts/openapi",
        "packages/contracts/schema",
        "ops/dev/grafana/provisioning",
        ".github/workflows",
    ]

    print("📁 Creating directory structure...")
    for d in dirs:
        (ROOT_DIR / d).mkdir(parents=True, exist_ok=True)
    print("   ✅ Directories created\n")

def write_file(filepath, content):
    """Write content to file, creating parent directories if needed."""
    path = ROOT_DIR / filepath
    path.parent.mkdir(parents=True, exist_ok=True)

    with open(path, 'w') as f:
        f.write(content)

    lines = len(content.splitlines())
    print(f"   ✅ {filepath} ({lines} lines)")

def create_dockerfiles():
    """Create Dockerfile for each service (not in delivery.md)."""
    print("\n🐋 Creating Dockerfiles...")

    # Gateway Dockerfile
    gateway_dockerfile = """FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src ./src
CMD ["node", "src/server.js"]
EXPOSE 8080
"""
    write_file("apps/gateway/Dockerfile", gateway_dockerfile)

    # Orchestrator Dockerfile
    orchestrator_dockerfile = """FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache sqlite
COPY package*.json ./
RUN npm ci --only=production
COPY src ./src
CMD ["node", "src/index.js"]
"""
    write_file("apps/mca-orchestrator/Dockerfile", orchestrator_dockerfile)

    # Worker services Dockerfile (all TypeScript services)
    worker_dockerfile = """FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src ./src
CMD ["node", "src/server.js"]
"""

    workers = [
        "planner-ra", "architect-aa", "implementer-ia", "runner-da",
        "security-sa", "quality-qa", "finops-fops", "db-layer-dba"
    ]

    for worker in workers:
        write_file(f"services/{worker}/Dockerfile", worker_dockerfile)

def create_tsconfig():
    """Create tsconfig.json for all TypeScript services."""
    print("\n🔧 Creating TypeScript configs...")

    tsconfig = """{
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
"""

    # Root tsconfig
    write_file("tsconfig.json", tsconfig)

    # Service tsconfigs
    services = [
        "apps/gateway",
        "apps/mca-orchestrator",
        "services/planner-ra",
        "services/architect-aa",
        "services/implementer-ia",
        "services/runner-da",
        "services/security-sa",
        "services/quality-qa",
        "services/finops-fops",
        "services/db-layer-dba",
    ]

    for service in services:
        write_file(f"{service}/tsconfig.json", tsconfig)

def create_turbo_json():
    """Create turbo.json for monorepo."""
    print("\n⚡ Creating Turborepo config...")

    turbo = """{
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
"""
    write_file("turbo.json", turbo)

def create_gitignore():
    """Create .gitignore."""
    print("\n🙈 Creating .gitignore...")

    gitignore = """node_modules/
dist/
.env
*.log
checkpoints/
checkpoints.db
.DS_Store
"""
    write_file(".gitignore", gitignore)

def main():
    print("🚀 Scaffolding autonomous-platform from delivery.md...\n")

    # Read delivery.md
    delivery_path = ROOT_DIR / DELIVERY_FILE
    if not delivery_path.exists():
        print(f"❌ Error: {DELIVERY_FILE} not found!")
        return 1

    with open(delivery_path, 'r') as f:
        content = f.read()

    # Create directories
    create_directories()

    # Extract and write all code blocks
    print("📝 Extracting files from delivery.md...")
    blocks = extract_code_blocks(content)

    print(f"   Found {len(blocks)} files to create\n")

    # Group by category for cleaner output
    categories = {
        "OpenAPI specs": [],
        "JSON schemas": [],
        "TypeScript files": [],
        "Config files": [],
        "CI/CD workflows": [],
        "Package files": [],
    }

    for filepath, code in blocks:
        if "openapi.yaml" in filepath:
            categories["OpenAPI specs"].append((filepath, code))
        elif ".json" in filepath and "schema" in filepath:
            categories["JSON schemas"].append((filepath, code))
        elif ".ts" in filepath:
            categories["TypeScript files"].append((filepath, code))
        elif "package.json" in filepath:
            categories["Package files"].append((filepath, code))
        elif ".yml" in filepath or ".yaml" in filepath:
            if ".github" in filepath:
                categories["CI/CD workflows"].append((filepath, code))
            else:
                categories["Config files"].append((filepath, code))
        else:
            categories["Config files"].append((filepath, code))

    # Write files by category
    for category, files in categories.items():
        if files:
            print(f"\n📋 {category}:")
            for filepath, code in files:
                write_file(filepath, code)

    # Create additional files not in delivery.md
    create_dockerfiles()
    create_tsconfig()
    create_turbo_json()
    create_gitignore()

    print("\n✨ Scaffolding complete!\n")
    print("📊 Summary:")
    print("   - 10 services (2 apps + 8 workers)")
    print("   - 9 OpenAPI specs")
    print("   - 2 JSON schemas")
    print("   - Docker Compose + OTEL + Grafana")
    print("   - GitHub Actions (SLSA, CodeQL, Trivy, Semgrep)")
    print("   - Dockerfiles + tsconfig + turbo.json")
    print("\n🚀 Next steps:")
    print("   1. Review generated files")
    print("   2. cp .env.example .env && edit .env")
    print("   3. docker-compose -f ops/dev/docker-compose.yml up -d")
    print("   4. npm install")
    print("   5. curl http://localhost:8080/healthz")
    print()

    return 0

if __name__ == "__main__":
    exit(main())
