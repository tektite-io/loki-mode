// loki-ts/src/providers/mcp_config.ts -- Phase D (v7.5.22) Bun-route MCP config bundle.
//
// Emits a per-iteration Loki MCP server bundle under <targetDir>/.loki/mcp-config.json
// for Claude Code's `--mcp-config <configs...>` variadic flag. Optionally chains a
// user overlay at ~/.claude/mcp.json when present. Hook events flag is composed by
// claude_flags.ts; this module owns only the config paths.
//
// Public API:
//   mcpConfigPath(targetDir) -> absolute path to Loki bundle (idempotent write)
//   userMcpConfigPath() -> absolute path to ~/.claude/mcp.json if readable, else null
//   buildMcpConfigArgv(targetDir) -> ["--mcp-config", "<loki>", "<user?>"]
//
// Design notes:
// - Bundle shape is hardcoded (no runtime read of project .mcp.json) to prevent
//   drift and ensure no `${...}` env-var expansion lands in the emitted file.
// - Idempotent write: compares stable-stringified existing bytes vs desired bytes
//   and short-circuits before fs.writeFileSync when equal, preserving mtime.
// - Variadic emission: separate argv elements per Commander `<configs...>` syntax
//   verified via `claude --help` (v2.1.34).
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { resolve as resolvePath, join } from "node:path";

// Hardcoded bundle shape -- mirrors project root .mcp.json.
// Do NOT read .mcp.json at runtime; keeping this literal prevents config drift
// and avoids any chance of shell-expansion strings (${HOME}, $VAR) leaking in.
const LOKI_MCP_BUNDLE = {
  mcpServers: {
    "loki-mode": {
      command: "python3",
      args: ["-m", "mcp.server"],
    },
  },
};

// Stable-key JSON serialization. JSON.stringify with sorted keys would also work
// for our small fixed object, but explicit serialization keeps byte output
// deterministic across Node/Bun versions.
function stableStringify(obj: unknown): string {
  return JSON.stringify(obj, null, 2) + "\n";
}

// Resolves to <targetDir>/.loki/mcp-config.json. Writes the Loki bundle when the
// existing file content differs (idempotent). Returns the absolute path either way.
export function mcpConfigPath(targetDir: string): string {
  const lokiDir = resolvePath(targetDir, ".loki");
  const cfgPath = join(lokiDir, "mcp-config.json");
  const desired = stableStringify(LOKI_MCP_BUNDLE);

  let existing: string | null = null;
  if (existsSync(cfgPath)) {
    try {
      existing = readFileSync(cfgPath, "utf8");
    } catch {
      existing = null;
    }
  }

  if (existing === desired) {
    // Idempotent: identical bytes already on disk, skip write to preserve mtime.
    return cfgPath;
  }

  mkdirSync(lokiDir, { recursive: true });
  writeFileSync(cfgPath, desired, "utf8");
  return cfgPath;
}

// Returns ~/.claude/mcp.json when the file exists and is readable, else null.
// Reads HOME via process.env so tests can stub it. No parsing of the file --
// we pass through unchanged to Claude (the user overlay may use `servers` or
// `mcpServers` key; both are valid per Claude Code docs).
export function userMcpConfigPath(): string | null {
  const home = process.env["HOME"];
  if (!home) return null;
  const p = join(home, ".claude", "mcp.json");
  if (!existsSync(p)) return null;
  try {
    // Stat probe ensures readability without slurping the whole file.
    const s = statSync(p);
    if (!s.isFile()) return null;
    // Best-effort readability check.
    readFileSync(p, "utf8");
    return p;
  } catch {
    return null;
  }
}

// Composes the variadic --mcp-config argv: ["--mcp-config", "<loki>"] plus user
// overlay path appended when present. Per Commander `<configs...>` semantics,
// each path is a separate argv element (verified via `claude --help`).
export function buildMcpConfigArgv(targetDir: string): string[] {
  const loki = mcpConfigPath(targetDir);
  const argv: string[] = ["--mcp-config", loki];
  const user = userMcpConfigPath();
  if (user !== null) {
    argv.push(user);
  }
  return argv;
}
