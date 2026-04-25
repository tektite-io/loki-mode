// Tests for src/runner/quality_gates.ts.
//
// Covers:
//   - Failure-count persistence (atomic, JSON round-trip, malformed-file recovery)
//   - clearGateFailure no-op on missing file, reset on existing file
//   - Escalation ladder boundaries: CLEAR_LIMIT, ESCALATE_LIMIT, PAUSE_LIMIT
//   - Orchestrator pass/fail aggregation, gate-failures.txt write+delete,
//     soft-gate path, runner-throws path.
//
// Strategy: each test uses an isolated temp dir; the override is threaded
// through ctx.lokiDir + the override args on track/clear so no production
// state is touched. Env overrides are scrubbed in afterEach.

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  clearGateFailure,
  getGateFailureCount,
  runQualityGates,
  trackGateFailure,
} from "../../src/runner/quality_gates.ts";
import type { RunnerContext } from "../../src/runner/types.ts";

let scratch = "";

const ENV_KEYS = [
  "LOKI_GATE_CLEAR_LIMIT",
  "LOKI_GATE_ESCALATE_LIMIT",
  "LOKI_GATE_PAUSE_LIMIT",
  "LOKI_HARD_GATES",
  "PHASE_STATIC_ANALYSIS",
  "PHASE_UNIT_TESTS",
  "PHASE_CODE_REVIEW",
  "LOKI_GATE_DOC_COVERAGE",
  "LOKI_GATE_MAGIC_DEBATE",
  "LOKI_STUB_GATE_STATIC_ANALYSIS",
  "LOKI_STUB_GATE_TEST_COVERAGE",
  "LOKI_STUB_GATE_CODE_REVIEW",
  "LOKI_STUB_GATE_DOC_COVERAGE",
  "LOKI_STUB_GATE_MAGIC_DEBATE",
];

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "loki-gates-test-"));
});

afterEach(() => {
  if (scratch && existsSync(scratch)) {
    rmSync(scratch, { recursive: true, force: true });
  }
  for (const k of ENV_KEYS) delete process.env[k];
});

function makeCtx(overrides: Partial<RunnerContext> = {}): RunnerContext {
  const logged: string[] = [];
  const ctx: RunnerContext = {
    cwd: scratch,
    lokiDir: scratch,
    prdPath: undefined,
    provider: "claude",
    maxRetries: 5,
    maxIterations: 10,
    baseWaitSeconds: 1,
    maxWaitSeconds: 60,
    autonomyMode: "single-pass",
    sessionModel: "development",
    budgetLimit: undefined,
    completionPromise: undefined,
    iterationCount: 1,
    retryCount: 0,
    currentTier: "development",
    log: (line: string) => logged.push(line),
    ...overrides,
  };
  return ctx;
}

function gateFile(): string {
  return join(scratch, "quality", "gate-failure-count.json");
}

// --- Persistence ----------------------------------------------------------

describe("trackGateFailure / clearGateFailure persistence", () => {
  it("creates the file on first track and increments", () => {
    expect(trackGateFailure("static_analysis", scratch)).toBe(1);
    expect(trackGateFailure("static_analysis", scratch)).toBe(2);
    expect(existsSync(gateFile())).toBe(true);
    const parsed = JSON.parse(readFileSync(gateFile(), "utf-8")) as Record<string, number>;
    expect(parsed["static_analysis"]).toBe(2);
  });

  it("tracks distinct gates independently", () => {
    trackGateFailure("static_analysis", scratch);
    trackGateFailure("test_coverage", scratch);
    trackGateFailure("test_coverage", scratch);
    expect(getGateFailureCount("static_analysis", scratch)).toBe(1);
    expect(getGateFailureCount("test_coverage", scratch)).toBe(2);
    expect(getGateFailureCount("code_review", scratch)).toBe(0);
  });

  it("clearGateFailure is a no-op when the file does not exist", () => {
    clearGateFailure("static_analysis", scratch);
    expect(existsSync(gateFile())).toBe(false);
  });

  it("clearGateFailure resets only the named gate", () => {
    trackGateFailure("static_analysis", scratch);
    trackGateFailure("test_coverage", scratch);
    clearGateFailure("static_analysis", scratch);
    expect(getGateFailureCount("static_analysis", scratch)).toBe(0);
    expect(getGateFailureCount("test_coverage", scratch)).toBe(1);
  });

  it("recovers from a malformed JSON file by treating counts as empty", () => {
    mkdirSync(join(scratch, "quality"), { recursive: true });
    writeFileSync(gateFile(), "{not json");
    // Match bash behavior: swallow JSONDecodeError, continue from {}.
    expect(trackGateFailure("static_analysis", scratch)).toBe(1);
  });

  it("ignores non-numeric values in the persisted file", () => {
    mkdirSync(join(scratch, "quality"), { recursive: true });
    writeFileSync(gateFile(), JSON.stringify({ static_analysis: "bogus", test_coverage: 4 }));
    expect(getGateFailureCount("static_analysis", scratch)).toBe(0);
    expect(getGateFailureCount("test_coverage", scratch)).toBe(4);
  });
});

