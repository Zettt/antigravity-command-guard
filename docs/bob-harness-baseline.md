# Bob Harness Baseline Analysis

Date: 2026-10-04
Target: antigravity-command-guard (v0.2.0)
Commit Baseline: b36dcbb

## 1. Executive Summary

This document establishes the architectural and quality baseline for `antigravity-command-guard` evaluated under Uncle Bob Martin's 5-stage engineering harness: Specifier, Coder, Cleaner, Hardener, and QA.

### Repository Quantitative Metrics
- Source Files: 13 TypeScript modules in `src/` (1,496 lines of code)
- Test Files: 11 test suites in `tests/` (1,771 lines of code)
- Test-to-Source Ratio: 1.18 : 1.00
- Test Suite Results: 100 passed, 0 failed (210ms execution time on Bun)
- Production Dependencies: 0 external packages
- Production Bundle: 31.38 KB (`dist/index.js`)

---

## 2. Five-Stage Harness Evaluation

### Stage 1: Specifier (Test Specifications & TDD Seams)
- **Current State**: Strong unit and integration test coverage across public APIs (`handlePreToolUse`, `evaluateRiskTier`, `isFastPathAllowed`, `findBlockedToken`).
- **Gaps Identified**:
  - `splitCommandChain`: Lacks explicit test specifications for command substitution syntax (`$(...)`, backticks) and nested operators.
  - `writeAuditLog`: Lacks explicit test cases for filesystem error propagation and permission exceptions during log rotation.
  - `evaluateSettingsPermission`: Lacks negative test coverage for path traversal tokens inside command rule specifications.

### Stage 2: Coder (Implementation Minimality)
- **Current State**: Code is compact and utilizes native Bun/Node compatibility APIs without third-party runtime dependencies.
- **Observations**:
  - Empty input handling is checked in both `src/index.ts` and `src/handler.ts`.
  - Fallback logic in `src/handler.ts` binds default filesystem implementations directly when dependency injection arguments are omitted.

### Stage 3: Cleaner (Clean Architecture Layer Boundaries)
Concentric layers defined:
- **Entities (Core Business Rules)**: `src/types.ts`, `src/policy.ts`, `src/blocklist.ts`
- **Use Cases (Application Logic)**: `src/handler.ts`, `src/fs-guard.ts`, `src/fast-path.ts`
- **Interface Adapters**: `src/jev.ts`, `src/settings.ts`, `src/config.ts`, `src/audit.ts`, `src/context.ts`
- **Frameworks & Drivers**: `src/index.ts`

**Boundary Inversions Identified**:
1. `src/handler.ts` (Use Case) directly imports `writeAuditLog` from `src/audit.ts` (I/O Adapter/Driver).
2. `src/handler.ts` (Use Case) directly imports `loadDefaultSettings` from `src/settings.ts` (Filesystem reader).
3. `src/fs-guard.ts` imports `formatBadge` from `src/policy.ts`, coupling domain policy to output display string formatting.

### Stage 4: Hardener (Cyclomatic Complexity & CRAP Audit)
Target Metric: $\text{CRAP}(m) = \text{comp}(m)^2 \times (1 - \text{cov}(m))^3 + \text{comp}(m) \le 8.0$.
Functions where $\text{comp}(m) > 8$ inherently exceed the $\le 8.0$ ceiling even under 100% coverage because $\text{CRAP}(m) \ge \text{comp}(m)$.

**High Complexity Functions Requiring Decomposition**:
- `handlePreToolUse` in `src/handler.ts`: Cyclomatic Complexity = 26 (CRAP $\ge 26.0$)
- `splitCommandChain` in `src/blocklist.ts`: Cyclomatic Complexity = 18 (CRAP $\ge 18.0$)
- `findBlockedToken` in `src/blocklist.ts`: Cyclomatic Complexity = 14 (CRAP $\ge 14.0$)
- `evaluateSettingsPermission` in `src/settings.ts`: Cyclomatic Complexity = 12 (CRAP $\ge 12.0$)
- `evaluateRiskTier` in `src/policy.ts`: Cyclomatic Complexity = 10 (CRAP $\ge 10.0$)

### Stage 5: QA (Gatekeeping & Release Manifest)
- Test suite passing: 100/100 tests.
- Bundle generation passing: `bun run build` successful.
- Missing Artifacts: `stage-manifest.json` does not exist in repository root.

---

## 3. Remediation Roadmap

1. **Specifier**: Author tests for edge-case syntax, log rotation errors, and settings matching.
2. **Cleaner**: Enforce dependency inversion in `src/handler.ts` for audit and settings services. Decouple badge presentation from core policy.
3. **Hardener**: Refactor functions with complexity $> 8$ into modular sub-functions with complexity $\le 8$.
4. **QA**: Validate full test suite, bundle integrity, and output `stage-manifest.json`.
