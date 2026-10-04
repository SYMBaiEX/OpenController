import { localPolicyRngVersion, localPolicySeedLimit } from "./local-policy";

export type RunnerOptions = {
  durationMs: number;
  matches: number;
  matchGapMs: number;
  minDecisions: number;
  minDecisionsPerPlayer: number;
  minRounds: number;
  minTotalDamage: number;
  pollMs: number;
  startupTimeoutMs: number;
  port: number;
  seed?: number;
  url?: string;
  output?: string;
  headed: boolean;
  verbose: boolean;
};

export type LocalPolicyRunMetadata = {
  server: "runner-spawned" | "external";
  randomSource: string;
  seedScope: string;
  seed?: number;
};

export function parseHeadlessArgs(args: string[]): RunnerOptions {
  const options: RunnerOptions = {
    durationMs: 15_000,
    matches: 1,
    matchGapMs: 250,
    minDecisions: 1,
    minDecisionsPerPlayer: 1,
    minRounds: 0,
    minTotalDamage: 0,
    pollMs: 250,
    startupTimeoutMs: 6_000,
    port: 5173,
    headed: false,
    verbose: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--duration-ms":
        options.durationMs = readPositiveNumber(args[++index], arg);
        break;
      case "--matches":
        options.matches = readPositiveNumber(args[++index], arg);
        break;
      case "--match-gap-ms":
        options.matchGapMs = readNonNegativeNumber(args[++index], arg);
        break;
      case "--min-decisions":
        options.minDecisions = readNonNegativeNumber(args[++index], arg);
        break;
      case "--min-decisions-per-player":
        options.minDecisionsPerPlayer = readNonNegativeNumber(
          args[++index],
          arg,
        );
        break;
      case "--min-rounds":
        options.minRounds = readNonNegativeNumber(args[++index], arg);
        break;
      case "--min-total-damage":
        options.minTotalDamage = readNonNegativeNumber(args[++index], arg);
        break;
      case "--poll-ms":
        options.pollMs = readPositiveNumber(args[++index], arg);
        break;
      case "--startup-timeout-ms":
        options.startupTimeoutMs = readPositiveNumber(args[++index], arg);
        break;
      case "--port":
        options.port = readPositiveNumber(args[++index], arg);
        break;
      case "--seed":
        options.seed = readSeed(args[++index], arg);
        break;
      case "--url":
        options.url = readRequiredValue(args[++index], arg);
        break;
      case "--output":
        options.output = readRequiredValue(args[++index], arg);
        break;
      case "--headed":
        options.headed = true;
        break;
      case "--verbose":
        options.verbose = true;
        break;
      case "--help":
        printHeadlessHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (options.url && options.seed !== undefined) {
    throw new Error(
      "--seed requires a runner-spawned server; remove --url or configure the external server with OPENCONTROLLER_AGENT_FIGHTER_SEED",
    );
  }
  return options;
}

export function localPolicyRunMetadata(
  options: RunnerOptions,
): LocalPolicyRunMetadata {
  if (options.url) {
    return {
      server: "external",
      randomSource: "unknown-external-server",
      seedScope:
        "Local-policy random branches only; the runner did not configure an external server seed.",
    };
  }
  return {
    server: "runner-spawned",
    randomSource:
      options.seed === undefined ? "Math.random" : localPolicyRngVersion,
    seedScope:
      "Local-policy random branches only; does not seed arena/browser randomness or external OpenAI decisions.",
    ...(options.seed === undefined ? {} : { seed: options.seed }),
  };
}

export function managementForRunnerSummary(
  management: Record<string, unknown> | undefined,
  options: RunnerOptions,
): Record<string, unknown> | undefined {
  if (!management || !options.url) {
    return management;
  }

  const reportedPolicy = management.localPolicy;
  const externalPolicy =
    typeof reportedPolicy === "object" &&
    reportedPolicy !== null &&
    !Array.isArray(reportedPolicy)
      ? { ...(reportedPolicy as Record<string, unknown>) }
      : {};
  delete externalPolicy.seed;

  return {
    ...management,
    localPolicy: {
      ...externalPolicy,
      server: "external",
      randomSource: "unknown-external-server",
      seedScope:
        "The headless runner did not configure this external server's seed.",
    },
  };
}

export function printHeadlessHelp(): void {
  console.log(`OpenController Agent Fighter Headless Runner

Usage:
  bun --cwd examples/agent-fighter headless [options]

Options:
  --duration-ms <ms>          Match runtime before summarizing (default: 15000)
  --matches <count>           Number of matches in the series (default: 1)
  --match-gap-ms <ms>         Delay between matches (default: 250)
  --min-decisions <count>     Fail if total decisions are below count (default: 1)
  --min-decisions-per-player <count>
                              Fail if either player has fewer decisions (default: 1)
  --min-rounds <count>        Fail if completed rounds are below count (default: 0)
  --min-total-damage <hp>     Fail if total HP damage is below value (default: 0)
  --poll-ms <ms>              Telemetry polling interval (default: 250)
  --startup-timeout-ms <ms>   Time to wait for spawned server (default: 6000)
  --port <port>               Port for spawned server (default: 5173)
  --seed <uint32>             Seed local-policy random choices on a spawned server
  --url <url>                 Use an already-running server instead of spawning
  --output <path>             Write JSON summary to a file
  --headed                    Show the Chromium window
  --verbose                   Print server and browser diagnostics
  --help                      Show this help
`);
}

function readSeed(value: string | undefined, option: string): number {
  const parsed = Number(readRequiredValue(value, option));
  if (
    !Number.isInteger(parsed) ||
    parsed < 0 ||
    parsed > localPolicySeedLimit
  ) {
    throw new Error(
      `${option} must be an integer between 0 and ${localPolicySeedLimit}`,
    );
  }
  return parsed;
}

function readPositiveNumber(value: string | undefined, option: string): number {
  const parsed = Number(readRequiredValue(value, option));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${option} must be a positive number`);
  }
  return Math.round(parsed);
}

function readNonNegativeNumber(
  value: string | undefined,
  option: string,
): number {
  const parsed = Number(readRequiredValue(value, option));
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${option} must be zero or a positive number`);
  }
  return Math.round(parsed);
}

function readRequiredValue(value: string | undefined, option: string): string {
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}
