# Legacy System Healing

**Inspired by:** Amazon AGI Lab's "How Agentic AI Helps Heal the Systems We Can't Replace" (2026)

**Core insight:** Don't replace legacy systems. Heal them. Learn their real behaviors -- the quirks, delays, error states, and invisible dependencies -- then modernize incrementally while preserving institutional logic.

---

## When to Load This Module

- `loki heal` command invoked
- Working with legacy codebases (COBOL, FORTRAN, old Java, PHP 5, Python 2, jQuery-era JS)
- Brownfield modernization projects
- `--target` flag used with `loki migrate`
- Codebase archaeology / knowledge extraction tasks

---

## The 5 Healing Principles

### 1. Friction is Semantics

System quirks are not bugs. They are the real behavior.

```yaml
friction_detection:
  examples:
    - "The modal that appears late encodes a sequencing rule"
    - "The field that refuses input until another value is saved"
    - "The form that resets because a backend job restarted midflow"
  rule: "Before 'fixing' any quirk, verify it is not an undocumented business rule"
  action: "Document in .loki/healing/friction-map.json"
```

**Friction Map Schema:**
```json
{
  "frictions": [
    {
      "id": "friction-001",
      "location": "src/billing/invoice.py:234",
      "behavior": "Sleep 2s before committing transaction",
      "classification": "business_rule|true_bug|unknown",
      "evidence": "Prevents race condition with external payment gateway callback",
      "discovered_by": "archaeology_scan",
      "timestamp": "2026-01-25T10:00:00Z",
      "safe_to_remove": false
    }
  ]
}
```

### 2. Learn Through Failure

The hardest part is not teaching what success looks like; it's teaching why workflows fail.

```yaml
failure_first_learning:
  protocol:
    1_characterize: "Run existing tests, note ALL failures and warnings"
    2_provoke: "Deliberately trigger edge cases and error paths"
    3_document: "Record failure modes in .loki/healing/failure-modes.json"
    4_preserve: "Write characterization tests that capture current behavior"
    5_learn: "Store failure patterns in episodic memory for future sessions"

  failure_modes_schema:
    location: ".loki/healing/failure-modes.json"
    fields:
      - mode_id: "Unique identifier"
      - trigger: "What causes the failure"
      - behavior: "What happens when it fails"
      - recovery: "How the system currently recovers"
      - is_intentional: "boolean - failure by design?"
      - test_id: "Characterization test that captures this mode"
```

### 3. Universal Adapter Pattern

The agent becomes a stable programmatic surface over infrastructure that can't be changed.

```yaml
universal_adapter:
  purpose: "Create abstraction layers that turn legacy APIs into modern interfaces"
  pattern:
    1_observe: "Map all entry points, outputs, side effects of legacy system"
    2_abstract: "Design clean interface that hides legacy complexity"
    3_implement: "Build adapter layer with full error handling"
    4_verify: "Ensure adapter produces identical outputs to direct legacy calls"

  adapter_structure:
    modern_api: "Clean REST/GraphQL/gRPC interface"
    translation_layer: "Maps modern calls to legacy formats"
    legacy_system: "Untouched original system"
    error_normalization: "Converts legacy errors to standard error codes"
    behavior_preservation: "Adapter must reproduce ALL legacy behaviors, including quirks"
```

### 4. Incremental Healing

Update components gradually without breaking workflows. The agent absorbs transitional fragility.

```yaml
incremental_healing:
  phases:
    1_archaeology:
      name: "Codebase Archaeology"
      actions:
        - "Map dependency graph (internal + external)"
        - "Identify knowledge holders and undocumented rules"
        - "Catalog all friction points"
        - "Write characterization tests for current behavior"
      gate: "100% of critical paths have characterization tests"

    2_stabilize:
      name: "Stabilize"
      actions:
        - "Add missing error handling without changing behavior"
        - "Add logging/observability without changing behavior"
        - "Extract configuration from hardcoded values"
        - "Add type annotations/hints where possible"
      gate: "All characterization tests still pass"

    3_isolate:
      name: "Isolate Components"
      actions:
        - "Identify component boundaries"
        - "Create adapter interfaces at boundaries"
        - "Reduce coupling between components"
        - "Add integration tests at adapter boundaries"
      gate: "Components can be tested independently"

    4_modernize:
      name: "Modernize Incrementally"
      actions:
        - "Replace ONE component at a time behind its adapter"
        - "Run characterization tests after each replacement"
        - "Verify friction behaviors are preserved (or explicitly removed)"
        - "Update adapter if new component has different interface"
      gate: "Characterization tests pass + new component tests pass"

    5_validate:
      name: "Validate Healing"
      actions:
        - "Run full regression suite"
        - "Compare outputs with pre-healing baseline"
        - "Verify no institutional logic was lost"
        - "Generate healing report"
      gate: "100% behavioral equivalence OR documented intentional changes"
```

### 5. Preserve Institutional Logic

Operational knowledge is often stored only in human memory. Extract it before it's lost.