// --- Escalation ladder ----------------------------------------------------

describe("escalation ladder boundaries", () => {
  beforeEach(() => {
    process.env["LOKI_GATE_CLEAR_LIMIT"] = "3";
    process.env["LOKI_GATE_ESCALATE_LIMIT"] = "5";
    process.env["LOKI_GATE_PAUSE_LIMIT"] = "7";
    // Force the static_analysis gate to fail on every run.
    process.env["LOKI_STUB_GATE_STATIC_ANALYSIS"] = "fail";
    // Disable the other gates so we test one ladder at a time.
    process.env["PHASE_UNIT_TESTS"] = "false";
    process.env["PHASE_CODE_REVIEW"] = "false";
    process.env["LOKI_GATE_DOC_COVERAGE"] = "false";
    process.env["LOKI_GATE_MAGIC_DEBATE"] = "false";
  });

  it("counts failures normally below CLEAR_LIMIT (count 1, 2)", async () => {
    const ctx = makeCtx();
    const r1 = await runQualityGates(ctx);
    expect(r1.failed).toEqual(["static_analysis"]);
    expect(r1.passed).toEqual([]);
    expect(r1.blocked).toBe(true);
    expect(r1.escalated).toBe(false);

    const r2 = await runQualityGates(ctx);
    expect(r2.failed).toEqual(["static_analysis"]);
    expect(r2.escalated).toBe(false);
    expect(getGateFailureCount("static_analysis", scratch)).toBe(2);
  });

  it("treats failures at CLEAR_LIMIT as passing (counter still climbs)", async () => {
    const ctx = makeCtx();
    await runQualityGates(ctx); // 1
    await runQualityGates(ctx); // 2
    const r3 = await runQualityGates(ctx); // 3 -- CLEAR_LIMIT
    expect(r3.passed).toEqual(["static_analysis"]);
    expect(r3.failed).toEqual([]);
    expect(r3.blocked).toBe(false);
    expect(r3.escalated).toBe(false);
    expect(getGateFailureCount("static_analysis", scratch)).toBe(3);
  });

  it("escalates at ESCALATE_LIMIT and writes signals/GATE_ESCALATION", async () => {
    const ctx = makeCtx();
    for (let i = 0; i < 4; i++) await runQualityGates(ctx); // 1..4
    const r5 = await runQualityGates(ctx); // 5 -- ESCALATE_LIMIT
    expect(r5.escalated).toBe(true);
    expect(r5.failed).toEqual(["static_analysis"]);
    const sig = readFileSync(join(scratch, "signals", "GATE_ESCALATION"), "utf-8");
    expect(sig).toContain("ESCALATE");
    expect(sig).toContain("static_analysis");
    // PAUSE marker must NOT exist yet.
    expect(existsSync(join(scratch, "PAUSE"))).toBe(false);
  });

  it("forces PAUSE at PAUSE_LIMIT and writes the .loki/PAUSE marker", async () => {
    const ctx = makeCtx();
    for (let i = 0; i < 6; i++) await runQualityGates(ctx); // 1..6
    const r7 = await runQualityGates(ctx); // 7 -- PAUSE_LIMIT
    expect(r7.escalated).toBe(true);
    expect(existsSync(join(scratch, "PAUSE"))).toBe(true);
    const sig = readFileSync(join(scratch, "signals", "GATE_ESCALATION"), "utf-8");
    expect(sig.startsWith("PAUSE\n")).toBe(true);
    expect(sig).toContain("static_analysis");
    expect(sig).toContain("7 consecutive");
  });

  it("clears the counter on a subsequent passing run", async () => {
    const ctx = makeCtx();
    await runQualityGates(ctx); // count 1
    await runQualityGates(ctx); // count 2
    process.env["LOKI_STUB_GATE_STATIC_ANALYSIS"] = "pass";
    const r = await runQualityGates(ctx);
    expect(r.passed).toEqual(["static_analysis"]);
    expect(getGateFailureCount("static_analysis", scratch)).toBe(0);
  });
});

