package repo

default allow := true

# Monorepo microservices required
deny contains msg if {
  not input.has_packages_dir
  msg := "Missing packages/* (monorepo microservices required)"
}

# Vendor lock: OpenAI-only in V1 (Anthropic forbidden)
deny contains msg if {
  some svc
  input.dependencies[svc].hasAnthropic
  msg := sprintf("Forbidden dependency: Anthropic SDK in %s", [svc])
}

# Evidence: coverage must exist
deny contains msg if {
  not input.evidence.coverage_final_json
  msg := "Missing evidence: coverage/coverage-final.json"
}

# Evidence: SBOM must exist
deny contains msg if {
  not input.evidence.sbom_json
  msg := "Missing evidence: .automation/evidence/compliance/sbom.json"
}

# Contracts-before-implementation (toggleable)
deny contains msg if {
  input.require_openapi_contracts == true
  count(input.openapi_specs) == 0
  msg := "Contracts-before-implementation: no OpenAPI specs found"
}

