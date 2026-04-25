// Skeleton tests for runAutonomous() -- exercise control-flow branches with
// hermetic .loki/ tmpdirs and FakeProvider injection. No real provider is
// invoked; no network calls. The goal is to lock in the loop's exit
// conditions before the C1/C2/C3/B1 modules land.

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { runAutonomous } from "../../src/runner/autonomous.ts";
import type {
  Clock,
  CouncilHook,
  ProviderInvocation,
  ProviderInvoker,
  ProviderResult,
  RunnerContext,
  RunnerOpts,
  SignalSource,
} from "../../src/runner/types.ts";

// ---------------------------------------------------------------------------
// Test doubles.
// ---------------------------------------------------------------------------

class FakeProvider implements ProviderInvoker {
  public calls: ProviderInvocation[] = [];
  constructor(private readonly results: ProviderResult[]) {}
  async invoke(call: ProviderInvocation): Promise<ProviderResult> {
    this.calls.push(call);
    const idx = Math.min(this.calls.length - 1, this.results.length - 1);
    const fallback: ProviderResult = {
      exitCode: 0,
      capturedOutputPath: call.iterationOutputPath,
    };
    return this.results[idx] ?? fallback;
  }
}

class FakeSignals implements SignalSource {
  public interventions: (0 | 1 | 2)[] = [];
  public budgetExceeded = false;
  async checkHumanIntervention(): Promise<0 | 1 | 2> {
    return this.interventions.shift() ?? 0;
  }
  async isBudgetExceeded(): Promise<boolean> {
    return this.budgetExceeded;
  }
}

class FakeClock implements Clock {
  public ticks = 0;
  public sleeps: number[] = [];
  now(): number {
    this.ticks += 1;
    return this.ticks * 1000;
  }
  async sleep(ms: number): Promise<void> {
    this.sleeps.push(ms);
  }
}

class FakeCouncil implements CouncilHook {
  constructor(private readonly verdicts: boolean[]) {}
  async shouldStop(_ctx: RunnerContext): Promise<boolean> {
    return this.verdicts.shift() ?? false;
  }
}

// ---------------------------------------------------------------------------
// Hermetic tmpdir per-test.
// ---------------------------------------------------------------------------

let tmpRoot: string;
let lokiDir: string;
let logLines: string[];
const logStream = {
  write(line: string | Uint8Array): boolean {
    logLines.push(typeof line === "string" ? line.trimEnd() : new TextDecoder().decode(line).trimEnd());
    return true;
  },
};

beforeEach(() => {
  tmpRoot = mkdtempSync(resolve(tmpdir(), "loki-runner-test-"));
  lokiDir = resolve(tmpRoot, ".loki");
  mkdirSync(lokiDir, { recursive: true });
  logLines = [];
});

afterEach(() => {
  try {
    rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
});

function baseOpts(overrides: Partial<RunnerOpts> = {}): RunnerOpts {
  return {
    cwd: tmpRoot,
    provider: "claude",
    autonomyMode: "checkpoint",
    maxRetries: 3,
    maxIterations: 5,
    baseWaitSeconds: 0,
    maxWaitSeconds: 0,
    sessionModel: "sonnet",
    loggerStream: logStream as unknown as NodeJS.WritableStream,
    clock: new FakeClock(),
    signals: new FakeSignals(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests.
// ---------------------------------------------------------------------------

describe("runAutonomous", () => {
  it("exits cleanly on STOP signal", async () => {
    const signals = new FakeSignals();
    signals.interventions = [2];
    const provider = new FakeProvider([]);
    const code = await runAutonomous(baseOpts({ signals, providerOverride: provider }));
    expect(code).toBe(0);
    expect(provider.calls).toHaveLength(0);
  });

  it("re-checks loop on PAUSE signal then exits when STOP follows", async () => {
    const signals = new FakeSignals();
    signals.interventions = [1, 2];
    const provider = new FakeProvider([]);
    const code = await runAutonomous(baseOpts({ signals, providerOverride: provider }));
    expect(code).toBe(0);
    expect(provider.calls).toHaveLength(0);
  });

  it("returns 0 when max iterations reached", async () => {
    const provider = new FakeProvider([{ exitCode: 1, capturedOutputPath: "" }]);
    const code = await runAutonomous(
      baseOpts({ maxIterations: 1, maxRetries: 5, providerOverride: provider }),
    );
    expect(code).toBe(0);
    // 1 iteration runs (counter incremented to 1), then 2nd iteration aborts on max.
    expect(provider.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("returns 1 when max retries exceeded on persistent failure", async () => {
    const provider = new FakeProvider([{ exitCode: 1, capturedOutputPath: "" }]);
    const code = await runAutonomous(
      baseOpts({ maxRetries: 2, maxIterations: 100, providerOverride: provider }),
    );
    expect(code).toBe(1);
    expect(provider.calls.length).toBe(2);
  });

  it("returns 0 when council votes STOP after a successful iteration", async () => {
    const provider = new FakeProvider([{ exitCode: 0, capturedOutputPath: "" }]);
    const council = new FakeCouncil([true]);
    const code = await runAutonomous(
      baseOpts({ providerOverride: provider, council, autonomyMode: "checkpoint" }),
    );
    expect(code).toBe(0);
    expect(provider.calls).toHaveLength(1);
  });

  it("returns 0 when completion promise text appears in captured output", async () => {
    const promise = "All PRD requirements implemented and tests passing";
    const captured = resolve(lokiDir, "logs", "iter-output-test.log");
    mkdirSync(resolve(lokiDir, "logs"), { recursive: true });
    writeFileSync(captured, `noise\n${promise}\nmore noise\n`);

    const provider = new FakeProvider([{ exitCode: 0, capturedOutputPath: captured }]);
    const council = new FakeCouncil([false]);

    const code = await runAutonomous(
      baseOpts({
        providerOverride: provider,
        council,
        completionPromise: promise,
        autonomyMode: "checkpoint",
        maxIterations: 5,
      }),
    );
    expect(code).toBe(0);
  });

  it("provider success path: invokes FakeProvider with a non-empty prompt", async () => {
    const provider = new FakeProvider([{ exitCode: 0, capturedOutputPath: "" }]);
    const council = new FakeCouncil([true]); // stop after iter 1 so test is bounded
    const code = await runAutonomous(baseOpts({ providerOverride: provider, council }));
    expect(code).toBe(0);
    expect(provider.calls).toHaveLength(1);
    const call = provider.calls[0]!;
    expect(call.provider).toBe("claude");
    expect(call.prompt.length).toBeGreaterThan(0);
    expect(call.iterationOutputPath.length).toBeGreaterThan(0);
  });

  it("perpetual mode never stops on council true; retries exhaust eventually", async () => {
    const provider = new FakeProvider([
      { exitCode: 0, capturedOutputPath: "" },
      { exitCode: 1, capturedOutputPath: "" },
      { exitCode: 1, capturedOutputPath: "" },
    ]);
    const council = new FakeCouncil([true, true]); // would stop in checkpoint mode
    const code = await runAutonomous(
      baseOpts({
        autonomyMode: "perpetual",
        providerOverride: provider,
        council,
        maxRetries: 2,
        maxIterations: 50,
      }),
    );
    // Hits max retries on the failing iterations -- council ignored.
    expect(code).toBe(1);
  });
});