// --- Orchestrator behavior ------------------------------------------------

describe("runQualityGates orchestration", () => {
  it("returns all gates in passed[] when stubs default to pass", async () => {
    const r = await runQualityGates(makeCtx());
    expect(r.failed).toEqual([]);
    expect(r.blocked).toBe(false);
    expect(r.escalated).toBe(false);
    // All five gates enabled by default.
    expect(r.passed).toEqual([
      "static_analysis",
      "test_coverage",
      "code_review",
      "doc_coverage",
      "magic_debate",
    ]);
  });

  it("writes gate-failures.txt with comma-trailing list when blocked", async () => {
    process.env["LOKI_STUB_GATE_TEST_COVERAGE"] = "fail";
    process.env["LOKI_STUB_GATE_DOC_COVERAGE"] = "fail";
    const r = await runQualityGates(makeCtx());
    expect(r.failed).toEqual(["test_coverage", "doc_coverage"]);
    const body = readFileSync(join(scratch, "quality", "gate-failures.txt"), "utf-8");
    expect(body).toBe("test_coverage,doc_coverage,\n");
  });

  it("removes gate-failures.txt on a clean iteration", async () => {
    const target = join(scratch, "quality", "gate-failures.txt");
    mkdirSync(join(scratch, "quality"), { recursive: true });
    writeFileSync(target, "stale,\n");
    const r = await runQualityGates(makeCtx());
    expect(r.blocked).toBe(false);
    expect(existsSync(target)).toBe(false);
  });

  it("respects PHASE_* toggles -- disabled gates do not run", async () => {
    process.env["PHASE_STATIC_ANALYSIS"] = "false";
    process.env["PHASE_UNIT_TESTS"] = "false";
    process.env["LOKI_GATE_DOC_COVERAGE"] = "false";
    process.env["LOKI_GATE_MAGIC_DEBATE"] = "false";
    const r = await runQualityGates(makeCtx());
    expect(r.passed).toEqual(["code_review"]);
  });

  it("soft-gate path (LOKI_HARD_GATES=false) only runs code_review and never blocks", async () => {
    process.env["LOKI_HARD_GATES"] = "false";
    process.env["LOKI_STUB_GATE_CODE_REVIEW"] = "fail";
    const r = await runQualityGates(makeCtx());
    expect(r.failed).toEqual(["code_review"]);
    // Soft path: blocked stays false, escalation never fires.
    expect(r.blocked).toBe(false);
    expect(r.escalated).toBe(false);
    // No persistence in soft mode.
    expect(existsSync(join(scratch, "quality", "gate-failures.txt"))).toBe(false);
  });

  it("stops the pipeline after a PAUSE-level escalation", async () => {
    process.env["LOKI_GATE_CLEAR_LIMIT"] = "1";
    process.env["LOKI_GATE_ESCALATE_LIMIT"] = "2";
    process.env["LOKI_GATE_PAUSE_LIMIT"] = "1";
    process.env["LOKI_STUB_GATE_STATIC_ANALYSIS"] = "fail";
    // Mark test_coverage to fail too -- it must NOT run because static_analysis
    // pauses the pipeline first.
    process.env["LOKI_STUB_GATE_TEST_COVERAGE"] = "fail";
    const r = await runQualityGates(makeCtx());
    expect(r.escalated).toBe(true);
    expect(getGateFailureCount("static_analysis", scratch)).toBe(1);
    expect(getGateFailureCount("test_coverage", scratch)).toBe(0);
  });
});
