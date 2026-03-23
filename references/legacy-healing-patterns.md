# Legacy Healing Patterns Reference

**Source:** Amazon AGI Lab - "How Agentic AI Helps Heal the Systems We Can't Replace" (2026), AWS Transform, and production modernization patterns.

---

## Table of Contents

1. [Codebase Archaeology](#codebase-archaeology)
2. [Friction-as-Semantics Detection](#friction-as-semantics-detection)
3. [Failure-First Learning (RL Gym Pattern)](#failure-first-learning)
4. [Universal Adapter Pattern](#universal-adapter-pattern)
5. [Incremental Healing Pipeline](#incremental-healing-pipeline)
6. [Institutional Knowledge Extraction](#institutional-knowledge-extraction)
7. [Cross-System Abstraction](#cross-system-abstraction)
8. [Behavioral Baseline Verification](#behavioral-baseline-verification)
9. [Healing Anti-Patterns](#healing-anti-patterns)

---

## Codebase Archaeology

Before modifying any legacy system, perform a structured archaeology scan to understand what you're working with.

### Dependency Archaeology

```yaml
dependency_scan:
  steps:
    1_static_analysis:
      - "Map import/require/include graphs"
      - "Identify circular dependencies"
      - "Find unused but loaded modules (may have side effects)"
      - "Detect version-pinned dependencies with known CVEs"

    2_runtime_analysis:
      - "Trace actual call paths during test execution"
      - "Identify lazy-loaded modules"
      - "Map database connection patterns"
      - "Detect implicit dependencies (env vars, config files, filesystem layout)"

    3_external_dependencies:
      - "Map all external service calls (HTTP, gRPC, SOAP, raw TCP)"
      - "Identify undocumented integrations"
      - "Find hardcoded URLs, IPs, hostnames"
      - "Map scheduled jobs and cron patterns"

  output: ".loki/healing/dependency-graph.json"
```

### Code Age Analysis

```yaml
code_age_analysis:
  purpose: "Identify ancient code that nobody touches vs actively maintained code"
  method:
    - "git log --format='%at' --diff-filter=M -- <file> | head -1"
    - "Classify files by last-modified date"
    - "Identify 'fossilized' code (unchanged 5+ years)"
    - "Flag 'radioactive' code (changed frequently, many authors, many bugs)"

  risk_matrix:
    fossilized_critical: "Unchanged 5+ years AND in critical path = highest risk"
    fossilized_peripheral: "Unchanged 5+ years, not in critical path = low priority"
    radioactive: "Changed frequently with many bugs = needs healing first"
    stable_maintained: "Regularly updated, low bug rate = leave alone"
```

### Comment Archaeology

Legacy systems encode business rules in comments. These comments are institutional knowledge.

```yaml
comment_patterns:
  high_value:
    - pattern: "hack|workaround|kludge|temporary"
      meaning: "Encodes a constraint that forced a non-obvious solution"
    - pattern: "don't touch|do not modify|fragile"
      meaning: "Previous developer knew something dangerous about this code"
    - pattern: "per .* requirement|compliance|regulation"
      meaning: "Business/legal rule encoded in code"
    - pattern: "see ticket|see bug|see issue"
      meaning: "Historical context available in issue tracker"

  extraction_command: |
    grep -rn "TODO\|HACK\|FIXME\|XXX\|WORKAROUND\|don't touch\|do not modify" \
      --include="*.py" --include="*.java" --include="*.js" --include="*.ts" \
      --include="*.rb" --include="*.php" --include="*.go" --include="*.rs" \
      --include="*.cbl" --include="*.cob" --include="*.f" --include="*.f90" \
      ./src/
```

---

## Friction-as-Semantics Detection

**Key insight from Amazon AGI Lab:** "The logic behind legacy systems reveals itself most clearly through friction."

### What Counts as Friction

| Category | Examples | Usually a Bug? |
|----------|---------|----------------|
| **Timing** | Sleep/wait before operations, delayed responses | Often a business rule (rate limiting, sequencing) |
| **Ordering** | Fields that must be filled in specific order | Almost always a business rule |
| **Validation** | Rejections with cryptic error codes | Business rule encoded in validation |
| **Side Effects** | Actions that trigger unexpected updates elsewhere | Cross-system dependency |
| **Retry Logic** | Automatic retries with specific backoff | Compensating for known infrastructure issue |
| **Format Quirks** | Date formats, number formatting, encoding | Interoperability requirement with another system |
| **Magic Values** | Hardcoded numbers, special string values | Business thresholds, status codes |
| **Dead Code** | Functions that appear unused | May be called dynamically or by external systems |

### Detection Protocol

```yaml
friction_detection:
  automated:
    - "Find all sleep/wait/delay calls and document their purpose"
    - "Find all hardcoded numeric values and trace their origin"
    - "Find all try/catch blocks that swallow errors silently"
    - "Find all retry loops and document what they compensate for"
    - "Find all TODO/HACK/FIXME comments"

  manual_verification:
    for_each_friction:
      1: "Can you remove it without breaking a test?"
      2: "Can you remove it without breaking an integration?"
      3: "Does git blame show it was added to fix a specific bug?"
      4: "Is there a comment explaining why it exists?"
      5: "Does the original author still work here? Ask them."

  classification:
    business_rule: "Keep and document"
    true_bug: "Fix with characterization test"
    unknown: "Keep until classified. NEVER remove unknown friction."
```

---

## Failure-First Learning

**Key insight:** "The hardest part of training an AI agent is not teaching it what a successful workflow looks like; it's teaching it why workflows fail."

### RL Gym Pattern (Adapted for Loki)

Amazon AGI Lab trains agents in synthetic environments called RL gyms that reproduce the quirks and failure modes of real systems. Loki adapts this concept:

```yaml
failure_gym:
  purpose: "Learn system behavior by provoking and cataloging failures"

  protocol:
    1_happy_path:
      - "Run all existing tests -- record pass/fail baseline"
      - "Execute all documented workflows end-to-end"
      - "Record all outputs as behavioral baseline"

    2_boundary_probing:
      - "Send null/empty/max-length inputs to all entry points"
      - "Test with invalid dates, negative numbers, special characters"
      - "Test concurrent access patterns"
      - "Test with slow/failing network connections"

    3_state_corruption:
      - "Kill processes mid-transaction"
      - "Corrupt database state intentionally"
      - "Remove expected files/directories"
      - "Exhaust disk space / memory"

    4_dependency_failure:
      - "Disconnect external services one at a time"
      - "Introduce latency to database connections"
      - "Return unexpected responses from APIs"
      - "Expire authentication tokens mid-session"

  output:
    for_each_failure:
      - "trigger: What caused the failure"
      - "behavior: How the system responded"
      - "recovery: Did it recover? How?"
      - "data_impact: Was data corrupted?"
      - "user_impact: What would the user see?"
      - "characterization_test: Test that reproduces this"
```

### Failure Memory Storage

```yaml
failure_memory:
  episodic:
    location: ".loki/memory/episodic/"
    entry_type: "failure_trace"
    fields:
      - failure_id
      - system_component
      - trigger_action
      - observed_behavior
      - expected_behavior
      - root_cause_analysis
      - recovery_path
      - characterization_test_id

  semantic:
    location: ".loki/memory/semantic/anti-patterns.json"
    consolidation: "After 3+ similar failures, extract pattern"
    example_pattern: |
      {
        "pattern": "silent_error_swallowing",
        "description": "Legacy Java services catch Exception and return empty response",
        "affected_languages": ["java", "php"],
        "detection": "grep -rn 'catch.*Exception.*\\{\\s*\\}' --include='*.java'",
        "healing": "Replace with explicit error response and logging",
        "risk": "May break callers that check for empty response as 'no error'"
      }
```

---

## Universal Adapter Pattern

**Key insight from Amazon:** "By managing the idiosyncrasies of legacy systems behind the scenes, the agent effectively becomes a universal API."

### Adapter Architecture

```
+-------------------+
|  Modern Consumers |  REST/GraphQL/gRPC
+--------+----------+
         |
+--------v----------+
|   Adapter Layer    |  Clean types, error normalization, retries
+--------+----------+
         |
+--------v----------+
| Translation Layer  |  Format conversion, protocol bridging
+--------+----------+
         |
+--------v----------+
|   Legacy System    |  COBOL, SOAP, mainframe, raw SQL
+-------------------+
```

### Adapter Requirements

```yaml
adapter_requirements:
  behavioral_fidelity:
    - "Adapter MUST reproduce all legacy behaviors, including quirks"
    - "Adapter MUST preserve error semantics (same errors for same inputs)"
    - "Adapter MUST handle all timing-dependent behaviors"
    - "Adapter MUST NOT add new behaviors not present in legacy system"

  testing:
    - "Every legacy endpoint has a characterization test"
    - "Adapter output is compared byte-for-byte with legacy output"
    - "Adapter error responses match legacy error responses"
    - "Performance characteristics are documented and monitored"

  documentation:
    - "Every translation rule is documented"
    - "Every quirk that the adapter absorbs is documented"
    - "Mapping between modern API and legacy calls is explicit"
```

### Cross-System Bridge

When agents reason about workflow rather than application, they can bridge systems never designed to interoperate:

```yaml
cross_system_bridge:
  pattern:
    1_map_systems:
      - "Map data models of both systems"
      - "Identify semantic overlaps (same concept, different names)"
      - "Identify gaps (concept exists in one but not the other)"
      - "Map lifecycle states between systems"

    2_build_bridge:
      - "Create canonical data model that spans both systems"
      - "Implement bidirectional translation"
      - "Handle conflict resolution (which system is authoritative?)"
      - "Add reconciliation checks"

    3_verify_bridge:
      - "End-to-end tests across both systems"
      - "Drift detection (systems diverging over time)"
      - "Error propagation tests (failure in one, how does other respond?)"
```

---

## Incremental Healing Pipeline

### Phase Gates for Healing

Each healing phase has deterministic gates (shell-level, not LLM):

```yaml
healing_phase_gates:
  archaeology_to_stabilize:
    required:
      - "friction-map.json exists with >0 entries"
      - "failure-modes.json exists"
      - "institutional-knowledge.md has >0 rules"
      - "All critical paths have characterization tests"
      - "Characterization tests pass at 100%"

  stabilize_to_isolate:
    required:
      - "All characterization tests still pass"
      - "No new static analysis warnings introduced"
      - "Logging/observability added to critical paths"
      - "Configuration extracted from hardcoded values"

  isolate_to_modernize:
    required:
      - "Component boundaries defined in architecture doc"
      - "Adapter interfaces created at boundaries"
      - "Components can be tested independently"
      - "Integration tests cover adapter boundaries"

  modernize_to_validate:
    required:
      - "Replacement component passes original characterization tests"
      - "Adapter layer handles all translation correctly"
      - "Performance within acceptable bounds"
      - "No institutional knowledge lost"
```

### Rollback Safety

```yaml
rollback_protocol:
  before_each_change:
    - "Create git checkpoint: loki checkpoint create healing-{component}-{phase}"
    - "Snapshot behavioral baseline outputs"
    - "Record all environment state"

  on_healing_failure:
    - "Restore from last checkpoint"
    - "Record failure in episodic memory"
    - "Update failure-modes.json with new mode"
    - "Write characterization test for the failure"
    - "Resume from REASON phase with new knowledge"
```

---

## Institutional Knowledge Extraction

### Knowledge Sources Priority

| Source | Value | Method |
|--------|-------|--------|
| Code comments | High | Regex scan for patterns (hack, workaround, don't touch) |
| Git blame history | High | Map code age, author patterns, commit message analysis |
| Error messages | Medium | User-facing errors often encode business rules |
| Test fixtures | Medium | Expected values encode business expectations |
| Configuration | Medium | Magic numbers, thresholds, feature flags |
| Dead code | Low-Medium | May contain removed-but-relevant business logic |
| Documentation | Variable | Often outdated, but useful as starting point |

### Extraction Output Format

```markdown
## Business Rule: Invoice Grace Period

**Location:** src/billing/grace_period.py:45-67
**Confidence:** High (explicit comment + test)
**Source:** Code comment: "Per CFO directive 2019-Q3, 15-day grace for enterprise clients"
**Git Blame:** Added by jsmith on 2019-10-14 (commit a1b2c3d)
**Test:** tests/billing/test_grace.py::test_enterprise_15_day_grace
**Dependencies:** Called by: invoice_reminder_job, late_fee_calculator
**Risk if Removed:** Enterprise clients charged late fees immediately. Finance team escalation.
```

---

## Behavioral Baseline Verification

### Pre-Healing Baseline

Before ANY code changes, capture a behavioral baseline:

```yaml
baseline_capture:
  for_each_component:
    - "Run all related tests, capture outputs"
    - "Execute documented workflows, capture responses"
    - "Query all API endpoints with known inputs, capture responses"
    - "Run batch jobs, capture outputs"
    - "Capture database state after operations"

  storage: ".loki/healing/behavioral-baseline/{component}/"
  format:
    - "inputs.json: All test inputs"
    - "outputs.json: All captured outputs"
    - "errors.json: All error responses"
    - "timing.json: Response time measurements"
    - "side-effects.json: Database changes, file writes, external calls"
```

### Post-Healing Verification

```yaml
baseline_comparison:
  strict_mode:
    - "Compare outputs byte-for-byte"
    - "Any difference = BLOCK until explained"
    - "Explained differences must be documented as intentional"

  relaxed_mode:
    - "Compare semantic equivalence (JSON field comparison)"
    - "Allow timing differences within 2x"
    - "Allow format differences if adapter handles translation"
    - "Flag removed functionality"
```

---

## Healing Anti-Patterns

| Anti-Pattern | Why It Fails | What to Do Instead |
|-------------|-------------|-------------------|
| **Big Bang Rewrite** | "Let's rewrite it in Rust/Go/TypeScript" destroys institutional knowledge | Incremental healing, one component at a time |
| **Premature Optimization** | "This SQL is slow, let me rewrite it" without understanding why it's structured that way | Characterize first, optimize after understanding |
| **Comment Deletion** | "Clean up comments" removes institutional knowledge | Extract to institutional-knowledge.md first |
| **Test Deletion** | "These tests are weird/slow" -- they capture critical behaviors | Keep ALL legacy tests until characterization is complete |
| **Ignoring Dead Code** | "Remove unused functions" -- they may be called dynamically | Verify with runtime analysis before removing |
| **Fixing Quirks** | "This sleep(2) is unnecessary" -- it may prevent a race condition | Classify friction first, fix only confirmed bugs |
| **Over-Abstracting** | "Let's add a clean architecture layer" adds complexity without healing | Adapt at component boundaries only |
| **Skipping Archaeology** | "I can see what this does" -- you see structure, not semantics | Always run archaeology before modification |

---

## Language-Specific Healing Guides

### COBOL / Mainframe

```yaml
cobol_healing:
  key_patterns:
    - "COPYBOOK files define shared data structures"
    - "PARAGRAPH names encode business process steps"
    - "WORKING-STORAGE contains state"
    - "88-level conditions are enum-like business rules"
    - "PERFORM THRU defines transaction boundaries"

  characterization:
    - "Capture JCL job outputs as baseline"
    - "Map COPYBOOK usage across programs"
    - "Document SORT/MERGE operations (often encode business ordering)"
    - "Trace CALL/EXEC CICS chains"
```

### Legacy Java (Pre-8)

```yaml
legacy_java_healing:
  key_patterns:
    - "XML configuration (Spring XML, Hibernate HBM) encodes wiring"
    - "EJB session beans may have transaction semantics"
    - "Servlet filters chain ordering matters"
    - "JNDI lookups encode deployment dependencies"

  characterization:
    - "Map all XML bean definitions"
    - "Trace transaction boundaries"
    - "Document filter chain ordering"
    - "Identify ThreadLocal usage (hidden state)"
```

### Legacy PHP (Pre-7)

```yaml
legacy_php_healing:
  key_patterns:
    - "register_globals behavior (variables from URL params)"
    - "mysql_* functions (deprecated, SQL injection risk)"
    - "include/require with variable paths (dynamic loading)"
    - "Session handling with custom save handlers"

  characterization:
    - "Find all superglobal access ($_GET, $_POST, $_SESSION)"
    - "Map include/require chains"
    - "Identify SQL queries built with string concatenation"
    - "Document session lifecycle"
```

### Legacy Python (2.x)

```yaml
legacy_python_healing:
  key_patterns:
    - "print as statement vs function"
    - "unicode/str confusion"
    - "Integer division behavior"
    - "Old-style classes"
    - "except Exception, e syntax"

  characterization:
    - "Run 2to3 in report mode (don't apply)"
    - "Test with both Python 2 and 3 to find divergences"
    - "Map all string/bytes handling"
    - "Document any monkey-patching"
```