```yaml
knowledge_extraction:
  sources:
    - "Code comments (especially apologetic ones: 'hack', 'workaround', 'don't touch')"
    - "Git blame history (who wrote it, when, why)"
    - "Dead code (may contain business rules removed by mistake)"
    - "Configuration files (magic numbers, thresholds)"
    - "Error messages (often encode business rules)"
    - "Test fixtures (encode expected behaviors)"

  output: ".loki/healing/institutional-knowledge.md"
  format: |
    ## Institutional Knowledge Registry

    ### Business Rules (Extracted from Code)
    | Rule | Location | Evidence | Confidence |
    |------|----------|----------|------------|

    ### Undocumented Dependencies
    | System A | System B | Nature | Risk if Broken |
    |----------|----------|--------|----------------|

    ### Tribal Knowledge (From Comments/History)
    | Knowledge | Source | Last Verified |
    |-----------|--------|---------------|
```

---

## Healing RARV Cycle

The standard RARV cycle is adapted for healing work:

```
REASON: What is the riskiest undocumented behavior?
   |
   v
ACT: Write a characterization test that captures it.
   |
   v
REFLECT: Does the test capture the ACTUAL behavior, not the INTENDED behavior?
   |
   v
VERIFY: Run the test. If it passes, the behavior is documented.
         If it fails, you misunderstood the system -- investigate.
   |
   +--[PASS]--> Store friction point in healing memory.
   |            Move to next undocumented behavior.
   |
   +--[FAIL]--> You learned something. Update your model of the system.
                This failure IS the learning. Store in episodic memory.
```

---

## Healing-Specific Code Review

When `loki heal` is active, the code review specialist pool includes:

| Specialist | Focus | Trigger Keywords |
|-----------|-------|-----------------|
| **legacy-healing-auditor** | Behavioral preservation, friction safety, institutional knowledge | legacy, heal, migrate, cobol, fortran, refactor, modernize, deprecat |

**Legacy Healing Auditor checks:**
- Behavioral change without characterization test update
- Removal of "quirky" code without friction map check
- Missing adapter layer for replaced components
- Institutional knowledge loss (deleted comments, removed error messages)
- Breaking changes to undocumented APIs consumed by other systems

---

## Healing Metrics

```
.loki/healing/
  friction-map.json              # All identified friction points
  failure-modes.json             # Cataloged failure modes
  institutional-knowledge.md     # Extracted tribal knowledge
  healing-progress.json          # Component-by-component healing status
  behavioral-baseline/           # Pre-healing output snapshots
  characterization-tests/        # Tests that capture current behavior
```

**Progress Tracking:**
```json
{
  "codebase": "./src",
  "started": "2026-01-25T10:00:00Z",
  "components": [
    {
      "name": "billing/invoice",
      "phase": "stabilize",
      "friction_points": 12,
      "friction_resolved": 3,
      "characterization_tests": 47,
      "characterization_passing": 47,
      "institutional_rules_extracted": 8,
      "health_score": 0.65
    }
  ],
  "overall_health": 0.42
}
```

---

## Healing Signals

| Signal | Purpose | Emitted When |
|--------|---------|-------------|
| `FRICTION_DETECTED` | New friction point found | Archaeology scan finds quirky behavior |
| `BEHAVIOR_CHANGE_RISK` | Proposed change may alter legacy behavior | Code review detects behavioral modification |
| `INSTITUTIONAL_KNOWLEDGE_FOUND` | Tribal knowledge extracted from code | Comment/history analysis reveals business rule |
| `HEALING_PHASE_COMPLETE` | Component completed a healing phase | Phase gate passed |
| `LEGACY_COMPATIBILITY_RISK` | Breaking change to legacy API detected | Adapter verification fails |

---

## Integration with Memory System

Healing operations generate specialized memory entries:

**Episodic (per-session):**
- Friction points discovered in this session
- Failure modes encountered during characterization
- Adapter implementations attempted (success/failure)

**Semantic (cross-session patterns):**
- "COBOL date fields always use YYMMDD format"
- "Legacy Java services expect XML, not JSON"
- "Old PHP systems rely on register_globals behavior"

**Procedural (reusable skills):**
- "How to write COBOL characterization tests"
- "How to build adapters for SOAP services"
- "How to extract business rules from stored procedures"

---

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `LOKI_HEAL_MODE` | `false` | Enable healing mode |
| `LOKI_HEAL_PHASE` | `archaeology` | Current healing phase |
| `LOKI_HEAL_PRESERVE_FRICTION` | `true` | Warn before removing friction points |
| `LOKI_HEAL_BASELINE_DIR` | `.loki/healing/behavioral-baseline/` | Pre-healing snapshots |
| `LOKI_HEAL_STRICT` | `false` | Block ALL behavioral changes without explicit approval |

---

## Quick Reference

```bash
# Start healing a legacy codebase
loki heal ./legacy-app

# Archaeology only (extract knowledge, don't modify)
loki heal ./legacy-app --phase archaeology

# Resume healing from last checkpoint
loki heal ./legacy-app --resume

# View healing progress
loki heal --status

# Generate healing report
loki heal --report

# Strict mode: block any behavioral change without approval
LOKI_HEAL_STRICT=true loki heal ./legacy-app
```
